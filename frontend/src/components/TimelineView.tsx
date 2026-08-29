/* Timeline View — a linear, vertical reading of the same live audit.
   Fed entirely by real SSE state (statuses/messages/durations/results).
   Clicking a row opens the same detail drawer as the graph. */

import { PIPELINE } from '../lib/steps'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'

const STATUS_TONE: Record<NodeStatus, string> = {
  pending: 'var(--color-muted)',
  running: 'var(--color-info)',
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
}

function statusLabel(s: NodeStatus) {
  if (s === 'running') return 'running'
  if (s === 'completed') return 'done'
  if (s === 'failed') return 'failed'
  return 'waiting'
}

function amber(text: string): boolean {
  const m = text.match(/^(\d+)\s*flag/i)
  return m ? Number(m[1]) > 0 : false
}

export default function TimelineView({
  statuses,
  messages,
  durations,
  results,
  selectedNode,
  onSelect,
}: {
  statuses: Record<string, NodeStatus>
  messages: Record<string, string>
  durations: Record<string, number>
  results: Record<string, string>
  selectedNode: string | null
  onSelect: (node: string | null) => void
}) {
  const doneCount = Object.values(statuses).filter((s) => s === 'completed').length
  const runningNode = PIPELINE.find((s) => statuses[s.node] === 'running')

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8" aria-label="Audit timeline">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[0.8125rem] font-bold uppercase tracking-[0.2em] text-muted">
            linear read · same statuses as the graph
          </p>
          <span className="font-mono text-[0.8125rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-secondary)' }}>
            {doneCount}/{PIPELINE.length} agents complete
            {runningNode ? (
              <>
                {' '}· now: <span style={{ color: 'var(--color-info)' }}>{runningNode.label.toLowerCase()}</span>
              </>
            ) : null}
          </span>
        </div>

        {/* Vertical rail */}
        <div className="relative pl-5">
          <div className="absolute bottom-2 left-[7px] top-2 w-px" style={{ background: 'var(--color-line)' }} aria-hidden="true" />
          <div className="stagger is-visible space-y-5">
            {PIPELINE.map((s, i) => {
              const status = statuses[s.node] ?? 'pending'
              const color = STATUS_TONE[status]
              const tone = color
              const result = results[s.node]
              return (
                <div key={s.node} className="relative" style={{ animationDelay: `${i * 0.05}s` }} role="button" tabIndex={0} onClick={() => onSelect(selectedNode === s.node ? null : s.node)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(selectedNode === s.node ? null : s.node) }} aria-pressed={selectedNode === s.node}>
                  {/* Rail dot */}
                  <span
                    className={`absolute -left-5 top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full border ${status === 'running' ? 'pulse-soft' : ''}`}
                    style={{ borderColor: `color-mix(in srgb, ${tone} 55%, transparent)`, background: status === 'running' ? tone : 'var(--color-surface)' }}
                    aria-hidden="true"
                  >
                    {(status === 'completed' || status === 'failed') && (
                      <span className="text-[0.625rem] font-bold" style={{ color: tone }}>{status === 'failed' ? '!' : '✓'}</span>
                    )}
                  </span>

                  <div
                    className="rounded-xl border px-4 py-3 transition-[border-color,background-color,transform] duration-300"
                    style={{
                      borderColor: selectedNode === s.node ? `color-mix(in srgb, ${tone} 55%, transparent)` : 'var(--color-line)',
                      background: selectedNode === s.node ? 'var(--color-panel)' : 'var(--color-surface)',
                      transform: selectedNode === s.node ? 'translateX(4px)' : 'translateX(0)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-[0.6875rem] font-bold" style={{ color: tone }}>{s.kicker.slice(0, 2)}</span>
                        <span className="truncate font-display text-[0.875rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                          {s.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {durations[s.node] != null && durations[s.node]! > 0 && !isNaN(durations[s.node]!) && (
                          <span className="font-mono text-[0.6875rem] tabular-nums text-muted">{(durations[s.node]! / 1000).toFixed(1)}s</span>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[0.65625rem] font-bold uppercase tracking-wider ${status === 'running' ? 'pulse-soft' : ''}`}
                          style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, color: tone, background: `color-mix(in srgb, ${tone} 8%, transparent)` }}
                        >
                          {statusLabel(status)}
                        </span>
                      </div>
                    </div>

                    {(messages[s.node] || result) && (
                      <p className="mt-2 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                        {messages[s.node]}
                        {result && (
                          <span
                            className="mt-1 block rounded px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium"
                            style={{
                              background: amber(result) ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : `color-mix(in srgb, ${tone} 12%, transparent)`,
                              color: amber(result) ? 'var(--color-warning)' : tone,
                              display: 'inline-block',
                            }}
                          >
                            {result}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-6 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted">
          tap a row to open its evidence · superseded agents stay greyed
        </p>
      </div>
    </div>
  )
}