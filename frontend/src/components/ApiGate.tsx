import { useState } from 'react'
import { useReveal } from '../hooks'
import { useCountUp } from '../hooks'

/* CI gate — a real backend endpoint (`/audit/{id}/verdict`) makes the
   score enforceable in pipelines. Prints exact curl, copyable. */

const BASE = (import.meta.env.VITE_API_URL ?? 'https://dataasentinal.onrender.com').replace(/\/$/, '')

export default function ApiGate() {
  const { ref, visible } = useReveal<HTMLDivElement>()
  const [copied, setCopied] = useState(false)
  const score = useCountUp(70, { active: visible, duration: 900 })

  const lines = [
    '# 1 · Start an audit',
    `curl -X POST ${BASE}/audit \\`,
    `  -d '{"url":"https://www.kaggle.com/datasets/uciml/iris"}'`,
    '',
    '# 2 · Gate in CI: exits 0 (pass) or 1 (fail)',
    `curl -f ${BASE}/audit/<run_id>/verdict?fail_under=${score}`,
  ].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section id="api" ref={ref} className="relative px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className={`reveal ${visible ? 'is-visible' : ''}`}>
          <p className="eyebrow">✦ API & CI gate</p>
          <h2
            className="mt-3 font-display text-[1.65rem] font-semibold tracking-tight"
            style={{ color: 'var(--color-primary)' }}
          >
            Block untrusted data before it reaches a pipeline.
          </h2>
          <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
            Every audit exposes a verdict endpoint. Point your CI or a pre-training gate at it with{' '}
            <code className="kbd">fail_under=&lt;minimum&gt;</code> and let the exit code fail the build when a dataset
            scores below your bar.
          </p>
        </div>

        <div className={`reveal mt-8 grid gap-4 lg:grid-cols-[1.5fr_1fr] ${visible ? 'is-visible' : ''}`}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--color-line)' }}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-error)', opacity: 0.8 }} />
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-warning)', opacity: 0.8 }} />
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-success)', opacity: 0.8 }} />
                <span className="ml-2 font-mono text-[0.6875rem] text-muted">terminal</span>
              </div>
              <button type="button" onClick={copy} className="btn btn-ghost px-2.5 py-1 !text-[0.6875rem]" aria-live="polite">
                {copied ? 'copied ✓' : 'copy'}
              </button>
            </div>
            <pre
              className="overflow-x-auto p-4 font-mono text-[0.75rem] leading-relaxed"
              style={{ color: 'var(--color-secondary)', background: 'var(--color-surface)' }}
            >
              {lines}
            </pre>
          </div>

          <div
            className="flex flex-col justify-between rounded-xl border p-5"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-panel))',
              borderColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
            }}
          >
            <div>
              <p className="eyebrow">Example policy</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-[3rem] font-bold tabular-nums leading-none" style={{ color: 'var(--color-accent)' }}>
                  {score}
                </span>
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted">minimum score</span>
              </div>
              <p className="mt-3 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                Below this bar the gate exits <code className="kbd">1</code> — the pipeline stops and the report link is
                attached to the failure.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}