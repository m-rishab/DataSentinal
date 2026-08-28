/* Shared SVG trust-score ring. Draws itself once mounted (or on `active`),
   animating the arc from 0 → score in its tier color. */

import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks'

export function scoreTone(score: number): { color: string; label: string } {
  if (score < 40) return { color: '#c4645f', label: 'High Risk' }
  if (score <= 70) return { color: '#c9a14a', label: 'Caution' }
  return { color: '#4a9d7f', label: 'Trustworthy' }
}

export default function Ring({
  score,
  label,
  size = 104,
  strokeWidth = 10,
  animate = true,
  delay = 0,
}: {
  score: number
  label?: string
  size?: number
  strokeWidth?: number
  animate?: boolean
  delay?: number
}) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(!animate || reduced)
  const raf = useRef<number | null>(null)
  const tone = scoreTone(score)

  useEffect(() => {
    if (reduced) {
      setShown(true)
      return
    }
    if (!animate) {
      setShown(true)
      return
    }
    const timer = window.setTimeout(() => {
      setShown(true)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [animate, delay, reduced])

  const R = (size - strokeWidth) / 2
  const C = 2 * Math.PI * R
  const frac = Math.max(0, Math.min(100, score)) / 100

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Trust score ${score} of 100 — ${label ?? tone.label}`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" strokeWidth={strokeWidth} stroke="rgba(255,255,255,0.06)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={tone.color}
          strokeDasharray={shown ? `${frac * C} ${C}` : `0 ${C}`}
          style={{ transition: `stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display font-bold leading-none tabular-nums" style={{ color: 'var(--color-primary)', fontSize: size * 0.17 }}>
            {score}
          </div>
          {label && (
            <div className="mt-0.5 font-mono font-bold uppercase" style={{ color: tone.color, fontSize: Math.max(7, size * 0.047), letterSpacing: '0.18em' }}>
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}