/* API & CI section — live terminal on the left, an interactive pipeline gate
   on the right where you can move the threshold and watch PASS/BLOCK flip. */

import { useEffect, useState } from 'react'
import { useCountUp, useReveal } from '../hooks'

function useTyper(text: string, active: boolean, speed = 34) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const iv = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(iv)
          return v
        }
        return v + 1
      })
    }, speed)
    return () => window.clearInterval(iv)
  }, [text, active, speed])
  return text.slice(0, n)
}

export default function CIGate() {
  const { ref, visible } = useReveal<HTMLDivElement>(0.25)
  const [threshold, setThreshold] = useState(70)
  const passes = 80 >= threshold

  const typed = useTyper(
    `curl -X POST ${''}https://dataasentinal.onrender.com/audit -H "Content-Type: application/json" -d '{ "url": "https://www.kaggle.com/datasets/uciml/iris", "fail_under": 70 }'`,
    visible,
  )

  const score = useCountUp(80, { active: visible, duration: 1100, delay: 200 })

  return (
    <section id="api" className="relative px-6 py-20" aria-label="API and CI gate">
      <div ref={ref} className={`mx-auto w-full max-w-6xl ${visible ? '' : 'opacity-0'}`} style={{ transition: 'opacity 0.6s var(--ease-out)' }}>
        <div className="mb-10 text-center">
          <p className="eyebrow justify-center">✦ drop it into CI</p>
          <h2 className={`mt-3 font-display text-[clamp(1.7rem,4vw,2.7rem)] font-semibold tracking-tight ${visible ? 'fade-in-up' : 'opacity-0'}`} style={{ color: 'var(--color-primary)' }}>
            A trust gate your pipeline can <em style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>enforce</em>.
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Terminal */}
          <div className="overflow-hidden rounded-xl border" style={{ background: '#070a10', borderColor: 'var(--color-line)' }}>
            <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}>
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#c4645f' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#c9a14a' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#4a9d7f' }} />
              </span>
              <span className="font-mono text-[0.65625rem] text-muted">/verdict · exit code &gt; gate</span>
            </div>
            <div className="min-h-[220px] p-4 font-mono text-[0.75rem] leading-[1.75]" style={{ color: 'var(--color-secondary)' }}>
              <p>
                <span style={{ color: 'var(--color-accent)' }}>$</span> {typed}
                {typed.length < 120 ? <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-pulse" style={{ background: 'var(--color-muted)' }} /> : null}
              </p>
              {typed.length >= 120 && (
                <div className="stagger is-visible mt-0">
                  <p className="fade-in-up" style={{ animationDelay: '100ms', color: 'var(--color-success)' }}>
                    → run_id 7231…a7f · status queued · fail_under=70
                  </p>
                  <p className="fade-in-up" style={{ animationDelay: '500ms' }}>
                    <span style={{ color: 'var(--color-accent)' }}>$</span> curl {''}https://dataasentinal.onrender.com/audit/7231…a7f/verdict
                  </p>
                  <p className="fade-in-up" style={{ animationDelay: '900ms' }}>
                    → score 80 · threshold 70 · verdict{' '}
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>PASS</span> · exit 0
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Interactive gate */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}> 
            <div className="flex items-center justify-center gap-2 pb-6 font-mono text-[0.65625rem] font-bold uppercase tracking-[0.16em] text-muted">
              <span>Dataset</span> <Arrow /> <span>Sentinel</span> <Arrow /> <span>Score</span> <Arrow /> <span>CI Gate</span>{' '}
              <span className="rounded border px-1.5 py-0.5" style={{ borderColor: passes ? 'color-mix(in srgb, var(--color-success) 40%, transparent)' : 'color-mix(in srgb, var(--color-error) 40%, transparent)', color: passes ? 'var(--color-success)' : 'var(--color-error)' }}>
                {passes ? 'PASS' : 'BLOCKED'}
              </span>
            </div>

            <div className="relative space-y-6">
              <div>
                <div className="mb-1.5 flex justify-between font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
                  <span>Trust score</span>
                  <span style={{ color: 'var(--color-primary)' }}>{score}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${score}%`, background: 'var(--color-accent)', transition: 'width 0.2s linear' }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex justify-between font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
                  <span>Minimum score</span>
                  <span style={{ color: 'var(--color-primary)' }}>{threshold}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  aria-label="Minimum score threshold"
                  className="w-full accent-[#35c2b3]"
                  style={{ color: 'var(--color-accent)' }}
                />
              </div>

              <div
                className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-500"
                style={{
                  borderColor: passes ? 'color-mix(in srgb, var(--color-success) 40%, transparent)' : 'color-mix(in srgb, var(--color-error) 40%, transparent)',
                  background: passes ? 'color-mix(in srgb, var(--color-success) 9%, transparent)' : 'color-mix(in srgb, var(--color-error) 9%, transparent)',
                }}
              >
                <span className="text-[1rem]" style={{ color: passes ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {passes ? '✓' : '✕'}
                </span>
                <p className="text-[0.8125rem] font-bold" style={{ color: passes ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {passes ? 'Pipeline passes — build proceeds' : 'Pipeline blocked — minimum score not met'}
                </p>
                <p className="ml-auto font-mono text-[0.625rem] text-muted">
                  {80} vs {threshold}
                </p>
              </div>

              <p className="font-mono text-[0.59375rem] uppercase tracking-[0.18em] text-muted">
                move the slider — the gate flips live
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Arrow() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
      <path d="M1 5h11M9 1l3 4-3 4" stroke="var(--color-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}