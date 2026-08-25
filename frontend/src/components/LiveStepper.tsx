import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLiveMetadata, openAuditStream } from '../lib/api'
import type { DatasetMetadata, SSEEvent } from '../lib/types'
import { downloadGraphPng, type NodeStatus as GraphNodeStatus, type RetryState } from '../lib/graphExport'

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
type RetryPhase = 'none' | 'active' | 'done'

interface StepDef {
  node: string
  label: string
  kicker: string
  description: string
  bullets: string[]
  x: number
  y: number
  w: number
  h: number
}

const STAGE_W = 1000
const STAGE_H = 520

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
    x: 120, y: 260, w: 168, h: 64,
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
    x: 400, y: 70, w: 188, h: 64,
  },
  {
    node: 'citation_tracer',
    label: 'Citation Tracer',
    kicker: '03 · Papers',
    description: 'Finds citing papers through Semantic Scholar, then cross-checks every DOI against Crossref retraction records.',
    bullets: [
      'Searches Semantic Scholar for citations',
      'Resolves DOIs via Crossref',
      'Marks retracted or disputed papers',
    ],
    x: 400, y: 196, w: 188, h: 64,
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
    x: 400, y: 324, w: 188, h: 64,
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
    x: 400, y: 450, w: 188, h: 64,
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
    x: 720, y: 196, w: 188, h: 64,
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
    x: 720, y: 360, w: 188, h: 64,
  },
]

const CONNECTIONS: { id: string; from: string; to: string }[] = [
  { id: 'ingest→consent_agent', from: 'ingest', to: 'consent_agent' },
  { id: 'ingest→citation_tracer', from: 'ingest', to: 'citation_tracer' },
  { id: 'ingest→duplication_agent', from: 'ingest', to: 'duplication_agent' },
  { id: 'ingest→related_work_agent', from: 'ingest', to: 'related_work_agent' },
  { id: 'consent_agent→critic_aggregator', from: 'consent_agent', to: 'critic_aggregator' },
  { id: 'citation_tracer→critic_aggregator', from: 'citation_tracer', to: 'critic_aggregator' },
  { id: 'duplication_agent→critic_aggregator', from: 'duplication_agent', to: 'critic_aggregator' },
  { id: 'related_work_agent→critic_aggregator', from: 'related_work_agent', to: 'critic_aggregator' },
  { id: 'critic_aggregator→report_generator', from: 'critic_aggregator', to: 'report_generator' },
]

const REVEAL: { t: number; kind: 'node' | 'edge'; id: string }[] = [
  { t: 80, kind: 'node', id: 'ingest' },
  { t: 520, kind: 'edge', id: 'ingest→consent_agent' },
  { t: 980, kind: 'node', id: 'consent_agent' },
  { t: 1380, kind: 'edge', id: 'ingest→citation_tracer' },
  { t: 1840, kind: 'node', id: 'citation_tracer' },
  { t: 2240, kind: 'edge', id: 'ingest→duplication_agent' },
  { t: 2700, kind: 'node', id: 'duplication_agent' },
  { t: 3100, kind: 'edge', id: 'ingest→related_work_agent' },
  { t: 3560, kind: 'node', id: 'related_work_agent' },
  { t: 4000, kind: 'edge', id: 'consent_agent→critic_aggregator' },
  { t: 4280, kind: 'edge', id: 'citation_tracer→critic_aggregator' },
  { t: 4560, kind: 'edge', id: 'duplication_agent→critic_aggregator' },
  { t: 4840, kind: 'edge', id: 'related_work_agent→critic_aggregator' },
  { t: 5340, kind: 'node', id: 'critic_aggregator' },
  { t: 5800, kind: 'edge', id: 'critic_aggregator→report_generator' },
  { t: 6260, kind: 'node', id: 'report_generator' },
]

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set())
  const [visibleEdges, setVisibleEdges] = useState<Set<string>>(new Set())
  const [graphReady, setGraphReady] = useState(false)
  const [meta, setMeta] = useState<DatasetMetadata | null>(null)
  /* Draggable node positions (graph coordinates), persisted per run. */
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const raw = localStorage.getItem(`ds-pos-${runId}`)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, { x: number; y: number }>
        if (STEPS.every((s) => saved[s.node])) return saved
      }
    } catch {
      /* fall through to defaults */
    }
    return Object.fromEntries(STEPS.map((s) => [s.node, { x: s.x, y: s.y }]))
  })
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    node: string
    px: number
    py: number
    ox: number
    oy: number
    moved: boolean
  } | null>(null)
  const doneRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const autoReturnRef = useRef(autoReturn)
  autoReturnRef.current = autoReturn

  const posOf = (node: string) => positions[node] ?? { x: 0, y: 0 }

  const clampFor = (node: string, x: number, y: number) => {
    const def = STEPS.find((s) => s.node === node)!
    return {
      x: Math.min(STAGE_W - def.w / 2 - 6, Math.max(def.w / 2 + 6, x)),
      y: Math.min(STAGE_H - def.h / 2 - 6, Math.max(def.h / 2 + 6, y)),
    }
  }

  /* Retry loop path follows the two nodes it connects. */
  const retryPath = useMemo(() => {
    const c = posOf('critic_aggregator')
    const t = posOf('citation_tracer')
    const sy = c.y - 34
    const ey = t.y - 34
    const lift = 110
    return `M ${c.x - 20} ${sy} C ${c.x - 40} ${sy - lift}, ${t.x + 130} ${ey - lift}, ${t.x + 58} ${ey}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions])

  const onNodePointerDown = (e: React.PointerEvent<HTMLButtonElement>, node: string) => {
    const p = posOf(node)
    dragRef.current = { node, px: e.clientX, py: e.clientY, ox: p.x, oy: p.y, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onNodePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.node !== e.currentTarget.dataset.node) return
    if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) < 4) return
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    d.moved = true
    setDraggingNode(d.node)
    setHoveredNode(null)
    const dx = ((e.clientX - d.px) / rect.width) * STAGE_W
    const dy = ((e.clientY - d.py) / rect.height) * STAGE_H
    setPositions((prev) => ({ ...prev, [d.node]: clampFor(d.node, d.ox + dx, d.oy + dy) }))
  }

  const onNodePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    dragRef.current = null
    setDraggingNode(null)
    if (!d || d.node !== e.currentTarget.dataset.node) return
    if (d.moved) {
      try {
        localStorage.setItem(
          `ds-pos-${runId}`,
          JSON.stringify({ ...positions, [d.node]: posOf(d.node) }),
        )
      } catch {
        /* storage full/unavailable — positions stay session-only */
      }
    } else {
      setSelectedNode(d.node)
    }
  }

  /* Reveal the workflow graph piece by piece — runs once per mount. */
  useEffect(() => {
    const timers: number[] = []
    REVEAL.forEach((item) => {
      timers.push(
        window.setTimeout(() => {
          if (item.kind === 'node') {
            setVisibleNodes((prev) => new Set(prev).add(item.id))
          } else {
            setVisibleEdges((prev) => new Set(prev).add(item.id))
          }
        }, item.t),
      )
    })
    timers.push(window.setTimeout(() => setGraphReady(true), 6700))
    return () => timers.forEach(clearTimeout)
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
    <div className="flex h-full min-h-0 bg-white">
      {/* Left: header + live dataset strip + graph canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
            <div>
              <p className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-800">
                {graphReady ? 'Live audit' : 'Building workflow'}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">{runId}</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
              {doneCount}/{STEPS.length} steps
              {runningCount > 0 ? ` · ${runningCount} running` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-[12px] font-medium text-slate-400 md:block">
              {autoReturn ? 'Click a node for details' : 'Drag nodes to rearrange · click for details'}
            </p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
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
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
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
            <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.05)] fade-in-up">
              <span className="font-display max-w-[240px] truncate text-[13.5px] font-bold text-slate-900">
                {meta.title || 'Unknown dataset'}
              </span>

              <Metric label="License" value={meta.license || 'Not stated'} tone={meta.license ? 'ok' : 'warn'} />

              <span className="group relative flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Files</span>
                <span className={`text-[12px] font-bold ${fileCount > 0 ? 'text-slate-800' : 'text-amber-600'}`}>
                  {fileCount} listed
                </span>
                {fileCount === 0 && (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" className="cursor-help">
                      <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 11v5" strokeLinecap="round" />
                    </svg>
                    <span className="normal-case tracking-normal pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-60 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-xl group-hover:block">
                      Kaggle did not expose a file list for this page (usually bot protection). The audit still runs on all public metadata.
                    </span>
                  </>
                )}
              </span>

              {columnCount > 0 && (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Columns ({columnCount})
                  </span>
                  <span className="flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
                    {meta.columns!.slice(0, 12).map((col) => (
                      <span
                        key={col}
                        className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-600"
                      >
                        {col}
                      </span>
                    ))}
                    {columnCount > 12 && (
                      <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                        +{columnCount - 12} more
                      </span>
                    )}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="graph-canvas relative min-h-0 flex-1 border-t border-slate-100">
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4">
            <div
              ref={stageRef}
              className="relative"
              style={{
                width: 'min(100%, 980px)',
                maxWidth: '100%',
                aspectRatio: `${STAGE_W} / ${STAGE_H}`,
              }}
            >
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
                fill="none"
              >
                <defs>
                  <marker id="dsArrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#94a3b8" />
                  </marker>
                </defs>

                {CONNECTIONS.map((conn) => {
                  if (!visibleEdges.has(conn.id)) return null
                  const fromDef = STEPS.find((s) => s.node === conn.from)!
                  const toDef = STEPS.find((s) => s.node === conn.to)!
                  const from = posOf(conn.from)
                  const to = posOf(conn.to)
                  const d = bezier(
                    from.x + fromDef.w / 2,
                    from.y,
                    to.x - toDef.w / 2,
                    to.y,
                  )
                  const toStatus = statuses[conn.to] ?? 'pending'
                  return (
                    <g key={conn.id}>
                      {/* Base path: constant props after mount, drawn exactly once.
                          Status changes can never re-trigger its animation. */}
                      <path
                        d={d}
                        pathLength={1}
                        className="edge-draw"
                        stroke="#cbd5e1"
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                        markerEnd="url(#dsArrow)"
                      />
                      {/* Flow overlay: separate element, mounted only while the
                          downstream node is executing. */}
                      {toStatus === 'running' && (
                        <path
                          d={d}
                          className="edge-flow"
                          stroke="#06b6d4"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                          fill="none"
                        />
                      )}
                    </g>
                  )
                })}

                {/* Retry loop: aggregator -> citation_tracer, drawn only once a bounce occurs.
                    Stays mounted after first activation; animates with a soft opacity
                    pulse while active (no dash marching = no flicker), then settles
                    into a static dashed line once the retry completes. */}
                {retry !== 'none' && (
                  <g>
                    <path
                      d={retryPath}
                      pathLength={1}
                      className={retry === 'active' ? 'retry-active' : ''}
                      stroke={retry === 'active' ? '#06b6d4' : '#34d399'}
                      strokeWidth={1.8}
                      strokeDasharray={retry === 'active' ? undefined : '5 5'}
                      strokeLinecap="round"
                      fill="none"
                      markerEnd="url(#dsArrow)"
                      opacity={0.9}
                    />
                    <text
                      x="620" y="52"
                      textAnchor="middle"
                      className="font-mono select-none"
                      fontSize="10.5"
                      fill={retry === 'active' ? '#0891b2' : '#059669'}
                    >
                      retry · deeper citation search
                    </text>
                  </g>
                )}
              </svg>

              {STEPS.map((step) => {
                if (!visibleNodes.has(step.node)) return null
                const status = statuses[step.node] ?? 'pending'
                const isSelected = selectedNode === step.node
                const isHovered = hoveredNode === step.node
                const p = posOf(step.node)
                /* Preview opens toward empty space so it never covers sibling nodes. */
                const side: 'left' | 'right' = p.x > STAGE_W * 0.55 ? 'left' : 'right'

                let border = 'border-slate-200'
                let bg = 'bg-white'
                let glow = ''
                let title = 'text-slate-900'
                let kicker = 'text-slate-400'
                let dot = 'bg-slate-300'
                if (status === 'running') {
                  border = 'border-cyan-400'
                  bg = 'bg-cyan-50'
                  glow = 'node-running'
                  title = 'text-cyan-900'
                  kicker = 'text-cyan-600'
                  dot = 'bg-cyan-500'
                } else if (status === 'completed') {
                  border = 'border-emerald-300'
                  bg = 'bg-emerald-50'
                  glow = 'shadow-[0_4px_16px_rgba(16,185,129,0.18)]'
                  title = 'text-emerald-900'
                  kicker = 'text-emerald-600'
                  dot = 'bg-emerald-500'
                } else if (status === 'failed') {
                  border = 'border-rose-300'
                  bg = 'bg-rose-50'
                  title = 'text-rose-900'
                  kicker = 'text-rose-500'
                  dot = 'bg-rose-500'
                }
                if (isSelected) {
                  glow += ' ring-2 ring-slate-900/25'
                }

                return (
                  <div
                    key={step.node}
                    className="absolute"
                    style={{
                      left: `${(p.x / STAGE_W) * 100}%`,
                      top: `${(p.y / STAGE_H) * 100}%`,
                      width: `${(step.w / STAGE_W) * 100}%`,
                      height: `${(step.h / STAGE_H) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: draggingNode === step.node ? 40 : isHovered || isSelected ? 30 : 10,
                    }}
                  >
                    <button
                      type="button"
                      data-node={step.node}
                      onPointerDown={(e) => onNodePointerDown(e, step.node)}
                      onPointerMove={onNodePointerMove}
                      onPointerUp={onNodePointerUp}
                      onMouseEnter={() => setHoveredNode(step.node)}
                      onMouseLeave={() => setHoveredNode((n) => (n === step.node ? null : n))}
                      className={`node-pop flex h-full w-full cursor-grab touch-none items-center justify-between gap-2 rounded-2xl border px-3.5 text-left shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,0.12)] active:cursor-grabbing ${border} ${bg} ${glow} ${
                        draggingNode === step.node
                          ? 'scale-[1.03] shadow-[0_16px_34px_rgba(15,23,42,0.20)] transition-none'
                          : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block text-[10px] font-semibold uppercase tracking-[0.14em] ${kicker}`}>
                          {step.kicker}
                          {durations[step.node] ? ` · ${(Math.round(durations[step.node] / 100) / 10).toFixed(1)}s` : ''}
                        </span>
                        <span className={`mt-0.5 block truncate text-[13.5px] font-semibold leading-tight ${title}`}>
                          {step.label}
                        </span>
                      </span>
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {status === 'running' && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                        )}
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
                      </span>
                    </button>

                    {/* Result chip: one-glance summary once the agent finishes */}
                    {status === 'completed' && results[step.node] && (
                      <span className="fade-in-up pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">
                        {results[step.node]}
                      </span>
                    )}

                    {/* Hover preview: opens beside the node (never on top of siblings),
                        delayed so quick mouse passes don't trigger it. */}
                    {isHovered && selectedNode !== step.node && draggingNode !== step.node && (
                      <span
                        className={`preview-in pointer-events-none absolute top-1/2 z-40 w-64 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl ${
                          side === 'left' ? 'right-full mr-3' : 'left-full ml-3'
                        }`}
                      >
                        <span className="block text-[11.5px] font-bold leading-snug text-slate-900">{step.label}</span>
                        <span className="mt-1 block text-[11px] leading-snug text-slate-500">{step.description}</span>
                        {messages[step.node] && (
                          <span className="mt-1.5 block border-t border-slate-100 pt-1.5 font-mono text-[10px] leading-snug text-cyan-700">
                            {messages[step.node]}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Minimal legend */}
          <div className="pointer-events-none absolute bottom-3 right-4 z-10 flex items-center gap-4 rounded-full border border-slate-200 bg-white/85 px-3.5 py-1.5 shadow-sm backdrop-blur">
            <LegendDot cls="bg-slate-300" text="Waiting" />
            <LegendDot cls="bg-cyan-500" text="Running" />
            <LegendDot cls="bg-emerald-500" text="Completed" />
          </div>

          {failed && (
            <div className="absolute bottom-4 left-1/2 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-xl">
              <p className="text-sm font-semibold text-rose-800">{failed}</p>
              <button
                onClick={onReset}
                className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                Start over
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: detail drawer */}
      <div
        className={`relative h-full shrink-0 overflow-hidden border-l border-slate-200 bg-white transition-[width] duration-500 ease-out max-md:absolute max-md:right-0 max-md:top-0 max-md:z-30 max-md:h-full max-md:shadow-2xl ${
          selected ? 'w-[min(100%,380px)]' : 'w-0'
        }`}
      >
        {selected && (
          <aside
            key={selected.node}
            className="slide-card-in flex h-full w-[min(100%,380px)] flex-col bg-white text-slate-900"
          >
            <div className="h-1 w-full shrink-0 bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-500" />

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  {selected.kicker}
                </p>
                <h3 className="font-display mt-1 text-[20px] font-bold leading-tight tracking-tight text-slate-900">
                  {selected.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
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
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : selectedStatus === 'running'
                      ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                      : selectedStatus === 'failed'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    selectedStatus === 'completed'
                      ? 'bg-emerald-500'
                      : selectedStatus === 'running'
                        ? 'animate-pulse bg-cyan-500'
                        : selectedStatus === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-slate-300'
                  }`}
                />
                {statusLabel(selectedStatus)}
              </span>

              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{STATUS_MEANING[selectedStatus]}</p>

              <p className="mt-4 text-[14px] leading-relaxed text-slate-700">{selected.description}</p>

              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                What this node does
              </p>
              <ul className="mt-2 space-y-2">
                {selected.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[13px] font-medium leading-snug text-slate-600"
                  >
                    <svg
                      className="mt-0.5 shrink-0"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#0891b2"
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
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Live log</p>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-mono text-[12px] leading-relaxed text-slate-700">
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
      <span className="text-[10.5px] font-semibold text-slate-500">{text}</span>
    </span>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span
        className={`max-w-[180px] truncate text-[12px] font-bold ${
          tone === 'warn' ? 'text-amber-600' : 'text-slate-800'
        }`}
      >
        {value}
      </span>
    </span>
  )
}
