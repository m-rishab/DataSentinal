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
        className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-[#0a0f1a]/90 p-2 shadow-[0_14px_44px_rgba(2,6,16,0.5)] backdrop-blur transition-all focus-within:border-cyan-400/60 focus-within:shadow-[0_14px_48px_rgba(34,211,238,0.16)] sm:flex-row sm:items-center"
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kaggle.com/datasets/owner/dataset-slug"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-sm font-medium text-slate-100 placeholder:text-slate-500 outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-6 py-3 text-sm font-bold text-[#04121c] shadow-[0_6px_18px_rgba(34,211,238,0.35)] transition-all hover:brightness-110 hover:shadow-[0_8px_26px_rgba(34,211,238,0.5)] active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100"
        >
          {mutation.isPending ? 'Starting…' : 'Run Audit'}
        </button>
      </form>

      {mutation.isError && (
        <p className="mt-2 text-sm font-semibold text-rose-300">{(mutation.error as Error).message}</p>
      )}

      <button
        type="button"
        onClick={() => setUrl(EXAMPLE)}
        className="mt-2 text-[12px] font-semibold text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-200"
      >
        Use an example dataset URL
      </button>
    </div>
  )
}
