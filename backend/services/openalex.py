"""OpenAlex API client (paper search + related-work discovery).

OpenAlex (https://openalex.org) is a free scholarly index — no API key needed.
It replaces the Semantic Scholar client: far more generous rate limits and
full-text search across titles, abstracts and paper bodies.

Rate limits:
  * Default pool: ~100 requests/day, ~1 req/s. Enough for occasional audits.
  * Polite pool: 100k requests/day at up to 10 req/s — enabled by setting
    OPENALEX_MAILTO to your email address in .env (recommended).

Important provenance rule: this module NEVER fabricates papers when the API
fails. An unavailable search is represented by OpenAlexError so the caller can
report missing evidence honestly. A search that simply returns no matches is a
valid empty result, not an error.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from typing import Any, Optional

import requests

OPENALEX = "https://api.openalex.org"

_MAILTO = (os.getenv("OPENALEX_MAILTO") or "").strip()

# OpenAlex semantics are ASCII whitespace-insensitive on ?search=; avoid
# sending raw quotes that some indexes mishandle. We still pass the polite
# pool email and a descriptive User-Agent.
_DEFAULT_UA = "DataSentinel/1.0 (dataset provenance audit)"

# Like the old Semantic Scholar client, graph nodes call this module
# concurrently via asyncio.to_thread. Keep calls spaced out modestly so we stay
# well inside even the default pool; polite-pool users are unaffected.
_THROTTLE_LOCK = threading.Lock()
_LAST_CALL_TS = 0.0
_MIN_INTERVAL_SECONDS = float(os.getenv("OPENALEX_MIN_INTERVAL_SECONDS", "0.35"))

# Responses are cached by request signature so the citation tracer and
# related-work agent stop paying duplicate outbound calls within one run.
_RESPONSE_CACHE: dict[str, dict] = {}
_CACHE_LOCK = threading.Lock()


class OpenAlexError(Exception):
    """Raised when OpenAlex cannot provide a trustworthy response."""


def _headers() -> dict[str, str]:
    return {"User-Agent": _DEFAULT_UA}


def _throttle() -> None:
    global _LAST_CALL_TS
    with _THROTTLE_LOCK:
        now = time.monotonic()
        wait = _MIN_INTERVAL_SECONDS - (now - _LAST_CALL_TS)
        if wait > 0:
            time.sleep(wait)
        _LAST_CALL_TS = time.monotonic()


def _cache_key(url: str, params: dict) -> str:
    raw = url + "|" + "|".join(f"{k}={v}" for k, v in sorted(params.items()))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get(url: str, params: dict, retries: int = 3) -> dict:
    key = _cache_key(url, params)
    with _CACHE_LOCK:
        cached = _RESPONSE_CACHE.get(key)
    if cached is not None:
        return cached

    last_error: Optional[str] = None
    for attempt in range(retries + 1):
        _throttle()
        query = dict(params)
        if _MAILTO:
            query["mailto"] = _MAILTO
        try:
            resp = requests.get(url, params=query, headers=_headers(), timeout=25)
        except requests.RequestException as exc:
            raise OpenAlexError(f"Network error: {exc}") from exc

        if resp.status_code == 429 and attempt < retries:
            time.sleep(2.0 + attempt)
            continue

        if resp.status_code != 200:
            raise OpenAlexError(f"HTTP {resp.status_code} from {url}: {resp.text[:200]}")

        try:
            data = resp.json()
        except ValueError as exc:
            raise OpenAlexError(f"Invalid JSON from {url}") from exc

        with _CACHE_LOCK:
            _RESPONSE_CACHE[key] = data
        return data

    raise OpenAlexError(last_error or f"Exhausted retries for {url}")


_FIELDS = (
    "id,doi,title,publication_year,primary_location,cited_by_count,"
    "abstract_inverted_index"
)


def _reconstruct_abstract(inverted: Optional[dict]) -> Optional[str]:
    """OpenAlex stores abstracts positionally (word -> positions); rebuild text."""
    if not isinstance(inverted, dict) or not inverted:
        return None
    positions: dict[int, str] = {}
    for word, idxs in inverted.items():
        for idx in idxs if isinstance(idxs, list) else [idxs]:
            positions[int(idx)] = word
    if not positions:
        return None
    text = " ".join(positions[i] for i in sorted(positions))
    return text[:2000] or None


def _normalize_work(work: dict) -> dict[str, Any]:
    source = ((work.get("primary_location") or {}).get("source") or {})
    venue = source.get("display_name")
    doi = (work.get("doi") or "").replace("https://doi.org/", "") or None
    openalex_id = (work.get("id") or "").rsplit("/", 1)[-1]
    return {
        "title": work.get("title"),
        "year": work.get("publication_year"),
        "venue": venue or None,
        "citation_count": work.get("cited_by_count"),
        "url": work.get("doi") or work.get("id"),
        "doi": doi,
        "work_id": openalex_id,
        "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
    }


def search_papers(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search OpenAlex for papers matching a query.

    Search results are discovery candidates only. Callers must independently
    verify whether a paper actually cites or uses a dataset.
    """
    query = (query or "").strip()
    if not query:
        return []

    data = _get(
        f"{OPENALEX}/works",
        {
            "search": query[:512],
            "per-page": max(1, min(int(limit), 100)),
            "select": _FIELDS,
        },
    )

    papers: list[dict[str, Any]] = []
    for work in data.get("results") or []:
        normalized = _normalize_work(work)
        if not normalized.get("title"):
            continue
        papers.append(normalized)
    return papers


def recommend_papers(work_id: str, limit: int = 6) -> list[dict[str, Any]]:
    """Return papers that cite the seed work (genuinely related, one call)."""
    if not work_id:
        return []
    if not str(work_id).startswith("W"):
        raise OpenAlexError(f"Not an OpenAlex work id: {work_id}")

    data = _get(
        f"{OPENALEX}/works",
        {
            "filter": f"cites:{work_id}",
            "per-page": max(1, min(int(limit), 100)),
            "sort": "cited_by_count:desc",
            "select": _FIELDS,
        },
    )

    papers: list[dict[str, Any]] = []
    for work in data.get("results") or []:
        normalized = _normalize_work(work)
        if not normalized.get("title"):
            continue
        papers.append(normalized)
    return papers


def find_seed_paper(title: str) -> Optional[dict[str, Any]]:
    """Find a possible seed paper for related-work discovery.

    This is intentionally not treated as proof that the seed paper cites the
    dataset. It is only a starting point for the related-work agent.
    """
    results = search_papers(title, limit=3)
    return results[0] if results else None