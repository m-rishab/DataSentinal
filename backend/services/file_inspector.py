"""Content inspection over scraped metadata (and real rows when available).

The inspector turns raw scrape output into concrete, human-readable checks:
whether the listed columns match the actual data headers, which columns look
personally identifiable, and how much of the listing could be verified.
"""

from __future__ import annotations

import re
from typing import Any

PII_COLUMN_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("email address", re.compile(r"\b(e[-_ ]?mail|mail)\b", re.I)),
    ("phone number", re.compile(r"\b(phone|mobile|tel|contact[_ -]?no)\b", re.I)),
    ("person name", re.compile(r"\b(first[_ -]?name|last[_ -]?name|full[_ -]?name|customer[_ -]?name|patient[_ -]?name|username|user[_ -]?id)\b", re.I)),
    ("postal address", re.compile(r"\b(address|street|zip|postcode|postal)\b", re.I)),
    ("government ID", re.compile(r"\b(ssn|social[_ -]?security|passport|national[_ -]?id|aadhaar|pan[_ -]?no)\b", re.I)),
    ("date of birth", re.compile(r"\b(dob|birth|birthdate|birthday)\b", re.I)),
    ("precise geolocation", re.compile(r"\b(lat(itude)?|long(itude)?|geo(_location)?|coordinates?|gps)\b", re.I)),
    ("IP address", re.compile(r"\b(ip[_ -]?addr(ess)?|ip)\b", re.I)),
    ("financial account", re.compile(r"\b(card|iban|swift|bank[_ -]?acc|credit[_ -]?card|cvv)\b", re.I)),
    ("biometric identifier", re.compile(r"\b(fingerprint|face(print)?|retina|iris[_ -]?(scan|code))\b", re.I)),
]


def detect_pii_columns(columns: list[str]) -> dict[str, list[str]]:
    """Map PII category -> matching column names."""
    hits: dict[str, list[str]] = {}
    for column in columns or []:
        for label, pattern in PII_COLUMN_PATTERNS:
            if pattern.search(column or ""):
                hits.setdefault(label, []).append(column)
    return hits


def inspect_dataset(meta: dict[str, Any]) -> dict[str, Any]:
    """Produce the file_inspection block for the report.

    `meta.sample_rows` (Hugging Face) enables header verification and value
    sampling; Kaggle listings usually only expose names, so several checks
    honestly report themselves as not verifiable instead of guessing.
    """
    files = meta.get("files") or []
    columns = meta.get("columns") or []
    sample_rows = meta.get("sample_rows") or []

    checks: list[dict] = []
    verified_headers: bool | None = None

    if sample_rows:
        actual_headers = list(sample_rows[0].keys())
        listed = [c.lower() for c in columns]
        matches = sum(1 for h in actual_headers if h.lower() in listed)
        verified_headers = len(actual_headers) > 0 and matches >= max(1, len(actual_headers) // 2)
        checks.append({
            "check": "Column headers match listing",
            "result": "pass" if verified_headers else "mismatch",
            "detail": f"{matches}/{len(actual_headers)} data headers appear in the listed columns.",
        })
        checks.append({
            "check": "Content sample retrieved",
            "result": "pass",
            "detail": f"Read {len(sample_rows)} real row(s) through the datasets-server API.",
        })
        # Value-level PII sniffing on the sample (emails/long digit strings).
        pii_values = set()
        for row in sample_rows[:10]:
            for value in row.values():
                text = str(value)
                if re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text):
                    pii_values.add("email-like values")
                if re.fullmatch(r"\d{9,}", text):
                    pii_values.add("long numeric identifiers")
        if pii_values:
            checks.append({
                "check": "Sampled values look de-identified",
                "result": "warning",
                "detail": f"Found {', '.join(sorted(pii_values))} in the sample rows.",
            })
        else:
            checks.append({
                "check": "Sampled values look de-identified",
                "result": "pass",
                "detail": "No obvious direct identifiers in sampled values.",
            })
    else:
        checks.append({
            "check": "Content sample retrieved",
            "result": "skipped",
            "detail": "Source does not expose downloadable rows anonymously; "
                      "inspection ran on filenames and column listings only.",
        })

    pii_hits = detect_pii_columns(columns)
    if pii_hits:
        categories = "; ".join(f"{label} ({', '.join(cols)})" for label, cols in pii_hits.items())
        checks.append({
            "check": "Personally identifiable columns",
            "result": "warning",
            "detail": f"Column names suggest: {categories}.",
        })
    elif columns:
        checks.append({
            "check": "Personally identifiable columns",
            "result": "pass",
            "detail": "No column name matched common identifier patterns.",
        })

    if not files:
        checks.append({
            "check": "File inventory",
            "result": "warning",
            "detail": "No file list was exposed by the source page.",
        })

    return {
        "source": meta.get("source") or "kaggle",
        "files_checked": len(files),
        "columns_detected": len(columns),
        "rows_sampled": len(sample_rows),
        "headers_verified": verified_headers,
        "pii_columns": sorted({c for cols in pii_hits.values() for c in cols}),
        "checks": checks,
    }
