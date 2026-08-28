"""Real content profiling — actually opens the dataset and computes stats.

Sources, in order of preference:
- Hugging Face: datasets-server /rows API (up to 100 rows, no auth needed)
- Kaggle: official download endpoint with optional KAGGLE_USERNAME /
  KAGGLE_KEY env credentials (the endpoint requires auth)

Everything is best-effort: any failure returns None / a skipped check so the
audit continues without blocking.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import zipfile
from typing import Any

import requests

# Reuse the project .env loader so KAGGLE_* vars are present even when this
# module is used outside the API process.
try:
    from backend.services.nvidia_client import _load_dotenv as _ensure_project_env

    _ensure_project_env()
except Exception:  # noqa: BLE001 — env loading is best-effort
    pass

USER_AGENT = "DataSentinel/1.0 (dataset provenance audit)"
TIMEOUT = 30.0
MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024  # profile at most ~8 MB
MAX_ROWS = 100

MISSING_TOKENS = {"", "na", "n/a", "nan", "null", "none", "missing", "?"}


class _ProfileSkipped(Exception):
    pass


# ---------------------------------------------------------------------------
# Source adapters
# ---------------------------------------------------------------------------


def _hf_rows(dataset_id: str) -> list[dict]:
    """Fetch up to MAX_ROWS real rows via the datasets-server /rows API."""
    config, split = "default", "train"
    try:
        splits_resp = requests.get(
            f"https://datasets-server.huggingface.co/splits?dataset={dataset_id}",
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        if splits_resp.status_code == 200:
            splits = splits_resp.json()
            first = (splits.get("splits") or [{}])[0]
            config = first.get("config", "default")
            split = first.get("split", "train")
    except Exception:  # noqa: BLE001 — fall back to defaults
        pass

    resp = requests.get(
        "https://datasets-server.huggingface.co/rows"
        f"?dataset={dataset_id}&config={config}&split={split}&offset=0&length={MAX_ROWS}",
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT,
    )
    if resp.status_code != 200:
        # Log the actual error for debugging
        try:
            error_detail = resp.json()
            raise _ProfileSkipped(
                f"datasets-server returned HTTP {resp.status_code}: {error_detail.get('error', 'unknown error')}"
            )
        except Exception:
            raise _ProfileSkipped(f"datasets-server returned HTTP {resp.status_code}")
    rows = [
        r.get("row")
        for r in (resp.json().get("rows") or [])
        if isinstance(r.get("row"), dict)
    ]
    if not rows:
        raise _ProfileSkipped("datasets-server returned no rows")
    return rows


def _parse_csv_text(text: str) -> list[dict]:
    """Parse CSV text; drop a trailing truncated row from partial downloads."""
    reader = csv.DictReader(io.StringIO(text))
    rows = [dict(r) for r in reader]
    if text and not text.endswith("\n") and rows:
        rows = rows[:-1]  # last line may be cut mid-row
    return [r for r in rows if any((v or "").strip() for v in r.values())]


def _kaggle_creds() -> tuple[dict[str, str] | None, tuple[str, str] | None]:
    """Resolve Kaggle credentials: API token first, then legacy user/key.

    Token sources (in order): KAGGLE_API_TOKEN env, ~/.kaggle/access_token.
    Legacy sources: KAGGLE_USERNAME + KAGGLE_KEY env, ~/.kaggle/kaggle.json.
    Returns (bearer_headers, basic_auth) — exactly one is non-None.
    """
    token = os.environ.get("KAGGLE_API_TOKEN", "").strip()
    if not token:
        token_path = os.path.expanduser("~/.kaggle/access_token")
        try:
            with open(token_path, encoding="utf-8") as fh:
                token = fh.read().strip()
        except OSError:
            token = ""
    if token:
        return {"Authorization": f"Bearer {token}"}, None

    username = os.environ.get("KAGGLE_USERNAME", "").strip()
    key = os.environ.get("KAGGLE_KEY", "").strip()
    if not (username and key):
        json_path = os.path.expanduser("~/.kaggle/kaggle.json")
        try:
            with open(json_path, encoding="utf-8") as fh:
                stored = json.load(fh)
            username = username or str(stored.get("username", "")).strip()
            key = key or str(stored.get("key", "")).strip()
        except (OSError, ValueError):
            pass
    if username and key:
        return None, (username, key)
    raise _ProfileSkipped(
        "No Kaggle credentials found — set KAGGLE_API_TOKEN (or ~/.kaggle/access_token), "
        "or KAGGLE_USERNAME + KAGGLE_KEY"
    )


def _kaggle_rows(url: str) -> list[dict]:
    """Download via Kaggle's API using a token or legacy credentials."""
    headers, basic_auth = _kaggle_creds()

    slug = url.rstrip("/").split("/datasets/")[-1].strip("/")
    download_url = f"https://www.kaggle.com/api/v1/datasets/download/{slug}"
    resp = requests.get(
        download_url,
        headers={"User-Agent": USER_AGENT, **(headers or {})},
        auth=basic_auth,
        stream=True,
        timeout=TIMEOUT,
    )
    if resp.status_code in (401, 403):
        raise _ProfileSkipped("Kaggle rejected the configured credentials")
    if resp.status_code != 200:
        raise _ProfileSkipped(f"Kaggle download returned HTTP {resp.status_code}")

    # Bail out early on huge bundles instead of truncating mid-archive.
    try:
        content_length = int(resp.headers.get("Content-Length") or 0)
    except ValueError:
        content_length = 0
    if content_length > MAX_DOWNLOAD_BYTES:
        readable = f"{content_length / (1024 ** 3):.1f} GB" if content_length >= 1024 ** 3 \
            else f"{content_length / (1024 ** 2):.1f} MB"
        raise _ProfileSkipped(
            f"Dataset bundle is {readable} — larger than the "
            f"{MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB inline-profiling cap"
        )

    head = b""
    payload = b""
    for chunk in resp.iter_content(chunk_size=65536):
        if not chunk:
            continue
        if len(head) < 4:
            head += chunk[: 4 - len(head)]
        payload += chunk
        if len(payload) >= MAX_DOWNLOAD_BYTES:
            break

    if head.startswith(b"PK"):
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                name = next(
                    (n for n in zf.namelist() if n.lower().endswith((".csv", ".json", ".jsonl"))),
                    None,
                )
                if not name:
                    raise _ProfileSkipped("Archive contained no CSV/JSON file")
                raw = zf.read(name)[:MAX_DOWNLOAD_BYTES].decode("utf-8", errors="replace")
        except zipfile.BadZipFile:
            # Truncated (>cap) or corrupt archive — say so plainly.
            raise _ProfileSkipped(
                "Bundle is an archive too large or too truncated to profile inline"
            )
    else:
        raw = payload.decode("utf-8", errors="replace")

    if re.search(r"<html|<!doctype", raw[:600], re.IGNORECASE):
        raise _ProfileSkipped("Source returned a web page instead of a data file")

    stripped = raw.lstrip()
    if stripped.startswith(("[", "{")):
        try:
            data = json.loads(stripped)
            rows = data if isinstance(data, list) else [data]
            rows = [r for r in rows if isinstance(r, dict)]
            if rows:
                return rows[:MAX_ROWS]
        except json.JSONDecodeError:
            lines = [
                json.loads(line)
                for line in stripped.splitlines()
                if line.strip().startswith("{")
            ]
            rows = [r for r in lines if isinstance(r, dict)]
            if rows:
                return rows[:MAX_ROWS]
            raise _ProfileSkipped("Could not parse JSON content")

    parsed = _parse_csv_text(raw)
    if not parsed:
        raise _ProfileSkipped("Downloaded file produced no parseable rows")
    # Guard against HTML/challenge text being misread as a one-column CSV.
    if max(len(r) for r in parsed[:10]) > 512 or any(
        "<html" in str(v).lower() for r in parsed[:5] for v in r.values()
    ):
        raise _ProfileSkipped("Source did not return tabular data")
    return parsed[:MAX_ROWS]


# ---------------------------------------------------------------------------
# Profiling core
# ---------------------------------------------------------------------------


def _is_missing(value: Any) -> bool:
    return value is None or str(value).strip().lower() in MISSING_TOKENS


def _as_float(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _profile_rows(rows: list[dict]) -> dict[str, Any]:
    columns: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in columns:
                columns.append(key)

    n = len(rows)
    per_col_missing = {c: sum(1 for r in rows if _is_missing(r.get(c))) for c in columns}

    numeric_summary: list[dict[str, Any]] = []
    categorical_counts: dict[str, dict[str, int]] = {}
    for col in columns:
        values = [r.get(col) for r in rows if not _is_missing(r.get(col))]
        floats = [f for f in (_as_float(v) for v in values) if f is not None]
        if values and len(floats) == len(values):
            numeric_summary.append({
                "column": col,
                "min": round(min(floats), 3),
                "max": round(max(floats), 3),
                "mean": round(sum(floats) / len(floats), 3),
                "missing_pct": round(per_col_missing[col] * 100 / n, 1),
            })
        else:
            distinct = {str(v).strip() for v in values}
            if 2 <= len(distinct) <= 10:
                counts: dict[str, int] = {}
                for v in values:
                    label = str(v).strip()
                    counts[label] = counts.get(label, 0) + 1
                categorical_counts[col] = dict(
                    sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:10]
                )

    seen = set()
    duplicates = 0
    for r in rows:
        fingerprint = json.dumps(
            {k: ("" if _is_missing(r.get(k)) else str(r.get(k))) for k in columns},
            sort_keys=True,
        )
        if fingerprint in seen:
            duplicates += 1
        else:
            seen.add(fingerprint)

    total_cells = max(1, n * len(columns))
    missing_total = sum(per_col_missing.values())

    balance_col = next(iter(categorical_counts), None)
    class_balance = None
    if balance_col:
        counts = categorical_counts[balance_col]
        total_classed = sum(counts.values())
        class_balance = {
            "column": balance_col,
            "values": [{"value": v, "count": c} for v, c in counts.items()],
            "minority_pct": round(min(counts.values()) * 100 / max(1, total_classed), 1),
        }

    return {
        "rows_profiled": n,
        "columns_profiled": columns,
        "duplicate_rows": duplicates,
        "duplicate_pct": round(duplicates * 100 / max(1, n), 2),
        "missing_total_pct": round(missing_total * 100 / total_cells, 2),
        "numeric_summary": numeric_summary[:20],
        "class_balance": class_balance,
    }


def _checks_from_profile(profile: dict, source_used: str) -> list[dict[str, str]]:
    checks = [{
        "check": "Data downloaded & profiled",
        "result": "pass",
        "detail": f"{profile['rows_profiled']} rows × {len(profile['columns_profiled'])} cols "
                  f"profiled via {source_used}.",
    }]
    missing_pct = profile["missing_total_pct"]
    checks.append({
        "check": "Missing values",
        "result": "pass" if missing_pct < 5 else "warning",
        "detail": f"{missing_pct}% of all cells are missing"
                  + ("." if missing_pct < 5 else " — investigate column completeness."),
    })
    dup_pct = profile["duplicate_pct"]
    checks.append({
        "check": "Duplicate rows",
        "result": "pass" if dup_pct < 2 else "warning",
        "detail": f"{profile['duplicate_rows']} exact duplicate row(s) ({dup_pct}%).",
    })
    balance = profile.get("class_balance")
    if balance:
        imbalanced = balance["minority_pct"] < 10
        checks.append({
            "check": "Class balance",
            "result": "warning" if imbalanced else "pass",
            "detail": (
                f"Column '{balance['column']}' minority class holds only "
                f"{balance['minority_pct']}% of rows." if imbalanced else
                f"Column '{balance['column']}' looks reasonably balanced."
            ),
        })
    return checks


def profile_dataset(url: str, meta: dict[str, Any]) -> dict[str, Any] | None:
    """Best-effort real profiling. Returns None when the source can't be opened."""
    try:
        source_used = None
        rows: list[dict] = []
        if "huggingface.co/datasets/" in url:
            slug = url.split("huggingface.co/datasets/")[-1].strip("/")
            parts = [p for p in slug.split("/") if p]
            dataset_id = "/".join(parts[:2]) if len(parts) >= 2 else parts[0]
            rows = _hf_rows(dataset_id)
            source_used = "huggingface datasets-server"
        elif "kaggle.com/datasets/" in url:
            rows = _kaggle_rows(url)
            source_used = "kaggle api download"
        else:
            return None

        if not rows:
            return None
        profile = _profile_rows(rows)
        profile["source_used"] = source_used
        profile["profile_checks"] = _checks_from_profile(profile, source_used)
        return profile
    except (_ProfileSkipped, requests.RequestException) as exc:
        return {
            "source_used": None,
            "skip_reason": str(exc)[:200],
            "profile_checks": [{
                "check": "Data downloaded & profiled",
                "result": "skipped",
                "detail": f"{exc}",
            }],
        }
    except Exception as exc:  # noqa: BLE001 — profiling must never break an audit
        return {
            "source_used": None,
            "skip_reason": f"profiling error: {exc}"[:200],
            "profile_checks": [{
                "check": "Data downloaded & profiled",
                "result": "skipped",
                "detail": f"Profiling failed: {exc}",
            }],
        }
