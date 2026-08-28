/* "The report is alive" — an interactive report preview built from the same
   visual language as the report page. Numbers shown are the story's fixed
   demo values; a real audit produces the real report. */

import { useState } from 'react'
import Ring from './Ring'
import AuditForm from './AuditForm'
import { useReveal } from '../hooks'
import { DEFAULT_DEMO } from '../lib/demo'

const METRICS: { label: string; value: number }[] = [
  { label: 'Consent & License', value: 80 },
  { label: 'Citations', value: 100 },
  { label: 'Originality', value: 96 },
  { label: 'Metadata', value: 100 },
  { label: 'Data Quality', value: 76 },
]

const FINDINGS: { severity: 'warning'; text: string; evidence: string }[] = [
  {
    severity: 'warning',
    text: 'License terms are ambiguous for synthetic extension',
    evidence: 'Consent & License agent: description references derived works without explicit grant. Review before redistribution.',
  },
  {
    severity: 'warning',
    text: 'Validation split tagging is inconsistent',
    evidence: 'Data Quality agent: some records are pre-tagged train/val, others infer from filename patterns.',
  },
]

export default function ReportPreview({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.2)
  const [active, setActive] = useState(0)

  return (
    <section id="reports" className="relative px-6 py-20" aria-label="Report preview">
      <div className="rule-fade mx-auto mb-12 max-w-6xl" />
      <div ref={ref} className={`mx-auto w-full max-w-6xl ${visible ? '' : 'opacity-0'}`} style={{ transition: 'opacity 0.7s var(--ease-out)' }}>
        <div className="mb-10 text-center">
          <p className="eyebrow justify-center">✦ the report</p>
          <h2 className={`mt-3 font-display text-[clamp(1.8rem,4.4vw,3rem)] font-semibold tracking-tight ${visible ? 'fade-in-up' : 'opacity-0'}`} style={{ color: 'var(--color-primary)' }}>
            One score. A trail you can <em style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>verify</em>.
          </h2>
        </div>

        <div className="relative overflow-hidden rounded-2xl border p-6 sm:p-8" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', boxShadow: 'var(--shadow-lift)' }}>
          <span className="absolute right-4 top-4 rounded border px-1.5 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)', borderColor: 'var(--color-line)' }}>
            demo report
          </span>

          <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
            {/* Score */}
            <div className="flex flex-col items-center justify-center gap-3 lg:border-r lg:pr-8" style={{ borderColor: 'var(--color-line)' }}>
              <Ring score={80} label="Trustworthy" size={150} strokeWidth={12} animate={visible} delay={150} />
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted">{DEFAULT_DEMO.short}</p>
            </div>

            {/* Breakdown bars */}
            <div className="space-y-4">
              <p className="font-mono text-[0.65625rem] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-muted)' }}>
                Score breakdown
              </p>
              <div className={visible ? 'stagger is-visible space-y-3' : 'stagger space-y-3'}>
                {METRICS.map((m) => (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-secondary)' }}>
                      {m.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
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
            </div>
          </div>

          {/* Findings: hover-expand, gentle slide */}
          <div className="mt-8 space-y-2 border-t pt-6" style={{ borderColor: 'var(--color-line)' }}>
            <p className="mb-3 font-mono text-[0.65625rem] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-muted)' }}>
              Findings
            </p>
            {FINDINGS.map((f, i) => (
              <div
                key={f.text}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(active === i ? -1 : i)}
                onMouseLeave={() => setActive(-1)}
                className="cursor-pointer rounded-lg border px-4 py-3 transition-[transform,border-color,background-color] duration-300"
                style={{
                  borderColor: active === i ? 'color-mix(in srgb, var(--color-warning) 40%, transparent)' : 'var(--color-line)',
                  background: active === i ? 'var(--color-panel)' : 'transparent',
                  transform: active === i ? 'translateX(6px)' : 'translateX(0)',
                }}
                aria-expanded={active === i}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-warning)' }} />
                    {f.text}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider" style={{ color: 'var(--color-warning)', borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)' }}>
                    warning
                  </span>
                </div>
                <div className="overflow-hidden transition-all" style={{ maxHeight: active === i ? 90 : 0, opacity: active === i ? 1 : 0 }}>
                  <p className="pt-2 text-[0.75rem] leading-relaxed text-secondary">{f.evidence}</p>
                </div>
              </div>
            ))}
            <p className="pt-2 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">hover to expand · evidence is always attached</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
              {DEFAULT_DEMO.short} · {DEFAULT_DEMO.source} · real audit
            </p>
            <AuditForm onStart={onStart} url={DEFAULT_DEMO.url} cta="Audit this dataset →" size="md" />
          </div>
        </div>
      </div>
    </section>
  )
}