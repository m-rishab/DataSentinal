# DataSentinel — Dataset Provenance Watchdog

Paste a Kaggle or Hugging Face dataset URL. A multi-agent pipeline checks its
license, consent signals, citing papers (with retraction checks), duplication
markers, and profiles the **actual data**, then gives you a 0–100 trust score
with an evidence-backed report.

## What it checks

- **Ingest** — scrapes Kaggle/HF page metadata (title, license, tags, files, columns)
- **Real data profiling** — downloads sample rows, computes missing %, duplicates, class imbalance, PII-shaped columns
- **Consent & license agent** — flags missing/vague licenses, consent language
- **Citation tracer** — finds citing papers (Semantic Scholar), checks retractions (Crossref)
- **Duplication agent** — flags copy-paste descriptions, re-upload patterns
- **Critic aggregator** — deterministic score + LLM-written rationale (LLM never sets the number)

## Pipeline

```mermaid
flowchart LR
    A[Ingest] --> B[Consent / License]
    A --> C[Citation Tracer]
    A --> D[Duplication Agent]
    B --> E[Critic Aggregator]
    C --> E
    D --> E
    E -.thin evidence, one retry.-> C
    E --> F[Report]
```

## CI gate

```bash
curl -X POST localhost:8000/audit -d '{"url": "...", "fail_under": 60}'
curl localhost:8000/audit/<run_id>/verdict
# { "passed": true, "exit_code": 0 }
```

## Stack

FastAPI · LangGraph · NVIDIA Nemotron LLM · SSE · SQLite · React · Tailwind

## Quick start

```bash
# backend
python3 -m venv myenv && source myenv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add NVIDIA_API_KEY, optional KAGGLE_API_TOKEN
uvicorn backend.main:app --port 8000 --reload

# frontend
cd frontend && npm install && npm run dev
```

Open the app, paste a `kaggle.com/datasets/*` or `huggingface.co/datasets/*` URL, run audit.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/audit` | Start audit → `{run_id}` |
| GET | `/audit/{id}/stream` | Live SSE progress |
| GET | `/audit/{id}/report` | Full report |
| GET | `/audit/{id}/verdict` | CI pass/fail |
| GET | `/runs` | Run history |

## Known limits

- Kaggle profiling capped at ~8 MB / 100 rows, needs API credentials
- Retraction checks depend on Crossref coverage
- Single-process in-memory registry (SQLite persists reports)

---
Built by [m-rishab](https://github.com/m-rishab) · LangGraph + NVIDIA Nemotron
