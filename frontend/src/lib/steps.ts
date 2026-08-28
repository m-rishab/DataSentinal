/* Canonical pipeline definition shared by the graph, live stepper, and
   landing page. One source of truth for the seven agents and edges. */

import type { LucideIcon } from 'lucide-react'
import { Database, Scale, ShieldCheck, Fingerprint, FileText, Link2, FileOutput } from 'lucide-react'

export interface StepDef {
  node: string
  /** Agent display name */
  label: string
  /** Number + category, e.g. "04 · ORIGINALITY" */
  kicker: string
  /** Bare category, e.g. "Originality" — used in node headers */
  category: string
  icon: LucideIcon
  description: string
  bullets: string[]
}

export const PIPELINE: StepDef[] = [
  {
    node: 'ingest',
    label: 'Ingest',
    kicker: '01 · SOURCE',
    category: 'Source',
    icon: Database,
    description:
      'Pulls the public dataset page and extracts the raw provenance surface: title, license, tags, upload date, file list and column names.',
    bullets: ['Scrapes the Kaggle / HF page', 'Captures license and metadata', 'Reads filenames and column names'],
  },
  {
    node: 'consent_agent',
    label: 'Consent & License',
    kicker: '02 · RIGHTS',
    category: 'Rights',
    icon: ShieldCheck,
    description:
      'Reads license metadata and scans the description for consent language, sensitive-data hints, and missing terms.',
    bullets: ['Flags missing or vague licenses', 'Looks for consent / PII language', 'Scores severity of each finding'],
  },
  {
    node: 'citation_tracer',
    label: 'Citation Tracer',
    kicker: '03 · PAPERS',
    category: 'Papers',
    icon: FileText,
    description:
      'Finds citing papers through OpenAlex, then cross-checks every DOI against Crossref retraction records.',
    bullets: ['Searches OpenAlex for citations', 'Resolves DOIs via Crossref', 'Marks retracted or disputed papers'],
  },
  {
    node: 'duplication_agent',
    label: 'Duplication Check',
    kicker: '04 · ORIGINALITY',
    category: 'Originality',
    icon: Fingerprint,
    description:
      'Screens the description and filenames for copy-paste markers, scrape residue, and raw re-upload patterns.',
    bullets: ['Detects duplicated descriptions', 'Flags re-upload file patterns', 'Notes thin or scraped listings'],
  },
  {
    node: 'related_work_agent',
    label: 'Related Work',
    kicker: '05 · CONTEXT',
    category: 'Context',
    icon: Link2,
    description:
      'Surfaces related academic papers and alternative open datasets so you can compare provenance, not just this listing.',
    bullets: ['Finds related research papers', 'Suggests alternative datasets', 'Adds venue and citation context'],
  },
  {
    node: 'critic_aggregator',
    label: 'Critic Aggregator',
    kicker: '06 · SCORE',
    category: 'Score',
    icon: Scale,
    description:
      "Joins every agent's findings, weighs evidence, and computes the 0–100 trust score with a written rationale.",
    bullets: ['Merges all agent outputs', 'May request one citation retry', 'Produces the trust score'],
  },
  {
    node: 'report_generator',
    label: 'Report Generator',
    kicker: '07 · OUTPUT',
    category: 'Output',
    icon: FileOutput,
    description:
      'Compiles the final report payload — flags, citations, logs, and score — and persists it for this run.',
    bullets: ['Assembles the JSON report', 'Writes evidence and errors', 'Saves the run to the database'],
  },
]

export interface Connection {
  id: string
  from: string
  to: string
}

export const CONNECTIONS: Connection[] = [
  { id: 'e-ingest-consent', from: 'ingest', to: 'consent_agent' },
  { id: 'e-ingest-citation', from: 'ingest', to: 'citation_tracer' },
  { id: 'e-ingest-duplication', from: 'ingest', to: 'duplication_agent' },
  { id: 'e-ingest-related', from: 'ingest', to: 'related_work_agent' },
  { id: 'e-consent-critic', from: 'consent_agent', to: 'critic_aggregator' },
  { id: 'e-citation-critic', from: 'citation_tracer', to: 'critic_aggregator' },
  { id: 'e-duplication-critic', from: 'duplication_agent', to: 'critic_aggregator' },
  { id: 'e-related-critic', from: 'related_work_agent', to: 'critic_aggregator' },
  { id: 'e-critic-report', from: 'critic_aggregator', to: 'report_generator' },
]

export function stepByNode(node: string): StepDef | undefined {
  return PIPELINE.find((s) => s.node === node)
}

export function indexByNode(node: string): number {
  return PIPELINE.findIndex((s) => s.node === node)
}