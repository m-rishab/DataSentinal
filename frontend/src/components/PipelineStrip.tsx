/* Editorial numbered pipeline strip for the landing page.
   Rows mirror the live graph's seven nodes; clicking one scrolls
   up to the audit form. Styled after the Midnight-Studio service rows:
   mono numbers, display titles, hairline rules, arrow-nudge on hover. */

const ROWS = [
  { n: '01', title: 'Ingest', sub: 'Pulls the public dataset page — title, license, tags, columns, files.' },
  { n: '02', title: 'Consent & License', sub: 'Reads the license and scans the listing for consent / PII language.' },
  { n: '03', title: 'Citation Tracer', sub: 'Finds citing papers via OpenAlex, then checks DOIs against Crossref.' },
  { n: '04', title: 'Duplication Check', sub: 'Screens description and filenames for copy-paste and re-upload residue.' },
  { n: '05', title: 'Related Work', sub: 'Surfaces peer papers and alternative open datasets for context.' },
  { n: '06', title: 'Critic Aggregator', sub: 'Weighs every agent’s evidence and computes the 0–100 trust score.' },
  { n: '07', title: 'Report Generator', sub: 'Compiles flags, citations and logs into a shareable report.' },
]

function scrollToAudit() {
  document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export default function PipelineStrip() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 pt-16 pb-20">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">
            ✦ How an audit runs
          </p>
          <h2 className="font-display mt-2 text-[26px] font-bold tracking-tight text-slate-50">
            Seven agents. One verdict.
          </h2>
        </div>
        <span className="hidden pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 md:block">
          07 nodes · pipelined
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1320]/60 backdrop-blur divide-y divide-white/5">
        {ROWS.map((r) => (
          <button
            key={r.n}
            type="button"
            onClick={scrollToAudit}
            className="pipeline-row flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-white/[0.025] sm:gap-8"
          >
            <span className="w-7 shrink-0 font-mono text-[12px] font-bold tabular-nums text-teal-400">
              {r.n}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-[14.5px] font-semibold text-slate-100">
                {r.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                {r.sub}
              </span>
            </span>
            <span className="pipeline-arrow grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10">
              <svg
                className="pipeline-arrow-svg text-slate-500 transition-colors duration-300"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
        Paste a URL above and watch all seven run live
      </p>
    </section>
  )
}