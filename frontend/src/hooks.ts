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