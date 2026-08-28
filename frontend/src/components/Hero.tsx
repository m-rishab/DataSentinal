import { useState } from 'react'
import AuditForm, { EXAMPLE } from './AuditForm'
import HeroDemo from './HeroDemo'

const EXAMPLES = [
  { label: 'Iris', url: 'https://www.kaggle.com/datasets/uciml/iris' },
  { label: 'Titanic', url: 'https://www.kaggle.com/datasets/yasserh/titanic-dataset' },
  { label: 'IMDb', url: 'https://huggingface.co/datasets/imdb' },
]

export default function Hero({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const [url, setUrl] = useState(EXAMPLE)

  return (
    <section id="top" className="relative overflow-hidden px-6 pb-14 pt-28">
      {/* Restrained backdrop: extremely low-opacity radial washes, no grid, no particles */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 42% at 50% -8%, rgba(107,150,196,0.10), transparent 62%), radial-gradient(ellipse 40% 32% at 82% 18%, rgba(53,194,179,0.06), transparent 60%), radial-gradient(ellipse 44% 34% at 14% 20%, rgba(107,150,196,0.05), transparent 60%)',
        }}
        aria-hidden="true"
      />
      {/* Horizontal hairline seat at the bottom of the hero */}
      <div className="rule-fade relative mx-auto mt-14 max-w-4xl" />

      <div className="relative mx-auto w-full max-w-3xl fade-in-up">
        <p className="eyebrow justify-center">
          <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
          Dataset Provenance Watchdog
          <span className="h-px w-6" style={{ background: 'var(--color-info)' }} aria-hidden="true" />
        </p>

        <h1
          className="mt-5 text-center font-display text-[clamp(2.1rem,5.4vw,3.6rem)] font-semibold leading-[1.06] tracking-tight"
          style={{ color: 'var(--color-primary)' }}
        >
          Before you build on a dataset,
          <br className="hidden sm:block" /> know what you're{' '}
          <em
            className="font-editorial font-semibold italic not-italic"
            style={{
              color: 'var(--color-accent)',
              fontStyle: 'italic',
            }}
          >
            trusting.
          </em>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-center text-[0.9375rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
          Audit Kaggle and Hugging Face datasets for licensing, consent, citations, duplication and data quality — then
          get an evidence-backed trust score.
        </p>

        <div className="mx-auto mt-8 max-w-xl">
          <AuditForm onStart={onStart} url={url} onUrlChange={setUrl} cta="Audit Dataset" id="audit" />

          {/* Secondary example actions */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>
              Try
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.url}
                type="button"
                onClick={() => setUrl(ex.url)}
                className="chip transition-colors"
                style={{ color: url === ex.url ? 'var(--color-accent)' : undefined, borderColor: url === ex.url ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)' : undefined }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live miniature of the actual product, not a decoration */}
        <div className="mx-auto mt-9 max-w-2xl">
          <HeroDemo />
        </div>
      </div>
    </section>
  )
}