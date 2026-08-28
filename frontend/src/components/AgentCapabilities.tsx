import { useReveal } from '../hooks'
import { PIPELINE } from '../lib/steps'

export default function AgentCapabilities() {
  const { ref, visible } = useReveal<HTMLDivElement>()
  return (
    <section ref={ref} className="relative px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className={`reveal ${visible ? 'is-visible' : ''}`}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow">✦ Seven agents investigate your dataset</p>
              <h2
                className="mt-3 font-display text-[1.65rem] font-semibold tracking-tight"
                style={{ color: 'var(--color-primary)' }}
              >
                Each agent looks for one kind of risk.
              </h2>
            </div>
            <span className="hidden font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted md:block">
              parallel · LangGraph
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={step.node}
                className={`reveal card group p-4 ${visible ? 'is-visible' : ''}`}
                style={{ transitionDelay: `${Math.min(i * 40, 200)}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
                    style={{
                      background: 'color-mix(in srgb, var(--color-info) 10%, transparent)',
                      borderColor: 'var(--color-line)',
                      color: 'var(--color-info)',
                    }}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-muted">
                      {step.kicker}
                    </p>
                    <h3 className="truncate font-display text-[0.9375rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {step.label}
                    </h3>
                  </div>
                </div>
                <p className="mt-3 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                  {step.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {step.bullets.map((b) => (
                    <span key={b} className="chip !text-[0.65625rem] !px-2 !py-[2px]">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          {/* The composition card that pulls the grid together */}
          <div
            className={`reveal rounded-xl border p-4 ${visible ? 'is-visible' : ''}`}
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-panel))',
              borderColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
              transitionDelay: '280ms',
            }}
          >
            <p className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-accent)' }}>
              One verdict
            </p>
            <h3 className="mt-2 font-display text-[0.9375rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
              A 0–100 trust score with written rationale
            </h3>
            <p className="mt-2 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
              The aggregator weighs every agent's evidence and the report ties each score back to the citations, flags
              and logs behind it.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}