"""Pydantic schemas and the LangGraph shared state definition for DataSentinel."""

from __future__ import annotations

import operator
from typing import Annotated, Literal, Optional, TypedDict

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# LangGraph shared state
# ---------------------------------------------------------------------------
# `evidence_log` and `errors` use the `operator.add` reducer so that the four
# parallel agent branches can append concurrently without clobbering each
# other when the branches join. Fields with a single writer (e.g.
# `citation_trail`) keep default overwrite semantics — which also means the
# refined citation re-run replaces the earlier trail instead of duplicating.


class SentinelGraphState(TypedDict, total=False):
    dataset_url: str
    metadata: dict
    consent_flags: list[dict]
    citation_trail: list[dict]
    duplication_flags: list[dict]
    related_work: dict
    trust_score: int
    rationale: str
    score_breakdown: dict
    evidence_log: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]
    # Structured content checks produced by the ingest inspector
    file_inspection: dict
    # Real content statistics from downloading actual rows (may be partial)
    data_profile: dict
    # Router bookkeeping (internal; not part of the public report payload)
    citation_evidence_quality: str  # solid | thin | ambiguous
    citation_retry_count: int
    citation_search_refined: bool
    # Final structured payload written by report_generator_node
    final_report: dict


def initial_state(dataset_url: str) -> dict:
    """Fresh state for one audit run."""
    return {
        "dataset_url": dataset_url,
        "metadata": {},
        "consent_flags": [],
        "citation_trail": [],
        "duplication_flags": [],
        "related_work": {"papers": [], "alternative_datasets": []},
        "trust_score": 0,
        "rationale": "",
        "file_inspection": {},
        "evidence_log": [],
        "errors": [],
        # Router bookkeeping (not part of the public report payload)
        "citation_evidence_quality": "unknown",  # solid | thin | ambiguous
        "citation_retry_count": 0,
        "citation_search_refined": False,
    }


# ---------------------------------------------------------------------------
# Pydantic models for API request/response payloads
# ---------------------------------------------------------------------------


class AuditRequest(BaseModel):
    url: str = Field(..., description="Kaggle dataset URL to audit")


class AuditSubmitted(BaseModel):
    run_id: str
    status: str = "queued"


class MetadataModel(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    license: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    upload_date: Optional[str] = None
    files: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)


class ConsentFlag(BaseModel):
    finding: str
    severity: Literal["info", "low", "medium", "high", "critical"] = "info"
    evidence: str


class CitationEntry(BaseModel):
    paper_title: str
    doi: Optional[str] = None
    retraction_status: Literal["not_retracted", "retracted", "possibly_retracted", "unknown"] = "unknown"
    source_url: Optional[str] = None


class DuplicationFlag(BaseModel):
    finding: str
    severity: Literal["info", "low", "medium", "high", "critical"] = "info"
    evidence: str


class RelatedPaper(BaseModel):
    title: str
    year: Optional[int] = None
    url: Optional[str] = None
    venue: Optional[str] = None
    citation_count: Optional[int] = None


class AlternativeDataset(BaseModel):
    name: str
    url: Optional[str] = None
    source: Literal["kaggle", "huggingface"] = "kaggle"


class RelatedWork(BaseModel):
    papers: list[RelatedPaper] = Field(default_factory=list)
    alternative_datasets: list[AlternativeDataset] = Field(default_factory=list)


class FinalReport(BaseModel):
    run_id: str
    dataset_url: str
    status: Literal["queued", "running", "completed", "failed"] = "completed"
    metadata: MetadataModel = Field(default_factory=MetadataModel)
    trust_score: int = Field(0, ge=0, le=100)
    rationale: str = ""
    score_breakdown: dict = Field(default_factory=dict)
    file_inspection: dict = Field(default_factory=dict)
    data_profile: dict = Field(default_factory=dict)
    gate: dict = Field(default_factory=dict)
    consent_flags: list[ConsentFlag] = Field(default_factory=list)
    citation_trail: list[CitationEntry] = Field(default_factory=list)
    duplication_flags: list[DuplicationFlag] = Field(default_factory=list)
    related_work: RelatedWork = Field(default_factory=RelatedWork)
    evidence_log: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class SSEEvent(BaseModel):
    node: str
    status: Literal["running", "completed", "failed", "done"]
    message: str
    result: Optional[str] = None
    timestamp: Optional[str] = None
