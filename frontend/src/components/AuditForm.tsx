import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { startAudit } from '../lib/api'

const EXAMPLE = 'https://www.kaggle.com/datasets/uciml/iris'

export default function AuditForm({ onStart }: { onStart: (url: string, runId: string) => void }) {
  const [url, setUrl] = useState('')

  const mutation = useMutation({
    mutationFn: (targetUrl: string) => startAudit(targetUrl),
    onSuccess: (data) => onStart(url.trim(), data.run_id),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) mutation.mutate(url.trim())
  }

  return (
    <div id="audit" className="w-full">
      <form
        onSubmit={submit}
        className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_14px_44px_rgba(15,23,42,0.08)] transition-shadow focus-within:border-cyan-400 focus-within:shadow-[0_14px_48px_rgba(6,182,212,0.16)] sm:flex-row sm:items-center"
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kaggle.com/datasets/owner/dataset-slug"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(6,182,212,0.30)] transition-all hover:brightness-110 hover:shadow-[0_8px_24px_rgba(6,182,212,0.40)] active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100"
        >
          {mutation.isPending ? 'Starting…' : 'Run Audit'}
        </button>
      </form>

      {mutation.isError && (
        <p className="mt-2 text-sm font-semibold text-rose-700">{(mutation.error as Error).message}</p>
      )}

      <button
        type="button"
        onClick={() => setUrl(EXAMPLE)}
        className="mt-2 text-[12px] font-semibold text-[#0e7490] underline decoration-dotted underline-offset-2 hover:text-[#0f5f75]"
      >
        Use an example dataset URL
      </button>
    </div>
  )
}
