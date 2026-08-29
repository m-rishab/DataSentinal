/* The landing page: a continuous visual story.
   HERO → scroll-driven INVESTIGATION animation → short HOW IT WORKS →
   small REPORT PREVIEW → final CTA → footer.
   Kept minimal on purpose — the investigation scene carries the story. */

import Hero from '../components/Hero'
import InvestigationScene from '../components/InvestigationScene'
import HowItWorks from '../components/HowItWorks'
import ReportPreview from '../components/ReportPreview'
import AuditForm from '../components/AuditForm'

interface LandingProps {
  onStart: (url: string, runId: string) => void
}

export default function Landing({ onStart }: LandingProps) {
  return (
    <div className="relative">
      <div className="relative z-10">
        <Hero onStart={onStart} />
        <InvestigationScene />
        <HowItWorks />
        <ReportPreview onStart={onStart} />

        {/* Final CTA */}
        <section className="relative px-6 pb-24" aria-label="Start an audit">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow justify-center">✦ start an audit</p>
            <h2 className="mt-4 font-display text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold leading-tight tracking-tight" style={{ color: 'var(--color-primary)' }}>
              Paste a URL. Get the truth — in about 30 seconds.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
              One dataset, seven agents, one evidence-backed verdict. No signup, no lock-in.
            </p>
            <div className="mx-auto mt-7 max-w-xl">
              <AuditForm onStart={onStart} cta="Audit Dataset" />
            </div>
            <p className="mt-4 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted">
              Powered by LangGraph · NVIDIA · OpenAlex
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
