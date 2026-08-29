import { useEffect, useRef, useState } from 'react'

/** Animate a number from 0 → target once `active` becomes true. */
export function useCountUp(target: number, { active = true, duration = 700, delay = 0 }: { active?: boolean; duration?: number; delay?: number } = {}) {
  const [value, setValue] = useState(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    const startAt = performance.now() + delay
    const tick = (now: number) => {
      if (now < startAt) {
        raf.current = requestAnimationFrame(tick)
        return
      }
      const elapsed = now - startAt
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [target, active, duration, delay])

  return value
}

/** Reveal-on-scroll: returns a ref + whether it has entered the viewport. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return { ref, visible }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Fractional scroll progress (0..1) of `ref` through a pinned section,
 * driven by a passive scroll listener + rAF.
 *
 * Maps the element's rect.top to progress as follows:
 *   rect.top = 0           → progress = 0   (element's top at viewport top)
 *   rect.top = -scrollDist → progress = 1 (element scrolled past bottom)
 *
 * where scrollDistance = rect.height - window.innerHeight.
 *
 * This is designed for a pinned investigation scene with a fixed-height
 * track (e.g. 260vh) where the inner sticky element stays in the viewport
 * while the user scrolls through the full track height.
 */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const scrollDistance = rect.height - vh
      // When rect.top = 0 → progress 0; rect.top = -scrollDist → progress 1
      const next = -rect.top / scrollDistance
      setProgress(Math.min(1, Math.max(0, next)))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return { ref, progress }
}