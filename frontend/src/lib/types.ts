export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface DatasetMetadata {
  title: string | null
  description: string | null
  license: string | null
  tags: string[]
  upload_date: string | null
  files: string[]
  columns?: string[]
}

export interface LiveMetadataResponse {
  run_id: string
  ready: boolean
  metadata: DatasetMetadata | null
}

export interface ConsentFlag {
  finding: string
  severity: Severity
  evidence: string
}

export type RetractionStatus = 'not_retracted' | 'retracted' | 'possibly_retracted' | 'unknown'

export interface CitationEntry {
  paper_title: string
  doi: string | null
  retraction_status: RetractionStatus
  source_url: string | null
  verified_citation?: boolean
}

export type DuplicationFlag = ConsentFlag

export interface RelatedPaper {
  title: string
  year: number | null
  url: string | null
  venue: string | null
  citation_count: number | null
}

export interface AlternativeDataset {
  name: string
  url: string | null
  source: 'kaggle' | 'huggingface'
}

export interface RelatedWork {
  papers: RelatedPaper[]
  alternative_datasets: AlternativeDataset[]
}

export interface ScoreBreakdown {
  consent?: number
  originality?: number
  citations?: number
  metadata?: number
}

export interface InspectionCheck {
  check: string
  result: 'pass' | 'warning' | 'mismatch' | 'skipped'
  detail: string
}

export interface FileInspection {
  source?: string
  files_checked?: number
  columns_detected?: number
  rows_sampled?: number
  headers_verified?: boolean | null
  pii_columns?: string[]
  checks?: InspectionCheck[]
}

export interface NumericColumnStat {
  column: string
  min?: number
  max?: number
  mean?: number
  missing_pct?: number
}

export interface ClassBalanceValue {
  value: string
  count: number
}

export interface DataProfile {
  source_used?: string | null
  rows_profiled?: number
  columns_profiled?: string[]
  duplicate_rows?: number
  duplicate_pct?: number
  missing_total_pct?: number
  numeric_summary?: NumericColumnStat[]
  class_balance?: {
    column: string
    values: ClassBalanceValue[]
    minority_pct?: number
  } | null
  skip_reason?: string
}

export interface GateInfo {
  fail_under?: number | null
  passed?: boolean | null
}

export interface AuditReport {
  run_id: string
  dataset_url: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  metadata: DatasetMetadata
  trust_score: number
  rationale: string
  score_breakdown?: ScoreBreakdown
  file_inspection?: FileInspection
  data_profile?: DataProfile
  gate?: GateInfo
  consent_flags: ConsentFlag[]
  citation_trail: CitationEntry[]
  duplication_flags: DuplicationFlag[]
  related_work: RelatedWork
  evidence_log: string[]
  errors: string[]
}

export interface SSEEvent {
  node: string
  status: 'running' | 'completed' | 'failed' | 'done'
  message: string
  result?: string
  timestamp?: string
}

export interface RunSummary {
  run_id: string
  url: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  trust_score: number | null
  title: string | null
  gate: GateInfo
}
