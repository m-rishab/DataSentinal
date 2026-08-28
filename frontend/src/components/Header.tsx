import { useMemo } from 'react'
import Logo from './Logo'

export type ShellPhase = 'landing' | 'running' | 'graph' | 'report'

interface HeaderProps {
  compact: boolean
  phase: ShellPhase
  onHome: () => void
  onViewGraph?: () => void
}

/* Minimal product navigation. Landing: subtle anchor links + GitHub.
   Shell (live/report): contextual Audit Graph / Report / Audits. */
export default function Header({ compact, phase, onHome, onViewGraph }: HeaderProps) {
  const inShell = compact

  const shellNav = useMemo(() => {
    return [
      { key: 'audits', label: 'Audits', onClick: onHome, enabled: true, active: false },
      { key: 'graph', label: 'Audit Graph', onClick: onViewGraph, enabled: !!onViewGraph, active: phase === 'graph' },
      { key: 'report', label: 'Report', onClick: onHome, enabled: phase === 'report', active: phase === 'report' },
    ]
  }, [phase, onHome, onViewGraph])

  const landingNav = [
    { key: 'product', label: 'Product', anchor: '#top' },
    { key: 'how', label: 'How it Works', anchor: '#how-it-works' },
    { key: 'reports', label: 'Reports', anchor: '#reports' },
    { key: 'api', label: 'API', anchor: '#api' },
  ]

  return (
    <header
      className={inShell ? 'relative z-40 border-b' : 'absolute left-0 top-0 z-40 w-full'}
      style={{ background: inShell ? 'var(--color-surface)' : 'transparent', borderColor: 'var(--color-line)' }}
    >
      <div className="mx-auto flex h-[54px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <button type="button" onClick={onHome} className="group flex shrink-0 items-center gap-2.5" aria-label="DataSentinel home">
          <Logo size={22} className="transition-transform duration-200 group-hover:scale-[1.03]" />
          <span className="font-display text-[0.9875rem] font-bold tracking-tight" style={{ color: 'var(--color-primary)' }}>
            DataSentinel
          </span>
        </button>

        {/* Landing nav — deliberately quiet */}
        {!inShell && (
          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {landingNav.map((item) => (
              <a key={item.key} href={item.anchor} className="rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary">
                {item.label}
              </a>
            ))}
            <a href="https://github.com/m-rishab" target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary">
              GitHub
            </a>
          </nav>
        )}

        {/* Shell nav — contextual product navigation */}
        {inShell && (
          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Product">
            {shellNav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                disabled={!item.enabled}
                aria-current={item.active ? 'page' : undefined}
                className="relative rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: item.active ? 'var(--color-primary)' : 'var(--color-secondary)' }}
              >
                {item.label}
                {item.active && <span className="absolute bottom-0 left-2.5 right-2.5 h-px" style={{ background: 'var(--color-accent)' }} aria-hidden="true" />}
              </button>
            ))}
          </nav>
        )}

        <button type="button" onClick={onHome} className="btn btn-primary hidden px-3.5 py-1.5 sm:inline-flex">
          New Audit
        </button>
      </div>
    </header>
  )
}