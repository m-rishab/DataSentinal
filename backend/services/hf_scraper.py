"""Hugging Face dataset scraper — uses the public Hub API (no auth needed).

Produces the same metadata shape as the Kaggle scraper so every downstream
agent works unchanged. Where possible we also fetch real column names and a
sample of rows through the datasets-server API, enabling actual content
inspection instead of page-text heuristics.
"""

from __future__ import annotations

import re
from typing import Any

import requests

USER_AGENT = "DataSentinel/1.0 (dataset provenance audit)"
API_TIMEOUT = 20.0


class HFDatasetError(Exception):
    pass


def is_huggingface_url(url: str) -> bool:
    return bool(re.match(r"^https?://(www\.)?huggingface\.co/datasets/", url or ""))


def _dataset_id(url: str) -> str:
    """Extract 'owner/name' from a HF datasets URL."""
    path = url.split("huggingface.co/datasets/")[-1].strip("/")
    parts = [p for p in path.split("/") if p]
    if not parts:
        raise HFDatasetError(f"Could not parse dataset id from {url}")
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}"
    return parts[0]


def _hub_metadata(dataset_id: str) -> dict:
    resp = requests.get(
        f"https://huggingface.co/api/datasets/{dataset_id}",
        headers={"User-Agent": USER_AGENT},
        timeout=API_TIMEOUT,
    )
    if resp.status_code != 200:
        raise HFDatasetError(f"Hub API returned HTTP {resp.status_code} for {dataset_id}")
    return resp.json()


def _first_rows(dataset_id: str) -> tuple[list[str], list[dict]] | tuple[list[str], list[dict]]:
    """Fetch column names + sample rows via datasets-server (best effort)."""
    try:
        splits = requests.get(
            f"https://datasets-server.huggingface.co/splits?dataset={dataset_id}",
            headers={"User-Agent": USER_AGENT},
            timeout=API_TIMEOUT,
        ).json()
        split_list = ((splits.get("splits") or [{}])[0])
        config = split_list.get("config", "default")
        split = split_list.get("split", "train")
    except Exception:  # noqa: BLE001 — best effort only
        config, split = "default", "train"

    try:
        data = requests.get(
            f"https://datasets-server.huggingface.co/first-rows"
            f"?dataset={dataset_id}&config={config}&split={split}",
            headers={"User-Agent": USER_AGENT},
            timeout=API_TIMEOUT,
        ).json()
        features = [f.get("name") for f in (data.get("features") or []) if f.get("name")]
        rows = [r.get("row") for r in (data.get("rows") or []) if isinstance(r.get("row"), dict)]
        return features, rows[:20]
    except Exception:  # noqa: BLE001
        return [], []


def scrape_huggingface_dataset(url: str) -> dict[str, Any]:
    """Normalized metadata for a Hugging Face dataset URL."""
    dataset_id = _dataset_id(url)
    hub = _hub_metadata(dataset_id)

    license_name = None
    card = hub.get("card_data") or hub.get("cardData") or {}
    if isinstance(card.get("license"), str):
        license_name = card["license"]
    elif isinstance(card.get("licenses"), list) and card["licenses"]:
        license_name = ", ".join(str(x) for x in card["licenses"][:2])

    files = [
        s.get("rfilename")
        for s in (hub.get("siblings") or [])
        if s.get("rfilename") and not s["rfilename"].startswith(".")
    ][:50]

    description = None
    try:
        readme = requests.get(
            f"https://huggingface.co/datasets/{dataset_id}/raw/main/README.md",
            headers={"User-Agent": USER_AGENT},
            timeout=API_TIMEOUT,
        )
        if readme.status_code == 200:
            body = re.sub(r"^---.*?---\s*", "", readme.text.strip(), flags=re.DOTALL)
            description = body[:4000] or None
    except Exception:  # noqa: BLE001
        pass

    columns, rows = [], []
    if files and any(f.endswith((".csv", ".json", ".parquet")) for f in files):
        columns, rows = _first_rows(dataset_id)

    tags = [t for t in (hub.get("tags") or []) if not t.startswith("size_categories")]
    title = dataset_id.split("/")[-1].replace("-", " ").title()

    return {
        "title": title,
        "description": description,
        "license": license_name,
        "tags": tags[:15],
        "upload_date": hub.get("created_at") or hub.get("lastModified"),
        "files": files,
        "columns": columns,
        # Extra fields unique to richer sources.
        "sample_rows": rows,
        "downloads": hub.get("downloads"),
        "likes": hub.get("likes"),
        "source": "huggingface",
    }
