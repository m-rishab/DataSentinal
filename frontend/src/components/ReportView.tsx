import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchReport } from '../lib/api'
import { explainLicense } from '../lib/licenses'
import SchemaTable from './SchemaTable'
import type { AuditReport, RetractionStatus, Severity } from '../lib/types'
type Tab = 'overview' | 'evidence' | 'citations' | 'compliance' | 'data' | 'logs'

const BREAKDOWN_LABEL: Record<string, { label: string; hint: string }> = {
  consent: { label: 'Consent & License', hint: 'How clearly the dataset states usage terms and consent.' },
  originality: { label: 'Originality', hint: 'Freedom from copy-paste / re-upload markers.' },
  citations: { label: 'Citations', hint: 'Verified citing papers and their retraction status.' },
  metadata: { label: 'Metadata', hint: 'Completeness of title, license, files and columns.' },
}

function scoreTone(score: number): { color: string; label: string } {
  if (score < 40) return { color: '#c4645f', label: 'High Risk' }
  if (score <= 70) return { color: '#c9a14a', label: 'Caution' }
  return { color: '#4a9d7f', label: 'Trustworthy' }
}

const SEVERITY_TONE: Record<Severity, string> = {
  info: 'var(--color-muted)',
  low: 'var(--color-info)',
  medium: 'var(--color-warning)',
  high: 'var(--color-warning)',
  critical: 'var(--color-error)',
}

const RETRACTION_LABEL: Record<RetractionStatus, { label: string; color: string }> = {
  retracted: { label: 'Retracted', color: 'var(--color-error)' },
  possibly_retracted: { label: 'Possibly Retracted', color: 'var(--color-warning)' },
  not_retracted: { label: 'Verified', color: 'var(--color-success)' },
  unknown: { label: 'Unknown', color: 'var(--color-muted)' },
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'citations', label: 'Citations' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'data', label: 'Data Profile' },
  { key: 'logs', label: 'Logs' },
]

/* ------------------------------------------------------------------ */
/* Report view                                                         */
/* ------------------------------------------------------------------ */

export default function ReportView({
  runId,
  datasetUrl,
  onReset,
  onViewGraph,
}: {
  runId: string
  datasetUrl: string
  onReset: () => void
  onViewGraph?: () => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copied, setCopied] = useState(false)
  const { data: report, isLoading, isFetching, error } = useQuery({
    queryKey: ['report', runId],
    queryFn: () => fetchReport(runId),
    retry: Infinity,
    retryDelay: 1000,
  })

  const shareLink = `${window.location.origin}/?run=${runId}`
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — user can copy the code block manually */
    }
  }

  if (isLoading || (isFetching && !report)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--color-line-strong)', borderTopColor: 'var(--color-accent)' }} />
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted">Loading report…</p>
      </div>
    )
  }
  if (error || !report) {
    return (
      <div
        className="mx-auto max-w-xl rounded-xl border p-6"
        style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--color-error) 35%, transparent)' }}
      >
        <p className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-error)' }}>
          Could not load report
        </p>
        <p className="mt-1 font-mono text-[0.75rem] text-muted">{(error as Error | null)?.message}</p>
        <button type="button" onClick={onReset} className="btn btn-danger mt-4 px-3 py-1.5 !text-[0.75rem]">
          Start over
        </button>
      </div>
    )
  }

  const tone = scoreTone(report.trust_score)
  const breakdown = report.score_breakdown ?? {}
  const gate = report.gate
  const licenseInfo = explainLicense(report.metadata.license)
  const effectiveColumns = report.metadata.columns?.length
    ? report.metadata.columns
    : report.data_profile?.columns_profiled ?? []
  const profilingFailed =
    report.data_profile?.skip_reason != null ||
    (effectiveColumns.length === 0 && (report.data_profile?.rows_profiled ?? 0) === 0)

  const findings = [
    ...report.consent_flags.map((f) => ({ ...f, group: 'License & Consent' as const })),
    ...report.duplication_flags.map((f) => ({ ...f, group: 'Originality' as const })),
  ]

  return (
    <div className="w-full space-y-8 fade-in-up print-area">
      {/* Partial evidence warning banner */}
      {profilingFailed && <WarningBanner />}

      {/* CI gate verdict banner — only when a threshold was actually set */}
      {gate && gate.fail_under != null && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            background: `color-mix(in srgb, ${gate.passed ? '#4a9d7f' : '#c4645f'} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${gate.passed ? '#4a9d7f' : '#c4645f'} 35%, transparent)`,
          }}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-black text-white"
            style={{ background: gate.passed ? '#4a9d7f' : '#c4645f' }}
          >
            {gate.passed ? '✓' : '✕'}
          </span>
          <p className="text-[0.8125rem] font-bold" style={{ color: gate.passed ? '#9bd0b9' : '#e0b3b0' }}>
            {gate.passed ? 'Gate passed' : 'Gate failed'} — trust score {report.trust_score} vs required {gate.fail_under}
          </p>
          <code className="chip ml-auto font-mono !text-[0.65625rem]">
            curl /audit/{runId}/verdict → exit {gate.passed ? '0' : '1'}
          </code>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-start" style={{ borderColor: 'var(--color-line)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[1.4rem] font-semibold tracking-tight" style={{ color: 'var(--color-primary)' }}>
              {report.metadata.title || 'Dataset Report'}
            </h2>
            <span className="chip hidden sm:inline-flex" style={{ color: tone.color, borderColor: `color-mix(in srgb, ${tone.color} 35%, transparent)`, background: `color-mix(in srgb, ${tone.color} 10%, transparent)` }}>
              {tone.label}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[0.65625rem] text-muted">
            {runId} · {report.metadata.license || 'license not stated'}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {onViewGraph && (
            <button type="button" onClick={onViewGraph} className="btn btn-ghost px-3 py-2 !text-[0.75rem]" title="Open the audit investigation workspace">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="5" cy="12" r="2.2" /><circle cx="19" cy="5" r="2.2" /><circle cx="19" cy="19" r="2.2" />
                <path d="M7 11l9.5-5M7 13l9.5 5" />
              </svg>
              Audit Graph
            </button>
          )}
          <button type="button" onClick={copyShare} className="btn btn-ghost px-3 py-2 !text-[0.75rem]" title={`Copy public link: ${shareLink}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {copied ? <path d="M20 6L9 17l-5-5" /> : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
            </svg>
            {copied ? 'Link copied' : 'Share'}
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-ghost px-3 py-2 !text-[0.75rem]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" />
            </svg>
            PDF
          </button>
          <a href={report?.dataset_url || datasetUrl} target="_blank" rel="noreferrer" className="text-[0.75rem] font-medium text-secondary underline decoration-line-strong transition-colors hover:text-accent hover:decoration-accent">
            Dataset Source
          </a>
          <button type="button" onClick={onReset} className="btn btn-primary px-3.5 py-2 !text-[0.75rem]">
            New Audit
          </button>
        </div>
      </div>

      {/* Score + Auditor Summary */}
      <div
        className="grid items-center gap-6 p-6 sm:grid-cols-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: '16px', boxShadow: 'var(--shadow-lift)' }}
      >
        <div className="flex items-center gap-5 sm:flex-col sm:gap-3 sm:border-r sm:pr-6" style={{ borderColor: 'var(--color-line)' }}>
          <ScoreRing score={report.trust_score} label={tone.label} />
          <div className="sm:text-center">
            <div className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.18em', color: 'var(--color-muted)' }}>
              Trust Score
            </div>
            <div className="mt-1 font-display text-[1.1rem] font-semibold" style={{ color: tone.color }}>
              {tone.label}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          <p className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.18em', color: 'var(--color-muted)' }}>
            Auditor Summary
          </p>
          <p className="mt-2 text-[0.9375rem] leading-[1.65]" style={{ color: 'var(--color-primary)' }}>
            {report.rationale || 'No summary was generated.'}
          </p>

          {Object.keys(breakdown).length > 0 && (
            <div className="mt-5 space-y-3">
              {Object.entries(breakdown).map(([key, value]) => {
                const meta = BREAKDOWN_LABEL[key] ?? { label: key, hint: 'Contribution to the trust score.' }
                const v = Math.max(0, Math.min(100, Math.round(value)))
                const barColor = v >= 70 ? 'var(--color-success)' : v >= 40 ? 'var(--color-warning)' : 'var(--color-error)'
                return (
                  <div key={key} className="flex items-center gap-3" title={meta.hint}>
                    <span className="w-32 shrink-0 text-[0.8125rem] font-medium text-secondary">{meta.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: barColor }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[0.8125rem] font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
                      {v}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sticky tabs bar */}
      <div
        className="sticky top-0 z-30 -mx-4 flex gap-1 overflow-x-auto border-b no-print px-4 sm:-mx-6 sm:px-6"
        style={{ background: 'color-mix(in srgb, var(--color-page) 92%, transparent)', borderColor: 'var(--color-line)', backdropFilter: 'blur(8px)' }}
        role="tablist"
        aria-label="Report sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="relative shrink-0 px-3.5 py-3 text-[0.8125rem] font-semibold capitalize transition-colors"
            style={{ color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-secondary)' }}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px]" style={{ background: 'var(--color-accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="min-h-[240px]" role="tabpanel">
        {activeTab === 'overview' && (
          <OverviewPanel
            report={report}
            effectiveColumns={effectiveColumns}
            licenseInfo={licenseInfo}
          />
        )}

        {activeTab === 'evidence' && (
          <div className="space-y-8">
            <FindingsBlock title="License & Consent Indicators" findings={findings.filter((f) => f.group === 'License & Consent')} />
            <FindingsBlock title="Originality Checks" findings={findings.filter((f) => f.group === 'Originality')} hasData={findings.length > 0} />
            {report.file_inspection && report.file_inspection.checks && report.file_inspection.checks.length > 0 && (
              <FileInspection inspection={report.file_inspection} />
            )}
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="space-y-8">
            <div>
              <SectionTitle title="Verification Trail" />
              {report.citation_trail.length === 0 ? (
                <Empty text="No citing papers verified." />
              ) : (
                <div className="space-y-3">
                  {report.citation_trail.map((citation, i) => {
                    const retraction = RETRACTION_LABEL[citation.retraction_status] ?? RETRACTION_LABEL.unknown
                    return (
                      <div key={i} className="card flex items-center justify-between gap-4 p-4 transition-colors hover:bg-white/[0.02]">
                        <div className="min-w-0">
                          <p className="truncate text-[0.8125rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {citation.paper_title}
                          </p>
                          {citation.doi && (
                            <a
                              href={`https://doi.org/${citation.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block font-mono text-[0.65625rem] text-muted transition-colors hover:text-accent hover:underline"
                            >
                              doi:{citation.doi}
                            </a>
                          )}
                        </div>
                        <Pill color={retraction.color} text={retraction.label} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <SectionTitle title="Related Research" />
              {report.related_work.papers.length === 0 ? (
                <Empty text="No related research papers." />
              ) : (
                <div className="space-y-2">
                  {report.related_work.papers.map((paper, i) => (
                    <div key={i} className="card flex items-center justify-between gap-4 p-3 text-[0.8125rem]">
                      {paper.url ? (
                        <a href={paper.url} target="_blank" rel="noreferrer" className="truncate font-semibold text-secondary transition-colors hover:text-accent hover:underline">
                          {paper.title}
                        </a>
                      ) : (
                        <span className="truncate font-semibold text-primary">{paper.title}</span>
                      )}
                      <span className="shrink-0 font-mono text-[0.65625rem] text-muted">{paper.year}</span>
                    </div>
                  ))}
                </div>
              )}
              {report.related_work.alternative_datasets.length > 0 && (
                <div className="mt-4">
                  <SectionTitle title="Alternative Datasets" />
                  <div className="space-y-2">
                    {report.related_work.alternative_datasets.map((alt, i) => (
                      <div key={i} className="card flex items-center justify-between gap-4 p-3 text-[0.8125rem]">
                        {alt.url ? (
                          <a href={alt.url} target="_blank" rel="noreferrer" className="truncate font-semibold text-secondary transition-colors hover:text-accent hover:underline">
                            {alt.name}
                          </a>
                        ) : (
                          <span className="truncate font-semibold text-primary">{alt.name}</span>
                        )}
                        <span className="shrink-0 font-mono text-[0.65625rem] capitalize text-muted">{alt.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-8">
            {/* License explainer */}
            <div>
              <SectionTitle title="License & Reuse Terms" />
              <div className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-[1.05rem] font-semibold" style={{ color: report.metadata.license ? 'var(--color-primary)' : 'var(--color-warning)' }}>
                    {report.metadata.license || 'Missing'}
                  </span>
                  {licenseInfo && (
                    <Pill
                      color={licenseInfo.commercial ? 'var(--color-success)' : 'var(--color-warning)'}
                      text={licenseInfo.commercial ? 'Commercial OK' : 'Review required — terms restricted'}
                    />
                  )}
                </div>
                {licenseInfo && <p className="mt-2 text-[0.8125rem] leading-relaxed text-secondary">{licenseInfo.blurb}</p>}
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-secondary">
                  <b style={{ color: 'var(--color-primary)' }}>Why this matters:</b>{' '}
                  {report.metadata.license
                    ? 'The stated terms determine whether you can redistribute or build a product on this data. Treat undocumented terms as risky.'
                    : 'This source did not expose a license. Reuse and redistribution terms are undefined — treat as high risk until clarified.'}
                </p>
              </div>
            </div>

            {/* Metadata completeness */}
            <div>
              <SectionTitle title="Metadata Completeness" />
              <div className="grid gap-3 sm:grid-cols-2">
                <CompletenessRow label="Title" ok={Boolean(report.metadata.title)} detail={report.metadata.title?.slice(0, 60) || 'missing'} />
                <CompletenessRow label="License" ok={Boolean(report.metadata.license)} detail={String(report.metadata.license || 'missing')} />
                <CompletenessRow label="Upload date" ok={Boolean(report.metadata.upload_date)} detail={String(report.metadata.upload_date || 'unknown')} />
                <CompletenessRow label="Tags" ok={report.metadata.tags.length > 0} detail={`${report.metadata.tags.length} tags`} />
                <CompletenessRow label="Files listed" ok={report.metadata.files.length > 0} detail={`${report.metadata.files.length} items`} />
                <CompletenessRow label="Columns detected" ok={effectiveColumns.length > 0} detail={`${effectiveColumns.length} columns`} />
              </div>
            </div>

            {/* CI gate */}
            <div>
              <SectionTitle title="CI Gate Verdict" />
              <div className="card p-4">
                {gate && gate.fail_under != null ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[0.9375rem] font-black"
                      style={{ background: `color-mix(in srgb, ${gate.passed ? '#4a9d7f' : '#c4645f'} 14%, transparent)`, color: gate.passed ? '#4a9d7f' : '#c4645f' }}>
                      {gate.passed ? '✓' : '✕'}
                    </span>
                    <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {gate.passed ? 'This run would pass' : 'This run would fail'} a CI gate set at fail_under={gate.fail_under}.
                    </p>
                    <code className="chip ml-auto font-mono !text-[0.65625rem]">
                      /audit/{runId}/verdict
                    </code>
                  </div>
                ) : (
                  <p className="text-[0.8125rem] text-secondary">
                    No threshold was configured for this run. Use <code className="chip! px-1.5 py-[2px] font-mono !text-[0.625rem]">?fail_under=70</code> when auditing to turn the score into a pass/fail gate for CI.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'data' && <DataPanel report={report} effectiveColumns={effectiveColumns} />}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div>
              <SectionTitle title="Audit Trace Logs" />
              <div className="max-h-96 overflow-y-auto rounded-xl border p-4 font-mono text-[0.6875rem] leading-relaxed" style={{ background: '#070a10', borderColor: 'var(--color-line)', color: 'var(--color-secondary)' }}>
                {report.evidence_log.length === 0 ? (
                  <Empty text="No trace lines recorded." />
                ) : (
                  <div className="min-w-max space-y-1.5">
                    {report.evidence_log.map((line, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="shrink-0 font-bold text-muted">{String(i + 1).padStart(2, '0')}</span>
                        <LinkedText text={line} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <SectionTitle title="Errors" />
              {report.errors.length === 0 ? (
                <Empty text="No agent errors recorded — the audit ran clean." />
              ) : (
                <ul className="space-y-2">
                  {report.errors.map((err, i) => (
                    <li key={i} className="rounded-lg border px-3 py-2 font-mono text-[0.6875rem]" style={{ borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)', background: 'color-mix(in srgb, var(--color-error) 8%, transparent)', color: '#e0b3b0' }}>
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewPanel({
  report,
  effectiveColumns,
  licenseInfo,
}: {
  report: AuditReport
  effectiveColumns: string[]
  licenseInfo: ReturnType<typeof explainLicense>
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KVCard label="License" value={report.metadata.license || 'Missing'} warn={!report.metadata.license} info="The usage terms shown on the dataset page.">
          {licenseInfo && (
            <Pill color={licenseInfo.commercial ? 'var(--color-success)' : 'var(--color-warning)'} text={licenseInfo.commercial ? 'Commercial OK' : 'No commercial'} />
          )}
        </KVCard>
        <KVCard label="Uploaded" value={report.metadata.upload_date ? String(report.metadata.upload_date).slice(0, 10) : 'Unknown'} info="Publish date from the dataset page, when available." />
        <KVCard label="Files Checked" value={`${report.metadata.files.length} ${report.metadata.files.length === 1 ? 'item' : 'items'}`} warn={report.metadata.files.length === 0} info="Files listed on the dataset page at audit time." />
        <KVCard label="Columns" value={`${effectiveColumns.length} detected`} warn={effectiveColumns.length === 0} info="Field names detected on the dataset page." />
      </div>

      {report.metadata.files.length === 0 && (
        <Note>
          <b>Why does “Files Checked” show 0?</b> Kaggle did not expose a file list for this page — usually bot
          protection or a listing without public file metadata. This is not an error: every agent still audited
          all public information (title, description, tags, citations).
        </Note>
      )}

      {effectiveColumns.length > 0 && (
        <div>
          <SectionTitle title="Dataset Columns" />
          <div className="flex flex-wrap gap-1.5">
            {effectiveColumns.map((col) => (
              <span key={col} className="chip font-mono !text-[0.65625rem]">{col}</span>
            ))}
          </div>
        </div>
      )}

      {report.metadata.tags.length > 0 && (
        <div>
          <SectionTitle title="Metadata Tags" />
          <div className="flex flex-wrap gap-1.5">
            {report.metadata.tags.map((tag) => (
              <span key={tag} className="chip">#{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle title="Scraped Files List" />
        {report.metadata.files.length > 0 ? (
          <div className="card max-h-40 overflow-y-auto">
            {report.metadata.files.map((file, i) => (
              <div key={i} className="px-3 py-1.5 font-mono text-[0.6875rem] text-secondary" style={i > 0 ? { borderTop: '1px solid var(--color-line)' } : undefined}>
                {file}
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No file names were exposed by the source page." />
        )}
      </div>

      <Note>
        <b>Interpretation:</b> open the <b>Evidence</b> tab for findings, <b>Citations</b> for the verification trail,
        <b> Compliance</b> for reuse terms and completeness, and <b>Data Profile</b> for what was verified from the
        actual rows. The score reads across all of it.
      </Note>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Evidence & compliance helpers                                       */
/* ------------------------------------------------------------------ */

function FindingsBlock({ title, findings, hasData = true }: { title: string; findings: { finding: string; severity: Severity; evidence: string }[]; hasData?: boolean }) {
  return (
    <div>
      <SectionTitle title={title} />
      {!hasData || findings.length === 0 ? (
        <Empty text="No concerns flagged — nothing adversarial found here." />
      ) : (
        <div className="space-y-3">
          {findings.map((flag, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--color-primary)' }}>{flag.finding}</p>
                <Pill color={SEVERITY_TONE[flag.severity] ?? 'var(--color-muted)'} text={flag.severity} />
              </div>
              {flag.evidence && (
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-secondary">{flag.evidence}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileInspection({ inspection }: { inspection: NonNullable<AuditReport['file_inspection']> }) {
  const checks = inspection.checks ?? []
  return (
    <div>
      <SectionTitle title="File Inspection" />
      <div className="card p-4">
        <p className="font-mono text-[0.65625rem] text-muted">
          {inspection.files_checked ?? 0} files · {inspection.columns_detected ?? 0} cols
          {inspection.rows_sampled != null ? ` · ${inspection.rows_sampled} rows sampled` : ''}
          {inspection.headers_verified ? ' · headers verified' : ''}
        </p>
        <div className="mt-3 space-y-1.5">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 text-[0.75rem] leading-snug">
              <span
                className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.5625rem] font-black"
                style={{
                  background: `color-mix(in srgb, ${CHECK_TONE(check.result)} 10%, transparent)`,
                  color: CHECK_TONE(check.result),
                }}
              >
                {check.result === 'pass' ? '✓' : check.result === 'warning' ? '!' : check.result === 'mismatch' ? '×' : '–'}
              </span>
              <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{check.check}</span>
              <span className="text-muted">{check.detail}</span>
            </div>
          ))}
        </div>
        {inspection.pii_columns && inspection.pii_columns.length > 0 && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-[0.75rem] font-medium" style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--color-warning) 30%, transparent)', color: 'var(--color-warning)' }}>
            Possible PII columns detected: {inspection.pii_columns.join(', ')} — review before sharing this dataset onward.
          </p>
        )}
      </div>
    </div>
  )
}

function CHECK_TONE(result: string): string {
  if (result === 'pass') return 'var(--color-success)'
  if (result === 'warning') return 'var(--color-warning)'
  if (result === 'mismatch') return 'var(--color-error)'
  return 'var(--color-muted)'
}

/* ------------------------------------------------------------------ */
/* Data Profile                                                        */
/* ------------------------------------------------------------------ */

function DataPanel({ report, effectiveColumns }: { report: AuditReport; effectiveColumns: string[] }) {
  const dp = report.data_profile
  return (
    <div className="space-y-6">
      {effectiveColumns.length > 0 && (
        <SchemaTable columns={effectiveColumns} dataProfile={dp ?? null} isPartial={dp?.rows_profiled != null && dp.rows_profiled < 1000} />
      )}

      {dp && (dp.rows_profiled || dp.skip_reason) ? (
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="eyebrow">Data Profile</span>
            <span className="font-mono text-[0.65625rem] text-muted">
              {dp.rows_profiled ? `${dp.rows_profiled} real rows · via ${dp.source_used}` : 'not available for this source'}
            </span>
          </div>

          {dp.rows_profiled ? (
            <>
              {dp.skip_reason && (
                <p className="mb-3 text-[0.75rem] leading-snug" style={{ color: 'var(--color-warning)' }}>
                  Partial profile: {dp.skip_reason}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatBox label="Duplicate rows" value={`${dp.duplicate_pct ?? 0}%`} tone={(dp.duplicate_pct ?? 0) >= 2 ? 'warn' : 'ok'} sub={`${dp.duplicate_rows ?? 0} exact matches`} />
                <StatBox label="Missing cells" value={`${dp.missing_total_pct ?? 0}%`} tone={(dp.missing_total_pct ?? 0) >= 5 ? 'warn' : 'ok'} sub="across all columns" />
                {dp.class_balance && (
                  <StatBox label={`Class balance · ${dp.class_balance.column}`} value={`${dp.class_balance.minority_pct ?? 0}%`} tone={(dp.class_balance.minority_pct ?? 100) < 10 ? 'warn' : 'ok'} sub="smallest class share" />
                )}
              </div>

              {(dp.numeric_summary?.length ?? 0) > 0 && (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--color-line)' }}>
                  <table className="w-full text-left">
                    <thead className="sticky top-0" style={{ background: 'var(--color-panel)' }}>
                      <tr className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-muted">
                        {['Numeric column', 'Min', 'Mean', 'Max', 'Missing'].map((h) => (
                          <th key={h} className="px-3 py-1.5 font-bold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dp.numeric_summary!.map((s, i) => (
                        <tr key={s.column} className="font-mono text-[0.6875rem] text-secondary" style={i > 0 ? { borderTop: '1px solid var(--color-line)' } : undefined}>
                          <td className="max-w-[140px] truncate px-3 py-1.5 font-semibold" style={{ color: 'var(--color-primary)' }}>{s.column}</td>
                          <td className="px-3 py-1.5">{s.min}</td>
                          <td className="px-3 py-1.5">{s.mean}</td>
                          <td className="px-3 py-1.5">{s.max}</td>
                          <td className="px-3 py-1.5" style={{ color: (s.missing_pct ?? 0) > 0 ? 'var(--color-warning)' : 'inherit' }}>{s.missing_pct ?? 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dp.class_balance && (
                <div className="mt-3 space-y-1.5">
                  {dp.class_balance.values.slice(0, 6).map((v) => {
                    const maxCount = Math.max(...dp.class_balance!.values.map((x) => x.count), 1)
                    return (
                      <div key={v.value} className="flex items-center gap-2">
                        <span className="w-32 shrink-0 truncate text-right font-mono text-[0.65625rem] text-secondary">{v.value}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(v.count / maxCount) * 100}%`, background: 'var(--color-accent)' }} />
                        </div>
                        <span className="w-10 shrink-0 font-mono text-[0.65625rem] text-muted">{v.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-[0.8125rem] leading-snug text-secondary">
              {dp.skip_reason || 'This source does not expose downloadable rows.'} The audit ran on page metadata,
              filenames and column listings instead.
            </p>
          )}
        </div>
      ) : (
        <Empty text="No data profile was produced for this source." />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

function Pill({ color, text }: { color: string; text: string }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {text}
    </span>
  )
}

/* SVG score ring showing the real 0–100 trust score in its tier colour. */
function ScoreRing({ score, label }: { score: number; label: string }) {
  const { color } = scoreTone(score)
  const R = 38
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img" aria-label={`Trust score ${score} of 100 — ${label}`}>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <circle cx="52" cy="52" r={R} fill="none" strokeWidth="10" stroke="rgba(255,255,255,0.06)" />
        <circle
          cx="52" cy="52" r={R} fill="none"
          strokeWidth="10" strokeLinecap="round"
          stroke={color}
          strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * C} ${C}`}
          style={{ transition: 'stroke-dasharray 0.8s var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display text-[1.75rem] font-bold leading-none tabular-nums" style={{ color: 'var(--color-primary)' }}>{score}</div>
          <div className="mt-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-[0.18em]" style={{ color }}>{label}</div>
        </div>
      </div>
    </div>
  )
}

function KVCard({ label, value, info, warn, children }: { label: string; value: string; info: string; warn?: boolean; children?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <span className="text-[0.625rem] font-bold uppercase tracking-wider" style={{ letterSpacing: '0.16em', color: 'var(--color-muted)' }}>
        {label} <Info text={info} />
      </span>
      <p className="mt-1 truncate font-display text-[1.05rem] font-semibold" style={{ color: warn ? 'var(--color-warning)' : 'var(--color-primary)' }}>
        {value}
      </p>
      {children}
    </div>
  )
}

function CompletenessRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65625rem] font-black"
        style={{ background: `color-mix(in srgb, ${ok ? '#4a9d7f' : '#c9a14a'} 12%, transparent)`, color: ok ? 'var(--color-success)' : 'var(--color-warning)' }}
      >
        {ok ? '✓' : '!'}
      </span>
      <span className="shrink-0 text-[0.75rem] font-semibold" style={{ color: 'var(--color-primary)' }}>{label}</span>
      <span className="truncate font-mono text-[0.65625rem] text-muted">{detail}</span>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="mb-3 text-[0.625rem] font-bold uppercase" style={{ letterSpacing: '0.2em', color: 'var(--color-muted)' }}>
      {title}
    </h3>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-[0.8125rem] font-medium italic text-muted">{text}</p>
}

function StatBox({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'ok' | 'warn' }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={
        tone === 'ok'
          ? { borderColor: 'var(--color-line)', background: 'rgba(255,255,255,0.03)' }
          : { borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)', background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' }
      }
    >
      <p className="truncate text-[0.5625rem] font-bold uppercase tracking-wider text-muted" title={label}>{label}</p>
      <p className="mt-0.5 text-[1.1rem] font-semibold leading-none tabular-nums" style={{ color: tone === 'ok' ? 'var(--color-primary)' : 'var(--color-warning)' }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[0.65625rem] font-medium text-muted">{sub}</p>}
    </div>
  )
}

function WarningBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div>
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--color-error)' }}>
          This score is based on partial evidence
        </p>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-secondary">
          Data profiling failed for this source. The trust score reflects metadata and citation checks only, not actual
          dataset content verification.
        </p>
      </div>
    </div>
  )
}

/* Hover tooltip explanation (display-toggle so it never flashes or leaks into copy). */
function Info({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex cursor-help align-middle" tabIndex={0}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.2" className="transition-colors group-hover:stroke-secondary">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M12 11v5" strokeLinecap="round" />
      </svg>
      <span className="normal-case tracking-normal pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-60 -translate-x-1/2 rounded-lg border px-3 py-2 text-[0.6875rem] font-medium leading-snug shadow-xl group-hover:block group-focus:block" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-line-strong)', color: 'var(--color-primary)' }}>
        {text}
      </span>
    </span>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)', background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' }}
    >
      <p className="text-[0.8125rem] leading-relaxed" style={{ color: 'var(--color-warning)' }}>{children}</p>
    </div>
  )
}

function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)\]]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-accent transition-colors hover:underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}