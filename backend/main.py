"""DataSentinel FastAPI backend.

Endpoints:
    POST /audit                — start an audit run, returns {"run_id": ...}
    GET  /audit/{id}/stream    — SSE live progress events for the run
    GET  /audit/{id}/report    — final JSON report (SQLite-backed cache)
    GET  /healthz              — liveness probe

Runs are executed in background asyncio tasks. Progress events are kept in
an in-memory per-run buffer (so SSE clients can replay) and final reports
are persisted to SQLite.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

from backend.graph.workflow import (
    NODE_CITATION,
    NODE_CONSENT,
    NODE_CRITIC,
    NODE_DUPLICATION,
    NODE_INGEST,
    NODE_RELATED,
    NODE_REPORT,
    sentinel_graph,
)
from backend.models import initial_state

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("datasentinel.api")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.getenv("DATASENTINEL_DB", str(PROJECT_ROOT / "datasentinel.db"))

app = FastAPI(title="DataSentinel", version="1.0.0", description="Dataset Provenance Watchdog")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# SQLite run cache
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id       TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    status       TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    completed_at TEXT,
    report_json  TEXT
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(_SCHEMA)


def db_save_run(run_id: str, url: str, status: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO runs (run_id, url, status, created_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET status = excluded.status",
            (run_id, url, status, utcnow()),
        )


def db_finish_run(run_id: str, status: str, report: dict) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE runs SET status = ?, completed_at = ?, report_json = ? WHERE run_id = ?",
            (status, utcnow(), json.dumps(report, ensure_ascii=False), run_id),
        )


def db_get_run(run_id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if row is None:
        return None
    record = dict(row)
    if record.get("report_json"):
        try:
            record["report"] = json.loads(record["report_json"])
        except json.JSONDecodeError:
            record["report"] = None
    return record


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# In-memory run registry (event buffers + SSE subscribers)
# ---------------------------------------------------------------------------


class RunRecord:
    def __init__(self, run_id: str, url: str, fail_under: Optional[int] = None):
        self.run_id = run_id
        self.url = url
        self.fail_under = fail_under
        self.status = "queued"
        self.events: list[dict] = []
        self.report: Optional[dict] = None
        # Snapshot of dataset metadata, published as soon as ingest completes
        # so the UI can show title/files/columns while the audit is running.
        self.metadata: Optional[dict] = None
        self.subscribers: set[asyncio.Queue] = set()
        self.lock = asyncio.Lock()


RUNS: dict[str, RunRecord] = {}


async def publish(run: RunRecord, event: dict) -> None:
    event.setdefault("timestamp", utcnow())
    async with run.lock:
        run.events.append(event)
        for queue in list(run.subscribers):
            queue.put_nowait(event)


# ---------------------------------------------------------------------------
# Node progress metadata (drives the SSE stream + frontend stepper)
# ---------------------------------------------------------------------------

NODE_MESSAGES: dict[str, str] = {
    NODE_INGEST: "Scraping Kaggle dataset page...",
    NODE_CONSENT: "Checking license & consent signals...",
    NODE_CITATION: "Tracing citations via Semantic Scholar & Crossref...",
    NODE_DUPLICATION: "Analyzing description for duplication...",
    NODE_RELATED: "Finding related papers & alternative datasets...",
    NODE_CRITIC: "Aggregating findings & computing trust score...",
    NODE_REPORT: "Generating final report...",
}
PARALLEL_AGENTS = {NODE_CONSENT, NODE_CITATION, NODE_DUPLICATION, NODE_RELATED}


async def emit(
    run: RunRecord,
    node: str,
    status: str,
    message: Optional[str] = None,
    result: Optional[str] = None,
) -> None:
    event = {"node": node, "status": status, "message": message or NODE_MESSAGES.get(node, node)}
    if result:
        event["result"] = result
    await publish(run, event)


def _result_for(node: str, payload: Any) -> Optional[str]:
    """Short per-node summary chip for the live graph."""
    if not isinstance(payload, dict):
        return None
    try:
        if node == NODE_INGEST:
            md = payload.get("metadata") or {}
            ins = payload.get("file_inspection") or {}
            prof = payload.get("data_profile") or {}
            files = ins.get("files_checked", len(md.get("files") or []))
            chip = f"{files} files · {ins.get('columns_detected', 0)} cols"
            if prof.get("rows_profiled"):
                chip += f" · {prof['rows_profiled']} rows profiled"
            return chip
        if node == NODE_CONSENT:
            return f"{len(payload.get('consent_flags') or [])} flag(s)"
        if node == NODE_CITATION:
            trail = payload.get("citation_trail") or []
            verified = sum(1 for c in trail if c.get("verified_citation"))
            return f"{len(trail)} candidates · {verified} verified"
        if node == NODE_DUPLICATION:
            return f"{len(payload.get('duplication_flags') or [])} flag(s)"
        if node == NODE_RELATED:
            rw = payload.get("related_work") or {}
            return (
                f"{len(rw.get('papers') or [])} papers · "
                f"{len(rw.get('alternative_datasets') or [])} datasets"
            )
        if node == NODE_CRITIC:
            return f"score {payload.get('trust_score', 0)}/100"
        if node == NODE_REPORT:
            return "report ready"
    except Exception:  # noqa: BLE001 — a summary chip must never break the run
        return None
    return None


async def run_audit(run_id: str, url: str) -> None:
    run = RUNS[run_id]
    run.status = "running"
    db_save_run(run_id, url, "running")
    completed: set[str] = set()
    critic_started = False
    citation_passes = 0
    state = initial_state(url)

    await emit(run, NODE_INGEST, "running")
    try:
        async for chunk in sentinel_graph.astream(state, {"recursion_limit": 30}, stream_mode="updates"):
            update = chunk[-1] if isinstance(chunk, tuple) else chunk
            if not isinstance(update, dict):
                continue
            for node, payload in update.items():
                if node == "__end__":
                    continue
                completed.add(node)
                await emit(run, node, "completed", result=_result_for(node, payload))

                if node == NODE_INGEST:
                    if isinstance(payload, dict) and payload.get("metadata"):
                        md = dict(payload["metadata"])
                        md.setdefault("source", "huggingface" if "huggingface" in url else "kaggle")
                        run.metadata = md
                    for agent in PARALLEL_AGENTS:
                        await emit(run, agent, "running")

                elif node == NODE_CITATION:
                    citation_passes += 1
                    if citation_passes > 1 or (PARALLEL_AGENTS <= completed and not critic_started):
                        if PARALLEL_AGENTS <= completed:
                            critic_started = True
                        await emit(run, NODE_CRITIC, "running")

                elif node in PARALLEL_AGENTS and PARALLEL_AGENTS <= completed and not critic_started:
                    critic_started = True
                    await emit(run, NODE_CRITIC, "running")

                elif node == NODE_CRITIC:
                    refine = (
                        isinstance(payload, dict)
                        and payload.get("citation_search_refined")
                        and payload.get("citation_evidence_quality") in ("thin", "ambiguous")
                    )
                    if refine:
                        await emit(run, NODE_CITATION, "running", "Citation evidence thin — refining search...")
                    else:
                        await emit(run, NODE_REPORT, "running")

                elif node == NODE_REPORT:
                    if isinstance(payload, dict) and payload.get("final_report"):
                        run.report = payload["final_report"]

        if run.report is None:
            raise RuntimeError("graph finished without producing a final report")
        report = {"run_id": run_id, "created_at": utcnow(), **run.report}
        gate: dict = {"fail_under": run.fail_under, "passed": None}
        if run.fail_under is not None:
            gate["passed"] = report.get("trust_score", 0) >= run.fail_under
        report["gate"] = gate
        run.report = report
        run.status = "completed"
        db_finish_run(run_id, "completed", report)
        gate_note = ""
        if gate["passed"] is not None:
            gate_note = f" · gate {'PASSED' if gate['passed'] else 'FAILED'} (min {run.fail_under})"
        await emit(
            run,
            NODE_REPORT,
            "done",
            f"Audit complete — trust score {report.get('trust_score', 0)}/100{gate_note}",
        )
        logger.info("run %s completed: score=%s", run_id, report.get("trust_score"))
    except Exception as exc:  # noqa: BLE001 — surface failure to the client, never crash the app
        logger.exception("run %s failed", run_id)
        run.status = "failed"
        db_finish_run(run_id, "failed", {"run_id": run_id, "dataset_url": url, "status": "failed", "errors": [str(exc)]})
        await emit(run, "pipeline", "failed", f"Audit failed: {exc}")


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


_ALLOWED_DATASET_HOSTS = {
    "kaggle.com", "www.kaggle.com",
    "huggingface.co", "www.huggingface.co",
}


class AuditRequest(BaseModel):
    url: str
    fail_under: Optional[int] = Field(default=None, ge=0, le=100)

    @field_validator("url")
    @classmethod
    def _valid_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("http://", "https://")):
            raise ValueError("url must be an absolute http(s) URL")
        host = (urlparse(value).hostname or "").lower()
        if host not in _ALLOWED_DATASET_HOSTS:
            raise ValueError(
                "url must point at a Kaggle (kaggle.com/datasets/...) or "
                "Hugging Face (huggingface.co/datasets/...) dataset page"
            )
        if "/datasets/" not in value:
            raise ValueError("url must contain /datasets/")
        return value


@app.post("/audit", status_code=202)
async def start_audit(request: AuditRequest) -> dict:
    run_id = uuid.uuid4().hex[:12]
    RUNS[run_id] = RunRecord(run_id, request.url, request.fail_under)
    db_save_run(run_id, request.url, "queued")
    asyncio.create_task(run_audit(run_id, request.url))
    return {"run_id": run_id, "status": "queued", "fail_under": request.fail_under}


@app.get("/audit/{run_id}/stream")
async def stream_audit(run_id: str) -> EventSourceResponse:
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Unknown run_id {run_id}")

    async def event_stream() -> AsyncIterator[dict]:
        queue: asyncio.Queue = asyncio.Queue()
        async with run.lock:
            buffered = list(run.events)
            run.subscribers.add(queue)
        try:
            for event in buffered:
                yield {"event": "progress", "data": json.dumps(event)}
                if event.get("status") in ("done", "failed"):
                    return
            while True:
                event = await queue.get()
                yield {"event": "progress", "data": json.dumps(event)}
                if event.get("status") in ("done", "failed"):
                    return
        finally:
            run.subscribers.discard(queue)

    # ping=15 injects ": ping" comments during quiet stretches (LLM calls can
    # stay silent for 30s+), so intermediaries don't reap the idle connection.
    return EventSourceResponse(event_stream(), ping=15)


@app.get("/audit/{run_id}/metadata")
async def get_live_metadata(run_id: str):
    """Metadata snapshot for the live view — available right after ingest."""
    run = RUNS.get(run_id)
    if run is not None:
        meta = run.metadata
        if meta is None and run.report:
            meta = (run.report or {}).get("metadata")
        return {"run_id": run_id, "ready": bool(meta), "metadata": meta}

    record = db_get_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Unknown run_id {run_id}")
    meta = (record.get("report") or {}).get("metadata") if record.get("report") else None
    return {"run_id": run_id, "ready": bool(meta), "metadata": meta}


@app.get("/audit/{run_id}/report")
async def get_report(run_id: str):
    run = RUNS.get(run_id)
    if run is None:
        record = db_get_run(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail=f"Unknown run_id {run_id}")
        if record.get("report"):
            return record["report"]
        return JSONResponse(status_code=202, content={"run_id": run_id, "status": record["status"]})

    if run.status == "completed" and run.report:
        return run.report
    return JSONResponse(status_code=202, content={"run_id": run_id, "status": run.status})


@app.get("/runs")
async def list_runs(limit: int = 50) -> dict:
    """Recent runs for the history view (newest first)."""
    limit = max(1, min(limit, 200))
    with _connect() as conn:
        rows = conn.execute(
            "SELECT run_id, url, status, created_at, completed_at, report_json "
            "FROM runs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    runs = []
    for row in rows:
        record = dict(row)
        report = {}
        if record.get("report_json"):
            try:
                report = json.loads(record["report_json"]) or {}
            except json.JSONDecodeError:
                report = {}
        metadata = report.get("metadata") or {}
        runs.append(
            {
                "run_id": record["run_id"],
                "url": record["url"],
                "status": record["status"],
                "created_at": record["created_at"],
                "completed_at": record.get("completed_at"),
                "trust_score": report.get("trust_score"),
                "title": metadata.get("title"),
                "gate": report.get("gate") or {},
            }
        )
    return {"runs": runs}


@app.get("/audit/{run_id}/verdict")
async def get_verdict(run_id: str):
    """CI-friendly verdict: exit_code is 0 only when the audit passed its gate."""
    run = RUNS.get(run_id)
    if run is not None:
        status = run.status
        score = (run.report or {}).get("trust_score")
        gate = (run.report or {}).get("gate") or {}
        fail_under = run.fail_under
        passed = gate.get("passed")
    else:
        record = db_get_run(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail=f"Unknown run_id {run_id}")
        status = record["status"]
        report = record.get("report") or {}
        score = report.get("trust_score")
        gate = report.get("gate") or {}
        fail_under = gate.get("fail_under")
        passed = gate.get("passed")

    exit_code = 0
    if status != "completed" or passed is False:
        exit_code = 1
    return {
        "run_id": run_id,
        "status": status,
        "trust_score": score,
        "fail_under": fail_under,
        "passed": passed,
        "exit_code": exit_code,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "llm_configured": bool(os.getenv("NVIDIA_API_KEY"))}


init_db()

# Serve a built frontend (frontend/dist) when present, for one-command demos.
_dist = PROJECT_ROOT / "frontend" / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
