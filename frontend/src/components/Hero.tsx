import AuditForm from './AuditForm'

const steps = [
  {
    n: '01',
    title: 'Paste a dataset URL',
    body: 'Kaggle, Hugging Face, or any public listing.',
    icon: (
      <path
        d="M7 8.5A1.5 1.5 0 018.5 7h7A1.5 1.5 0 0117 8.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 15.5v-7zM3.5 10v3a1 1 0 01-1-1v-1a1 1 0 011-1zM20 11v3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    n: '02',
    title: 'Agents run in parallel',
    body: 'License, citations, originality, related work.',
    icon: (
      <>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="6" r="2.4" />
        <circle cx="6" cy="18" r="2.4" />
        <circle cx="18" cy="18" r="2.4" />
        <path d="M8.2 7.3l7.6 2M8 17.8l8-9.6M7.4 8.2l9.2 7.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    n: '03',
    title: 'Read the trust score',
    body: 'A 0–100 score with flags and evidence.',
    icon: (
      <path
        d="M12 3.5l6.7 2.6v4.6c0 4-2.8 6.7-6.7 8-3.9-1.3-6.7-4-6.7-8V6.1L12 3.5zM9.2 12.1l2.1 2.1 3.9-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

export default function Hero({ onStart }: { onStart: (url: string, runId: string) => void }) {
  return (
    <section className="relative flex min-h-full flex-col justify-center px-5 pt-20 pb-6">
      <div
        className="orb-drift pointer-events-none absolute -top-24 right-[-8%] h-[380px] w-[380px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)' }}
      />
      <div
        className="orb-drift pointer-events-none absolute bottom-[-10%] left-[-6%] h-[300px] w-[300px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)', animationDelay: '-4.5s' }}
      />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
          </span>
          LangGraph · NVIDIA Nemotron
        </div>

        <h1 className="font-editorial max-w-3xl text-[clamp(2.7rem,6.2vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.015em] text-[#f2edd8]">
          Know the <em className="text-glow font-semibold not-italic">truth</em> behind{' '}
          <em className="font-black italic text-slate-50">every dataset.</em>
        </h1>

        <p className="mt-5 max-w-xl text-[16.5px] font-normal leading-[1.7] text-slate-400">
          Audit license compliance, citation trails, and originality for any public dataset — live, in one pass.
        </p>

        <div className="mt-7">
          <AuditForm onStart={onStart} />
        </div>

        <div className="rule-fade mt-8 flex items-center justify-between gap-3 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <span>07 parallel agents · live stream</span>
          <span className="hidden text-slate-400 sm:inline">OpenAlex · NVIDIA Nemotron</span>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="group flex items-start gap-3 rounded-2xl border border-slate-800 bg-[#0c1320]/80 px-3.5 py-3 backdrop-blur transition-all hover:border-cyan-400/40 hover:shadow-[0_8px_28px_rgba(34,211,238,0.15)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 text-white shadow-[0_0_14px_rgba(34,211,238,0.35)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  {s.icon}
                </svg>
              </span>
              <div>
                <p className="text-[13px] font-bold text-slate-100">
                  <span className="mr-1.5 font-mono text-[11px] font-semibold text-cyan-300">{s.n}</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll hint — the editorial nudge to keep going down. */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1.5 sm:flex">
        <span className="scroll-hint font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">
          Scroll
        </span>
        <svg
          className="scroll-hint text-cyan-300"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  )
}
