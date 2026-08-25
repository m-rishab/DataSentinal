"""In-memory scrape cache — identical URLs are re-audited a lot, and every
fresh scrape costs seconds plus Kaggle rate-limit risk. Entries live 30
minutes and the cache is process-local (fine for a single-instance app).
"""

from __future__ import annotations

import copy
import time
from collections import OrderedDict
from typing import Any, Callable

TTL_SECONDS = 30 * 60
MAX_ENTRIES = 128

_cache: "OrderedDict[str, tuple[float, dict[str, Any]]]" = OrderedDict()


def _get(url: str) -> dict[str, Any] | None:
    entry = _cache.get(url)
    if not entry:
        return None
    stored_at, meta = entry
    if time.monotonic() - stored_at > TTL_SECONDS:
        _cache.pop(url, None)
        return None
    _cache.move_to_end(url)
    # Callers mutate the returned dict freely (e.g. popping sample_rows),
    # so hand out a deep copy — never the cached object itself.
    return copy.deepcopy(meta)


def _put(url: str, meta: dict[str, Any]) -> None:
    _cache[url] = (time.monotonic(), copy.deepcopy(meta))
    _cache.move_to_end(url)
    while len(_cache) > MAX_ENTRIES:
        _cache.popitem(last=False)


def get_or_scrape(
    url: str,
    kaggle_scraper: Callable[[str], dict],
    hf_scraper: Callable[[str], dict],
    is_huggingface: Callable[[str], bool],
) -> dict[str, Any]:
    """Return cached metadata for `url` or scrape + cache it."""
    hit = _get(url)
    if hit is not None:
        hit["_cache"] = "hit"
        return hit
    meta = hf_scraper(url) if is_huggingface(url) else kaggle_scraper(url)
    _put(url, meta)
    return meta
