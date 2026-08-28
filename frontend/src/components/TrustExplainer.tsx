import { useReveal } from '../hooks'
import { useCountUp } from '../hooks'
import type { RunSummary } from '../lib/types'

/* Score bands, consistent with RunHistory + report coloring. */
export const SCORE_BANDS = [
  { min: 0, max: 39, label: 'High Risk', color: 'var(--color-error)', note: 'Major flags — verify manually before any downstream use.' },
  { min: 40, max: 70, label: 'Caution', color: 'var(--color-warning)', note: 'Some concerns raised. Read the findings before you build.' },
  { min: 71, max: 100, label: 'Trustworthy', color: 'var(--color-success)', note: 'No material concerns found across the audited signals.' },
] as const

export function bandFor(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max) ?? SCORE_BANDS[0]
}

interface TrustExplainerProps {
  recentRun?: RunSummary | null
  onOpenReport?: (runId: string, url: string) => void
}

export default function TrustExplainer({ recentRun, onOpenReport }: TrustExplainerProps) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  const score = recentRun?.trust_score ?? 0
  const shown = useCountUp(score, { active: visible && recentRun != null, duration: 900, delay: 180 })

  const latestComplete = recentRun?.status === 'completed' ? recentRun : null

  return (
    <section ref={ref} className="relative px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className={`reveal ${visible ? 'is-visible' : ''}`}>
          <p className="eyebrow">✦ How the trust score works</p>
          <h2
            className="mt-3 font-display text-[1.65rem] font-semibold tracking-tight"
            style={{ color: 'var(--color-primary)' }}
          >
            Evidence-backed, never vibes.
          </h2>
        </div>

        <div className={`reveal mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr] ${visible ? 'is-visible' : ''}`}>
          {/* Score bands */}
          <div className="card p-5">
            <p className="eyebrow mb-4">Score bands</p>
            <div className="space-y-3">
              {SCORE_BANDS.map((band) => (
                <div key={band.label} className="flex items-center gap-4">
                  <span className="w-24 shrink-0 font-display text-[0.8125rem] font-semibold" style={{ color: band.color }}>
                    {band.label}
                  </span>
                  <div className="h-1.5 flex-1 rounded-full" style={{ background: 'var(--color-line)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${((band.max - band.min + 1) / 100) * 100}%`,
                        marginLeft: `${band.min}%`,
                        background: band.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className="w-[200px] shrink-0 hidden text-[0.6875rem] leading-snug text-secondary sm:block">
                    {band.note}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-secondary">
              Each dimension — consent, citations, originality, metadata and data quality — is scored independently,
              then weighted into the final 0–100 trust score together with the auditor's written rationale.
            </p>
          </div>

          {/* Latest audit preview — real run, opened directly */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Latest audit</p>
              {recentRun?.status === 'running' && <span className="chip" style={{ color: 'var(--color-info)' }}>running</span>}
              {recentRun?.status === 'failed' && <span className="chip" style={{ color: 'var(--color-error)' }}>failed</span>}
            </div>

            {!recentRun ? (
              <div className="mt-6 flex h-28 items-center justify-center rounded-lg border border-dashed text-center text-[0.8125rem] text-secondary" style={{ borderColor: 'var(--color-line)' }}>
                <div>
                  <p className="font-medium">No audits yet</p>
                  <p className="mt-1 font-mono text-[0.6875rem] text-muted">Run your first dataset above</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-stretch gap-5">
                <div className="relative grid h-24 w-24 shrink-0 place-items-center">
                  <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                    <circle cx="48" cy="48" r="42" fill="none" stroke="var(--color-line)" strokeWidth="7" />
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      fill="none"
                      stroke={bandFor(score).color}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${(2 * Math.PI * 42 * (score / 100)).toFixed(1)} ${2 * Math.PI * 42}`}
                      transform="rotate(-90 48 48)"
                      style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)' }}
                    />
                  </svg>
                  <span className="absolute font-display text-[1.5rem] font-bold tabular-nums" style={{ color: bandFor(score).color }}>
                    {shown}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[0.9375rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {recentRun.title || recentRun.url}
                  </p>
                  <p className="mt-1 truncate font-mono text-[0.6875rem] text-muted">{recentRun.url}</p>
                  <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: bandFor(score).color }}>
                    {bandFor(score).label}
                  </p>
                  {onOpenReport && latestComplete && (
                    <button
                      type="button"
                      onClick={() => onOpenReport(recentRun.run_id, recentRun.url)}
                      className="btn btn-ghost mt-3 px-3 py-1.5 !text-[0.75rem]"
                    >
                      Open report →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}