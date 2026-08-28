/* Editorial numbered pipeline strip for the landing page.
   Rows mirror the live graph's seven nodes; clicking one scrolls
   up to the audit form. */

import { useReveal } from '../hooks'
import { PIPELINE } from '../lib/steps'

function scrollToAudit() {
  document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export default function PipelineStrip() {
  const { ref, visible } = useReveal<HTMLDivElement>()
  return (
    <section ref={ref} className="relative px-6 py-16">
      <div className={`reveal mx-auto w-full max-w-5xl ${visible ? 'is-visible' : ''}`}>
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">✦ Seven agents investigate your dataset</p>
            <h2
              className="mt-3 font-display text-[1.65rem] font-semibold tracking-tight"
              style={{ color: 'var(--color-primary)' }}
            >
              How an audit runs
            </h2>
          </div>
          <span className="hidden pb-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted md:block">
            07 nodes · pipelined
          </span>
        </div>

        <div
          className="card overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lift)' }}
        >
          {PIPELINE.map((step, i) => (
            <button
              key={step.node}
              type="button"
              onClick={scrollToAudit}
              className="pipeline-row flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] sm:gap-8"
              style={i > 0 ? { borderTop: '1px solid var(--color-line)' } : undefined}
            >
              <span className="w-7 shrink-0 font-mono text-[0.8125rem] font-bold tabular-nums" style={{ color: 'var(--color-info)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block text-[0.9375rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {step.label}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug" style={{ color: 'var(--color-secondary)' }}>
                  {step.description}
                </span>
              </span>
              <span className="pipeline-arrow grid h-8 w-8 shrink-0 place-items-center rounded-full border" style={{ borderColor: 'var(--color-line)' }}>
                <svg
                  className="pipeline-arrow-svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: 'var(--color-muted)' }}
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-center font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
          Paste a URL above and watch all seven run live
        </p>
      </div>
    </section>
  )
}