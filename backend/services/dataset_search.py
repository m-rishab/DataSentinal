"""Alternative-dataset discovery: Kaggle search + HuggingFace datasets API.

Kaggle's public search endpoint sometimes requires auth; we try it first and
fall back to the keyless HuggingFace datasets API, so this never hard-fails.
"""

from __future__ import annotations

from typing import Any

import requests

KAGGLE_SEARCH = "https://www.kaggle.com/api/v1/datasets/list"
HF_SEARCH = "https://huggingface.co/api/datasets"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def search_kaggle(query: str, limit: int = 5) -> list[dict[str, Any]]:
    try:
        resp = requests.get(
            KAGGLE_SEARCH,
            params={"search": query, "page": 1, "sortBy": "relevance"},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        payload = resp.json()
        if isinstance(payload, dict):
            payload = payload.get("datasets") or []
        out = []
        for item in payload[:limit]:
            if not isinstance(item, dict):
                continue
            ref = item.get("ref") or item.get("url")
            url = f"https://www.kaggle.com/datasets/{ref}" if ref and not str(ref).startswith("http") else ref
            out.append(
                {
                    "name": item.get("title") or ref or "Untitled dataset",
                    "url": url,
                    "source": "kaggle",
                }
            )
        return out
    except (requests.RequestException, ValueError):
        return []


def search_huggingface(query: str, limit: int = 5) -> list[dict[str, Any]]:
    try:
        resp = requests.get(
            HF_SEARCH,
            params={"search": query, "limit": limit, "sort": "downloads", "direction": -1},
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        out = []
        for item in resp.json()[:limit]:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            out.append(
                {
                    "name": item["id"],
                    "url": f"https://huggingface.co/datasets/{item['id']}",
                    "source": "huggingface",
                }
            )
        return out
    except (requests.RequestException, ValueError):
        return []


def find_alternatives(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Kaggle first, then HuggingFace to fill remaining slots."""
    results = search_kaggle(query, limit)
    if len(results) < limit:
        results.extend(search_huggingface(query, limit - len(results)))
    return results[:limit]
