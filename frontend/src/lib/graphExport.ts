/* Dependency-free PNG snapshot of the workflow graph.
   Builds an SVG string mirroring the live layout, then rasterizes it
   through an offscreen canvas at 2x for crisp output. */

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
type RetryState = 'none' | 'active' | 'done'

interface StepDef {
  node: string
  label: string
  kicker: string
  x: number
  y: number
  w: number
  h: number
}

const STAGE_W = 1000
const STAGE_H = 520

const STEPS: StepDef[] = [
  { node: 'ingest', label: 'Ingest', kicker: '01 · SOURCE', x: 120, y: 260, w: 168, h: 64 },
  { node: 'consent_agent', label: 'Consent & License', kicker: '02 · RIGHTS', x: 400, y: 70, w: 188, h: 64 },
  { node: 'citation_tracer', label: 'Citation Tracer', kicker: '03 · PAPERS', x: 400, y: 196, w: 188, h: 64 },
  { node: 'duplication_agent', label: 'Duplication Check', kicker: '04 · ORIGINALITY', x: 400, y: 324, w: 188, h: 64 },
  { node: 'related_work_agent', label: 'Related Work', kicker: '05 · CONTEXT', x: 400, y: 450, w: 188, h: 64 },
  { node: 'critic_aggregator', label: 'Critic Aggregator', kicker: '06 · SCORE', x: 720, y: 196, w: 188, h: 64 },
  { node: 'report_generator', label: 'Report Generator', kicker: '07 · OUTPUT', x: 720, y: 360, w: 188, h: 64 },
]

const CONNECTIONS: [string, string][] = [
  ['ingest', 'consent_agent'],
  ['ingest', 'citation_tracer'],
  ['ingest', 'duplication_agent'],
  ['ingest', 'related_work_agent'],
  ['consent_agent', 'critic_aggregator'],
  ['citation_tracer', 'critic_aggregator'],
  ['duplication_agent', 'critic_aggregator'],
  ['related_work_agent', 'critic_aggregator'],
  ['critic_aggregator', 'report_generator'],
]

const RETRY_PATH = 'M 790 162 C 760 58, 520 44, 452 158'

const NODE_STYLE: Record<NodeStatus, { fill: string; stroke: string; dot: string }> = {
  pending: { fill: '#ffffff', stroke: '#e2e8f0', dot: '#cbd5e1' },
  running: { fill: '#ecfeff', stroke: '#22d3ee', dot: '#06b6d4' },
  completed: { fill: '#ecfdf5', stroke: '#6ee7b7', dot: '#10b981' },
  failed: { fill: '#fff1f2', stroke: '#fda4af', dot: '#f43f5e' },
}

function esc(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function buildGraphSvg(
  statuses: Record<string, NodeStatus>,
  durations: Record<string, number>,
  results: Record<string, string>,
  retryState: RetryState,
  runId: string,
): string {
  const S = 1.25
  const W = Math.round(STAGE_W * S)
  const H = Math.round(STAGE_H * S)

  const edges = CONNECTIONS.map(([fromId, toId]) => {
    const from = STEPS.find((s) => s.node === fromId)!
    const to = STEPS.find((s) => s.node === toId)!
    const d = bezier((from.x + from.w / 2) * S, from.y * S, (to.x - to.w / 2) * S, to.y * S)
    return `<path d="${d}" stroke="#cbd5e1" stroke-width="2" fill="none" marker-end="url(#arw)"/>`
  }).join('')

  const retry =
    retryState !== 'none'
      ? `<path d="${RETRY_PATH}" transform="scale(${S})" stroke="${retryState === 'active' ? '#06b6d4' : '#34d399'}" stroke-width="1.6" ${retryState === 'done' ? 'stroke-dasharray="5 5"' : ''} fill="none" opacity="0.9" marker-end="url(#arw)"/>`
      : ''

  const nodes = STEPS.map((step) => {
    const status = statuses[step.node] ?? 'pending'
    const c = NODE_STYLE[status]
    const x = (step.x - step.w / 2) * S
    const y = (step.y - step.h / 2) * S
    const w = step.w * S
    const h = step.h * S
    const secs = durations[step.node] ? `${Math.round(durations[step.node] / 100) / 10}s` : ''
    const result = status === 'completed' ? results[step.node] ?? '' : ''
    const kickerColor = status === 'pending' ? '#94a3b8' : c.dot
    return `
<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>
  <text x="${x + 16}" y="${y + 24}" font-family="ui-monospace, Menlo, monospace" font-size="11" fill="${kickerColor}">${esc(step.kicker)}${secs ? ` · ${secs}` : ''}</text>
  <text x="${x + 16}" y="${y + 44}" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(step.label)}</text>
  <circle cx="${x + w - 20}" cy="${y + 40}" r="5" fill="${c.dot}"/>
  ${result ? `<text x="${x + 16}" y="${y + h - 12}" font-family="ui-monospace, Menlo, monospace" font-size="10.5" fill="#64748b">${esc(result)}</text>` : ''}
</g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="arw" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
    <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#94a3b8"/>
  </marker>
</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="40" y="52" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#0f172a">DataSentinel audit graph</text>
<text x="40" y="76" font-family="ui-monospace, Menlo, monospace" font-size="13" fill="#94a3b8">run ${esc(runId)} · generated ${new Date().toLocaleString()}</text>
${edges}${retry}${nodes}
<rect x="0" y="${H - 34}" width="${W}" height="34" fill="#f8fafc"/>
<circle cx="44" cy="${H - 17}" r="4" fill="#cbd5e1"/><text x="54" y="${H - 13}" font-family="system-ui" font-size="11" fill="#64748b">Waiting</text>
<circle cx="140" cy="${H - 17}" r="4" fill="#06b6d4"/><text x="150" y="${H - 13}" font-family="system-ui" font-size="11" fill="#64748b">Running</text>
<circle cx="236" cy="${H - 17}" r="4" fill="#10b981"/><text x="246" y="${H - 13}" font-family="system-ui" font-size="11" fill="#64748b">Completed</text>
</svg>`
}

export function downloadGraphPng(
  statuses: Record<string, NodeStatus>,
  durations: Record<string, number>,
  results: Record<string, string>,
  retryState: RetryState,
  runId: string,
): void {
  const svg = buildGraphSvg(statuses, durations, results, retryState, runId)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width * 2
    canvas.height = img.height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return
      const pngUrl = URL.createObjectURL(pngBlob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `datasentinel-${runId}.png`
      a.click()
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }
  img.src = url
}

export type { NodeStatus, RetryState }
