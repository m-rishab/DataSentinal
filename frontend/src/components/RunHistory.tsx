import type { RunSummary } from '../lib/types'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function scoreTone(score: number | null): { bg: string; fg: string; text: string } {
  if (score == null) return { bg: 'color-mix(in srgb, var(--color-muted) 10%, transparent)', fg: 'var(--color-muted)', text: '—' }
  if (score < 40) return { bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)', fg: 'var(--color-error)', text: String(score) }
  if (score <= 70) return { bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', fg: 'var(--color-warning)', text: String(score) }
  return { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)', text: String(score) }
}

export default function RunHistory({
  runs,
  isLoading,
  onOpen,
}: {
  runs: RunSummary[]
  isLoading: boolean
  onOpen: (runId: string, url: string) => void
}) {
  if (isLoading && runs.length === 0) return null

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-20">
      <div className="rule-fade mb-5 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">✦ Recent Audits</h2>
          <span className="shrink-0 font-mono text-[0.65625rem] text-muted">{runs.length} stored</span>
        </div>
      </div>

      {runs.length === 0 ? (
        <p
          className="rounded-xl border border-dashed px-4 py-6 text-center text-[0.8125rem] font-medium text-muted"
          style={{ borderColor: 'var(--color-line-strong)' }}
        >
          No audits yet — run one above and it will appear here.
        </p>
      ) : (
        <div
          className="card overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lift)' }}
        >
          {runs.map((run, i) => {
            const tone = scoreTone(run.trust_score)
            return (
              <button
                key={run.run_id}
                type="button"
                onClick={() => onOpen(run.run_id, run.url)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                style={i > 0 ? { borderTop: '1px solid var(--color-line)' } : undefined}
              >
                <span
                  className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-[0.875rem] font-bold tabular-nums"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {tone.text}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {run.title || run.url}
                  </span>
                  <span className="block truncate font-mono text-[0.65625rem]" style={{ color: 'var(--color-muted)' }}>
                    {run.url}
                  </span>
                </span>
                {run.gate?.passed != null && (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider"
                    style={
                      run.gate.passed
                        ? { borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)', background: 'color-mix(in srgb, var(--color-success) 10%, transparent)', color: 'var(--color-success)' }
                        : { borderColor: 'color-mix(in srgb, var(--color-error) 35%, transparent)', background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }
                    }
                  >
                    gate {run.gate.passed ? 'pass' : 'fail'}
                  </span>
                )}
                <span className="w-16 shrink-0 text-right font-mono text-[0.65625rem]" style={{ color: 'var(--color-muted)' }}>
                  {timeAgo(run.created_at)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}