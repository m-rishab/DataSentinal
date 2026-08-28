import { useEffect, useRef, useState } from 'react'
import { startAudit } from '../lib/api'

/**
 * Animated particle/node background using the running status color at low opacity.
 * Minimal, subtle movement - no flashy effects.
 */
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = []
    const count = 40
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 1,
      })
    }

    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, w, h)

      // Running color (#6b96c4) at 12% opacity
      ctx.fillStyle = 'rgba(107, 150, 196, 0.12)'
      ctx.strokeStyle = 'rgba(107, 150, 196, 0.08)'
      ctx.lineWidth = 1

      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      })

      // Connect nearby particles with lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default function Hero({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || submitting) return

    setError(null)
    setSubmitting(true)

    try {
      const { run_id } = await startAudit(url.trim())
      onStart(url.trim(), run_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit')
      setSubmitting(false)
    }
  }

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center px-6 overflow-hidden">
      <ParticleBackground />

      <div className="relative z-10 w-full max-w-3xl space-y-8 fade-in-up">
        {/* Headline */}
        <div className="text-center space-y-4">
          <h1 className="text-title" style={{ color: '#e4e6eb' }}>
            Trust Score for Any Dataset
          </h1>
          <p className="text-body max-w-2xl mx-auto" style={{ color: '#8b9099' }}>
            Paste a Kaggle or Hugging Face dataset URL. Get an evidence-backed provenance report in
            under a minute — license check, citation trace, duplication scan, and a 0–100 trust score.
          </p>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.kaggle.com/datasets/..."
              disabled={submitting}
              className="w-full px-5 py-4 text-body rounded-xl border transition-all"
              style={{
                background: '#14171b',
                borderColor: error ? '#c4645f' : 'rgba(255, 255, 255, 0.08)',
                color: '#e4e6eb',
                outline: 'none',
              }}
              onFocus={e => {
                if (!error) e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }}
              onBlur={e => {
                if (!error) e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'
              }}
            />
            {error && (
              <p className="absolute -bottom-6 left-1 text-tiny" style={{ color: '#c4645f' }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!url.trim() || submitting}
            className="w-full px-6 py-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: submitting ? '#3a3f47' : '#6b96c4',
              color: '#0d0f12',
              border: 'none',
            }}
            onMouseEnter={e => {
              if (!submitting && url.trim()) {
                e.currentTarget.style.background = '#7ba3cc'
              }
            }}
            onMouseLeave={e => {
              if (!submitting) {
                e.currentTarget.style.background = '#6b96c4'
              }
            }}
          >
            {submitting ? 'Starting audit...' : 'Audit This Dataset'}
          </button>
        </form>

        {/* Quick examples */}
        <div className="flex flex-wrap gap-3 justify-center text-tiny">
          <span style={{ color: '#5a5f68' }}>Try:</span>
          {[
            { label: 'Iris', url: 'https://www.kaggle.com/datasets/uciml/iris' },
            { label: 'Titanic', url: 'https://www.kaggle.com/datasets/yasserh/titanic-dataset' },
            { label: 'IMDB', url: 'https://huggingface.co/datasets/imdb' },
          ].map(ex => (
            <button
              key={ex.url}
              onClick={() => setUrl(ex.url)}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
              style={{
                background: '#14171b',
                borderColor: 'rgba(255, 255, 255, 0.08)',
                color: '#8b9099',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
