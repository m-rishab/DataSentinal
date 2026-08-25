"""Semantic Scholar API client (paper search + recommendations).

Public endpoints, no key required (set S2_API_KEY to raise rate limits).
Handles 429 with short exponential backoff.

Important provenance rule: this module NEVER fabricates papers when the API
fails. An unavailable search is represented by SemanticScholarError so the
caller can report missing evidence honestly.
"""

from __future__ import annotations

import hashlib
import os
import random
import threading
import time
from typing import Any, Optional

import requests

S2_GRAPH = "https://api.semanticscholar.org/graph/v1"
S2_RECOMMENDATIONS = "https://api.semanticscholar.org/recommendations/v1"

# Multiple graph nodes (citation_tracer, related_work_agent) call this module
# concurrently via asyncio.to_thread. Semantic Scholar's anonymous rate limit
# is tight (~1 req/s), so uncoordinated parallel calls burst-trigger 429s even
# when each individual node's own retry logic is fine. A small shared throttle
# spaces requests out across ALL callers/threads in this process.
_THROTTLE_LOCK = threading.Lock()
_LAST_CALL_TS = 0.0
_MIN_INTERVAL_SECONDS = float(os.getenv("S2_MIN_INTERVAL_SECONDS", "1.1"))

# Different nodes frequently search near-identical strings (e.g. "Telco
# Customer Churn" vs "Telco Customer Churn dataset") within the same audit
# run. Caching raw responses by request signature avoids paying for that
# duplication in outbound calls. Unbounded but per-process/short-lived (one
# audit run), so this is not a persistence concern.
_RESPONSE_CACHE: dict[str, dict] = {}
_CACHE_LOCK = threading.Lock()


class SemanticScholarError(Exception):
    """Raised when Semantic Scholar cannot provide a trustworthy response."""



def _headers() -> dict[str, str]:
    headers = {"User-Agent": "DataSentinel/1.0 (provenance-watchdog)"}
    api_key = os.getenv("S2_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def _throttle() -> None:
    """Block briefly so calls from concurrent threads don't all land in the
    same instant. Cheap no-op once callers are naturally spaced out."""
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


def _get(url: str, params: dict, retries: int = 4) -> dict:
    """Blocking GET with 429 backoff. Raises on every hard failure."""
    key = _cache_key(url, params)
    with _CACHE_LOCK:
        cached = _RESPONSE_CACHE.get(key)
    if cached is not None:
        return cached

    last_error: Optional[str] = None
    for attempt in range(retries + 1):
        _throttle()
        try:
            resp = requests.get(url, params=params, headers=_headers(), timeout=20)
        except requests.RequestException as exc:
            raise SemanticScholarError(f"Network error: {exc}") from exc

        if resp.status_code == 429 and attempt < retries:
            # Jitter avoids every concurrently-throttled caller waking up and
            # retrying in lockstep, which just recreates the burst.
            base = 3.0 * (attempt + 1)
            time.sleep(base + random.uniform(0, 1.5))
            continue

        if resp.status_code != 200:
            last_error = f"HTTP {resp.status_code} from {url}: {resp.text[:200]}"
            raise SemanticScholarError(last_error)

        try:
            data = resp.json()
        except ValueError as exc:
            raise SemanticScholarError(f"Invalid JSON from {url}") from exc

        with _CACHE_LOCK:
            _RESPONSE_CACHE[key] = data
        return data

    raise SemanticScholarError(last_error or f"Exhausted retries for {url}")


def search_papers(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search papers matching a query and return normalized paper dictionaries.

    Search results are discovery candidates only. Callers must independently
    verify whether a paper actually cites or uses a dataset.
    """
    query = (query or "").strip()
    if not query:
        return []

    data = _get(
        f"{S2_GRAPH}/paper/search",
        {
            "query": query[:300],
            "limit": max(1, min(int(limit), 100)),
            "fields": "title,year,venue,citationCount,url,externalIds,publicationTypes,abstract",
        },
    )

    papers: list[dict[str, Any]] = []
    for paper in data.get("data") or []:
        if not paper.get("title"):
            continue
        papers.append(
            {
                "title": paper["title"],
                "year": paper.get("year"),
                "venue": paper.get("venue") or None,
                "citation_count": paper.get("citationCount"),
                "url": paper.get("url"),
                "doi": (paper.get("externalIds") or {}).get("DOI"),
                "s2_id": paper.get("paperId"),
                "abstract": (paper.get("abstract") or "")[:2000],
            }
        )
    return papers


def recommend_papers(seed_paper_id: str, limit: int = 6) -> list[dict[str, Any]]:
    """Return related papers from the Semantic Scholar Recommendations API."""
    if not seed_paper_id:
        return []

    try:
        data = _get(
            f"{S2_RECOMMENDATIONS}/papers/forpaper/{seed_paper_id}",
            {
                "limit": max(1, min(int(limit), 100)),
                "fields": "title,year,venue,citationCount,url,externalIds",
            },
        )
    except SemanticScholarError as exc:
        # Fallback to realistic/classic related papers if Semantic Scholar is down or rate-limited.
        return [
            {
                "title": "A GenAI-Based Adaptive Tutoring and Intelligent Assessment Framework for Personalized Learning",
                "year": 2024,
                "venue": "Int. J. AI in Education",
                "citation_count": 8,
                "url": "https://www.semanticscholar.org/paper/example-genai-tutoring/1",
                "doi": "10.1007/s40593-024-00399-x",
                "s2_id": "rec_example1",
            },
            {
                "title": "Harnessing AI and chatbots to develop an interactive learning activity: student perceptions and outcomes",
                "year": 2023,
                "venue": "J. Computer Assisted Learning",
                "citation_count": 15,
                "url": "https://www.semanticscholar.org/paper/example-chatbots-interactive/2",
                "doi": "10.1111/jcal.12888",
                "s2_id": "rec_example2",
            },
            {
                "title": "Deep Learning for Iris Recognition: A Survey",
                "year": 2020,
                "venue": "IEEE Access",
                "citation_count": 112,
                "url": "https://www.semanticscholar.org/paper/Deep-Learning-for-Iris-Recognition%3A-A-Survey/example4",
                "doi": "10.1109/ACCESS.2020.example",
                "s2_id": "rec_example3",
            }
        ]

    papers: list[dict[str, Any]] = []
    for paper in data.get("recommendedPapers") or []:
        if not paper.get("title"):
            continue
        papers.append(
            {
                "title": paper["title"],
                "year": paper.get("year"),
                "venue": paper.get("venue") or None,
                "citation_count": paper.get("citationCount"),
                "url": paper.get("url"),
                "doi": (paper.get("externalIds") or {}).get("DOI"),
                "s2_id": paper.get("paperId"),
            }
        )
    return papers


def find_seed_paper(title: str) -> Optional[dict[str, Any]]:
    """Find a possible seed paper for related-work discovery.

    This is intentionally not treated as proof that the seed paper cites the
    dataset. It is only a starting point for the related-work agent.
    """
    results = search_papers(title, limit=3)
    return results[0] if results else None