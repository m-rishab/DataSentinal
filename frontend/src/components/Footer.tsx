export default function Footer({ compact = false }: { compact?: boolean }) {
  const iconClass = 'text-slate-400 hover:text-slate-900 transition-colors'

  return (
    <footer className={`border-t border-slate-200 bg-white ${compact ? 'px-5 py-3' : 'px-5 py-6'}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="9" fill="#0e7490" />
            <path d="M16 7.5l7.5 3v6.2c0 4.4-3.1 7.4-7.5 8.8-4.4-1.4-7.5-4.4-7.5-8.8V10.5L16 7.5z" stroke="white" strokeWidth="1.7" fill="none" />
          </svg>
          <span className="font-display text-[13px] font-bold text-[#0c1a2b]">DataSentinel</span>
        </div>

        <div className="flex items-center gap-4">
          <a href="https://drive.google.com/file/d/1Rq0D3AITueDZdNEuksm3obFP22YQuaps/view?usp=sharing" target="_blank" rel="noopener noreferrer" className={iconClass} aria-label="CV">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-8h8v1.5H8V12zm0 3h8v1.5H8V15zm0-6h4v1.5H8V9z"/>
            </svg>
          </a>
          <a href="https://github.com/m-rishab" target="_blank" rel="noopener noreferrer" className={iconClass} aria-label="GitHub">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
          <p className="text-[11px] font-medium text-[#8a8176]">
            © {new Date().getFullYear()} · LangGraph + NVIDIA Nemotron
          </p>
        </div>
      </div>
    </footer>
  )
}
