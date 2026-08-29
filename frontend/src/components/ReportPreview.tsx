/* A small, self-contained report preview on the landing page.
   Built from the same visual language as the report page, but compact.
   Values are the story's fixed demo values; a real audit produces the real report. */

import { useState } from 'react'
import Ring from './Ring'
import AuditForm from './AuditForm'
import { useReveal } from '../hooks'
import { DEFAULT_DEMO } from '../lib/demo'

const FINDINGS: { severity: 'warning'; text: string }[] = [
  { severity: 'warning', text: 'License terms are ambiguous for synthetic extension' },
  { severity: 'warning', text: 'Validation split tagging is inconsistent' },
]

const METRICS: { label: string; value: number }[] = [
  { label: 'Consent & License', value: 80 },
  { label: 'Citations', value: 100 },
  { label: 'Originality', value: 96 },
  { label: 'Metadata', value: 100 },
  { label: 'Data Quality', value: 76 },
]

export default function ReportPreview({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.15)
  const [active, setActive] = useState<number>(-1)

  return (
    <section id="reports" className="relative px-6 py-16" aria-label="Report preview">
      <div ref={ref} className={`mx-auto w-full max-w-4xl ${visible ? '' : 'opacity-0'}`} style={{ transition: 'opacity 0.7s var(--ease-out)' }}>
        <div className="mb-8 text-center">
          <p className="eyebrow justify-center">✦ the report you get</p>
          <h2 className={`mt-3 font-display text-[clamp(1.6rem,3.8vw,2.4rem)] font-semibold tracking-tight ${visible ? 'fade-in-up' : ''}`} style={{ color: 'var(--color-primary)' }}>
            One score. A trail you can <em style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>verify</em>.
          </h2>
        </div>

        <div className="card relative overflow-hidden p-6 sm:p-7" style={{ boxShadow: 'var(--shadow-lift)' }}>
          <span className="absolute right-4 top-4 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)', borderColor: 'var(--color-line)' }}>
            demo report
          </span>

          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
            {/* Score */}
            <div className="flex flex-col items-center gap-2 md:border-r md:pr-8" style={{ borderColor: 'var(--color-line)' }}>
              <Ring score={80} label="Trustworthy" size={128} strokeWidth={11} animate={visible} delay={150} />
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">{DEFAULT_DEMO.short}</p>
            </div>

            {/* Breakdown + findings */}
            <div className="min-w-0">
              <p className="mb-3 font-mono text-[0.65625rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>
                Score breakdown
              </p>
              <div className={visible ? 'stagger is-visible space-y-2.5' : 'stagger space-y-2.5'}>
                {METRICS.map((m) => (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--color-secondary)' }}>
                      {m.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(31,42,57,0.08)' }}>
                      <div
                        className="bar-fill h-full rounded-full"
                        style={{
                          width: visible ? `${m.value}%` : '0%',
                          background: m.value >= 90 ? 'var(--color-success)' : m.value >= 70 ? 'var(--color-accent)' : 'var(--color-warning)',
                        }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[0.8125rem] font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-1.5 border-t pt-4" style={{ borderColor: 'var(--color-line)' }}>
                {FINDINGS.map((f, i) => (
                  <div
                    key={f.text}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(-1)}
                    onClick={() => setActive(active === i ? -1 : i)}
                    className="cursor-pointer rounded-lg border px-3 py-2 transition-all duration-200"
                    style={{
                      borderColor: active === i ? 'color-mix(in srgb, var(--color-warning) 40%, transparent)' : 'transparent',
                      background: active === i ? 'color-mix(in srgb, var(--color-warning) 6%, white)' : 'transparent',
                      transform: active === i ? 'translateX(4px)' : 'translateX(0)',
                    }}
                    aria-expanded={active === i}
                  >
                    <div className="flex items-center gap-2 text-[0.8125rem] font-medium" style={{ color: 'var(--color-primary)' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-warning)' }} />
                      {f.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-5" style={{ borderColor: 'var(--color-line)' }}>
            <p className="mr-auto font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted">
              {DEFAULT_DEMO.short} · {DEFAULT_DEMO.source}
            </p>
            <AuditForm onStart={onStart} url={DEFAULT_DEMO.url} cta="Audit this dataset" size="md" />
          </div>
        </div>
      </div>
    </section>
  )
}
