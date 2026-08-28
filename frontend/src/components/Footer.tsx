import Logo from './Logo'

export default function Footer() {
  return (
    <footer style={{ background: 'var(--color-surface)' }}>
      <div className="rule-fade" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="font-display text-[0.875rem] font-bold" style={{ color: 'var(--color-primary)' }}>
            DataSentinel
          </span>
          <span className="hidden font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted sm:inline">
            Dataset Provenance Watchdog
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-5" aria-label="Footer">
          <a href="#api" className="text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary">
            API & CI gate
          </a>
          <a href="#top" className="text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary">
            Top
          </a>
          <a
            href="https://github.com/m-rishab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary"
          >
            GitHub
          </a>
        </nav>

        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
          © {new Date().getFullYear()} · LangGraph + NVIDIA
        </p>
      </div>
    </footer>
  )
}