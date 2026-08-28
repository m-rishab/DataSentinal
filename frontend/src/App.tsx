import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Header from './components/Header'
import Hero from './components/Hero'
import LiveStepper from './components/LiveStepper'
import PipelineStrip from './components/PipelineStrip'
import ReportView from './components/ReportView'
import RunHistory from './components/RunHistory'
import Footer from './components/Footer'
import { fetchRuns } from './lib/api'

type Phase = 'landing' | 'running' | 'graph' | 'report'

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [runId, setRunId] = useState<string | null>(null)
  const [datasetUrl, setDatasetUrl] = useState('')
  const [scrollPct, setScrollPct] = useState(0)

  /* Fixed gradient progress bar on the landing page (Kombai-inspired). */
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      setScrollPct(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    if (phase !== 'landing') return
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [phase])

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => fetchRuns(12),
    enabled: phase === 'landing',
    refetchInterval: 15000,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('preview') === 'audit') {
      setDatasetUrl('https://www.kaggle.com/datasets/uciml/iris')
      setRunId('preview')
      setPhase('running')
      return
    }
    /* Shared report links: /?run=<run_id> opens the report directly. */
    const sharedRun = params.get('run')
    if (sharedRun) {
      setRunId(sharedRun)
      setPhase('report')
    }
  }, [])

  const startRun = (url: string, id: string) => {
    setDatasetUrl(url)
    setRunId(id)
    setPhase('running')
  }

  const goHome = () => {
    setPhase('landing')
    setRunId(null)
    void runsQuery.refetch()
  }

  const openRun = (id: string, url: string) => {
    setDatasetUrl(url)
    setRunId(id)
    setPhase('report')
  }

  const lockViewport = phase === 'landing' || phase === 'running' || phase === 'graph'

  return (
    <div
      className={`flex flex-col bg-[#070b14] ${
        lockViewport ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      <Header compact={phase !== 'landing'} onHome={goHome} />

      {phase === 'landing' && (
        <div
          className="scroll-progress"
          style={{ transform: `scaleX(${scrollPct})` }}
          aria-hidden="true"
        />
      )}

      <main className={`flex-1 ${phase === 'running' || phase === 'graph' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {phase === 'landing' && (
          <>
            <Hero onStart={startRun} />
            <PipelineStrip />
            <RunHistory
              runs={runsQuery.data ?? []}
              isLoading={runsQuery.isLoading}
              onOpen={openRun}
            />
          </>
        )}

        {(phase === 'running' || phase === 'graph') && runId && (
          <LiveStepper
            runId={runId}
            onDone={() => setPhase('report')}
            onReset={goHome}
            autoReturn={phase === 'running'}
            onBack={phase === 'graph' ? () => setPhase('report') : undefined}
          />
        )}

        {phase === 'report' && runId && (
          <div className="pt-20 pb-16">
            <div className="mx-auto max-w-4xl px-6">
              <ReportView
                runId={runId}
                datasetUrl={datasetUrl}
                onReset={goHome}
                onViewGraph={() => setPhase('graph')}
              />
            </div>
          </div>
        )}
      </main>

      {phase === 'landing' && <Footer compact />}
    </div>
  )
}
