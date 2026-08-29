import { useReveal } from '../hooks'

const steps = [
  { n: '01', title: 'Paste a dataset URL', desc: 'Any Kaggle or Hugging Face dataset page.' },
  { n: '02', title: 'Seven agents investigate', desc: 'License, citations, originality, quality & more run in parallel.' },
  { n: '03', title: 'Get an evidence-backed score', desc: 'A 0–100 trust score with flags, citations and a rationale.' },
]

export default function HowItWorks() {
  const { ref, visible } = useReveal<HTMLDivElement>(0.25)
  return (
    <section id="how-it-works" className="px-6 py-16">
      <div className="rule-fade mx-auto mb-10 max-w-6xl" />
      <div ref={ref} className={`mx-auto max-w-5xl ${visible ? '' : 'opacity-0'}`} style={{ transition: 'opacity 0.7s var(--ease-out)' }}>
        <div className="mb-8 text-center">
          <p className="eyebrow justify-center">✦ how it works</p>
          <h2 className={`mt-3 font-display text-[clamp(1.6rem,3.8vw,2.4rem)] font-semibold tracking-tight ${visible ? 'fade-in-up' : ''}`} style={{ color: 'var(--color-primary)' }}>
            From URL to verdict in three steps.
          </h2>
        </div>
        <div className={`grid gap-4 sm:grid-cols-3 ${visible ? 'stagger is-visible' : 'stagger'}`}>
          {steps.map((s) => (
            <div key={s.n} className="card p-5">
              <p className="font-display text-lg font-semibold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                {s.n}
              </p>
              <h3 className="mt-2 text-[0.9375rem] font-bold tracking-tight" style={{ color: 'var(--color-primary)' }}>
                {s.title}
              </h3>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
