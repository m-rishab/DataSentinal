/* Live miniature audit visualization for the hero.
   Not a data source — a product demonstration. It cycles a small pipeline
   through ingest → branch agents → aggregator → a trust score, mirroring the
   real audit graph. Labelled DEMO so it can never be mistaken for results. */

import { useEffect, useState } from 'react'

const BRANCHES: { id: string; label: string }[] = [
  { id: 'consent', label: 'Consent' },
  { id: 'citation', label: 'Citation' },
  { id: 'duplication', label: 'Dupe check' },
  { id: 'related', label: 'Related' },
]

const PHASE_COUNT = 8 // 0 idle · 1 ingest · 2-5 branches · 6 aggregator · 7 scored
const FINAL = 96

function tone(active: boolean, done: boolean, core = false) {
  if (active) return core ? 'var(--color-accent)' : 'var(--color-info)'
  if (done) return 'var(--color-success)'
  return 'var(--color-muted)'
}

function MiniNode({ label, active, done, core = false }: { label: string; active: boolean; done: boolean; core?: boolean }) {
  const c = tone(active, done, core)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.625rem] font-semibold leading-none transition-all duration-300"
      style={{
        color: c,
        borderColor: `color-mix(in srgb, ${c} ${active || done ? 55 : 25}%, transparent)`,
        background: `color-mix(in srgb, ${c} ${active || done ? 12 : 4}%, transparent)`,
        transform: active ? 'translateY(-1px)' : 'none',
      }}
    >
      <span className={`h-1 w-1 rounded-full ${active ? 'pulse-soft' : ''}`} style={{ background: c }} />
      {label}
    </span>
  )
}

function Arrow() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0" aria-hidden="true">
      <path d="M0 5h12M9 1l4 4-4 4" stroke="var(--color-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function HeroDemo() {
  const [phase, setPhase] = useState(0)
  const [score, setScore] = useState(0)

  useEffect(() => {
    const iv = window.setInterval(() => {
      setPhase((p) => (p + 1) % PHASE_COUNT)
    }, 1000)
    return () => window.clearInterval(iv)
  }, [])

  /* Score count-up as the sweep lands; holds during the scored phase. */
  useEffect(() => {
    const target = phase === 0 ? 0 : phase >= 7 ? FINAL : Math.round((phase / (PHASE_COUNT - 1)) * 100)
    const from = score
    const dur = phase === 0 ? 200 : 750
    const start = performance.now()
    let raf = 0
    const run = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      setScore(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(run)
    }
    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const scored = phase === 7
  const doneThru = (min: number) => phase > min || phase === 7

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-xl border p-4"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', boxShadow: 'var(--shadow-lift)' }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--color-muted)' }}>
          Pipeline preview
        </p>
        <span
          className="rounded border px-1.5 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--color-muted)', borderColor: 'var(--color-line)' }}
        >
          demo
        </span>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <MiniNode label="Dataset" active={false} done />
          <Arrow />
          <MiniNode label="Ingest" active={phase === 1} done={doneThru(1)} />
          <Arrow />
          <div className="flex flex-wrap items-center gap-1">
            {BRANCHES.map((b, i) => (
              <MiniNode key={b.id} label={b.label} active={phase === 2 + i} done={doneThru(2 + i)} />
            ))}
          </div>
          <Arrow />
          <MiniNode label="Aggregator" core active={phase === 6} done={doneThru(6)} />
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-1">
          <span
            className="grid h-14 w-14 place-items-center rounded-full border-2 transition-colors duration-500"
            style={{ borderColor: scored ? 'color-mix(in srgb, var(--color-accent) 60%, var(--color-line))' : 'var(--color-line-strong)' }}
            aria-hidden="true"
          >
            <span
              className="font-display text-[1.15rem] font-bold tabular-nums transition-colors duration-500"
              style={{ color: scored ? 'var(--color-accent)' : 'var(--color-secondary)' }}
            >
              {score}
            </span>
          </span>
          <div className="font-mono text-[0.5625rem] uppercase leading-tight tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>
            {scored ? 'trust score' : 'computing…'}
          </div>
        </div>
      </div>
    </div>
  )
}