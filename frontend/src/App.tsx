import { useEffect, useState } from 'react'
import Header from './components/Header'
import Landing from './components/Landing'
import LiveStepper from './components/LiveStepper'
import ReportView from './components/ReportView'
import Footer from './components/Footer'

type Phase = 'landing' | 'running' | 'graph' | 'report'

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [runId, setRunId] = useState<string | null>(null)
  const [datasetUrl, setDatasetUrl] = useState('')
  const [scrollPct, setScrollPct] = useState(0)

  /* Fixed 2px progress hairline on the landing page. */
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
  }

  const lockViewport = phase === 'running' || phase === 'graph'

  return (
    <div
      className={`flex flex-col ${lockViewport ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      style={{ background: 'var(--color-page)' }}
    >
      <Header
        compact={phase !== 'landing'}
        phase={phase}
        onHome={goHome}
        onViewGraph={phase === 'report' && runId ? () => setPhase('graph') : undefined}
        onReport={runId ? () => setPhase('report') : undefined}
      />

      {phase === 'landing' && (
        <div className="scroll-progress" style={{ transform: `scaleX(${scrollPct})` }} aria-hidden="true" />
      )}

      <main className={`flex-1 ${phase === 'running' || phase === 'graph' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {phase === 'landing' && (
          <Landing
            onStart={startRun}
          />
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
          <div className="pt-6 pb-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
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

      {phase === 'landing' && <Footer />}
    </div>
  )
}
