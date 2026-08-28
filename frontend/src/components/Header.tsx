import { useMemo } from 'react'
import Logo from './Logo'

export type ShellPhase = 'landing' | 'running' | 'graph' | 'report'

interface HeaderProps {
  compact: boolean
  phase: ShellPhase
  onHome: () => void
  onViewGraph?: () => void
  onFeedback?: () => void
}

/* Contextual product navigation. There is no router — these items set the
   app phase through App. Items that need a run are disabled until one exists. */
export default function Header({ compact, phase, onHome, onViewGraph, onFeedback }: HeaderProps) {
  const inShell = compact

  const nav = useMemo(() => {
    const items: { key: string; label: string; onClick?: () => void; enabled: boolean; active: boolean; anchor?: string }[] = []
    if (inShell) {
      items.push(
        { key: 'audits', label: 'Audits', onClick: onHome, enabled: true, active: phase === 'landing' },
        {
          key: 'graph',
          label: 'Audit Graph',
          onClick: onViewGraph,
          enabled: !!onViewGraph,
          active: phase === 'running' || phase === 'graph',
        },
        {
          key: 'report',
          label: 'Report',
          onClick: onHome,
          enabled: phase === 'report',
          active: phase === 'report',
        },
      )
    } else {
      items.push(
        { key: 'dashboard', label: 'Dashboard', anchor: '#top', enabled: true, active: false },
        { key: 'api', label: 'API', anchor: '#api', enabled: true, active: false },
      )
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inShell, phase, onHome, onViewGraph])

  return (
    <header
      className={
        inShell
          ? 'relative z-40 border-b'
          : 'absolute left-0 top-0 z-40 w-full'
      }
      style={{
        background: inShell ? 'var(--color-surface)' : 'transparent',
        borderColor: 'var(--color-line)',
      }}
    >
      <div className="mx-auto flex h-[52px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <button
          type="button"
          onClick={onHome}
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="DataSentinel home"
        >
          <Logo size={inShell ? 24 : 26} className="transition-transform duration-200 group-hover:scale-[1.03]" />
          <span className="font-display text-[1.02rem] font-bold tracking-tight" style={{ color: 'var(--color-primary)' }}>
            DataSentinel
          </span>
          {!inShell && (
            <span className="hidden font-mono text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-muted sm:inline">
              Provenance Watchdog
            </span>
          )}
        </button>

        {/* Nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Product navigation">
          {nav.map((item) =>
            item.anchor ? (
              <a
                key={item.key}
                href={item.anchor}
                className="rounded-md px-3 py-1.5 text-[0.8125rem] font-medium text-secondary transition-colors hover:text-primary"
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                disabled={!item.enabled}
                aria-current={item.active ? 'page' : undefined}
                className="relative rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  color: item.active ? 'var(--color-primary)' : 'var(--color-secondary)',
                }}
              >
                {item.label}
                {item.active && (
                  <span
                    className="absolute left-3 right-3 -bottom-[1px] h-px"
                    style={{ background: 'var(--color-accent)' }}
                    aria-hidden="true"
                  />
                )}
              </button>
            ),
          )}
        </nav>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {inShell && phase !== 'landing' && (
            <span className="hidden font-mono text-[0.6875rem] text-muted sm:block" title="Active run">
              audit session
            </span>
          )}
          <button
            type="button"
            onClick={onHome}
            className="btn btn-primary hidden px-3.5 py-1.5 sm:inline-flex"
          >
            New Audit
          </button>
          {onFeedback && (
            <button
              type="button"
              onClick={onFeedback}
              aria-label="Send feedback"
              className="btn btn-ghost px-2 py-1.5"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}