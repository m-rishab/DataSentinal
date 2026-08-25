# DataSentinel — Dataset Provenance Watchdog

DataSentinel audits public datasets **before you build on them**. Paste a Kaggle or
Hugging Face dataset URL and a multi-agent pipeline investigates the dataset's
provenance — license, consent signals, citing research papers (with retraction
checks), duplication markers, related work — then downloads and profiles the
**actual data** and produces a 0–100 trust score with an evidence-backed report.

> Think of it as a security scanner, but for dataset trustworthiness.

---

## What it actually does

| Check | How |
|---|---|
| **Ingest** | Scrapes the Kaggle page (JSON-LD → OpenGraph → embedded state → headless-Chromium fallback for bot protection) or the Hugging Face Hub API. Extracts title, license, tags, upload date, files, column names. |
| **Real data profiling** | Downloads up to 100 real rows (Hugging Face `datasets-server`, or Kaggle's official API with your credentials) and computes missing-value %, exact duplicate rows, class imbalance, and per-column numeric stats. |
| **File inspection** | Verifies listed files/columns against downloaded headers; flags PII-shaped column names (`email`, `ssn`, `phone`…). |
| **Consent & license agent** | Detects missing/vague licenses, consent language, sensitive-data hints. |
| **Citation tracer** | Finds citing papers via Semantic Scholar, resolves DOIs through Crossref retraction records, marks retracted/possibly-retracted citations. Thin evidence triggers one automatic retry loop with a refined search. |
| **Duplication agent** | Flags copy-paste descriptions, re-upload filename patterns, scrape residue. |
| **Related work agent** | Surfaces related research papers and alternative datasets on both platforms. |
| **Critic aggregator** | Deterministic 0–100 score with a per-dimension breakdown (consent / originality / citations / metadata) + LLM-written plain-English rationale. |
| **Report generator** | Persists everything into a structured report with a full evidence log. |

The scoring is **deterministic first**: every point deduction maps to concrete
findings. The LLM writes the summary, it doesn't invent the number.

## CI gate

Every audit can enforce a minimum quality bar:

```bash
# start an audit that must score >= 60
curl -X POST localhost:8000/audit -H 'Content-Type: application/json' \
     -d '{"url": "https://www.kaggle.com/datasets/uciml/iris", "fail_under": 60}'

# CI-friendly verdict — exit code 0 only when the audit passed its gate
curl localhost:8000/audit/<run_id>/verdict
# { "status": "completed", "trust_score": 65, "fail_under": 60,
#   "passed": true, "exit_code": 0 }
```

Wire the verdict endpoint into GitHub Actions / GitLab CI to block training jobs
that use low-provenance data.

## Live workflow graph

The UI renders the LangGraph pipeline as it executes: nodes light up while their
agent runs, edges draw themselves in execution order, timing badges and one-glance
result chips appear as agents finish, and the citation-retry loop is animated when
the aggregator bounces work back to the tracer. Nodes are **draggable**, hover any
node for a plain-English explanation of what it does, and export the graph as PNG.

Reports add a shareable link (`/?run=<run_id>`), print-to-PDF styling, license
explanations, score-breakdown bars, the file-inspection trail and the full data
profile card.

## Architecture

```
frontend/            React 18 + Vite + Tailwind v4 + TanStack Query
  src/components/    LiveStepper (graph), ReportView, RunHistory…
  src/lib/           api client, SSE handling, graph PNG export, license explainer
backend/
  main.py            FastAPI app, run registry, SSE stream, SQLite persistence
  models.py          LangGraph state + report schemas
  graph/
    workflow.py      node wiring + conditional citation-retry loop
    nodes.py         ingest, 4 audit agents, critic aggregator, report generator
  services/
    kaggle_scraper.py    multi-pass Kaggle scraper (+ headless render fallback)
    hf_scraper.py        Hugging Face Hub / datasets-server client
    data_profiler.py     real row download + statistical profiling
    file_inspector.py    header verification + PII column detection
    headless_render.py   local Chrome/Brave/Edge rendering fallback
    scrape_cache.py      30-minute TTL metadata cache
    semantic_scholar.py / crossref.py / dataset_search.py
    nvidia_client.py     NVIDIA Nemotron via OpenAI-compatible API
```

**Stack:** FastAPI · LangGraph · NVIDIA Nemotron LLM · SSE · SQLite · React · Tailwind.

### The graph

```
                 ┌────────────────┐
          ┌─────▶│ Consent/License│──────┐
          │      └────────────────┘      │
          │      ┌────────────────┐      │
ingest ───┼─────▶│ Citation Tracer│──────┤      retry loop (thin evidence)
          │      └────────────────┘      ├─────▶ critic_aggregator ──▶ report
          │      ┌────────────────┐      │         ▲   │
          └─────▶│ Duplication    │──────┘         └───┘ (one bounce back to tracer)
                 └────────────────┘
```

## Getting started

### Prerequisites
- Python 3.11+
- Node 18+
- An [NVIDIA NIM](https://build.nvidia.com/) API key (free)
- *(optional)* A Kaggle API token for real-data profiling of Kaggle datasets

### Backend

```bash
python3 -m venv myenv && source myenv/bin/activate
pip install -r requirements.txt

cp .env.example .env    # then fill in your keys
uvicorn backend.main:app --port 8000 --reload
```

`.env`:

```ini
NVIDIA_API_KEY=nvapi-...            # required for LLM summaries

# Optional — enables REAL dataset downloads from Kaggle (profiling).
# Token from kaggle.com/settings → API → Create New Token
KAGGLE_API_TOKEN=KGAT_...
# or the legacy pair:
# KAGGLE_USERNAME=...
# KAGGLE_KEY=...
```

Without Kaggle credentials, Kaggle datasets still get fully audited from page
metadata — only the download-based profiling is skipped (clearly marked in the
report).

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /audit → :8000)
```

Production: `npm run build` — FastAPI serves `frontend/dist` automatically when
present.

### Try it

Open the app, paste `https://www.kaggle.com/datasets/uciml/iris`, hit **Run Audit**
and watch the graph execute. Preview mode: append `?preview=audit`.

## API reference

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/audit` | Start an audit. Body: `{url, fail_under?}` → `{run_id}` |
| `GET` | `/audit/{id}/stream` | Live SSE progress events (with keep-alive pings, replays history on reconnect) |
| `GET` | `/audit/{id}/metadata` | Lightweight polled metadata (title/license/files/columns) once ingest finishes |
| `GET` | `/audit/{id}/report` | Full report (score, breakdown, profile, flags, citations, evidence log, gate) |
| `GET` | `/audit/{id}/verdict` | CI verdict: `{passed, exit_code}` |
| `GET` | `/runs?limit=` | Recent run history with scores + gate status |
| `GET` | `/healthz` | Health + LLM config check |

Only `kaggle.com/datasets/*` and `huggingface.co/datasets/*` URLs are accepted.

## Design notes

- **Deterministic scoring** — subscores per dimension computed from findings;
  the LLM only narrates. Same input → same score.
- **Never crash an audit** — every scraper/profiler failure degrades into an
  honest "skipped" check with a reason instead of failing the run.
- **Bot-protection aware** — four extraction passes plus an optional local
  headless-browser render before giving up on any field.
- **Cache-friendly** — repeated URLs reuse scraped metadata for 30 minutes.
- **Honest gaps surfaced in the UI** — e.g. oversized bundles (>8 MB inline cap)
  explain exactly why they weren't profiled.

## Known limits

- Kaggle profiling needs API credentials and is capped at ~8 MB bundles / 100 rows.
- Retraction checks depend on Crossref coverage.
- Single-process in-memory run registry + cache (SQLite persists reports).

---

Built by [m-rishab](https://github.com/m-rishab) · LangGraph + NVIDIA Nemotron
