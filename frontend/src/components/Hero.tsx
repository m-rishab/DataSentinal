import { useEffect, useState } from 'react'
import AuditForm from './AuditForm'
import { DEMOS, DEFAULT_DEMO, type DemoDataset } from '../lib/demo'
import { usePrefersReducedMotion } from '../hooks'

export default function Hero({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const [url, setUrl] = useState(DEFAULT_DEMO.url)
  const [demo, setDemo] = useState<DemoDataset>(DEFAULT_DEMO)
  const [heads, setHeads] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const t = window.setTimeout(() => setHeads(true), reduced ? 0 : 60)
    return () => window.clearTimeout(t)
  }, [reduced])

  const pickDemo = (d: DemoDataset) => {
    setUrl(d.url)
    setDemo(d)
  }

  return (
    <section id="top" className={`relative px-6 pb-6 pt-20 sm:pt-24 ${heads ? '' : ''}`}>
      <div className="mx-auto max-w-3xl text-center">
        <p className="eyebrow justify-center">
          <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
          Dataset Provenance Watchdog
          <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
        </p>

        <h1 className="mt-5 font-display text-[clamp(2.2rem,6.4vw,4.2rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
          <span className={`mask-line ${heads ? 'is-visible' : ''}`}>
            <span style={{ transitionDelay: heads ? '60ms' : '0ms' }}>Before you build on a dataset,</span>
          </span>
          <span className={`mask-line ${heads ? 'is-visible' : ''}`}>
            <span style={{ transitionDelay: heads ? '160ms' : '0ms' }}>
              know what you're <em className="not-italic" style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>trusting</em>.
            </span>
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[0.9375rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          Audit Kaggle and Hugging Face datasets for licensing, consent, citations, duplication and data quality — then
          get an evidence-backed trust score.
        </p>

        <div className="mx-auto mt-7 max-w-lg">
          <AuditForm onStart={onStart} url={url} onUrlChange={setUrl} cta="Audit Dataset" id="audit" />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>
              Try
            </span>
            {DEMOS.map((d) => (
              <button
                key={d.url}
                type="button"
                onClick={() => pickDemo(d)}
                className="chip transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                style={demo.label === d.label ? { color: 'var(--color-accent)', borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' } : undefined}
                aria-pressed={demo.label === d.label}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 pb-2 text-center font-mono text-[0.59375rem] uppercase tracking-[0.2em] text-muted">
          scroll to watch an investigation unfold
          <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle pulse-soft" style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
        </p>
      </div>
    </section>
  )
}
