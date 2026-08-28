/* The landing page is one continuous story:
   DATASET → INVESTIGATION → EVIDENCE → RISK → TRUST SCORE → REPORT → CI DECISION.
   Sections share a single visual language and hand the user from one to the next. */

import Hero from '../components/Hero'
import AgentSequence from '../components/AgentSequence'
import EvidenceScore from '../components/EvidenceScore'
import ReportPreview from '../components/ReportPreview'
import CIGate from '../components/CIGate'
import RunHistory from '../components/RunHistory'
import AuditForm from '../components/AuditForm'
import BgNetwork from '../components/BgNetwork'
import type { RunSummary } from '../lib/types'

interface LandingProps {
  onStart: (url: string, runId: string) => void
  runs: RunSummary[]
  runsLoading: boolean
  onOpenReport: (runId: string, url: string) => void
}

export default function Landing({ onStart, runs, runsLoading, onOpenReport }: LandingProps) {
  return (
    <div className="relative">
      <BgNetwork />

      <div className="relative z-10">
        {/* DATASET → INVESTIGATION */}
        <Hero onStart={onStart} />

        {/* SEVEN AGENTS */}
        <AgentSequence />

        {/* EVIDENCE → RISK → SCORE */}
        <EvidenceScore />

        {/* REPORT */}
        <ReportPreview onStart={onStart} />

        {/* CI DECISION */}
        <CIGate />

        <RunHistory runs={runs} isLoading={runsLoading} onOpen={onOpenReport} />

        {/* Final CTA */}
        <section className="relative px-6 pb-24" aria-label="Start an audit">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow justify-center">✦ Start an audit</p>
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