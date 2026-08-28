/* Pinned "Evidence → Score" scene. Scroll reveals evidence signals one by
   one; each completed signal feeds the score which transforms 42 → 80.
   A fixed visual explanation of the scoring concept — not a calculation. */

import { useEffect, useRef, useState } from 'react'
import { useReveal, useScrollProgress } from '../hooks'

const ITEMS: { label: string; status: 'ok' | 'warn'; note: string }[] = [
  { label: 'LICENSE', status: 'ok', note: '✓ detected' },
  { label: 'CONSENT', status: 'warn', note: '⚠ ambiguous' },
  { label: 'CITATIONS', status: 'ok', note: '✓ 5 verified' },
  { label: 'ORIGINALITY', status: 'ok', note: '✓ no significant matches' },
  { label: 'DATA QUALITY', status: 'ok', note: '✓ profile complete' },
]

const TARGETS = [42, 57, 68, 74, 80]
const THRESHOLDS = [0.16, 0.3, 0.44, 0.58, 0.72]

function ScoreTween({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  const prev = useRef(0)
  const raf = useRef(0)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    const start = performance.now()
    const dur = 900
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value])
  return <>{shown}</>
}

export default function EvidenceScore() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>()
  const { ref: headRef, visible } = useReveal<HTMLDivElement>(0.4)

  const reached = THRESHOLDS.map((t) => progress >= t)
  const currentScore = TARGETS[Math.min(reached.filter(Boolean).length, TARGETS.length - 1)]
  const scoreColor = currentScore < 40 ? 'var(--color-error)' : currentScore <= 70 ? 'var(--color-warning)' : 'var(--color-success)'

  return (
    <section id="evidence-score" className="relative" aria-label="How evidence becomes a trust score">
      <div ref={ref} className="relative" style={{ height: '220vh' }}>
        <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6 py-12">
          <div className="mx-auto w-full max-w-6xl">
            <div ref={headRef} className={`mb-8 sm:mb-10 ${visible ? 'fade-in-up' : 'opacity-0'}`}>
              <p className="eyebrow">✦ evidence → score</p>
              <h2 className={`mt-3 font-display text-[clamp(2rem,4.6vw,3.2rem)] font-semibold tracking-tight ${visible ? 'fade-in-up' : 'opacity-0'}`} style={{ color: 'var(--color-primary)' }}>
                Every number is accountable to something.
              </h2>
            </div>

            <div className="grid items-center gap-12 md:grid-cols-[1.05fr_1fr] md:gap-8">
              {/* Evidence column */}
              <div>
                <p className="mb-4 font-mono text-[0.75rem] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-muted)' }}>
                  Evidence signals
                </p>
                <div className="space-y-2">
                  {ITEMS.map((item, i) => {
                    const on = reached[i]
                    return (
                      <div key={item.label}>
                        <div
                          className="flex items-center justify-between rounded-lg border px-4 py-3.5 transition-all duration-500"
                          style={{
                            borderColor: on ? (item.status === 'warn' ? 'color-mix(in srgb, var(--color-warning) 45%, transparent)' : 'color-mix(in srgb, var(--color-success) 40%, transparent)') : 'var(--color-line)',
                            background: on ? 'var(--color-surface)' : 'transparent',
                            opacity: on ? 1 : 0.35,
                            transform: on ? 'translateX(0)' : 'translateX(-8px)',
                          }}
                        >
                          <span className="font-mono text-[0.75rem] font-bold tracking-[0.16em]" style={{ color: 'var(--color-primary)' }}>
                            {item.label}
                          </span>
                          <span className="font-mono text-[0.8125rem]" style={{ color: item.status === 'warn' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                            {on ? item.note : '…'}
                          </span>
                        </div>
                        {/* feed line into score */}
                        <div className="relative ml-5 h-3 w-px overflow-hidden" style={{ background: 'var(--color-line)' }} aria-hidden="true">
                          <div
                            className="absolute inset-0"
                            style={{
                              background: 'var(--color-accent)',
                              transform: `scaleY(${on ? 1 : 0})`,
                              transformOrigin: 'top',
                              transition: 'transform 0.5s var(--ease-out)',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Score column */}
              <div className="relative flex flex-col items-center justify-center">
                <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 50%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 70%)' }} aria-hidden="true" />
                <div
                  className="relative grid h-52 w-52 place-items-center rounded-full border"
                  style={{
                    borderColor: `color-mix(in srgb, ${currentScore >= 70 ? '#4a9d7f' : currentScore >= 40 ? '#c9a14a' : '#c4645f'} 40%, transparent)`,
                  }}
                >
                  <div className="text-center">
                    <div className="font-display text-[4rem] font-bold leading-none tabular-nums" style={{ color: 'var(--color-primary)' }}>
                      <ScoreTween value={currentScore} />
                    </div>
                    <div className="mt-1.5 font-mono text-[0.75rem] font-bold uppercase tracking-[0.2em]" style={{ color: scoreColor }}>
                      {currentScore < 40 ? 'HIGH RISK' : currentScore <= 70 ? 'CAUTION' : 'TRUSTWORTHY'}
                    </div>
                  </div>
                </div>
                <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
                  80 · final verdict
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}