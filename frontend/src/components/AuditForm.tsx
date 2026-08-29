import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { startAudit } from '../lib/api'

const EXAMPLE = 'https://www.kaggle.com/datasets/uciml/iris'

interface AuditFormProps {
  onStart: (url: string, runId: string) => void
  /** Controlled URL — lets parent components inject example URLs. */
  url?: string
  onUrlChange?: (url: string) => void
  cta?: string
  size?: 'lg' | 'md'
  id?: string
}

export default function AuditForm({
  onStart,
  url: externalUrl,
  onUrlChange,
  cta = 'Audit Dataset',
  size = 'lg',
  id,
}: AuditFormProps) {
  const [internalUrl, setInternalUrl] = useState('')
  const url = externalUrl !== undefined ? externalUrl : internalUrl
  const setUrl = onUrlChange ?? setInternalUrl

  const mutation = useMutation({
    mutationFn: (targetUrl: string) => startAudit(targetUrl),
    onSuccess: (data) => onStart(url.trim(), data.run_id),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) mutation.mutate(url.trim())
  }

  return (
    <div id={id} className="w-full">
      <form
        onSubmit={submit}
        className="flex flex-col rounded-xl border bg-white p-1.5 shadow-[0_14px_40px_-18px_rgba(28,38,52,0.35)] sm:flex-row sm:items-center"
        style={{
          background: 'var(--color-surface)',
          borderColor: mutation.isError ? 'color-mix(in srgb, var(--color-error) 60%, transparent)' : 'var(--color-line)',
          transition: 'border-color 160ms cubic-bezier(0.4,0,0.2,1)',
        }}
        onFocusCapture={(e) => {
          if (!mutation.isError) {
            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 50%, transparent)'
          }
        }}
        onBlurCapture={(e) => {
          if (!mutation.isError) e.currentTarget.style.borderColor = 'var(--color-line)'
        }}
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kaggle.com/datasets/owner/dataset-slug"
          aria-label="Dataset URL"
          className="min-w-0 flex-1 rounded-lg bg-transparent px-4 font-medium outline-none placeholder:text-muted"
          style={{
            color: 'var(--color-primary)',
            fontSize: size === 'lg' ? '0.9375rem' : '0.875rem',
            paddingTop: size === 'lg' ? '0.925rem' : '0.75rem',
            paddingBottom: size === 'lg' ? '0.925rem' : '0.75rem',
          }}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !url.trim()}
          className="btn shrink-0"
          style={{
            background: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
            color: '#ffffff',
            fontSize: size === 'lg' ? '0.9375rem' : '0.875rem',
            padding: size === 'lg' ? '0.875rem 1.75rem' : '0.7rem 1.4rem',
          }}
        >
          {mutation.isPending && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin">
              <path d="M21 12a9 9 0 11-6.2-8.56" />
            </svg>
          )}
          {mutation.isPending ? 'Starting…' : cta}
        </button>
      </form>

      {mutation.isError && (
        <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--color-error)' }}>
          {(mutation.error as Error).message}
        </p>
      )}
    </div>
  )
}

export { EXAMPLE }