/* "Seven agents investigate every dataset."
   A pinned, scroll-driven horizontal investigation with a lerped
   cursor-tracked preview on desktop and tap-to-expand on mobile.
   Evidence text is real agent copy from lib/steps.ts. */

import { useState } from 'react'
import { PIPELINE, stepByNode } from '../lib/steps'
import { usePrefersReducedMotion, useReveal, useScrollProgress } from '../hooks'

const SEQUENCE = ['Dataset', 'Ingest', 'License', 'Citations', 'Originality', 'Context', 'Quality', 'Trust']

/* Real agent node per sequence position (Trust maps to the aggregator). */
const NODE_REF = ['', 'ingest', 'consent_agent', 'citation_tracer', 'duplication_agent', 'related_work_agent', 'critic_aggregator', 'critic_aggregator']

const META: Record<string, string> = {
  License: 'Scans license + consent language and scores severity of every finding',
  Citations: 'Searches OpenAlex, cross-checks every DOI against Crossref retraction records',
  Originality: 'Screens the listing for copy-paste markers, scrape residue and re-upload patterns',
  Context: 'Surfaces related papers and alternative clean datasets for comparison',
  Quality: 'Profiles real rows — duplicates, missing cells, class balance and numeric ranges',
  Trust: 'Weights all evidence and computes the 0–100 trust score with a rationale',
}

interface PreviewState {
  x: number
  y: number
  label: string
  stepNode: string
  active: number
}

const TAP_MENU: { node: string; title: string }[] = [
  { node: 'ingest', title: 'Ingest' },
  { node: 'consent_agent', title: 'License' },
  { node: 'citation_tracer', title: 'Citations' },
  { node: 'duplication_agent', title: 'Originality' },
  { node: 'related_work_agent', title: 'Context' },
  { node: 'critic_aggregator', title: 'Quality · Trust' },
]

export default function AgentSequence() {
  const reduced = usePrefersReducedMotion()
  const { ref: trackRef, progress } = useScrollProgress<HTMLDivElement>()
  const { ref: showRef, visible } = useReveal<HTMLDivElement>(0.3)

  /* fraction through the 7 moves */
  const activeIndex = Math.min(Math.max(Math.floor(progress * 7), 0), 7)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)

  const activeSnippet = activeIndex >= 1 && activeIndex <= 7 ? SEQUENCE[activeIndex] : null

  const step = activeIndex >= 1 && activeIndex <= 7 ? stepByNode(NODE_REF[activeIndex]) : undefined

  return (
    <section id="how-it-works" className="relative overflow-hidden">
      {/* Tall pinned track */}
      <div ref={trackRef} className="relative" style={{ height: '200vh' }}>
        <div className="sticky top-0 flex h-screen flex-col justify-between overflow-hidden px-6 pb-10 pt-16 sm:pt-20">
          <div ref={showRef} className={`mx-auto w-full max-w-6xl ${visible ? '' : 'opacity-0'}`} style={{ transition: 'opacity 0.6s var(--ease-out)' }}>
            <div className="text-center">
              <p className="eyebrow justify-center">✦ investigation sequence</p>
              <h2 className={`mt-4 font-display text-[clamp(2rem,4.8vw,3.4rem)] font-semibold leading-[1.04] tracking-tight ${visible ? 'fade-in-up' : ''}`} style={{ color: 'var(--color-primary)' }}>
                Seven agents investigate <em style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>every dataset</em>.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-[0.9375rem] text-secondary">Scroll — you are moving through the audit. Each agent hands its evidence to the next.</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            {/* Horizontal pipeline strip */}
            <div className="relative mx-auto w-full max-w-6xl overflow-x-auto pb-2 md:overflow-visible" style={{ scrollbarWidth: 'none' }}>
              <div className="flex min-w-max items-center gap-1 px-1 md:justify-center md:gap-1.5 md:px-0">
                {SEQUENCE.map((label, i) => {
                  const done = i <= activeIndex
                  const active = i === activeIndex
                  return (
                    <div key={label} className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => setExpandedNode(expandedNode === label ? null : label)}
                        onMouseEnter={(e) => {
                          if (!reduced && window.matchMedia('(pointer: fine)').matches) {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setPreview({ x: rect.right - 40, y: rect.top - 90, label, stepNode: NODE_REF[i] || '', active: i })
                          }
                        }}
                        onMouseMove={(e) => {
                          if (preview) setPreview((p) => (p ? { ...p, x: e.clientX + 24, y: e.clientY + 20 } : p))
                        }}
                        onMouseLeave={() => setPreview(null)}
                        className={`flex flex-col items-center gap-2 rounded-xl px-4 py-4 transition-all duration-500 md:px-6 ${active ? 'scale-[1.08]' : done ? 'scale-100' : 'scale-[0.96]'}`}
                        style={{
                          background: active ? 'var(--color-panel)' : 'transparent',
                          border: '1px solid' + (active ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)' : done ? 'var(--color-line-strong)' : 'var(--color-line)'),
                          opacity: active ? 1 : done ? 0.78 : 0.42,
                        }}
                        aria-current={active ? 'step' : undefined}
                      >
                        <span className="font-mono text-[0.65625rem] font-bold uppercase tracking-[0.18em]" style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="whitespace-nowrap font-display text-[1rem] font-semibold md:text-[1.05rem]" style={{ color: 'var(--color-primary)' }}>
                          {label}
                        </span>
                        <span className="font-mono text-[0.6875rem]" style={{ color: done ? 'var(--color-success)' : 'var(--color-muted)' }}>
                          {done ? '✓' : '○'}
                        </span>
                      </button>
                      {i < SEQUENCE.length - 1 && (
                        <div className="relative mx-1.5 hidden h-px w-14 shrink-0 overflow-hidden md:block lg:w-20" style={{ background: 'var(--color-line)' }} aria-hidden="true">
                          <div
                            className="absolute inset-0 transition-transform duration-200"
                            style={{
                              background: 'linear-gradient(90deg, var(--color-accent), var(--color-info))',
                              transform: `scaleX(${Math.min(1, Math.max(0, progress * 7 - i))})`,
                              transformOrigin: 'left',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Evidence tape for the current position */}
            <div className="mx-auto w-full max-w-3xl">
              <div key={activeIndex} className={`min-h-[112px] text-center fade-in`} style={{ color: 'var(--color-secondary)' }}>
                {step && (
                  <>
                    <p className="font-mono text-[0.75rem] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-info)' }}>
                      now: {activeSnippet}
                    </p>
                    <p className="mt-2.5 text-[1rem] leading-relaxed">{step.description}</p>
                    {META[activeSnippet ?? ''] && <p className="mt-2 text-[0.8125rem] text-muted">{META[activeSnippet ?? '']}</p>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cursor-tracked preview (desktop) — CSS-transition follow feels lerped */}
      {preview && !reduced && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-50 w-64 rounded-xl border p-4"
          style={{
            transform: `translate(${preview.x}px, ${preview.y}px)`,
            transition: 'transform 130ms cubic-bezier(0.16,1,0.3,1)',
            background: 'var(--color-surface)',
            borderColor: 'var(--color-line-strong)',
            boxShadow: 'var(--shadow-float)',
          }}
          role="tooltip"
        >
          {(() => {
            const s = stepByNode(preview.stepNode)
            if (!s) {
              return (
                <div>
                  <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-muted">Dataset</p>
                  <p className="mt-1 text-[0.875rem] text-secondary">The source page being investigated.</p>
                </div>
              )
            }
            const i = PIPELINE.indexOf(s)
            return (
              <div>
                <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-info)' }}>
                  {s.kicker}
                </p>
                <p className="mt-1 font-display text-[1rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {s.label}
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-secondary">{s.description}</p>
                <ul className="mt-2 space-y-1">
                  {s.bullets.slice(0, 2).map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[0.75rem] text-muted">
                      <span style={{ color: 'var(--color-accent)' }}>→</span> {b}
                    </li>
                  ))}
                </ul>
                {i !== -1 && s.node === 'citation_tracer' && (
                  <p className="mt-2 font-mono text-[0.6875rem] text-muted">Sources: OpenAlex · Crossref</p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Mobile tap-expand list */}
      <div className="px-6 pb-6 md:hidden">
        <div className="space-y-1">
          {TAP_MENU.map((m) => (
            <div key={m.node}>
              <button
                type="button"
                onClick={() => setExpandedNode(expandedNode === m.node ? null : m.node)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
                aria-expanded={expandedNode === m.node}
              >
                <span className="font-display text-[0.875rem] font-semibold" style={{ color: 'var(--color-primary)' }}>{m.title}</span>
                <span className="font-mono text-[0.6875rem]" style={{ color: 'var(--color-accent)' }}>{expandedNode === m.node ? '−' : '+'}</span>
              </button>
              {expandedNode === m.node && stepByNode(m.node) && (
                <p className="px-3 py-2 text-[0.8125rem] leading-relaxed text-secondary">{stepByNode(m.node)!.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}