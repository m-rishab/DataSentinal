import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchReport } from '../lib/api'
import { explainLicense } from '../lib/licenses'
import SchemaTable from './SchemaTable'
import type { RetractionStatus, Severity } from '../lib/types'
type Tab = 'overview' | 'citations' | 'compliance' | 'logs'

const BREAKDOWN_LABEL: Record<string, { label: string; hint: string }> = {
  consent: { label: 'Consent & License', hint: 'How clearly the dataset states usage terms and consent.' },
  originality: { label: 'Originality', hint: 'Freedom from copy-paste / re-upload markers.' },
  citations: { label: 'Citations', hint: 'Verified citing papers and their retraction status.' },
  metadata: { label: 'Metadata', hint: 'Completeness of title, license, files and columns.' },
}

function scoreColor(score: number): { text: string; label: string } {
  if (score < 40) return { text: 'text-rose-400', label: 'High Risk' }
  if (score <= 70) return { text: 'text-amber-400', label: 'Caution' }
  return { text: 'text-emerald-400', label: 'Trustworthy' }
}

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'text-slate-400 bg-white/5 border border-white/10',
  low: 'text-blue-300 bg-blue-400/10 border border-blue-400/25',
  medium: 'text-amber-300 bg-amber-400/10 border border-amber-400/25',
  high: 'text-orange-300 bg-orange-400/10 border border-orange-400/25',
  critical: 'text-rose-300 bg-rose-400/10 border border-rose-400/25',
}

const RETRACTION_LABEL: Record<RetractionStatus, { label: string; style: string }> = {
  retracted: { label: 'Retracted', style: 'text-rose-300 bg-rose-400/10 border border-rose-400/30' },
  possibly_retracted: { label: 'Possibly Retracted', style: 'text-amber-300 bg-amber-400/10 border border-amber-400/30' },
  not_retracted: { label: 'Verified', style: 'text-emerald-300 bg-emerald-400/10 border border-emerald-400/30' },
  unknown: { label: 'Unknown', style: 'text-slate-400 bg-white/5 border border-white/10' },
}

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
      <div className="flex flex-col items-center gap-2 py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-400" />
        <p className="text-xs text-slate-500 font-mono">Loading report...</p>
      </div>
    )
  }
  if (error || !report) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-6 text-xs text-rose-200">
        Could not load report: {(error as Error | null)?.message}
        <button
          onClick={onReset}
          className="mt-3 block rounded border border-rose-400/40 bg-[#0c1320] px-3 py-1.5 font-bold text-rose-300 transition-colors hover:bg-rose-400/15"
        >
          Start over
        </button>
      </div>
    )
  }

  const { text: scoreTextColor, label: scoreLabel } = scoreColor(report.trust_score)
  const breakdown = report.score_breakdown ?? {}
  const gate = report.gate
  const licenseInfo = explainLicense(report.metadata.license)
  const effectiveColumns = report.metadata.columns?.length
    ? report.metadata.columns
    : report.data_profile?.columns_profiled ?? []

  // Check for partial evidence (failed profiling or empty data)
  const profilingFailed =
    report.data_profile?.skip_reason != null ||
    (effectiveColumns.length === 0 && (report.data_profile?.rows_profiled ?? 0) === 0)

  return (
    <div className="w-full space-y-8 fade-in-up print-area">
      {/* Partial evidence warning banner */}
      {profilingFailed && (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{
            background: 'color-mix(in srgb, #c4645f 10%, transparent)',
            borderColor: 'color-mix(in srgb, #c4645f 30%, transparent)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c4645f"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 mt-0.5"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#c4645f' }}>
              This score is based on partial evidence
            </p>
            <p className="mt-1 text-xs" style={{ color: '#8b9099' }}>
              Data profiling failed for this source. The trust score reflects metadata and citation checks only, not
              actual dataset content verification.
            </p>
          </div>
        </div>
      )}

      {/* CI gate verdict banner — only when a threshold was actually set */}
      {gate && gate.fail_under != null && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
            gate.passed ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-rose-400/30 bg-rose-400/10'
          }`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-white ${gate.passed ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {gate.passed ? '✓' : '✕'}
          </span>
          <p className={`text-[13px] font-bold ${gate.passed ? 'text-emerald-300' : 'text-rose-300'}`}>
            {gate.passed ? 'Gate passed' : 'Gate failed'} — trust score {report.trust_score} vs required{' '}
            {gate.fail_under}
          </p>
          <code className="rounded-md bg-[#0c1320] px-2 py-1 font-mono text-[10.5px] text-slate-300 ring-1 ring-white/10">
            curl /audit/{runId}/verdict → exit {gate.passed ? '0' : '1'}
          </code>
        </div>
      )}

      {/* Minimal Header row */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-white/5">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-50">
            {report.metadata.title || 'Dataset Report'}
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">{runId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {onViewGraph && (
            <button
              onClick={onViewGraph}
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#0c1320] border border-slate-700 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 px-3.5 py-2 rounded-lg transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="5" cy="12" r="2.2" /><circle cx="19" cy="5" r="2.2" /><circle cx="19" cy="19" r="2.2" />
                <path d="M7 11l9.5-5M7 13l9.5 5" />
              </svg>
              Audit Graph
            </button>
          )}
          <button
            onClick={copyShare}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#0c1320] border border-slate-700 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 px-3.5 py-2 rounded-lg transition-all"
            title={`Copy public link: ${shareLink}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {copied
                ? <path d="M20 6L9 17l-5-5" />
                : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
            </svg>
            {copied ? 'Link copied' : 'Share'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#0c1320] border border-slate-700 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 px-3.5 py-2 rounded-lg transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" />
            </svg>
            PDF
          </button>
          <a
            href={report?.dataset_url || datasetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-slate-400 hover:text-cyan-300 underline decoration-slate-700 hover:decoration-cyan-300 transition-all"
          >
            Dataset Source
          </a>
          <button
            onClick={onReset}
            className="text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-400 text-[#04121c] px-4 py-2 rounded-lg transition-all hover:brightness-110 shadow-[0_4px_16px_rgba(34,211,238,0.3)]"
          >
            New Audit
          </button>
        </div>
      </div>

      {/* Trust Score & Rationale Block (Compact) */}
      <div className="grid sm:grid-cols-4 gap-6 items-center bg-[#0c1320]/70 p-6 rounded-2xl border border-slate-800">
        <div className="text-center sm:text-left sm:border-r border-white/5 sm:pr-6">
          <div className={`text-6xl font-light ${scoreTextColor}`}>
            {report.trust_score}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-center sm:justify-start">
            Trust Score
            <Info text="A 0–100 score computed from license clarity, consent signals, citation verification and originality checks. Higher = safer to build on." />
          </div>
          <div className={`text-[11px] font-bold mt-1 ${scoreTextColor}`}>
            {scoreLabel}
          </div>
        </div>
        <div className="sm:col-span-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1 flex items-center">
            Auditor Summary
            <Info text="A plain-language reading of the score: what lowered it and what you should verify before using this dataset." />
          </div>
          <p className="text-sm font-medium text-slate-200 leading-relaxed">
            {report.rationale || 'No summary was generated.'}
          </p>

          {Object.keys(breakdown).length > 0 && (
            <div className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {Object.entries(breakdown).map(([key, value]) => {
                const meta = BREAKDOWN_LABEL[key] ?? { label: key, hint: 'Contribution to the trust score.' }
                const v = Math.max(0, Math.min(100, Math.round(value)))
                const barColor = v >= 70 ? 'bg-emerald-400' : v >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-[118px] shrink-0 truncate text-[11px] font-semibold text-slate-400" title={meta.hint}>
                      {meta.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${v}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[10.5px] font-bold text-slate-400">{v}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabs Selector Bar */}
      <div className="flex border-b border-slate-800 gap-6 overflow-x-auto select-none no-print">
        {(['overview', 'citations', 'compliance', 'logs'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-xs font-semibold capitalize transition-all border-b-2 -mb-[2px] ${
              activeTab === tab
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="min-h-[220px] transition-all duration-200">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  License
                  <Info text="The usage terms shown on the dataset page. 'Missing' means reuse/redistribution terms are undefined — treat as risky." />
                </span>
                <p className={`text-sm font-bold mt-1 ${report.metadata.license ? 'text-slate-100' : 'text-amber-400'}`}>
                  {report.metadata.license || 'Missing'}
                </p>
                {licenseInfo && (
                  <p className="mt-1 text-[11px] font-medium leading-snug text-slate-400">
                    <span
                      className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        licenseInfo.commercial ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30' : 'bg-rose-400/10 text-rose-300 border border-rose-400/30'
                      }`}
                    >
                      {licenseInfo.commercial ? 'Commercial OK' : 'No commercial'}
                    </span>
                    {licenseInfo.blurb}
                  </p>
                )}
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  Uploaded
                  <Info text="Publish date from the dataset page, when available." />
                </span>
                <p className="text-sm font-bold text-slate-100 mt-1">
                  {report.metadata.upload_date
                    ? /^\d{4}-\d{2}-\d{2}/.test(String(report.metadata.upload_date))
                      ? String(report.metadata.upload_date).slice(0, 10)
                      : String(report.metadata.upload_date)
                    : 'Unknown'}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  Files Checked
                  <Info text="Files listed on the dataset page at audit time." />
                </span>
                <p className={`text-sm font-bold mt-1 ${report.metadata.files.length > 0 ? 'text-slate-100' : 'text-amber-400'}`}>
                  {report.metadata.files.length} {report.metadata.files.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  Columns
                  <Info text="Column (field) names detected on the dataset page — tells you what each record contains." />
                </span>
                <p className={`text-sm font-bold mt-1 ${effectiveColumns.length > 0 ? 'text-slate-100' : 'text-amber-400'}`}>
                  {effectiveColumns.length} detected
                </p>
              </div>
            </div>

            {report.metadata.files.length === 0 && (
              <Note>
                <b>Why does “Files Checked” show 0?</b> Kaggle did not expose a file list for this page — usually bot
                protection or a listing without public file metadata. This is not an error: every agent still audited
                all public information (title, description, tags, citations). Try re-running later or checking the
                page manually.
              </Note>
            )}

            {/* File inspection: what the auditor actually opened and checked */}
            {report.file_inspection && report.file_inspection.checks && report.file_inspection.checks.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-[#0c1320]/80 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">File Inspection</span>
                  <span className="font-mono text-[10.5px] text-slate-500">
                    {report.file_inspection.files_checked ?? 0} files · {effectiveColumns.length} cols
                    {report.file_inspection.rows_sampled != null ? ` · ${report.file_inspection.rows_sampled} rows sampled` : ''}
                    {report.file_inspection.headers_verified ? ' · headers verified' : ''}
                  </span>
                </div>
                <div className="space-y-1">
                  {report.file_inspection.checks.map((check, i) => {
                    const tone =
                      check.result === 'pass'
                        ? { icon: '✓', cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30' }
                        : check.result === 'warning'
                          ? { icon: '!', cls: 'text-amber-300 bg-amber-400/10 border-amber-400/30' }
                          : check.result === 'mismatch'
                            ? { icon: '×', cls: 'text-rose-300 bg-rose-400/10 border-rose-400/30' }
                            : { icon: '–', cls: 'text-slate-400 bg-white/5 border-white/10' }
                    return (
                      <div key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-black ${tone.cls}`}>
                          {tone.icon}
                        </span>
                        <span className="font-semibold text-slate-200">{check.check}</span>
                        <span className="text-slate-400">{check.detail}</span>
                      </div>
                    )
                  })}
                </div>
                {report.file_inspection.pii_columns && report.file_inspection.pii_columns.length > 0 && (
                  <p className="mt-2 rounded-lg bg-rose-400/10 border border-rose-400/30 px-3 py-2 text-[11px] font-medium text-rose-300">
                    Possible PII columns detected: {report.file_inspection.pii_columns.join(', ')} — review before sharing this dataset onward.
                  </p>
                )}
              </div>
            )}

            {/* Dataset Schema Table with PII detection */}
            {effectiveColumns.length > 0 && (
              <SchemaTable
                columns={effectiveColumns}
                dataProfile={report.data_profile ?? null}
                isPartial={
                  report.data_profile?.rows_profiled != null &&
                  report.data_profile.rows_profiled < 1000
                }
              />
            )}

            {/* Real content profile — stats computed from actually downloaded rows */}
            {report.data_profile && (report.data_profile.rows_profiled || report.data_profile.skip_reason) && (
              <div className="rounded-xl border border-slate-800 bg-[#0c1320]/80 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Data Profile</span>
                  <span className="font-mono text-[10.5px] text-slate-500">
                    {report.data_profile.rows_profiled
                      ? `${report.data_profile.rows_profiled} real rows · via ${report.data_profile.source_used}`
                      : 'not available for this source'}
                  </span>
                </div>

                {report.data_profile.rows_profiled ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <StatBox
                        label="Duplicate rows"
                        value={`${report.data_profile.duplicate_pct ?? 0}%`}
                        tone={(report.data_profile.duplicate_pct ?? 0) >= 2 ? 'warn' : 'ok'}
                        sub={`${report.data_profile.duplicate_rows ?? 0} exact matches`}
                      />
                      <StatBox
                        label="Missing cells"
                        value={`${report.data_profile.missing_total_pct ?? 0}%`}
                        tone={(report.data_profile.missing_total_pct ?? 0) >= 5 ? 'warn' : 'ok'}
                        sub="across all columns"
                      />
                      {report.data_profile.class_balance && (
                        <StatBox
                          label={`Class balance · ${report.data_profile.class_balance.column}`}
                          value={`${report.data_profile.class_balance.minority_pct ?? 0}%`}
                          tone={(report.data_profile.class_balance.minority_pct ?? 100) < 10 ? 'warn' : 'ok'}
                          sub="smallest class share"
                        />
                      )}
                    </div>

                    {(report.data_profile.numeric_summary?.length ?? 0) > 0 && (
                      <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left">
                          <thead className="sticky top-0 bg-[#0d1524]">
                            <tr className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-1.5 font-bold">Numeric column</th>
                              <th className="px-3 py-1.5 font-bold">Min</th>
                              <th className="px-3 py-1.5 font-bold">Mean</th>
                              <th className="px-3 py-1.5 font-bold">Max</th>
                              <th className="px-3 py-1.5 font-bold">Missing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {report.data_profile.numeric_summary!.map((s) => (
                              <tr key={s.column} className="font-mono text-[10.5px] text-slate-300">
                                <td className="max-w-[140px] truncate px-3 py-1.5 font-semibold text-slate-100">{s.column}</td>
                                <td className="px-3 py-1.5">{s.min}</td>
                                <td className="px-3 py-1.5">{s.mean}</td>
                                <td className="px-3 py-1.5">{s.max}</td>
                                <td className={`px-3 py-1.5 ${(s.missing_pct ?? 0) > 0 ? 'text-amber-400' : ''}`}>{s.missing_pct ?? 0}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {report.data_profile.class_balance && (
                      <div className="mt-3 space-y-1.5">
                        {report.data_profile.class_balance.values.slice(0, 6).map((v) => {
                          const maxCount = Math.max(...report.data_profile!.class_balance!.values.map((x) => x.count), 1)
                          return (
                            <div key={v.value} className="flex items-center gap-2">
                              <span className="w-32 shrink-0 truncate text-right font-mono text-[10px] text-slate-400">{v.value}</span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                                <div className="h-full rounded-full bg-teal-400" style={{ width: `${(v.count / maxCount) * 100}%` }} />
                              </div>
                              <span className="w-10 shrink-0 font-mono text-[10px] text-slate-500">{v.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11.5px] leading-snug text-slate-400">
                    {report.data_profile.skip_reason || 'This source does not expose downloadable rows.'} The audit ran on
                    page metadata, filenames and column listings instead.
                  </p>
                )}
              </div>
            )}

            {effectiveColumns.length > 0 && (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block mb-2">Dataset Columns</span>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveColumns.map((col) => (
                    <span key={col} className="font-mono text-[10px] font-medium text-slate-300 bg-white/[0.04] border border-slate-700 px-2 py-1 rounded-md">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.metadata.tags.length > 0 && (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block mb-2">Metadata Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {report.metadata.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-medium text-slate-400 bg-white/[0.04] border border-slate-700 px-2 py-0.5 rounded-md">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block mb-2">Scraped Files List</span>
              {report.metadata.files.length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-white/[0.03] p-3 divide-y divide-white/5">
                  {report.metadata.files.map((file, i) => (
                    <div key={i} className="py-1.5 font-mono text-[10px] text-slate-400">
                      {file}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="No file names were exposed by the source page." />
              )}
            </div>
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="space-y-8">
            {/* Citation Trail */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Verification Trail</h3>
              {report.citation_trail.length === 0 ? (
                <Empty text="No citing papers verified." />
              ) : (
                <div className="space-y-3">
                  {report.citation_trail.map((citation, i) => {
                    const retraction = RETRACTION_LABEL[citation.retraction_status] ?? RETRACTION_LABEL.unknown
                    return (
                      <div key={i} className="p-4 rounded-xl border border-slate-800 hover:border-slate-600 bg-[#0c1320]/80 flex items-center justify-between gap-4 transition-all">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100 truncate">{citation.paper_title}</p>
                          {citation.doi && (
                            <a
                              href={`https://doi.org/${citation.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-mono text-slate-500 hover:text-cyan-300 hover:underline mt-1 inline-block"
                            >
                              doi:{citation.doi}
                            </a>
                          )}
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-bold tracking-wider ${retraction.style}`}>
                          {retraction.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Related Research */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Related Research</h3>
              {report.related_work.papers.length === 0 ? (
                <Empty text="No related research papers." />
              ) : (
                <div className="space-y-2">
                  {report.related_work.papers.map((paper, i) => (
                    <div key={i} className="p-3 rounded-lg border border-slate-800 bg-[#0c1320]/60 text-xs flex justify-between items-center gap-4">
                      {paper.url ? (
                        <a href={paper.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-200 hover:text-cyan-200 truncate hover:underline">
                          {paper.title}
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-300 truncate">{paper.title}</span>
                      )}
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {paper.year}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-8">
            {/* Consent Flags */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">License & Consent Indicators</h3>
              {report.consent_flags.length === 0 ? (
                <Empty text="No license or consent concerns flagged." />
              ) : (
                <div className="space-y-3">
                  {report.consent_flags.map((flag, i) => (
                    <div key={i} className="p-4 rounded-xl border border-slate-800 bg-[#0c1320]/80 space-y-1">
                      <div className="flex justify-between items-center gap-3">
                        <p className="text-xs font-semibold text-slate-100">{flag.finding}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[flag.severity ?? 'info']}`}>
                          {flag.severity}
                        </span>
                      </div>
                      {flag.evidence && <p className="text-[11px] text-slate-400 leading-normal">{flag.evidence}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Originality Flags */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Originality Checks</h3>
              {report.duplication_flags.length === 0 ? (
                <Empty text="No duplication markers discovered." />
              ) : (
                <div className="space-y-3">
                  {report.duplication_flags.map((flag, i) => (
                    <div key={i} className="p-4 rounded-xl border border-slate-800 bg-[#0c1320]/80 space-y-1">
                      <div className="flex justify-between items-center gap-3">
                        <p className="text-xs font-semibold text-slate-100">{flag.finding}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[flag.severity ?? 'info']}`}>
                          {flag.severity}
                        </span>
                      </div>
                      {flag.evidence && <p className="text-[11px] text-slate-400 leading-normal">{flag.evidence}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Audit Trace logs</h3>
            <div className="bg-[#05080f] border border-slate-800 rounded-xl p-4 max-h-80 overflow-y-auto space-y-1.5 font-mono text-[10px] text-slate-400">
              {report.evidence_log.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-600 font-bold shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <LinkedText text={line} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-slate-500 font-medium italic">{text}</p>
}

/* Compact stat tile used in the Data Profile card. */
function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: 'ok' | 'warn'
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'ok' ? 'border-slate-800 bg-white/[0.04]' : 'border-amber-400/30 bg-amber-400/10'}`}>
      <p className="truncate text-[9.5px] font-bold uppercase tracking-wider text-slate-500" title={label}>{label}</p>
      <p className={`mt-0.5 text-lg font-light leading-none ${tone === 'ok' ? 'text-slate-100' : 'text-amber-300'}`}>{value}</p>
      {sub && <p className="mt-1 text-[10px] font-medium text-slate-500">{sub}</p>}
    </div>
  )
}

/* Hover tooltip that explains what a metric means.
   Uses a display toggle (not opacity) so it never flashes on load or
   leaks into copied text, and resets inherited uppercase/tracking. */
function Info({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex cursor-help align-middle" tabIndex={0}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#64748b"
        strokeWidth="2.2"
        className="transition-colors group-hover:stroke-slate-400"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M12 11v5" strokeLinecap="round" />
      </svg>
      <span className="normal-case tracking-normal pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-60 -translate-x-1/2 rounded-lg border border-slate-700 bg-[#0a0f1a] px-3 py-2 text-[11px] font-medium leading-snug text-slate-100 shadow-xl group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  )
}

/* Soft explanatory callout used for things like the zero-files case. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
      <p className="text-[12px] leading-relaxed text-amber-200">{children}</p>
    </div>
  )
}

function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)\]]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
