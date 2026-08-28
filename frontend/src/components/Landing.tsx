import Hero from '../components/Hero'
import PipelineStrip from '../components/PipelineStrip'
import AgentCapabilities from '../components/AgentCapabilities'
import TrustExplainer from '../components/TrustExplainer'
import ApiGate from '../components/ApiGate'
import RunHistory from '../components/RunHistory'
import AuditForm from '../components/AuditForm'
import type { RunSummary } from '../lib/types'

interface LandingProps {
  onStart: (url: string, runId: string) => void
  runs: RunSummary[]
  runsLoading: boolean
  onOpenReport: (runId: string, url: string) => void
}

export default function Landing({ onStart, runs, runsLoading, onOpenReport }: LandingProps) {
  const latestComplete = runs.find((r) => r.status === 'completed') ?? runs[0] ?? null

  return (
    <>
      <Hero onStart={onStart} />

      {/* Interactive demonstration — the hero already carries a live miniature */}
      <PipelineStrip />

      <AgentCapabilities />

      <TrustExplainer recentRun={latestComplete} onOpenReport={onOpenReport} />

      <ApiGate />

      <RunHistory runs={runs} isLoading={runsLoading} onOpen={onOpenReport} />

      {/* Final CTA */}
      <section className="relative px-6 pb-20" aria-label="Start an audit">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow justify-center">✦ Start an audit</p>
          <h2
            className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-tight"
            style={{ color: 'var(--color-primary)' }}
          >
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
    </>
  )
}