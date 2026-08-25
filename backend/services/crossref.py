"""Crossref API client — DOI resolution + retraction status detection.

Crossref does not expose a single "retracted" boolean; we combine the
standard signals: explicit relation types, update-to links, assertions,
and title text of the record.
"""

from __future__ import annotations

from typing import Any, Optional

import requests

CROSSREF_WORKS = "https://api.crossref.org/works"

RETRACT_RELATIONS = {
    "is-retraction-of",
    "is-retracted-by",
    "is-retraction-of-annotation",
}


class CrossrefError(Exception):
    pass


def _get(url: str, params: Optional[dict] = None, timeout: float = 20.0) -> dict:
    try:
        resp = requests.get(
            url,
            params=params,
            headers={"User-Agent": "DataSentinel/1.0 (mailto:auditor@datasentinel.example)"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise CrossrefError(f"Network error: {exc}") from exc
    if resp.status_code == 404:
        raise CrossrefError(f"Not found: {url}")
    if resp.status_code != 200:
        raise CrossrefError(f"HTTP {resp.status_code} from {url}: {resp.text[:200]}")
    try:
        return resp.json()
    except ValueError as exc:
        raise CrossrefError(f"Invalid JSON from {url}") from exc


def resolve_doi_by_title(title: str) -> Optional[str]:
    """Best-effort DOI lookup by paper title (returns None when ambiguous)."""
    if not title.strip():
        return None
    try:
        data = _get(
            CROSSREF_WORKS,
            {"query.title": title[:300], "rows": 1, "select": "DOI,title"},
        )
    except CrossrefError:
        return None
    items = (data.get("message") or {}).get("items") or []
    if not items:
        return None
    return items[0].get("DOI")


def check_retraction(doi: str) -> dict[str, Any]:
    """Check retraction status for a DOI.

    Returns {"status": "retracted"|"possibly_retracted"|"not_retracted",
             "detail": str}
    """
    data = _get(f"{CROSSREF_WORKS}/{doi}")
    message = data.get("message") or {}
    title_parts = message.get("title") or []
    title_text = " ".join(title_parts).lower()

    relations = message.get("relation") or {}
    for rel_key, rel_value in relations.items():
        if str(rel_key).lower() in RETRACT_RELATIONS and rel_value:
            return {
                "status": "retracted",
                "detail": f'Crossref relation "{rel_key}" links this record to a retraction.',
            }

    for update in message.get("update-to") or []:
        label = ((update.get("label") or "") + " " + (update.get("type") or "")).lower()
        if "retract" in label:
            return {
                "status": "retracted",
                "detail": f"Crossref update-to link marks this record as retracted ({label.strip()}).",
            }

    for assertion in message.get("assertion") or []:
        if not isinstance(assertion, dict):
            continue
        if "retract" in str(assertion.get("label", "")).lower():
            return {
                "status": "retracted",
                "detail": f'Crossref assertion: {assertion.get("label")} — {assertion.get("explanation", "")[:200]}',
            }

    if "retract" in title_text:
        return {
            "status": "possibly_retracted",
            "detail": 'The Crossref record title mentions "retraction" — verify manually.',
        }

    return {"status": "not_retracted", "detail": "No retraction signals found in the Crossref record."}
