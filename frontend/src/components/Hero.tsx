import { useEffect, useState } from 'react'
import AuditForm from './AuditForm'
import ProvenanceViz from './ProvenanceViz'
import { DEMOS, DEFAULT_DEMO, type DemoDataset } from '../lib/demo'
import { usePrefersReducedMotion, useScrollProgress } from '../hooks'

export default function Hero({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const [url, setUrl] = useState(DEFAULT_DEMO.url)
  const [demo, setDemo] = useState<DemoDataset>(DEFAULT_DEMO)
  const [heads, setHeads] = useState(false)
  const reduced = usePrefersReducedMotion()

  /* Masked headline reveal on load. */
  useEffect(() => {
    const t = window.setTimeout(() => setHeads(true), reduced ? 0 : 60)
    return () => window.clearTimeout(t)
  }, [reduced])

  /* Scroll-linked: hero gently compresses/tilts as the next section arrives. */
  const { ref, progress } = useScrollProgress<HTMLElement>()
  const leaving = Math.min(1, Math.max(0, (progress - 0.82) / 0.18))

  const pickDemo = (d: DemoDataset) => {
    setUrl(d.url)
    setDemo(d)
  }

  return (
    <section ref={ref} id="top" className={`relative overflow-hidden px-6 pb-10 pt-24 sm:pt-28 ${heads ? 'fade-in' : ''}`}>
      {/* Motion-ramp from the hero into the agents section: stretches the scene. */}
      <div
        className="relative transition-transform duration-700"
        style={{
          transform: `scale(${1 - leaving * 0.055}) translateY(${leaving * 34}px)`,
          opacity: 1 - leaving * 0.9,
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow justify-center">
            <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
            Dataset Provenance Watchdog
            <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
          </p>

          <h1 className="mt-5 font-display text-[clamp(2.4rem,7vw,4.9rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
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
            <AuditForm onStart={onStart} url={url} onUrlChange={setUrl} cta="Audit Dataset →" id="audit" />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>
                Try
              </span>
              {DEMOS.map((d) => (
                <button
                  key={d.url}
                  type="button"
                  onClick={() => pickDemo(d)}
                  className="chip transition-colors"
                  style={demo.label === d.label ? { color: 'var(--color-accent)', borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' } : undefined}
                  aria-pressed={demo.label === d.label}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <ProvenanceViz dataset={demo} />
        </div>
      </div>

      <div className="rule-fade relative mx-auto mt-10 max-w-4xl" />
    </section>
  )
}