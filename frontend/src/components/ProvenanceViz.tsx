/* Interactive provenance visualization — the hero centerpiece.
   A living scene: dataset center → eight investigation agents → trust score.
   On mount (and on dataset change) the lines draw, nodes reveal, particles
   travel and the score counts to 80. This is a controlled marketing demo:
   it never touches the audit API, and the 80 is a fixed story value. */

import { useEffect, useMemo, useState } from 'react'
import { useCountUp, usePrefersReducedMotion } from '../hooks'
import type { DemoDataset } from '../lib/demo'

interface Agent {
  id: string
  label: string
  x: number
  y: number
}

const CX = 400
const CY = 268
const SCORE_Y = 574
const SCORE_R = 30

const AGENTS: Agent[] = [
  { id: 'ingest', label: 'Ingest', x: 400, y: 84 },
  { id: 'consent', label: 'Consent & License', x: 564, y: 140 },
  { id: 'citation', label: 'Citation Tracer', x: 632, y: 268 },
  { id: 'duplication', label: 'Duplication Check', x: 576, y: 398 },
  { id: 'related', label: 'Related Work', x: 240, y: 140 },
  { id: 'quality', label: 'Data Quality', x: 176, y: 268 },
  { id: 'pii', label: 'PII Scanner', x: 232, y: 398 },
  { id: 'metadata', label: 'Metadata Analyzer', x: 400, y: 452 },
]

function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  return `M ${ax} ${ay} Q ${mx} ${my - 24} ${bx} ${by}`
}

const TARGET = 80

export default function ProvenanceViz({ dataset, compact = false }: { dataset: DemoDataset; compact?: boolean }) {
  const reduced = usePrefersReducedMotion()
  const [run, setRun] = useState(0)
  const [phase, setPhase] = useState<'draw' | 'reveal'>('draw')
  useEffect(() => {
    setRun((r) => r + 1)
    setPhase('draw')
    const t = window.setTimeout(() => setPhase('reveal'), reduced ? 0 : 110)
    return () => window.clearTimeout(t)
  }, [dataset.label, reduced])

  const score = useCountUp(TARGET, { active: phase === 'reveal', duration: 1600, delay: 900 })

  /* Dataset→agent edges, drawn with stagger; agent→score connectors below. */
  const outEdges = useMemo(
    () => AGENTS.map((a, i) => ({ id: a.id, d: edgePath(CX, CY, a.x, a.y), delay: 40 + i * 110 })),
    [],
  )
  const scoreEdges = useMemo(
    () => AGENTS.map((a, i) => ({ id: `s-${a.id}`, d: `M ${a.x} ${a.y + 10} C ${a.x} ${a.y + 90}, ${CX} ${SCORE_Y - 40}, ${CX} ${SCORE_Y - SCORE_R}`, delay: 1320 + i * 110 })),
    [],
  )

  const scoreNodeVisible = phase === 'reveal'

  return (
    <div className={`provenance relative mx-auto w-full ${compact ? 'max-w-xl' : 'max-w-4xl'}`}>
      <svg viewBox="0 0 800 596" className="h-auto w-full" role="img" aria-label={`Provenance visualization for the ${dataset.short} demo dataset`}>
        <defs>
          <radialGradient id="pv-center">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--color-accent) 20%, transparent)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="pv-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--color-info) 30%, transparent)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>

        {/* ambient center wash */}
        <ellipse cx={CX} cy={CY} rx="150" ry="120" fill="url(#pv-center)" />

        {/* dataset → agent edges */}
        {outEdges.map((e) => (
          <path
            key={`${run}-${e.id}`}
            id={`out-${e.id}`}
            d={e.d}
            fill="none"
            stroke="url(#pv-edge)"
            strokeWidth="1.2"
            className={`draw-line ${scoreNodeVisible ? 'is-visible' : ''}`}
            style={{ ['--dash' as string]: 320, ['--draw-dur' as string]: '1.15s', transitionDelay: '0s', animationDelay: `${e.delay}ms` }}
            opacity={0.8}
          />
        ))}

        {/* agent → score edges */}
        {scoreEdges.map((e) => (
          <path
            key={`${run}-${e.id}`}
            d={e.d}
            fill="none"
            stroke="rgba(107,150,196,0.28)"
            strokeWidth="1"
            strokeDasharray="3 7"
            className={`draw-line ${scoreNodeVisible ? 'is-visible' : ''}`}
            style={{ ['--dash' as string]: 420, ['--draw-dur' as string]: '1s', animationDelay: `${e.delay}ms` }}
          />
        ))}

        {/* agent nodes */}
        {AGENTS.map((a, i) => {
          const visible = scoreNodeVisible
          return (
            <g key={`${run}-${a.id}`} opacity={visible ? 1 : 0} style={{ transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${visible ? 160 + i * 90 : 0}ms` }}>
              <circle cx={a.x} cy={a.y} r="16" fill="var(--color-panel)" stroke="color-mix(in srgb, var(--color-info) 45%, transparent)" strokeWidth="1" />
              <circle cx={a.x} cy={a.y} r="3.5" fill="var(--color-info)" />
              <text x={a.x} y={a.y + 34} textAnchor="middle" fontSize="10.5" fontWeight={600} fill="#9aa3b2" style={{ fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.02em' }}>
                {a.label.toUpperCase()}
              </text>
            </g>
          )
        })}

        {/* score node */}
        <g opacity={scoreNodeVisible ? 1 : 0} style={{ transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) 1.35s` }}>
          <circle cx={CX} cy={SCORE_Y} r={SCORE_R} fill="color-mix(in srgb, var(--color-accent) 16%, var(--color-panel))" stroke="var(--color-accent)" strokeWidth="1.4" />
          <text x={CX} y={SCORE_Y - 4} textAnchor="middle" fontSize="19" fontWeight={700} fill="#e8ecf3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {score}
          </text>
          <text x={CX} y={SCORE_Y + 15} textAnchor="middle" fontSize="7.5" fontWeight={600} letterSpacing="0.18em" fill="#9aa3b2" style={{ fontFamily: 'ui-monospace, monospace' }}>
            TRUST SCORE
          </text>
        </g>

        {/* data particles traveling along edges after reveal */}
        {!reduced && scoreNodeVisible && (
          <g>
            {outEdges.map((e, i) => (
              <circle key={`p-${run}-${i}`} r="2.2" fill="var(--color-accent)">
                <animateMotion dur={`${2.4 + (i % 4) * 0.7}s`} repeatCount="indefinite" begin={`${1.4 + i * 0.25}s`} path={e.d} />
              </circle>
            ))}
            <circle r="2" fill="var(--color-warning)">
              <animateMotion dur="3.2s" repeatCount="indefinite" begin="2s" path={edgePath(CX, CY, CX + 8, SCORE_Y - SCORE_R)} />
            </circle>
          </g>
        )}

        {/* soft breath on the dataset core */}
        {!reduced && (
          <circle cx={CX} cy={CY} r="34" fill="none" stroke="color-mix(in srgb, var(--color-accent) 30%, transparent)" strokeWidth="1">
            <animate attributeName="r" values="30;40;30" dur="4.5s" repeatCount="indefinite" begin="2s" />
            <animate attributeName="opacity" values="0.5;0.9;0.5" dur="4.5s" repeatCount="indefinite" begin="2s" />
          </circle>
        )}
      </svg>

      {/* Dataset core card (HTML, above the SVG center). */}
      <div
        className="provenance-core pointer-events-none absolute z-10 transition-transform duration-700"
        style={{
          left: '50%',
          top: `${CY / 596 * 100}%`,
          transform: 'translate(-50%, -50%) scale(0.82)',
        }}
        aria-hidden="true"
      >
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-line-strong)', boxShadow: 'var(--shadow-float)' }}>
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent)', boxShadow: `0 0 12px var(--color-accent)` }} />
          <span className="font-mono text-[0.65625rem] font-bold uppercase tracking-[0.18em] text-muted">{dataset.source}</span>
          <span className="font-display text-[0.9375rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
            {dataset.short}
          </span>
        </div>
        <p className="mx-auto mt-1.5 w-max font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-muted">
          dataset → provenance → evidence → agents → trust
        </p>
      </div>

      <p className="mt-1 text-center font-mono text-[0.59375rem] uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>
        live marketing demo — 80 is a story value, not an audit result
      </p>
    </div>
  )
}