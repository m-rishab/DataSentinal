import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLiveMetadata, openAuditStream } from '../lib/api'
import type { DatasetMetadata, SSEEvent } from '../lib/types'
import { downloadGraphPng, type NodeStatus as GraphNodeStatus, type RetryState } from '../lib/graphExport'
import PipelineGraph from './PipelineGraph'

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
type RetryPhase = 'none' | 'active' | 'done'

interface StepDef {
  node: string
  label: string
  kicker: string
  description: string
  bullets: string[]
}

const STEPS: StepDef[] = [
  {
    node: 'ingest',
    label: 'Ingest',
    kicker: '01 · Source',
    description: 'Pulls the public dataset page and extracts the raw provenance surface: title, license, tags, upload date, file list and column names.',
    bullets: [
      'Scrapes the Kaggle dataset page',
      'Captures license and metadata fields',
      'Reads filenames and column names',
    ],
  },
  {
    node: 'consent_agent',
    label: 'Consent & License',
    kicker: '02 · Rights',
    description: 'Reads license metadata and scans the description for consent language, sensitive-data hints, and missing terms.',
    bullets: [
      'Flags missing or vague licenses',
      'Looks for consent / PII language',
      'Scores severity of each finding',
    ],
  },
  {
    node: 'citation_tracer',
    label: 'Citation Tracer',
    kicker: '03 · Papers',
    description: 'Finds citing papers through OpenAlex, then cross-checks every DOI against Crossref retraction records.',
    bullets: [
      'Searches OpenAlex for citations',
      'Resolves DOIs via Crossref',
      'Marks retracted or disputed papers',
    ],
  },
  {
    node: 'duplication_agent',
    label: 'Duplication Check',
    kicker: '04 · Originality',
    description: 'Screens the description and filenames for copy-paste markers, scrape residue, and raw re-upload patterns.',
    bullets: [
      'Detects duplicated descriptions',
      'Flags re-upload file patterns',
      'Notes thin or scraped listings',
    ],
  },
  {
    node: 'related_work_agent',
    label: 'Related Work',
    kicker: '05 · Context',
    description: 'Surfaces related academic papers and alternative open datasets so you can compare provenance, not just this listing.',
    bullets: [
      'Finds related research papers',
      'Suggests alternative datasets',
      'Adds venue and citation context',
    ],
  },
  {
    node: 'critic_aggregator',
    label: 'Critic Aggregator',
    kicker: '06 · Score',
    description: 'Joins every agent’s findings, weighs evidence, and computes the 0–100 trust score with a written rationale.',
    bullets: [
      'Merges all four agent outputs',
      'May request one citation retry',
      'Produces the trust score',
    ],
  },
  {
    node: 'report_generator',
    label: 'Report Generator',
    kicker: '07 · Output',
    description: 'Compiles the final report payload — flags, citations, logs, and score — and persists it for this run.',
    bullets: [
      'Assembles the JSON report',
      'Writes evidence and errors',
      'Saves the run to the database',
    ],
  },
]

function statusLabel(status: NodeStatus) {
  if (status === 'running') return 'Running'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Waiting'
}

/* Plain-English meaning of each status, so nobody has to guess. */
const STATUS_MEANING: Record<NodeStatus, string> = {
  pending: 'Queued — this agent starts automatically once its inputs are ready.',
  running: 'Working right now — live output streams into the log below.',
  completed: 'Finished successfully. Its findings are folded into the final report.',
  failed: 'Hit a problem. The audit continues with reduced evidence for this step.',
}

export default function LiveStepper({
  runId,
  onDone,
  onReset,
  autoReturn = true,
  onBack,
}: {
  runId: string
  onDone: () => void
  onReset: () => void
  /* false = reviewing a finished run: don't bounce to the report automatically */
  autoReturn?: boolean
  onBack?: () => void
}) {
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [retry, setRetry] = useState<RetryPhase>('none')
  const [failed, setFailed] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const [meta, setMeta] = useState<DatasetMetadata | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const doneRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const autoReturnRef = useRef(autoReturn)
  autoReturnRef.current = autoReturn

  /* Flip the header from "Building workflow" to "Live audit" once the
     graph has revealed its final node (the reveal animation itself lives
     inside PipelineGraph). */
  useEffect(() => {
    const timer = window.setTimeout(() => setGraphReady(true), 6700)
    return () => window.clearTimeout(timer)
  }, [])

  /* Poll the lightweight metadata endpoint so title / license / files /
     columns appear the moment ingest finishes, without waiting for the
     full report. */
  useEffect(() => {
    if (runId === 'preview') {
      setMeta({
        title: 'Iris Dataset',
        description: 'Classic multivariate iris flower dataset (preview).',
        license: 'CC0: Public Domain',
        tags: ['iris', 'classification'],
        upload_date: null,
        files: ['Iris.csv'],
        columns: ['Id', 'SepalLengthCm', 'SepalWidthCm', 'PetalLengthCm', 'PetalWidthCm', 'Species'],
      })
      return
    }
    let stopped = false
    let interval: number | undefined
    const tick = async () => {
      try {
        const res = await fetchLiveMetadata(runId)
        if (!stopped && res.ready && res.metadata) {
          setMeta(res.metadata)
          if (interval) window.clearInterval(interval)
        }
      } catch {
        /* keep polling silently */
      }
    }
    tick()
    interval = window.setInterval(tick, 1600)
    return () => {
      stopped = true
      if (interval) window.clearInterval(interval)
    }
  }, [runId])

  useEffect(() => {
    if (runId === 'preview') {
      const order = STEPS.map((s) => s.node)
      const timers: number[] = []
      order.forEach((node, i) => {
        const start = Date.now()
        timers.push(window.setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [node]: 'running' }))
          setMessages((prev) => ({ ...prev, [node]: `Running ${node.replace(/_/g, ' ')}…` }))
        }, 700 + i * 900))
        timers.push(window.setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [node]: 'completed' }))
          setDurations((prev) => ({ ...prev, [node]: Date.now() - start + 900 }))
          setResults((prev) => ({ ...prev, [node]: 'demo' }))
          setMessages((prev) => ({ ...prev, [node]: `${node.replace(/_/g, ' ')} completed.` }))
        }, 1400 + i * 900))
      })
      return () => timers.forEach(clearTimeout)
    }

    const nodeStart: Record<string, number> = {}
    const completedOnce = new Set<string>()

    /* Latest callbacks live in refs so the stream connection is opened
       exactly once per run — parent re-renders can never tear it down. */
    const applyEvent = (event: SSEEvent) => {
      if (doneRef.current) return
      if (event.status === 'failed') {
        setFailed(event.message)
        return
      }
      if (event.status === 'done') {
        doneRef.current = true
        setStatuses((prev) => ({ ...prev, [event.node]: 'completed' }))
        if (nodeStart[event.node]) {
          setDurations((prev) => ({ ...prev, [event.node]: Date.now() - nodeStart[event.node] }))
        }
        if (autoReturnRef.current) {
          const remaining = 6800 - (Date.now() - startedAtRef.current)
          setTimeout(() => onDoneRef.current(), Math.max(900, remaining + 500))
        }
        return
      }
      if (event.status === 'running') {
        /* Aggregator bounced work back to an already-finished tracer — light up the retry loop. */
        if (completedOnce.has(event.node)) setRetry((r) => (r === 'none' ? 'active' : r))
        else nodeStart[event.node] = Date.now()
      } else {
        completedOnce.add(event.node)
        if (event.result) setResults((prev) => ({ ...prev, [event.node]: event.result as string }))
        if (nodeStart[event.node]) {
          setDurations((prev) => ({ ...prev, [event.node]: Date.now() - nodeStart[event.node] }))
          delete nodeStart[event.node]
        }
        if (event.node === 'critic_aggregator') setRetry((r) => (r === 'active' ? 'done' : r))
      }
      const status: NodeStatus = event.status === 'running' ? 'running' : 'completed'
      setStatuses((prev) => ({ ...prev, [event.node]: status }))
      if (event.message) setMessages((prev) => ({ ...prev, [event.node]: event.message }))
    }

    /* Coalesce bursts (history replay after a reconnect) into a single
       render pass so the graph never flickers through old states. */
    let queue: SSEEvent[] = []
    let flushTimer: number | null = null
    const scheduleFlush = () => {
      if (flushTimer != null) return
      flushTimer = window.setTimeout(() => {
        flushTimer = null
        const batch = queue
        queue = []
        batch.forEach(applyEvent)
      }, 60)
    }

    const close = openAuditStream(
      runId,
      (event: SSEEvent) => {
        if (doneRef.current) return
        queue.push(event)
        scheduleFlush()
      },
      () => setFailed('Lost connection to the audit stream.'),
      () => setReconnecting(true),
      () => setReconnecting(false),
    )
    return () => {
      close()
      if (flushTimer != null) window.clearTimeout(flushTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const selected = useMemo(
    () => STEPS.find((s) => s.node === selectedNode) ?? null,
    [selectedNode],
  )
  const selectedStatus = selected ? (statuses[selected.node] ?? 'pending') : 'pending'
  const selectedMsg = selected ? messages[selected.node] : undefined

  const runningCount = Object.values(statuses).filter((s) => s === 'running').length
  const doneCount = Object.values(statuses).filter((s) => s === 'completed').length

  const fileCount = meta?.files?.length ?? 0
  const columnCount = meta?.columns?.length ?? 0

  return (
    <div className="flex h-full min-h-0" style={{ background: '#0d0f12' }}>
      {/* Reconnecting banner */}
      {reconnecting && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-small"
          style={{
            background: 'color-mix(in srgb, #6b96c4 15%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, #6b96c4 30%, transparent)',
            color: '#6b96c4',
          }}
        >
          <div
            className="h-4 w-4 animate-spin rounded-full border-2"
            style={{
              borderColor: '#6b96c4',
              borderTopColor: 'transparent',
            }}
          />
          <span>Reconnecting to audit stream...</span>
        </div>
      )}

      {/* Left: header + live dataset strip + graph canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ background: '#6b96c4' }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: '#6b96c4' }}
              />
            </span>
            <div>
              <p
                className="text-[13px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: '#e4e6eb' }}
              >
                {graphReady ? 'Live audit' : 'Building workflow'}
              </p>
              <p className="mt-0.5 font-mono text-[11px]" style={{ color: '#5a5f68' }}>
                {runId}
              </p>
            </div>
            <span
              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{
                borderColor: 'rgba(255, 255, 255, 0.08)',
                background: '#14171b',
                color: '#8b9099',
              }}
            >
              {doneCount}/{STEPS.length} steps
              {runningCount > 0 ? ` · ${runningCount} running` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-[12px] font-medium text-slate-500 md:block">
              Drag nodes to rearrange · click for details
            </p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0c1320] px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Report
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                downloadGraphPng(
                  statuses as Record<string, GraphNodeStatus>,
                  durations,
                  results,
                  retry as RetryState,
                  runId,
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0c1320] px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
              title="Download a PNG snapshot of this graph"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              PNG
            </button>
          </div>
        </div>

        {/* Live dataset snapshot: title, license, files, columns */}
        {meta && (
          <div className="shrink-0 px-5 pb-2">
            <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800 bg-[#0c1320]/80 px-4 py-2.5 shadow-[0_2px_12px_rgba(2,6,16,0.5)] fade-in-up">
              <span className="font-display max-w-[240px] truncate text-[13.5px] font-bold text-slate-50">
                {meta.title || 'Unknown dataset'}
              </span>

              <Metric label="License" value={meta.license || 'Not stated'} tone={meta.license ? 'ok' : 'warn'} />

              <span className="group relative flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Files</span>
                <span className={`text-[12px] font-bold ${fileCount > 0 ? 'text-slate-200' : 'text-amber-400'}`}>
                  {fileCount} listed
                </span>
                {fileCount === 0 && (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" className="cursor-help">
                      <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 11v5" strokeLinecap="round" />
                    </svg>
                    <span className="normal-case tracking-normal pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-60 rounded-lg border border-slate-700 bg-[#0a0f1a] px-3 py-2 text-[11px] font-medium leading-snug text-slate-200 shadow-xl group-hover:block">
                      Kaggle did not expose a file list for this page (usually bot protection). The audit still runs on all public metadata.
                    </span>
                  </>
                )}
              </span>

              {columnCount > 0 && (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Columns ({columnCount})
                  </span>
                  <span className="flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
                    {meta.columns!.slice(0, 12).map((col) => (
                      <span
                        key={col}
                        className="shrink-0 rounded-md border border-slate-700 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-300"
                      >
                        {col}
                      </span>
                    ))}
                    {columnCount > 12 && (
                      <span className="shrink-0 text-[10.5px] font-medium text-slate-500">
                        +{columnCount - 12} more
                      </span>
                    )}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="graph-canvas relative min-h-0 flex-1 border-t border-white/5">
          <PipelineGraph
            runId={runId}
            statuses={statuses}
            durations={durations}
            results={results}
            retry={retry}
            selectedNode={selectedNode}
            onSelect={setSelectedNode}
          />

          {/* Minimal legend */}
          <div className="pointer-events-none absolute bottom-3 right-4 z-10 flex items-center gap-4 rounded-full border border-slate-800 bg-[#0a0f1a]/85 px-3.5 py-1.5 shadow-sm backdrop-blur">
            <LegendDot cls="bg-slate-500" text="Waiting" />
            <LegendDot cls="bg-cyan-400" text="Running" />
            <LegendDot cls="bg-emerald-400" text="Completed" />
          </div>

          {failed && (
            <div className="absolute bottom-4 left-1/2 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 shadow-xl backdrop-blur">
              <p className="text-sm font-semibold text-rose-200">{failed}</p>
              <button
                onClick={onReset}
                className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-400/25"
              >
                Start over
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: detail drawer */}
      <div
        className={`relative h-full shrink-0 overflow-hidden border-l border-slate-800 bg-[#0a0f1a] transition-[width] duration-500 ease-out max-md:absolute max-md:right-0 max-md:top-0 max-md:z-30 max-md:h-full max-md:shadow-2xl ${
          selected ? 'w-[min(100%,380px)]' : 'w-0'
        }`}
      >
        {selected && (
          <aside
            key={selected.node}
            className="slide-card-in flex h-full w-[min(100%,380px)] flex-col bg-[#0a0f1a] text-slate-100"
          >
            <div className="h-1 w-full shrink-0 bg-gradient-to-r from-cyan-400/80 via-teal-400/80 to-indigo-400/80" />

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
                  {selected.kicker}
                </p>
                <h3 className="font-display mt-1 text-[20px] font-bold leading-tight tracking-tight text-slate-50">
                  {selected.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
                aria-label="Close details"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
                  selectedStatus === 'completed'
                    ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30'
                    : selectedStatus === 'running'
                      ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/30'
                      : selectedStatus === 'failed'
                        ? 'bg-rose-400/10 text-rose-300 border border-rose-400/30'
                        : 'bg-white/[0.04] text-slate-400 border border-white/10'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    selectedStatus === 'completed'
                      ? 'bg-emerald-400'
                      : selectedStatus === 'running'
                        ? 'animate-pulse bg-cyan-400'
                        : selectedStatus === 'failed'
                          ? 'bg-rose-400'
                          : 'bg-slate-500'
                  }`}
                />
                {statusLabel(selectedStatus)}
              </span>

              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{STATUS_MEANING[selectedStatus]}</p>

              <p className="mt-4 text-[14px] leading-relaxed text-slate-300">{selected.description}</p>

              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                What this node does
              </p>
              <ul className="mt-2 space-y-2">
                {selected.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2 text-[13px] font-medium leading-snug text-slate-300"
                  >
                    <svg
                      className="mt-0.5 shrink-0"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    {b}
                  </li>
                ))}
              </ul>

              {selected.node === 'ingest' && meta && meta.columns && meta.columns.length > 0 && (
                <>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Detected columns ({meta.columns.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {meta.columns.map((col) => (
                      <span
                        key={col}
                        className="rounded-md border border-slate-700 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] font-medium text-slate-300"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Live log</p>
              <div className="mt-2 rounded-xl border border-slate-800 bg-[#05080f] p-3">
                <p className="font-mono text-[12px] leading-relaxed text-slate-300">
                  {selectedMsg || 'Waiting for this node to run…'}
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function LegendDot({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      <span className="text-[10.5px] font-semibold text-slate-400">{text}</span>
    </span>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span
        className={`max-w-[180px] truncate text-[12px] font-bold ${
          tone === 'warn' ? 'text-amber-400' : 'text-slate-200'
        }`}
      >
        {value}
      </span>
    </span>
  )
}
