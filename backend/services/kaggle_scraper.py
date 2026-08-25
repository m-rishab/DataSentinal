"""Kaggle dataset page scraper (requests + BeautifulSoup).

Kaggle dataset pages embed structured state in two places:
  1. `<script type="application/ld+json">` (schema.org DataDownload)
  2. `window.Kaggle.State = {...}` blob with full dataset metadata

We parse both, falling back to OpenGraph meta tags, and finally to raw
regex over the HTML for license / file-name hints. All network errors are
raised as `KaggleScrapeError` for the ingest node to catch.
"""

from __future__ import annotations

import html as html_lib
import json
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

from backend.services.headless_render import HeadlessRenderError, render_page

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

FILE_EXT_RE = re.compile(
    r'"name"\s*:\s*"([^"]+?\.(?:csv|tsv|json|jsonl|parquet|zip|tar|gz|txt|xlsx|xls|xml|jpg|jpeg|png|mp4|wav|h5|pkl))"',
    re.IGNORECASE,
)
LICENSE_RE = re.compile(r'"(?:licenseName|license)"\s*:\s*"([^"]{2,80}?)"')
# Rendered file rows look like:  <h2 ...>Iris.csv<span ...>(5.11 kB)</span></h2>
RENDERED_FILE_RE = re.compile(
    r"<h2[^>]*>\s*([^<]{1,120}?\.(?:csv|tsv|json|jsonl|parquet|zip|gz|txt|xlsx|xls|xml|h5|pkl))"
    r"(?:<span[^>]*>\s*\(?([0-9.]+\s*[kKmMgGbB]+[iI]?[bB]?)\)?)?",
)
# Structured blobs inside the rendered page carry license as a CreativeWork.
CREATIVE_WORK_LICENSE_RE = re.compile(
    r'"license"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]{2,80})"', re.DOTALL
)
# Rendered column tables put each column name in a titled span inside <th>:
#   <th ...><span title="parental_education" ...>parental_education</span>...
TH_COLUMN_RE = re.compile(
    r"<th[^>]*>(?:(?!</th>).)*?<span[^>]*\btitle=\"([^\"]{1,64})\"", re.DOTALL
)


class KaggleScrapeError(Exception):
    pass


def _http_get(url: str, timeout: float = 25.0) -> requests.Response:
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise KaggleScrapeError(f"Network error fetching {url}: {exc}") from exc
    if resp.status_code == 403:
        raise KaggleScrapeError(
            f"Kaggle returned 403 for {url} (bot protection). "
            "Metadata will be derived from the URL slug only."
        )
    if resp.status_code != 200:
        raise KaggleScrapeError(f"Kaggle returned HTTP {resp.status_code} for {url}")
    return resp


def _json_ld_metadata(soup: BeautifulSoup) -> dict:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or script.get_text() or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(data, dict):
            continue
        if data.get("@type") in ("Dataset", "DataDownload"):
            return data
    return {}


def _kaggle_state_metadata(soup: BeautifulSoup) -> dict:
    """Extract fields from the `window.Kaggle.State` blob if present."""
    for script in soup.find_all("script"):
        text = script.string or ""
        if not text or "Kaggle.State" not in text:
            continue
        match = re.search(r"Kaggle\.State\s*=\s*(\{.*?\})\s*;?\s*(?:window\.|</script>|$)", text, re.DOTALL)
        if not match:
            continue
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            return data
    return {}


def _slug_fallback(url: str) -> dict:
    slug = url.rstrip("/").split("/datasets/")[-1].strip("/")
    # The URL slug is "owner/dataset-name" — only the dataset-name segment is a
    # real human-readable title. Gluing the owner slug onto the front (e.g.
    # "Uciml — Iris") produces a bogus token that pollutes every downstream
    # search query and citation-verification token match, so keep the owner
    # out of the title entirely.
    name_segment = slug.split("/")[-1] if "/" in slug else slug
    title = name_segment.replace("-", " ").strip().title()
    return {
        "title": title or "Unknown dataset",
        "description": "",
        "license": None,
        "tags": [],
        "upload_date": None,
        "files": [],
        "columns": [],
    }


def _columns_from_description(description: str) -> list[str]:
    """Many dataset pages list columns as markdown bullets after a line like
    'The columns in this dataset are:' — harvest those."""
    if not description:
        return []
    names: list[str] = []
    in_block = False
    for line in description.splitlines():
        stripped = line.strip()
        if not in_block and re.search(r"column[s]?\s*(?:in|are|include|:)", stripped, re.IGNORECASE):
            in_block = True
            continue
        if in_block:
            bullet = re.match(r"^[-*•]\s*(.+)$", stripped)
            if not bullet:
                if names:
                    break  # block ended
                continue
            name = bullet.group(1).strip().strip("`*_")
            if 0 < len(name) <= 64 and re.fullmatch(r"[A-Za-z0-9_ .\-/]+", name):
                names.append(name)
    return list(dict.fromkeys(names))[:60]


def _merge_rendered_dom(meta: dict[str, Any], html: str) -> dict[str, Any]:
    """Extract extra signal from a fully-rendered page (headless fallback)."""
    # Real title / description from the rendered document.
    if not meta.get("title"):
        og = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]{2,200})"', html)
        title_tag = re.search(r"<title>([^<]{2,200})</title>", html)
        raw = (og.group(1) if og else (title_tag.group(1) if title_tag else "")) \
            .replace(" | Kaggle", "").strip()
        meta["title"] = raw or None
    if not meta.get("description"):
        og = re.search(
            r'<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]{10,1000})"',
            html,
        )
        if og:
            meta["description"] = og.group(1)

    # Upload date from structured data or the rendered "N days ago" label.
    if not meta.get("upload_date"):
        iso = re.search(r'"datePublished"\s*:\s*"([0-9T:\.\-Z]{8,24})"', html)
        ago = re.search(r'(\d+)\s*(day|month|year)s?\s+ago', html)
        if iso:
            meta["upload_date"] = iso.group(1)
        elif ago:
            meta["upload_date"] = f"{ago.group(1)} {ago.group(2)}s ago"

    # Files with human sizes from the rendered file table.
    if len(meta.get("files") or []) < 1:
        rendered_files = [f"{name}{f' ({size})' if size else ''}" for name, size in RENDERED_FILE_RE.findall(html)]
        meta["files"] = list(dict.fromkeys(rendered_files))[:50] or meta.get("files") or []

    # License embedded as a CreativeWork object in structured data.
    if not meta.get("license"):
        match = CREATIVE_WORK_LICENSE_RE.search(html)
        if match:
            meta["license"] = match.group(1)

    # Column names, either from a JSON array or the description bullets.
    if not meta.get("columns"):
        state_cols = re.search(r'"columns"\s*:\s*(\[[^\]]{0,4000}?\])', html)
        if state_cols:
            try:
                parsed = json.loads(state_cols.group(1))
                names = [
                    str(c["name"]) for c in parsed
                    if isinstance(c, dict) and c.get("name") and len(str(c["name"])) < 64
                ]
                meta["columns"] = list(dict.fromkeys(names))[:60]
            except (json.JSONDecodeError, AttributeError):
                pass
    if not meta.get("columns"):
        # Rendered dataset pages draw a column table whose header cells carry
        # the name in a titled span — the most reliable rendered source.
        th_names = [html_lib.unescape(n).strip() for n in TH_COLUMN_RE.findall(html)]
        th_names = [
            n for n in th_names
            if n and re.fullmatch(r"[A-Za-z0-9_ .\-/]{1,64}", n) and n.lower() not in {"label", "count", "views", "downloads"}
        ]
        meta["columns"] = list(dict.fromkeys(th_names))[:60]
    if not meta.get("columns"):
        meta["columns"] = _columns_from_description(html_lib.unescape(meta.get("description") or ""))
        if not meta["columns"]:
            # Last resort: bullets near the word 'columns' directly in HTML text.
            text_match = re.search(
                r"[Cc]olumns[^<]{0,80}(?:</[^>]+>\s*)*((?:[-*•][^<]{0,64}<[^>]+>){2,})", html
            )
            if text_match:
                raw = re.sub(r"<[^>]+>", "\n", text_match.group(1))
                meta["columns"] = _columns_from_description(raw)
        if not meta["columns"]:
            # Rendered bodies keep escaped newlines ("\\n - Id") inside JSON
            # blobs; slice the region around the phrase and normalize it.
            idx = html.lower().find("columns in this dataset")
            if idx >= 0:
                raw = html[idx:idx + 2500].replace("\\n", "\n")
                meta["columns"] = _columns_from_description(raw)

    return meta


def scrape_kaggle_dataset(url: str) -> dict[str, Any]:
    """Return normalized metadata for a Kaggle dataset URL.

    Never raises for parse problems — only for network-level failures the
    caller cannot recover from (raised as KaggleScrapeError).
    """
    resp = _http_get(url)
    soup = BeautifulSoup(resp.text, "html.parser")

    meta: dict[str, Any] = {
        "title": None,
        "description": None,
        "license": None,
        "tags": [],
        "upload_date": None,
        "files": [],
        "columns": [],
    }

    # --- Pass 1: schema.org JSON-LD ---------------------------------------
    ld = _json_ld_metadata(soup)
    if ld:
        meta["title"] = ld.get("name") or ld.get("headline")
        meta["description"] = ld.get("description")
        meta["upload_date"] = ld.get("datePublished") or ld.get("dateModified")
        keywords = ld.get("keywords") or []
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(",") if k.strip()]
        meta["tags"] = keywords[:15]
        license_field = ld.get("license")
        if isinstance(license_field, str):
            meta["license"] = license_field
        elif isinstance(license_field, dict):
            meta["license"] = license_field.get("name") or license_field.get("url")
        distribution = ld.get("distribution") or []
        if isinstance(distribution, list):
            meta["files"] = [
                d.get("name") or d.get("contentUrl", "")
                for d in distribution
                if isinstance(d, dict) and (d.get("name") or d.get("contentUrl"))
            ][:50]

    # --- Pass 2: OpenGraph / HTML meta ------------------------------------
    if not meta["title"]:
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            meta["title"] = og["content"].replace(" | Kaggle", "").strip()
    if not meta["description"]:
        og = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
        if og and og.get("content"):
            meta["description"] = og["content"].strip()

    # --- Pass 3: Kaggle.State blob + raw-regex license/file hints ----------
    state = _kaggle_state_metadata(soup)
    if state:
        page = (state.get("page") or {})
        dataset = page.get("dataset") or state.get("dataset") or {}
        meta["title"] = meta["title"] or dataset.get("title")
        meta["description"] = meta["description"] or dataset.get("subtitle") or dataset.get("description")
        license_name = dataset.get("licenseName") or dataset.get("license")
        if isinstance(license_name, str) and license_name.strip():
            meta["license"] = meta["license"] or license_name.strip()
        files = dataset.get("files") or []
        if files and isinstance(files, list):
            meta["files"] = [f.get("name", "") for f in files if isinstance(f, dict) and f.get("name")][:50]
        columns = dataset.get("columns") or []
        if columns and isinstance(columns, list):
            names: list[str] = []
            for col in columns:
                if isinstance(col, dict) and col.get("name"):
                    names.append(str(col["name"]))
                elif isinstance(col, str) and col.strip():
                    names.append(col.strip())
            meta["columns"] = list(dict.fromkeys(names))[:60]

    # Column-name fallback: CSV/parquet column lists are embedded in the page
    # state as `"name":"col"` inside `columns` arrays even when the structured
    # parse above misses them.
    if not meta["columns"]:
        col_block = re.search(r'"columns"\s*:\s*(\[[^\]]*?\{[^\]]*?\}[^\]]*?\])', resp.text)
        if col_block:
            try:
                parsed = json.loads(col_block.group(1))
                names = [
                    str(c["name"]) for c in parsed
                    if isinstance(c, dict) and c.get("name") and len(str(c["name"])) < 64
                ]
                meta["columns"] = list(dict.fromkeys(names))[:60]
            except (json.JSONDecodeError, AttributeError):
                pass

    if not meta["license"]:
        license_match = LICENSE_RE.search(resp.text)
        if license_match:
            meta["license"] = license_match.group(1)

    if not meta["files"]:
        meta["files"] = list(dict.fromkeys(FILE_EXT_RE.findall(resp.text)))[:50]

    # --- Pass 4: headless render fallback ---------------------------------
    # Kaggle serves a JS-challenge shell to plain HTTP clients; when the fast
    # scrape came up thin (missing files OR columns), re-render through a
    # local Chromium-family browser and mine the fully-rendered DOM.
    if not meta["files"] or not meta["columns"]:
        try:
            rendered = render_page(url)
            meta = _merge_rendered_dom(meta, rendered)
        except HeadlessRenderError:
            # Degrade silently — the audit continues with what we have.
            pass

    # --- Final fallback: URL slug ------------------------------------------
    if not meta["title"]:
        # Field-wise so we never clobber data extracted from the rendered page.
        slug_meta = _slug_fallback(url)
        for key, value in slug_meta.items():
            if not meta.get(key):
                meta[key] = value
    # Pages embed HTML entities (&amp;, &#39;, ...) in every text field.
    for key in ("title", "description", "license", "upload_date"):
        if isinstance(meta.get(key), str):
            meta[key] = html_lib.unescape(meta[key]).strip() or None
    meta["tags"] = [html_lib.unescape(str(t)) for t in meta.get("tags") or []]
    meta["columns"] = [html_lib.unescape(str(c)) for c in meta.get("columns") or []]
    return meta