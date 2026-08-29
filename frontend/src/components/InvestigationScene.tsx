/* InvestigationScene — the landing page centerpiece.
   A pinned, scroll-driven vertical investigation: Dataset → Ingest →
   License → Citations → Originality → Data Quality → Evidence → Trust Score.
   Each stage activates in sequence as the user scrolls, drawing curved SVG
   evidence paths, sweeping a subtle vertical scan beam, carrying small
   evidence particles, and finally resolving a score ring to 80/100.
   This is marketing choreography with fixed story values (80) — it never
   touches the audit API. */

import { Fragment } from 'react'
import { useEffect, useState } from 'react'
import { usePrefersReducedMotion, useScrollProgress } from '../hooks'

/* Stage rail (left) — the written story of the same animation. */
const STORY: { n: string; title: string; note: string }[] = [
  { n: '01', title: 'Dataset', note: 'The source page under investigation' },
  { n: '02', title: 'Ingest', note: 'Extract license, tags, files, columns' },
  { n: '03', title: 'License', note: 'Read reuse terms + consent language' },
  { n: '04', title: 'Citations', note: 'Resolve DOIs against retraction records' },
  { n: '05', title: 'Originality', note: 'Scan for copy-paste / re-upload markers' },
  { n: '06', title: 'Data Quality', note: 'Profile real rows — dupes, gaps, balance' },
  { n: '07', title: 'Evidence', note: 'Every signal below is accountable' },
  { n: '08', title: 'Trust Score', note: 'One 0–100 verdict with rationale' },
]

/* Node positions + tone for the SVG scene (viewBox 1000 x 700). */
interface NodeSpec {
  id: string
  label: string
  x: number
  y: number
  tone: 'teal' | 'green' | 'amber'
  accent?: boolean
}
const NODES: NodeSpec[] = [
  { id: 'dataset', label: 'Dataset', x: 500, y: 68, tone: 'teal' },
  { id: 'ingest', label: 'Ingest', x: 500, y: 172, tone: 'teal' },
  { id: 'license', label: 'License', x: 240, y: 330, tone: 'amber' },
  { id: 'citations', label: 'Citations', x: 420, y: 332, tone: 'green' },
  { id: 'originality', label: 'Originality', x: 580, y: 332, tone: 'green' },
  { id: 'quality', label: 'Data Quality', x: 760, y: 330, tone: 'green' },
  { id: 'evidence', label: 'Evidence', x: 500, y: 468, tone: 'teal' },
  { id: 'trust', label: 'Trust Score', x: 500, y: 612, tone: 'teal', accent: true },
]

/* Curved edge (quadratic) between two nodes. */
function curve(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  return `M ${ax} ${ay} Q ${mx} ${my + (bx - ax) * 0.18} ${bx} ${by}`
}

/* Ordered connections matching the story. */
const FLOW: [number, number][] = [
  [0, 1], // Dataset → Ingest
  [1, 2], // Ingest → License
  [1, 3], // Ingest → Citations
  [1, 4], // Ingest → Originality
  [1, 5], // Ingest → Data Quality
  [2, 6], // License → Evidence
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 7], // Evidence → Trust
]

const TONE: Record<NodeSpec['tone'], { fill: string; stroke: string; text: string }> = {
  teal: { fill: 'color-mix(in srgb, var(--color-accent) 10%, white)', stroke: 'var(--color-accent)', text: 'var(--color-accent-strong)' },
  green: { fill: 'color-mix(in srgb, var(--color-success) 9%, white)', stroke: 'var(--color-success)', text: 'var(--color-success)' },
  amber: { fill: 'color-mix(in srgb, var(--color-warning) 9%, white)', stroke: 'var(--color-warning)', text: 'var(--color-warning)' },
}

const TOTAL = 8

export default function InvestigationScene() {
  const reduced = usePrefersReducedMotion()
  const { ref, progress } = useScrollProgress<HTMLDivElement>()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), reduced ? 0 : 60)
    return () => window.clearTimeout(t)
  }, [reduced])

  /* Active stage 0..7 driven by scroll through the pinned track. */
  const active = Math.min(TOTAL - 1, Math.max(0, Math.floor(progress * TOTAL)))

  /* Pin stage 0 so the scene is alive before scrolling. */
  const shown = mounted || active > 0

  const isOn = (i: number) => active >= i
  const isCur = (i: number) => active === i
  const beamOn = shown

  /* Final score: count 0 → 80 across the whole last stage so it resolves
     exactly at the end of the track (no dead pinned tail). */
  const finalAt = 7
  const finalProgress = Math.max(0, Math.min(1, (progress * TOTAL - finalAt) / (TOTAL - finalAt)))
  const score = Math.round(80 * (1 - Math.pow(1 - finalProgress, 3)))

  return (
    <section id="investigation" className="relative" aria-label="Scroll-driven investigation of a dataset">
      {/* tall pinned track makes the scroll story long without empty gaps */}
      <div ref={ref} className="relative" style={{ height: '260vh' }}>
        <div className="sticky top-0 flex h-screen flex-col bg-page">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
            <div className="mb-2 text-center">
              <p className="eyebrow justify-center">✦ the investigation</p>
            </div>

            <div className="flex w-full items-stretch gap-6 lg:gap-12">
              {/* Story rail (left, desktop) */}
              <div className="hidden w-56 shrink-0 flex-col justify-center md:flex">
                <div className="border-l" style={{ borderColor: 'var(--color-line)' }}>
                  {STORY.map((s, i) => (
                    <Fragment key={s.n}>
                      <div
                        className="relative -ml-px flex items-baseline gap-3 py-1.5 transition-all duration-500 pl-5"
                        style={{
                          borderLeft: '1px solid ' + (isOn(i) ? 'var(--color-accent)' : 'var(--color-line)'),
                          opacity: isOn(i) ? 1 : active === i - 1 ? 0.55 : 0.3,
                          transform: isCur(i) ? 'translateX(3px)' : 'translateX(0)',
                        }}
                      >
                        <span className="font-mono text-[0.65625rem] font-bold tabular-nums" style={{ color: isCur(i) ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                          {s.n}
                        </span>
                        <div className="min-w-0">
                          <p className="font-display text-[0.825rem] font-semibold leading-tight" style={{ color: isOn(i) ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                            {s.title}
                          </p>
                          <p
                            className="overflow-hidden text-[0.6875rem] leading-snug transition-all duration-500"
                            style={{ color: 'var(--color-muted)', maxHeight: isCur(i) ? 48 : 0, opacity: isCur(i) ? 1 : 0 }}
                          >
                            {s.note}
                          </p>
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* SVG scene */}
              <div className="relative min-w-0 flex-1">
                <svg
                  viewBox="0 0 1000 700"
                  className={`h-auto w-full max-w-[820px] transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
                  role="img"
                  aria-label="Dataset to trust score investigation flow"
                >
                  <defs>
                    <linearGradient id="isa-edge" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="color-mix(in srgb, var(--color-accent) 55%, transparent)" />
                      <stop offset="100%" stopColor="var(--color-accent)" />
                    </linearGradient>
                    <linearGradient id="isa-beam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
                      <stop offset="50%" stopColor="var(--color-accent)" stopOpacity="0.10" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                    </linearGradient>
                    <filter id="isa-blur" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" />
                    </filter>
                  </defs>

                  {/* subtle vertical scan beam drifting down the investigation */}
                  {!reduced && beamOn && (
                    <g className="scan-beam" style={{ animationDelay: '1.2s' }}>
                      <rect x="120" y="20" width="760" height="660" fill="url(#isa-beam)" filter="url(#isa-blur)" />
                    </g>
                  )}

                  {/* edges */}
                  {FLOW.map(([a, b], i) => {
                    const on = isOn(b)
                    const cur = isCur(b)
                    const d = curve(NODES[a].x, NODES[a].y, NODES[b].x, NODES[b].y)
                    if (!on) return null
                    return (
                      <G key={`e-${i}`}>
                        <path
                          d={d}
                          fill="none"
                          stroke={cur ? 'url(#isa-edge)' : 'rgba(31,42,57,0.16)'}
                          strokeWidth={cur ? 2.2 : 1.4}
                          className={`draw-line ${cur ? 'is-visible' : ''}`}
                          style={{ ['--dash' as string]: 300, ['--draw-dur' as string]: '0.9s' }}
                          opacity={on ? 1 : 0}
                        />
                        {/* particles flowing along just-activated path */}
                        {!reduced && cur && (
                          <>
                            <circle r="2.4" fill="var(--color-accent)">
                              <animateMotion dur="1.6s" repeatCount="indefinite" begin="0.2s" path={d} />
                            </circle>
                            <circle r="1.6" fill="var(--color-accent)">
                              <animateMotion dur="1.6s" repeatCount="indefinite" begin="0.5s" path={d} />
                            </circle>
                          </>
                        )}
                      </G>
                    )
                  })}

                  {/* nodes */}
                  {NODES.map((n, i) => {
                    const on = isOn(i)
                    const cur = isCur(i)
                    if (!on) return null
                    const t = TONE[n.tone]
                    return (
                      <G key={n.id} opacity={1} style={{ transition: 'opacity 0.5s var(--ease)' }}>
                        {cur && !n.accent && (
                          <circle cx={n.x} cy={n.y} r="34" fill="none" stroke={`color-mix(in srgb, ${t.stroke} 40%, transparent)`} strokeWidth="1">
                            <animate attributeName="r" values="30;42;30" dur="2.6s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.7;1;0.7" dur="2.6s" repeatCount="indefinite" />
                          </circle>
                        )}
                        <rect
                          x={n.x - 66}
                          y={n.y - 20}
                          width="132"
                          height="40"
                          rx="13"
                          fill="var(--color-surface)"
                          stroke={t.stroke}
                          strokeWidth={cur ? 1.8 : 1.2}
                          style={{ boxShadow: cur ? '0 8px 24px -12px rgba(14,154,139,0.5)' : 'none', transition: 'stroke-width 0.3s var(--ease)' }}
                        />
                        <circle cx={n.x - 44} cy={n.y} r="3" fill={t.stroke} />
                        <text
                          x={n.x - 30}
                          y={n.y + 4}
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight={700}
                          fill={t.text}
                          fontFamily="'Space Grotesk', 'Inter', system-ui, sans-serif"
                        >
                          {n.label}
                        </text>
                      </G>
                    )
                  })}

                  {/* final score ring */}
                  <ScoreRing cx={500} cy={612} radius={40} score={score} on={isOn(7)} />
                </svg>

                {/* Mobile story ticker below the scene */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 md:hidden">
                  {STORY.slice(0, 8).map((s, i) => (
                    <span
                      key={s.n}
                      className="rounded-full border px-2 py-0.5 font-mono text-[0.59375rem] font-semibold uppercase tracking-wide transition-colors"
                      style={{
                        borderColor: isCur(i) ? 'var(--color-accent)' : 'var(--color-line)',
                        color: isOn(i) ? 'var(--color-primary)' : 'var(--color-muted)',
                        background: isOn(i) ? 'color-mix(in srgb, var(--color-accent) 8%, white)' : 'transparent',
                      }}
                    >
                      {s.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-3 font-mono text-[0.59375rem] uppercase tracking-[0.18em] text-muted">
              scroll — each agent hands its evidence to the next
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* Lightweight passthrough so we can keep <g> usage concise. */
function G({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) {
  return <g {...rest}>{children}</g>
}

/* Score ring that resolves to 80 / TRUSTWORTHY once stage 7 is reached. */
function ScoreRing({
  cx,
  cy,
  radius,
  score,
  on,
}: {
  cx: number
  cy: number
  radius: number
  score: number
  on: boolean
}) {
  const C = 2 * Math.PI * radius
  const frac = score / 100
  return (
    <G opacity={on ? 1 : 0} style={{ transition: 'opacity 0.6s var(--ease)' }}>
      <circle cx={cx} cy={cy} r={radius} fill="color-mix(in srgb, var(--color-success) 8%, white)" stroke="rgba(31,42,57,0.10)" strokeWidth="7" />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--color-success)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${frac * C} ${C}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="score-ring-arc"
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight={800} fill="var(--color-success)" fontFamily="'Space Grotesk', system-ui, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8.5" fontWeight={600} letterSpacing="0.18em" fill="var(--color-muted)" fontFamily="'JetBrains Mono', monospace">
        TRUSTWORTHY
      </text>
    </G>
  )
}
