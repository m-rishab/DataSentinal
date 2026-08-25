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
        className="pointer-events-none absolute -top-24 right-[-8%] h-[380px] w-[380px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #5eead4 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-[-10%] left-[-6%] h-[300px] w-[300px] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #a5b4fc 0%, transparent 70%)' }}
      />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/70 px-3 py-1 text-[11px] font-semibold text-[#0c6478] shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-600" />
          </span>
          LangGraph + NVIDIA Nemotron
        </div>

        <h1 className="font-display max-w-3xl text-[clamp(2.1rem,5.4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-[#0c1a2b]">
          Know the{' '}
          <span className="bg-gradient-to-r from-[#0e7490] via-[#0f766e] to-[#4f46e5] bg-clip-text text-transparent">
            truth behind
          </span>{' '}
          every dataset.
        </h1>

        <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-[#44403a]">
          Audit license compliance, citation trails, and originality for any public dataset — live, in one pass.
        </p>

        <div className="mt-6">
          <AuditForm onStart={onStart} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:border-cyan-300 hover:shadow-[0_8px_24px_rgba(6,182,212,0.12)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  {s.icon}
                </svg>
              </span>
              <div>
                <p className="text-[13px] font-bold text-[#0c1a2b]">
                  <span className="mr-1.5 font-mono text-[11px] font-semibold text-[#0e7490]">{s.n}</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
