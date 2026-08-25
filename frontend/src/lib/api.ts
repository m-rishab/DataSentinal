import type { AuditReport, LiveMetadataResponse, RunSummary, SSEEvent } from './types'

const BASE = ''  // relative URLs — Vite proxy in dev, same-origin in production

export async function startAudit(url: string, failUnder?: number | null): Promise<{ run_id: string; fail_under?: number | null }> {
  const res = await fetch(`${BASE}/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(failUnder != null ? { url, fail_under: failUnder } : { url }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail?.[0]?.msg || body.detail || `Failed to start audit (HTTP ${res.status})`)
  }
  return res.json()
}

export async function fetchReport(runId: string): Promise<AuditReport> {
  const res = await fetch(`${BASE}/audit/${runId}/report`)
  if (res.status === 202) throw new Error('Report not ready')
  if (!res.ok) throw new Error(`Failed to load report (HTTP ${res.status})`)
  return res.json()
}

export async function fetchLiveMetadata(runId: string): Promise<LiveMetadataResponse> {
  const res = await fetch(`${BASE}/audit/${runId}/metadata`)
  if (!res.ok) throw new Error(`Failed to load metadata (HTTP ${res.status})`)
  return res.json()
}

export async function fetchRuns(limit = 50): Promise<RunSummary[]> {
  const res = await fetch(`${BASE}/runs?limit=${limit}`)
  if (!res.ok) throw new Error(`Failed to load runs (HTTP ${res.status})`)
  const body = await res.json()
  return body.runs ?? []
}

export function openAuditStream(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`${BASE}/audit/${runId}/stream`)
  const close = () => source.close()
  source.addEventListener('progress', (e) => {
    try {
      const event = JSON.parse((e as MessageEvent).data) as SSEEvent
      onEvent(event)
      // Terminal events — the server closes the stream now, so stop here
      // before the browser's auto-reconnect kicks in.
      if (event.status === 'done' || event.status === 'failed') close()
    } catch {
      // ignore malformed frames
    }
  })
  source.onerror = () => {
    // Transient drops auto-reconnect (the server replays buffered events),
    // so stay quiet unless the connection is truly unrecoverable.
    if (source.readyState === EventSource.CLOSED) {
      onError()
      close()
    }
  }
  return close
}
