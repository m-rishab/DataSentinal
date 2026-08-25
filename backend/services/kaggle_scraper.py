"""Kaggle dataset page scraper.

Extraction strategy, in order:

1. Plain HTTP request + BeautifulSoup.
2. JSON-LD / schema.org metadata.
3. OpenGraph / standard HTML metadata.
4. window.Kaggle.State structured metadata.
5. Regex-based file / license / column extraction.
6. Headless Chromium rendering when the HTTP response is incomplete,
   blocked, or otherwise does not expose files/columns.
7. Second HTTP attempt when the first yielded nothing (challenge page)
   and headless rendering is unavailable.
8. URL-slug fallback for the dataset title.

Important deployment behavior:
- Kaggle may return 403/404/challenge HTML to a normal HTTP client.
- Those responses are NOT treated as an immediate fatal scraper error.
- The scraper attempts the headless browser fallback before giving up.
- If headless rendering is unavailable (e.g. on Render), a single HTTP
  retry is attempted before falling back to the URL slug.
- Headless browser failures are logged so deployment problems are visible.
"""

from __future__ import annotations

import html as html_lib
import json
import logging
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

from backend.services.headless_render import (
    HeadlessRenderError,
    render_page,
)

logger = logging.getLogger("datasentinel.kaggle_scraper")


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


FILE_EXT_RE = re.compile(
    r'"name"\s*:\s*"([^"]+?\.(?:'
    r"csv|tsv|json|jsonl|parquet|zip|tar|gz|txt|xlsx|xls|xml|"
    r"jpg|jpeg|png|mp4|wav|h5|pkl"
    r'))"',
    re.IGNORECASE,
)


LICENSE_RE = re.compile(
    r'"(?:licenseName|license)"\s*:\s*"([^"]{2,120}?)"',
    re.IGNORECASE,
)


# Rendered file rows can look like:
#
# <h2 ...>Iris.csv<span ...>(5.11 kB)</span></h2>
#
RENDERED_FILE_RE = re.compile(
    r"<h2[^>]*>\s*"
    r"([^<]{1,120}?\.(?:"
    r"csv|tsv|json|jsonl|parquet|zip|gz|txt|xlsx|xls|xml|h5|pkl"
    r"))"
    r"(?:<span[^>]*>\s*\(?"
    r"([0-9.]+\s*[kKmMgGbB]+[iI]?[bB]?)"
    r"\)?)?",
    re.IGNORECASE,
)


CREATIVE_WORK_LICENSE_RE = re.compile(
    r'"license"\s*:\s*\{'
    r'[^}]*?"name"\s*:\s*"([^"]{2,120})"',
    re.DOTALL | re.IGNORECASE,
)


# Rendered column tables:
#
# <th ...><span title="sepal_length" ...>
#
TH_COLUMN_RE = re.compile(
    r"<th[^>]*>(?:(?!</th>).)*?"
    r'<span[^>]*\btitle="([^"]{1,64})"',
    re.DOTALL | re.IGNORECASE,
)


class KaggleScrapeError(Exception):
    """Raised when Kaggle metadata cannot be recovered."""


def _http_get(
    url: str,
    timeout: float = 25.0,
) -> requests.Response | None:
    """Fetch Kaggle using a normal HTTP request.

    Important:
        Non-200 responses are returned instead of immediately raising.

    Kaggle can return a challenge/blocked page with 403/404-like responses.
    We want scrape_kaggle_dataset() to get a chance to use the headless
    browser fallback before declaring the scrape unsuccessful.
    """

    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": (
                    "text/html,application/xhtml+xml,"
                    "application/xml;q=0.9,image/avif,image/webp,"
                    "image/apng,*/*;q=0.8"
                ),
            },
            timeout=timeout,
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        logger.warning(
            "Kaggle HTTP request failed for %s: %s",
            url,
            exc,
        )
        return None

    logger.info(
        "Kaggle HTTP response: status=%s bytes=%s final_url=%s",
        resp.status_code,
        len(resp.text or ""),
        resp.url,
    )

    return resp


def _json_ld_metadata(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract schema.org Dataset/DataDownload metadata."""

    for script in soup.find_all(
        "script",
        type="application/ld+json",
    ):
        try:
            raw = script.string or script.get_text() or "{}"
            data = json.loads(raw)
        except (
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ):
            continue

        candidates: list[Any]

        if isinstance(data, list):
            candidates = data
        else:
            candidates = [data]

        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue

            if candidate.get("@type") in (
                "Dataset",
                "DataDownload",
            ):
                return candidate

    return {}


def _extract_balanced_json_object(
    text: str,
    start: int,
) -> str | None:
    """Extract a balanced JSON object starting at ``start``.

    This avoids the fragile non-greedy regex approach for Kaggle.State,
    because nested objects contain many closing braces.
    """

    if start < 0 or start >= len(text) or text[start] != "{":
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1

            if depth == 0:
                return text[start : index + 1]

    return None


def _kaggle_state_metadata(
    soup: BeautifulSoup,
) -> dict[str, Any]:
    """Extract metadata from window.Kaggle.State when present."""

    for script in soup.find_all("script"):
        text = script.string or script.get_text() or ""

        if "Kaggle.State" not in text:
            continue

        match = re.search(
            r"Kaggle\.State\s*=\s*",
            text,
        )

        if not match:
            continue

        object_start = text.find(
            "{",
            match.end(),
        )

        if object_start < 0:
            continue

        raw_json = _extract_balanced_json_object(
            text,
            object_start,
        )

        if not raw_json:
            continue

        try:
            data = json.loads(raw_json)
        except (
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ):
            logger.debug(
                "Kaggle.State JSON could not be decoded."
            )
            continue

        if isinstance(data, dict):
            return data

    return {}


def _slug_fallback(url: str) -> dict[str, Any]:
    """Create minimal metadata from the Kaggle URL."""

    slug = (
        url.rstrip("/")
        .split("/datasets/")[-1]
        .strip("/")
    )

    name_segment = (
        slug.split("/")[-1]
        if "/" in slug
        else slug
    )

    title = (
        name_segment
        .replace("-", " ")
        .strip()
        .title()
    )

    return {
        "title": title or "Unknown dataset",
        "description": "",
        "license": None,
        "tags": [],
        "upload_date": None,
        "files": [],
        "columns": [],
    }


def _columns_from_description(
    description: str,
) -> list[str]:
    """Extract column names from markdown-style description bullets."""

    if not description:
        return []

    names: list[str] = []
    in_block = False

    for line in description.splitlines():
        stripped = line.strip()

        if not in_block and re.search(
            r"column[s]?\s*(?:in|are|include|:)",
            stripped,
            re.IGNORECASE,
        ):
            in_block = True
            continue

        if in_block:
            bullet = re.match(
                r"^[-*•]\s*(.+)$",
                stripped,
            )

            if not bullet:
                if names:
                    break
                continue

            name = (
                bullet.group(1)
                .strip()
                .strip("`*_")
            )

            if (
                0 < len(name) <= 64
                and re.fullmatch(
                    r"[A-Za-z0-9_ .\-/]+",
                    name,
                )
            ):
                names.append(name)

    return list(dict.fromkeys(names))[:60]


def _merge_rendered_dom(
    meta: dict[str, Any],
    html: str,
) -> dict[str, Any]:
    """Extract additional metadata from a fully rendered Kaggle DOM."""

    if not html:
        return meta

    # ------------------------------------------------------------------
    # Parse structured metadata from the rendered DOM first.
    # ------------------------------------------------------------------

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    # JSON-LD
    ld = _json_ld_metadata(soup)

    if ld:
        if not meta.get("title"):
            meta["title"] = (
                ld.get("name")
                or ld.get("headline")
            )

        if not meta.get("description"):
            meta["description"] = ld.get(
                "description"
            )

        if not meta.get("upload_date"):
            meta["upload_date"] = (
                ld.get("datePublished")
                or ld.get("dateModified")
            )

        if not meta.get("license"):
            license_field = ld.get("license")

            if isinstance(
                license_field,
                str,
            ):
                meta["license"] = license_field

            elif isinstance(
                license_field,
                dict,
            ):
                meta["license"] = (
                    license_field.get("name")
                    or license_field.get("url")
                )

        distribution = (
            ld.get("distribution")
            or []
        )

        if (
            not meta.get("files")
            and isinstance(
                distribution,
                list,
            )
        ):
            meta["files"] = [
                d.get("name")
                or d.get("contentUrl", "")
                for d in distribution
                if (
                    isinstance(d, dict)
                    and (
                        d.get("name")
                        or d.get("contentUrl")
                    )
                )
            ][:50]

    # Kaggle.State
    state = _kaggle_state_metadata(soup)

    if state:
        page = (
            state.get("page")
            or {}
        )

        dataset = (
            page.get("dataset")
            or state.get("dataset")
            or {}
        )

        if isinstance(dataset, dict):
            if not meta.get("title"):
                meta["title"] = dataset.get(
                    "title"
                )

            if not meta.get("description"):
                meta["description"] = (
                    dataset.get("subtitle")
                    or dataset.get("description")
                )

            license_name = (
                dataset.get("licenseName")
                or dataset.get("license")
            )

            if (
                not meta.get("license")
                and isinstance(
                    license_name,
                    str,
                )
                and license_name.strip()
            ):
                meta["license"] = (
                    license_name.strip()
                )

            files = (
                dataset.get("files")
                or []
            )

            if (
                not meta.get("files")
                and isinstance(files, list)
            ):
                meta["files"] = [
                    f.get("name", "")
                    for f in files
                    if (
                        isinstance(f, dict)
                        and f.get("name")
                    )
                ][:50]

            columns = (
                dataset.get("columns")
                or []
            )

            if (
                not meta.get("columns")
                and isinstance(
                    columns,
                    list,
                )
            ):
                names: list[str] = []

                for col in columns:
                    if (
                        isinstance(col, dict)
                        and col.get("name")
                    ):
                        names.append(
                            str(col["name"])
                        )
                    elif (
                        isinstance(col, str)
                        and col.strip()
                    ):
                        names.append(
                            col.strip()
                        )

                meta["columns"] = list(
                    dict.fromkeys(names)
                )[:60]

    # ------------------------------------------------------------------
    # Standard HTML metadata.
    # ------------------------------------------------------------------

    if not meta.get("title"):
        og = soup.find(
            "meta",
            property="og:title",
        )

        if og and og.get("content"):
            meta["title"] = (
                og["content"]
                .replace(" | Kaggle", "")
                .strip()
            )

    if not meta.get("description"):
        og = soup.find(
            "meta",
            property="og:description",
        )

        if not og:
            og = soup.find(
                "meta",
                attrs={
                    "name": "description"
                },
            )

        if og and og.get("content"):
            meta["description"] = (
                og["content"].strip()
            )

    # ------------------------------------------------------------------
    # Upload date.
    # ------------------------------------------------------------------

    if not meta.get("upload_date"):
        iso = re.search(
            r'"datePublished"\s*:\s*'
            r'"([0-9T:\.\-Z]{8,30})"',
            html,
        )

        ago = re.search(
            r"(\d+)\s*"
            r"(day|month|year|week)s?"
            r"\s+ago",
            html,
            re.IGNORECASE,
        )

        if iso:
            meta["upload_date"] = (
                iso.group(1)
            )

        elif ago:
            meta["upload_date"] = (
                f"{ago.group(1)} "
                f"{ago.group(2).lower()}s ago"
            )

    # ------------------------------------------------------------------
    # Files.
    # ------------------------------------------------------------------

    if not meta.get("files"):
        rendered_files = [
            (
                f"{name}"
                f"{f' ({size})' if size else ''}"
            )
            for name, size
            in RENDERED_FILE_RE.findall(html)
        ]

        meta["files"] = list(
            dict.fromkeys(
                rendered_files
            )
        )[:50]

    # ------------------------------------------------------------------
    # License.
    # ------------------------------------------------------------------

    if not meta.get("license"):
        match = (
            CREATIVE_WORK_LICENSE_RE.search(
                html
            )
        )

        if match:
            meta["license"] = (
                match.group(1)
            )

    # ------------------------------------------------------------------
    # Columns from JSON.
    # ------------------------------------------------------------------

    if not meta.get("columns"):
        state_cols = re.search(
            r'"columns"\s*:\s*'
            r'(\[[^\]]{0,10000}?\])',
            html,
            re.DOTALL,
        )

        if state_cols:
            try:
                parsed = json.loads(
                    state_cols.group(1)
                )

                names = [
                    str(c["name"])
                    for c in parsed
                    if (
                        isinstance(c, dict)
                        and c.get("name")
                        and len(
                            str(c["name"])
                        ) < 64
                    )
                ]

                meta["columns"] = list(
                    dict.fromkeys(names)
                )[:60]

            except (
                json.JSONDecodeError,
                AttributeError,
                TypeError,
            ):
                pass

    # ------------------------------------------------------------------
    # Columns from rendered table headers.
    # ------------------------------------------------------------------

    if not meta.get("columns"):
        th_names = [
            html_lib.unescape(n).strip()
            for n
            in TH_COLUMN_RE.findall(html)
        ]

        th_names = [
            n
            for n in th_names
            if (
                n
                and re.fullmatch(
                    r"[A-Za-z0-9_ .\-/]{1,64}",
                    n,
                )
                and n.lower()
                not in {
                    "label",
                    "count",
                    "views",
                    "downloads",
                }
            )
        ]

        meta["columns"] = list(
            dict.fromkeys(th_names)
        )[:60]

    # ------------------------------------------------------------------
    # Columns from description.
    # ------------------------------------------------------------------

    if not meta.get("columns"):
        description = html_lib.unescape(
            meta.get("description")
            or ""
        )

        meta["columns"] = (
            _columns_from_description(
                description
            )
        )

    # ------------------------------------------------------------------
    # Last HTML-text column fallback.
    # ------------------------------------------------------------------

    if not meta.get("columns"):
        text_match = re.search(
            r"[Cc]olumns[^<]{0,100}"
            r"(?:</[^>]+>\s*)*"
            r"((?:[-*•][^<]{0,80}"
            r"<[^>]+>){2,})",
            html,
        )

        if text_match:
            raw = re.sub(
                r"<[^>]+>",
                "\n",
                text_match.group(1),
            )

            meta["columns"] = (
                _columns_from_description(
                    raw
                )
            )

    # ------------------------------------------------------------------
    # Escaped newline fallback.
    # ------------------------------------------------------------------

    if not meta.get("columns"):
        lower_html = html.lower()

        phrases = [
            "columns in this dataset",
            "columns are",
            "columns include",
        ]

        index = -1

        for phrase in phrases:
            index = lower_html.find(
                phrase
            )

            if index >= 0:
                break

        if index >= 0:
            raw = html[
                index : index + 5000
            ].replace(
                "\\n",
                "\n",
            )

            meta["columns"] = (
                _columns_from_description(
                    raw
                )
            )

    return meta


def _merge_plain_http_metadata(
    meta: dict[str, Any],
    html: str,
) -> dict[str, Any]:
    """Run the normal non-browser extraction passes."""

    if not html:
        return meta

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    # --------------------------------------------------------------
    # Pass 1: JSON-LD
    # --------------------------------------------------------------

    ld = _json_ld_metadata(soup)

    if ld:
        meta["title"] = (
            meta.get("title")
            or ld.get("name")
            or ld.get("headline")
        )

        meta["description"] = (
            meta.get("description")
            or ld.get("description")
        )

        meta["upload_date"] = (
            meta.get("upload_date")
            or ld.get("datePublished")
            or ld.get("dateModified")
        )

        keywords = (
            ld.get("keywords")
            or []
        )

        if isinstance(
            keywords,
            str,
        ):
            keywords = [
                k.strip()
                for k
                in keywords.split(",")
                if k.strip()
            ]

        meta["tags"] = list(
            dict.fromkeys(
                (
                    meta.get("tags")
                    or []
                )
                + keywords[:15]
            )
        )[:15]

        license_field = ld.get(
            "license"
        )

        if isinstance(
            license_field,
            str,
        ):
            meta["license"] = (
                meta.get("license")
                or license_field
            )

        elif isinstance(
            license_field,
            dict,
        ):
            meta["license"] = (
                meta.get("license")
                or license_field.get(
                    "name"
                )
                or license_field.get(
                    "url"
                )
            )

        distribution = (
            ld.get("distribution")
            or []
        )

        if (
            not meta.get("files")
            and isinstance(
                distribution,
                list,
            )
        ):
            meta["files"] = [
                d.get("name")
                or d.get("contentUrl", "")
                for d in distribution
                if (
                    isinstance(d, dict)
                    and (
                        d.get("name")
                        or d.get("contentUrl")
                    )
                )
            ][:50]

    # --------------------------------------------------------------
    # Pass 2: OpenGraph
    # --------------------------------------------------------------

    if not meta.get("title"):
        og = soup.find(
            "meta",
            property="og:title",
        )

        if og and og.get("content"):
            meta["title"] = (
                og["content"]
                .replace(" | Kaggle", "")
                .strip()
            )

    if not meta.get("description"):
        og = soup.find(
            "meta",
            property="og:description",
        )

        if not og:
            og = soup.find(
                "meta",
                attrs={
                    "name": "description"
                },
            )

        if og and og.get("content"):
            meta["description"] = (
                og["content"].strip()
            )

    # --------------------------------------------------------------
    # Pass 3: Kaggle.State
    # --------------------------------------------------------------

    state = _kaggle_state_metadata(
        soup
    )

    if state:
        page = (
            state.get("page")
            or {}
        )

        dataset = (
            page.get("dataset")
            or state.get("dataset")
            or {}
        )

        if isinstance(dataset, dict):
            meta["title"] = (
                meta.get("title")
                or dataset.get("title")
            )

            meta["description"] = (
                meta.get("description")
                or dataset.get("subtitle")
                or dataset.get("description")
            )

            license_name = (
                dataset.get("licenseName")
                or dataset.get("license")
            )

            if (
                not meta.get("license")
                and isinstance(
                    license_name,
                    str,
                )
                and license_name.strip()
            ):
                meta["license"] = (
                    license_name.strip()
                )

            files = (
                dataset.get("files")
                or []
            )

            if (
                not meta.get("files")
                and isinstance(
                    files,
                    list,
                )
            ):
                meta["files"] = [
                    f.get("name", "")
                    for f in files
                    if (
                        isinstance(f, dict)
                        and f.get("name")
                    )
                ][:50]

            columns = (
                dataset.get("columns")
                or []
            )

            if (
                not meta.get("columns")
                and isinstance(
                    columns,
                    list,
                )
            ):
                names: list[str] = []

                for col in columns:
                    if (
                        isinstance(
                            col,
                            dict,
                        )
                        and col.get("name")
                    ):
                        names.append(
                            str(
                                col["name"]
                            )
                        )

                    elif (
                        isinstance(
                            col,
                            str,
                        )
                        and col.strip()
                    ):
                        names.append(
                            col.strip()
                        )

                meta["columns"] = list(
                    dict.fromkeys(names)
                )[:60]

    # --------------------------------------------------------------
    # Pass 4: column JSON regex
    # --------------------------------------------------------------

    if not meta.get("columns"):
        col_block = re.search(
            r'"columns"\s*:\s*'
            r'(\[[^\]]*?'
            r'\{[^\]]*?\}'
            r'[^\]]*?\])',
            html,
            re.DOTALL,
        )

        if col_block:
            try:
                parsed = json.loads(
                    col_block.group(1)
                )

                names = [
                    str(c["name"])
                    for c in parsed
                    if (
                        isinstance(c, dict)
                        and c.get("name")
                        and len(
                            str(c["name"])
                        ) < 64
                    )
                ]

                meta["columns"] = list(
                    dict.fromkeys(names)
                )[:60]

            except (
                json.JSONDecodeError,
                AttributeError,
                TypeError,
            ):
                pass

    # --------------------------------------------------------------
    # Pass 5: license regex
    # --------------------------------------------------------------

    if not meta.get("license"):
        license_match = (
            LICENSE_RE.search(html)
        )

        if license_match:
            meta["license"] = (
                license_match.group(1)
            )

    # --------------------------------------------------------------
    # Pass 6: filename regex
    # --------------------------------------------------------------

    if not meta.get("files"):
        meta["files"] = list(
            dict.fromkeys(
                FILE_EXT_RE.findall(
                    html
                )
            )
        )[:50]

    return meta


def _metadata_is_thin(
    meta: dict[str, Any],
) -> bool:
    """Return True when browser rendering is still useful."""

    return not (
        meta.get("files")
        and meta.get("columns")
    )


def _normalise_metadata(
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Final cleanup and deduplication."""

    for key in (
        "title",
        "description",
        "license",
        "upload_date",
    ):
        if isinstance(
            meta.get(key),
            str,
        ):
            meta[key] = (
                html_lib.unescape(
                    meta[key]
                )
                .strip()
                or None
            )

    meta["tags"] = list(
        dict.fromkeys(
            html_lib.unescape(
                str(t)
            )
            for t in (
                meta.get("tags")
                or []
            )
            if str(t).strip()
        )
    )[:15]

    meta["files"] = list(
        dict.fromkeys(
            html_lib.unescape(
                str(f)
            ).strip()
            for f in (
                meta.get("files")
                or []
            )
            if str(f).strip()
        )
    )[:50]

    meta["columns"] = list(
        dict.fromkeys(
            html_lib.unescape(
                str(c)
            ).strip()
            for c in (
                meta.get("columns")
                or []
            )
            if str(c).strip()
        )
    )[:60]

    return meta


def scrape_kaggle_dataset(
    url: str,
) -> dict[str, Any]:
    """Return normalized metadata for a Kaggle dataset URL.

    The scraper deliberately attempts multiple extraction paths.

    HTTP failures do not immediately terminate the scrape because Kaggle
    may return a challenge page to normal HTTP clients while a browser
    can still obtain the real rendered page.

    A KaggleScrapeError is raised only when we cannot recover meaningful
    metadata through either HTTP or headless rendering.
    """

    logger.info(
        "Starting Kaggle scrape: %s",
        url,
    )

    meta: dict[str, Any] = {
        "title": None,
        "description": None,
        "license": None,
        "tags": [],
        "upload_date": None,
        "files": [],
        "columns": [],
    }

    # ==============================================================
    # PASS 1: NORMAL HTTP
    # ==============================================================

    resp = _http_get(url)

    http_status: int | None = None
    http_html = ""

    if resp is not None:
        http_status = resp.status_code
        http_html = resp.text or ""

        if resp.status_code == 200:
            logger.info(
                "Kaggle HTTP scrape succeeded: %s bytes",
                len(http_html),
            )

            meta = _merge_plain_http_metadata(
                meta,
                http_html,
            )

        else:
            logger.warning(
                "Kaggle HTTP returned %s. "
                "Will attempt headless rendering.",
                resp.status_code,
            )

            # Even challenge/error pages can contain useful metadata.
            meta = _merge_plain_http_metadata(
                meta,
                http_html,
            )

    # ==============================================================
    # PASS 2: HEADLESS BROWSER
    # ==============================================================

    if _metadata_is_thin(meta):
        logger.info(
            "Kaggle metadata incomplete "
            "(files=%d, columns=%d). "
            "Attempting headless rendering.",
            len(meta.get("files") or []),
            len(meta.get("columns") or []),
        )

        try:
            rendered = render_page(
                url,
                virtual_time_budget_ms=12000,
                timeout_s=40,
            )

            logger.info(
                "Headless render succeeded: %d bytes",
                len(rendered or ""),
            )

            # First run the same structured extraction against
            # the rendered DOM.
            meta = _merge_plain_http_metadata(
                meta,
                rendered,
            )

            # Then use the browser-specific extraction patterns.
            meta = _merge_rendered_dom(
                meta,
                rendered,
            )

        except HeadlessRenderError as exc:
            logger.warning(
                "Headless Kaggle render failed: %s",
                exc,
            )

        except Exception as exc:
            # Do not let an unexpected browser/parser issue silently
            # disappear in production.
            logger.exception(
                "Unexpected Kaggle headless-render error: %s",
                exc,
            )

    # ==============================================================
    # PASS 2b: RETRY HTTP when headless browser unavailable and
    # the first attempt yielded nothing (likely a Kaggle challenge page).
    # ==============================================================

    if _metadata_is_thin(meta) and not meta.get("license"):
        logger.info(
            "Kaggle metadata still incomplete after headless attempt. "
            "Retrying HTTP request once."
        )

        retry_resp = _http_get(url)

        if retry_resp is not None and retry_resp.text:
            meta = _merge_plain_http_metadata(
                meta,
                retry_resp.text,
            )

    # ==============================================================
    # PASS 3: FINAL URL SLUG FALLBACK
    # ==============================================================

    if not meta.get("title"):
        slug_meta = _slug_fallback(url)

        for key, value in slug_meta.items():
            if not meta.get(key):
                meta[key] = value

    # ==============================================================
    # FINAL NORMALISATION
    # ==============================================================

    meta = _normalise_metadata(meta)

    files_count = len(
        meta.get("files") or []
    )

    columns_count = len(
        meta.get("columns") or []
    )

    logger.info(
        "Kaggle scrape complete: "
        "status=%s files=%d columns=%d "
        "license=%s title=%r",
        http_status,
        files_count,
        columns_count,
        bool(meta.get("license")),
        meta.get("title"),
    )

    # If HTTP failed and browser failed and we have absolutely no
    # meaningful dataset metadata, raise a useful error instead of
    # pretending the scrape was successful.
    meaningful_metadata = any(
        [
            meta.get("title"),
            meta.get("description"),
            meta.get("license"),
            meta.get("files"),
            meta.get("columns"),
            meta.get("upload_date"),
        ]
    )

    if not meaningful_metadata:
        if http_status is not None:
            raise KaggleScrapeError(
                "Unable to recover Kaggle metadata. "
                f"HTTP status={http_status}. "
                "The headless browser fallback also failed."
            )

        raise KaggleScrapeError(
            "Unable to recover Kaggle metadata. "
            "The HTTP request failed and the "
            "headless browser fallback failed."
        )

    return meta