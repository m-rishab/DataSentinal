const steps = [
  { n: '01', title: 'Paste a dataset URL', desc: 'Drop any Kaggle, Hugging Face, or public dataset URL into the form.' },
  { n: '02', title: 'Agents run in parallel', desc: 'LangGraph orchestrates consent, citation, duplication, and related-work agents.' },
  { n: '03', title: 'Get a trust score', desc: 'A 0–100 trust score with flags, citations, and an auditor rationale.' },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-8">
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-slate-800 bg-[#0c1320]/80 px-4 py-3">
            <p className="font-display text-lg font-semibold italic text-cyan-300">{s.n}</p>
            <h3 className="mt-1 text-[13px] font-bold text-slate-100">{s.title}</h3>
            <p className="mt-1 text-[12px] leading-snug text-slate-500">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
