/* Living dataset-relationship background for the landing page.
   Faint procedural provenance lines + tiny nodes + slow drift. Near-invisible
   on purpose; it makes the page feel like the dataset network it audits. */

import { useMemo } from 'react'
import { usePrefersReducedMotion } from '../hooks'

const N = 15
const W = 1440
const H = 900

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function BgNetwork() {
  const reduced = usePrefersReducedMotion()

  const { dots, links } = useMemo(() => {
    const rnd = mulberry32(20260829)
    const dots = Array.from({ length: N }, (_, i) => ({
      id: i,
      x: rnd() * W,
      y: rnd() * H,
      r: 1 + rnd() * 1.8,
      slow: rnd() > 0.75,
      bloom: rnd() > 0.85,
    }))
    const links: [number, number][] = []
    for (let i = 0; i < N; i++) {
      const n = 1 + Math.floor(rnd() * 2)
      for (let k = 0; k < n; k++) {
        const j = Math.floor(rnd() * N)
        if (j !== i && !links.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) {
          links.push([i, j])
        }
      }
    }
    return { dots, links }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true" style={{ opacity: 0.055 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className={`h-full w-full ${reduced ? '' : 'bg-drift'}`}
      >
        {links.map(([a, b], i) => (
          <line key={`l${i}`} x1={dots[a].x} y1={dots[a].y} x2={dots[b].x} y2={dots[b].y} stroke="#9aa3b2" strokeWidth="0.6" />
        ))}
        {dots.map((d) => (
          <g key={d.id}>
            <circle cx={d.x} cy={d.y} r={d.r} fill="#c6cbd6" />
            {reduced ? null : d.bloom ? <circle className="bloom" cx={d.x} cy={d.y} r="14" fill="url(#bgnet-radial)" style={{ animationDelay: `${d.id * 1.3}s` }} /> : null}
          </g>
        ))}
        <defs>
          <radialGradient id="bgnet-radial">
            <stop offset="0%" stopColor="#6b96c4" />
            <stop offset="100%" stopColor="#6b96c4" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  )
}