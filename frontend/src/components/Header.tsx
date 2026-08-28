export default function Header({
  compact = false,
  onHome,
}: {
  compact?: boolean
  onHome?: () => void
}) {
  return (
      <header
        className={`z-50 border-b ${
          compact
            ? 'relative bg-[#0a0f1a]/95 border-slate-800/80'
            : 'absolute top-0 left-0 w-full bg-[#070b14]/80 backdrop-blur-md border-white/5'
        }`}
      >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2.5"
        >
          <span className="rounded-[9px] bg-gradient-to-br from-cyan-400 to-teal-500 p-[3px] shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="#0e7490" />
              <path
                d="M16 7.5l7.5 3v6.2c0 4.4-3.1 7.4-7.5 8.8-4.4-1.4-7.5-4.4-7.5-8.8V10.5L16 7.5z"
                stroke="white"
                strokeWidth="1.7"
                fill="none"
              />
              <path d="M12.2 16.1l2.4 2.4 5.2-5.4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-[1.08rem] font-bold tracking-tight text-slate-50">
            Data<span className="text-cyan-300">Sentinel</span>
          </span>
        </button>
        <span className="hidden sm:block text-[11px] font-semibold tracking-wide text-slate-500">
          Dataset Provenance Watchdog
        </span>
      </div>
    </header>
  )
}
