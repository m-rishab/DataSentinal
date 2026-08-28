import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLiveMetadata, openAuditStream } from '../lib/api'
import type { DatasetMetadata, SSEEvent } from '../lib/types'
import { downloadGraphPng, type NodeStatus as GraphNodeStatus, type RetryState } from '../lib/graphExport'
import { PIPELINE, indexByNode } from '../lib/steps'
import PipelineGraph, { type GraphFilter } from './PipelineGraph'
import TimelineView from './TimelineView'

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
type RetryPhase = 'none' | 'active' | 'done'

function statusLabel(status: NodeStatus) {
  if (status === 'running') return 'Running'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Waiting'
}

const STATUS_MEANING: Record<NodeStatus, string> = {
  pending: 'Queued — this agent starts automatically once its inputs are ready.',
  running: 'Working right now — live output streams into the log below.',
  completed: 'Finished successfully. Its findings are folded into the final report.',
  failed: 'Hit a problem. The audit continues with reduced evidence for this step.',
}

/* Monotonic mm:ss elapsed clock. */
function Elapsed({ from, running }: { from: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const iv = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(iv)
  }, [running])
  const s = Math.floor((now - from) / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <span className="font-mono text-[0.8125rem] tabular-nums" style={{ color: 'var(--color-secondary)' }}>
      {mm}:{ss}
    </span>
  )
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
  const [showEvidence, setShowEvidence] = useState(false)
  const [filter, setFilter] = useState<GraphFilter>('all')
  const [view, setView] = useState<'graph' | 'timeline'>('graph')
  const [search, setSearch] = useState('')
  const [timestamps, setTimestamps] = useState<Record<string, number>>({})
  const searchRef = useRef<HTMLInputElement | null>(null)
  const doneRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const autoReturnRef = useRef(autoReturn)
  autoReturnRef.current = autoReturn

  useEffect(() => {
    const timer = window.setTimeout(() => setGraphReady(true), 6700)
    return () => window.clearTimeout(timer)
  }, [])

  /* Poll lightweight metadata endpoint for title/license/files/columns. */
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
      const timers: number[] = []
      PIPELINE.forEach((s, i) => {
        const start = Date.now()
        timers.push(
          window.setTimeout(() => {
            setStatuses((prev) => ({ ...prev, [s.node]: 'running' }))
            setMessages((prev) => ({ ...prev, [s.node]: `Running ${s.label.toLowerCase()}…` }))
          }, 700 + i * 900),
        )
        timers.push(
          window.setTimeout(() => {
            setStatuses((prev) => ({ ...prev, [s.node]: 'completed' }))
            setDurations((prev) => ({ ...prev, [s.node]: Date.now() - start + 900 }))
            setResults((prev) => ({ ...prev, [s.node]: 'demo' }))
            setMessages((prev) => ({ ...prev, [s.node]: `${s.label} completed.` }))
            setTimestamps((prev) => ({ ...prev, [s.node]: Date.now() }))
          }, 1400 + i * 900),
        )
      })
      return () => timers.forEach(clearTimeout)
    }

    const nodeStart: Record<string, number> = {}
    const completedOnce = new Set<string>()

    const applyEvent = (event: SSEEvent) => {
      if (doneRef.current) return
      if (event.status === 'failed') {
        setFailed(event.message)
        return
      }
      if (event.status === 'done') {
        doneRef.current = true
        setStatuses((prev) => ({ ...prev, [event.node]: 'completed' }))
        setTimestamps((prev) => ({ ...prev, [event.node]: Date.now() }))
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
      if (event.status !== 'running') setTimestamps((prev) => ({ ...prev, [event.node]: Date.now() }))
      if (event.message) setMessages((prev) => ({ ...prev, [event.node]: event.message }))
    }

    /* Coalesce history replay after reconnect into one render pass. */
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

  const selected = useMemo(() => (selectedNode ? PIPELINE[indexByNode(selectedNode)] ?? null : null), [selectedNode])
  const selectedStatus = selected ? (statuses[selected.node] ?? 'pending') : 'pending'
  const selectedMsg = selected ? messages[selected.node] : undefined
  const selectedResult = selected ? results[selected.node] : undefined
  const selectedDuration = selected ? durations[selected.node] : undefined

  const runningCount = Object.values(statuses).filter((s) => s === 'running').length
  const doneCount = Object.values(statuses).filter((s) => s === 'completed').length
  const fileCount = meta?.files?.length ?? 0
  const columnCount = meta?.columns?.length ?? 0

  /* Keyboard: / or f focuses search · T toggles graph/timeline ·
     Escape closes the drawer and clears search. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target != null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (typing) return
      if (e.key === 'Escape') {
        setSelectedNode(null)
        setShowEvidence(false)
        setSearch('')
        searchRef.current?.blur()
      } else if (e.key.toLowerCase() === 't') {
        setView((v) => (v === 'graph' ? 'timeline' : 'graph'))
      } else if (e.key.toLowerCase() === 'f') {
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedTs = selected ? timestamps[selected.node] : undefined

  const headerLabel = !graphReady ? 'Building workflow' : doneCount === PIPELINE.length ? 'Audit complete' : 'Live audit'

  return (
    <div className="relative flex h-full min-h-0" style={{ background: 'var(--color-page)' }}>
      {reconnecting && (
        <div
          className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 py-2 text-[0.9375rem] font-medium"
          style={{ background: 'color-mix(in srgb, var(--color-info) 12%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)', color: 'var(--color-info)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin">
            <path d="M21 12a9 9 0 11-6.2-8.56" />
          </svg>
          Reconnecting to audit stream…
        </div>
      )}

      {/* Left: top bar + dataset strip + canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-1 pt-3 sm:px-5 sm:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${autoReturn ? 'pulse-soft' : ''}`}
                style={{ background: 'var(--color-info)', opacity: autoReturn ? 0.7 : 0.35 }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: autoReturn ? 'var(--color-info)' : 'var(--color-success)' }} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-display text-[0.9375rem] font-semibold leading-tight" style={{ color: 'var(--color-primary)' }}>
                  {meta?.title ?? (runId === 'preview' ? 'Iris Dataset' : 'Preparing…')}
                </p>
                {onBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="btn btn-ghost shrink-0 px-2 py-0.5 !text-[0.6875rem]"
                    title="Back to report"
                  >
                    ← Report
                  </button>
                ) : null}
              </div>
              <p className="truncate font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
                {headerLabel} · {runId}
              </p>
            </div>
            <span className="chip shrink-0 hidden sm:inline-flex">
              {doneCount}/{PIPELINE.length} completed
              {runningCount > 0 ? ` · ${runningCount} running` : ''}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {autoReturn && (
              <span className="flex items-center gap-2">
                <span className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted sm:inline">elapsed</span>
                <Elapsed from={startedAtRef.current} running={autoReturn} />
              </span>
            )}
            <span className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted md:inline">
                drag · click nodes for details
              </span>
            <span className="hidden rounded-full border px-2 py-0.5 font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-muted lg:inline" style={{ borderColor: 'var(--color-line)' }}>
              t=timeline · /=search · esc=close
            </span>
            {/* Graph / Timeline toggle */}
            <span className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: 'var(--color-line)' }} role="group" aria-label="View">
              {(['graph', 'timeline'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-2.5 py-0.5 capitalize font-mono text-[0.6875rem] font-semibold transition-colors ${
                    view === v ? 'text-[#0b0e13]' : 'text-muted hover:text-primary'
                  }`}
                  style={view === v ? { background: 'var(--color-accent)' } : undefined}
                  aria-pressed={view === v}
                  title={v === 'graph' ? 'Investigation map (T)' : 'Linear read of the same audit (T)'}
                >
                  {v}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() =>
                downloadGraphPng(statuses as Record<string, GraphNodeStatus>, durations, results, retry as RetryState, runId)
              }
              className="btn btn-ghost px-2.5 py-1.5 !text-[0.6875rem]"
              title="Download a PNG snapshot of this graph"
              aria-label="Export graph as PNG"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              PNG
            </button>
            <button type="button" onClick={onReset} className="btn btn-ghost px-2.5 py-1.5 !text-[0.6875rem]" title="Cancel this audit">
              {doneCount === PIPELINE.length ? 'Restart' : 'Cancel'}
            </button>
          </div>
        </div>

        {/* Live dataset snapshot */}
        {meta && (
          <div className="shrink-0 px-4 pb-2 sm:px-5">
            <div
              className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2 fade-in-up"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
            >
              <Metric label="License" value={meta.license || 'Not stated'} tone={meta.license ? 'ok' : 'warn'} />
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">Files</span>
                <span className="text-[0.9375rem] font-semibold" style={{ color: fileCount > 0 ? 'var(--color-primary)' : 'var(--color-warning)' }}>
                  {fileCount} listed
                </span>
              </span>
              {columnCount > 0 && (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
                    Columns ({columnCount})
                  </span>
                  <span className="flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
                    {meta.columns!.slice(0, 10).map((col) => (
                      <span key={col} className="chip !px-1.5 !py-[2px] font-mono !text-[0.6875rem]">
                        {col}
                      </span>
                    ))}
                    {columnCount > 10 && (
                      <span className="shrink-0 font-mono text-[0.8125rem] text-muted">+{columnCount - 10} more</span>
                    )}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="graph-canvas relative min-h-0 flex-1" style={{ borderTop: '1px solid var(--color-line)' }}>
          {view === 'graph' ? (
            <PipelineGraph
              statuses={statuses}
              durations={durations}
              results={results}
              retry={retry}
              selectedNode={selectedNode}
              onSelect={(n) => {
                setSelectedNode(n)
                setShowEvidence(false)
              }}
              filter={filter}
              runId={runId}
              search={search}
              onSearchChange={setSearch}
              searchInputRef={searchRef}
            />
          ) : (
            <TimelineView
              statuses={statuses}
              messages={messages}
              durations={durations}
              results={results}
              selectedNode={selectedNode}
              onSelect={(n) => {
                setSelectedNode(n)
                setShowEvidence(false)
              }}
            />
          )}

          {/* Legend + node filter (graph view only) */}
          {view === 'graph' && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-full border px-3.5 py-1.5"
            style={{ background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)', borderColor: 'var(--color-line)', backdropFilter: 'blur(6px)' }}
          >
            <span className="flex items-center gap-4">
              <LegendDot color="var(--color-muted)" text="Waiting" />
              <LegendDot color="var(--color-info)" text="Running" />
              <LegendDot color="var(--color-success)" text="Completed" />
              <LegendDot color="var(--color-error)" text="Error" />
            </span>
            <span className="pointer-events-auto flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: 'var(--color-line)' }}>
              {(['all', 'running', 'completed', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-2 py-0.5 capitalize font-mono text-[0.6875rem] font-semibold transition-colors ${
                    filter === f ? 'text-[#0b0e13]' : 'text-muted hover:text-primary'
                  }`}
                  style={filter === f ? { background: 'var(--color-primary)' } : undefined}
                  aria-pressed={filter === f}
                >
                  {f}
                </button>
              ))}
            </span>
          </div>
          )}

          {failed && (
            <div
              className="absolute bottom-4 left-1/2 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-xl border p-4 shadow-[0_18px_50px_rgba(2,6,16,0.55)]"
              style={{ background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-panel))', borderColor: 'color-mix(in srgb, var(--color-error) 35%, transparent)' }}
            >
              <p className="text-[0.9375rem] font-semibold" style={{ color: '#e0b3b0' }}>
                {failed}
              </p>
              <button type="button" onClick={onReset} className="btn btn-danger mt-3 px-3 py-1.5 !text-[0.8125rem]">
                Start over
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: detail drawer (bottom sheet on small screens) */}
      <div
        className={`relative h-full shrink-0 overflow-hidden transition-[width,height] duration-500 ease-out ${
          selected ? 'w-[min(100%,460px)]' : 'w-0'
        } max-md:absolute max-md:bottom-0 max-md:left-0 max-md:z-30 ${
          selected ? 'max-md:h-[min(72vh,580px)] max-md:w-full' : 'max-md:h-0'
        }`}
        style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-line)' }}
      >
        {selected && (
          <aside
            key={selected.node}
            className="slide-in flex h-full w-[min(100%,460px)] flex-col fade-in"
            style={{ background: 'var(--color-surface)' }}
            aria-label={`${selected.label} details`}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}>
              <div className="min-w-0">
                <p className="font-mono text-[0.75rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-info)' }}>
                  {selected.kicker}
                </p>
                <h3 className="mt-1 truncate font-display text-[1.35rem] font-semibold leading-tight" style={{ color: 'var(--color-primary)' }}>
                  {selected.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="btn btn-ghost shrink-0 px-2 py-1.5"
                aria-label="Close details"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5" style={{ overscrollBehavior: 'contain' }}>
              {/* Status */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="chip"
                  style={{
                    color: STATUS_TONE[selectedStatus],
                    borderColor: `color-mix(in srgb, ${STATUS_TONE[selectedStatus]} 35%, transparent)`,
                    background: `color-mix(in srgb, ${STATUS_TONE[selectedStatus]} 10%, transparent)`,
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${selectedStatus === 'running' ? 'pulse-soft' : ''}`}
                    style={{ background: STATUS_TONE[selectedStatus] }}
                  />
                  {statusLabel(selectedStatus)}
                </span>
                {(selectedDuration != null && selectedDuration > 0) || selectedTs ? (
                  <span className="font-mono text-[0.75rem] tabular-nums text-muted">
                    {(selectedDuration != null && selectedDuration > 0 ? `${(selectedDuration / 1000).toFixed(1)}s` : '')}
                    {selectedDuration != null && selectedDuration > 0 && selectedTs ? ' · ' : ''}
                    {selectedTs ? `finished ${new Date(selectedTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                {STATUS_MEANING[selectedStatus]}
              </p>

              <p className="mt-4 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--color-primary)' }}>
                {selected.description}
              </p>

              {/* Result / evidence */}
              {selectedResult && (
                <div
                  className="mt-5 rounded-lg border p-3.5"
                  style={{ background: 'color-mix(in srgb, var(--color-success) 6%, var(--color-panel))', borderColor: 'color-mix(in srgb, var(--color-success) 25%, transparent)' }}
                >
                  <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-success)' }}>
                    Result
                  </p>
                  <p className="mt-1.5 font-mono text-[0.875rem] leading-relaxed" style={{ color: 'var(--color-primary)' }}>
                    {selectedResult}
                  </p>
                </div>
              )}

              {/* Parsed real-metric readout (numbers are actual agent output). */}
              {selectedResult && <DerivedMetrics node={selected.node} result={selectedResult} columns={selected.node === 'ingest' ? meta?.columns : undefined} files={selected.node === 'ingest' ? meta?.files : undefined} />}

              {showEvidence && (
                <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
                  <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted">Raw evidence</p>
                  <p className="mt-1.5 font-mono text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                    {selectedMsg || 'No message yet for this node.'}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowEvidence((v) => !v)}
                  className="btn px-3.5 py-1.5 !text-[0.8125rem]"
                  disabled={!selectedMsg && !selectedResult}
                >
                  {showEvidence ? 'Hide evidence' : 'View evidence'}
                </button>
                <button type="button" onClick={() => setSelectedNode(null)} className="btn btn-ghost px-3.5 py-1.5 !text-[0.8125rem]">
                  Focus graph
                </button>
              </div>

              <p className="mt-6 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted">What this agent checks</p>
              <ul className="mt-2.5 space-y-2">
                {selected.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[0.9375rem] font-medium leading-snug" style={{ color: 'var(--color-secondary)' }}>
                    <svg
                      className="mt-[3px] shrink-0"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-accent)"
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
                  <p className="mt-5 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted">
                    Detected columns ({meta.columns.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {meta.columns.map((col) => (
                      <span key={col} className="chip font-mono !text-[0.8125rem]">
                        {col}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-6 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted">Live log</p>
              <div className="mt-2.5 rounded-lg border p-3.5" style={{ background: '#070a10', borderColor: 'var(--color-line)' }}>
                <p className="font-mono text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
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

const STATUS_TONE: Record<NodeStatus, string> = {
  pending: 'var(--color-muted)',
  running: 'var(--color-info)',
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
}

function LegendDot({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--color-secondary)' }}>
        {text}
      </span>
    </span>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span
        className="max-w-[200px] truncate text-[0.9375rem] font-semibold"
        style={{ color: tone === 'warn' ? 'var(--color-warning)' : 'var(--color-primary)' }}
      >
        {value}
      </span>
    </span>
  )
}

/* Numeric readout parsed straight from real agent output — never fabricated.
   Shows counts the agent actually reported (flags, citations, files,
   columns) next to the message that produced them. */
function DerivedMetrics({
  node,
  result,
  columns,
  files,
}: {
  node: string
  result: string
  columns?: string[]
  files?: string[]
}) {
  const flags = result.match(/(\d+)\s*flag/i)
  const chips = result.match(/(\d+)\s*chip/i)
  const candidates = result.match(/(\d+)\s*candidates?/i)
  const verified = result.match(/(\d+)\s*(?:verified|confirmed|matched)/i)
  const papers = result.match(/(\d+)\s*papers?/i)
  const datasets = result.match(/(\d+)\s*(?:alternative|datasets?)/i)

  const rows: { label: string; value: string; tone?: 'ok' | 'warn' }[] = []
  if (node === 'ingest') {
    if (files && files.length > 0) rows.push({ label: 'Files listed', value: String(files.length) })
    if (columns && columns.length > 0) rows.push({ label: 'Columns detected', value: String(columns.length) })
  }
  if (flags) rows.push({ label: node === 'duplication_agent' ? 'Duplication flags' : 'Severity flags', value: flags[1], tone: Number(flags[1]) > 0 ? 'warn' : 'ok' })
  if (chips) rows.push({ label: 'Slug chips', value: chips[1] })
  if (candidates) rows.push({ label: 'Candidates', value: candidates[1] })
  if (verified) rows.push({ label: 'Verified', value: verified[1] })
  if (papers) rows.push({ label: 'Related papers', value: papers[1] })
  if (datasets) rows.push({ label: 'Alternatives', value: datasets[1] })

  if (rows.length === 0) return null

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
          <p className="font-mono text-[0.75rem] font-bold uppercase tracking-[0.14em] text-muted">{r.label}</p>
          <p className="mt-1 font-display text-[1.2rem] font-semibold tabular-nums" style={{ color: r.tone === 'warn' ? 'var(--color-warning)' : 'var(--color-primary)' }}>
            {r.value}
          </p>
        </div>
      ))}
    </div>
  )
}