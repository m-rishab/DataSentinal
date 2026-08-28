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

function scoreTone(score: number | null): { cls: string; text: string } {
  if (score == null) return { cls: 'bg-slate-400/10 text-slate-400', text: '—' }
  if (score < 40) return { cls: 'bg-rose-400/15 text-rose-300', text: String(score) }
  if (score <= 70) return { cls: 'bg-amber-400/15 text-amber-300', text: String(score) }
  return { cls: 'bg-emerald-400/15 text-emerald-300', text: String(score) }
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
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Recent Audits
        </h2>
        <span className="font-mono text-[11px] text-slate-500">{runs.length} stored</span>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-xs font-medium text-slate-500">
          No audits yet — run one above and it will appear here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0c1320]/80 backdrop-blur shadow-[0_4px_18px_rgba(2,6,16,0.5)]">
          {runs.map((run, i) => {
            const tone = scoreTone(run.trust_score)
            return (
              <button
                key={run.run_id}
                type="button"
                onClick={() => onOpen(run.run_id, run.url)}
                className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                  i > 0 ? 'border-t border-white/5' : ''
                }`}
              >
                <span className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black ${tone.cls}`}>
                  {tone.text}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-slate-100">
                    {run.title || run.url}
                  </span>
                  <span className="block truncate font-mono text-[10.5px] text-slate-500">
                    {run.url}
                  </span>
                </span>
                {run.gate?.passed != null && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      run.gate.passed
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                    }`}
                  >
                    gate {run.gate.passed ? 'pass' : 'fail'}
                  </span>
                )}
                <span className="w-16 shrink-0 text-right font-mono text-[10.5px] text-slate-500">
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
