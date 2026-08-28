/* React Flow + dagre pipeline graph for the live audit workflow.
   dagre computes the LR layout automatically, so there is no manual
   coordinate math and edges never cross by construction. Edges are
   smoothstep with colour/animation derived from the source node status:
   green completed · blue dashed running · gray waiting. */

import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import {
  Database,
  FileOutput,
  FileText,
  Fingerprint,
  Link2,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
export type RetryPhase = 'none' | 'active' | 'done'

interface StepDef {
  node: string
  label: string
  kicker: string
  icon: LucideIcon
}

interface StepData extends Record<string, unknown> {
  label: string
  kicker: string
  icon: LucideIcon
  status: NodeStatus
  duration?: number
  result?: string
  revealed: boolean
  selected: boolean
}

interface PipelineGraphProps {
  runId: string
  statuses: Record<string, NodeStatus>
  durations: Record<string, number>
  results: Record<string, string>
  retry: RetryPhase
  selectedNode: string | null
  onSelect: (node: string | null) => void
}

const STEPS: StepDef[] = [
  { node: 'ingest', label: 'Ingest', kicker: '01 · Source', icon: Database },
  { node: 'consent_agent', label: 'Consent & License', kicker: '02 · Rights', icon: ShieldCheck },
  { node: 'citation_tracer', label: 'Citation Tracer', kicker: '03 · Papers', icon: FileText },
  { node: 'duplication_agent', label: 'Duplication Check', kicker: '04 · Originality', icon: Fingerprint },
  { node: 'related_work_agent', label: 'Related Work', kicker: '05 · Context', icon: Link2 },
  { node: 'critic_aggregator', label: 'Critic Aggregator', kicker: '06 · Score', icon: Scale },
  { node: 'report_generator', label: 'Report Generator', kicker: '07 · Output', icon: FileOutput },
]

/* Edges excluding the dynamic retry loop, which is added at render time. */
const CONNECTIONS: { id: string; from: string; to: string }[] = [
  { id: 'e-ingest-consent', from: 'ingest', to: 'consent_agent' },
  { id: 'e-ingest-citation', from: 'ingest', to: 'citation_tracer' },
  { id: 'e-ingest-duplication', from: 'ingest', to: 'duplication_agent' },
  { id: 'e-ingest-related', from: 'ingest', to: 'related_work_agent' },
  { id: 'e-consent-critic', from: 'consent_agent', to: 'critic_aggregator' },
  { id: 'e-citation-critic', from: 'citation_tracer', to: 'critic_aggregator' },
  { id: 'e-duplication-critic', from: 'duplication_agent', to: 'critic_aggregator' },
  { id: 'e-related-critic', from: 'related_work_agent', to: 'critic_aggregator' },
  { id: 'e-critic-report', from: 'critic_aggregator', to: 'report_generator' },
]

/* Staggered reveal, mirroring the node-by-node build animation. */
const REVEAL: { t: number; id: string }[] = [
  { t: 80, id: 'ingest' },
  { t: 520, id: 'e-ingest-consent' },
  { t: 980, id: 'consent_agent' },
  { t: 1380, id: 'e-ingest-citation' },
  { t: 1840, id: 'citation_tracer' },
  { t: 2240, id: 'e-ingest-duplication' },
  { t: 2700, id: 'duplication_agent' },
  { t: 3100, id: 'e-ingest-related' },
  { t: 3560, id: 'related_work_agent' },
  { t: 4000, id: 'e-consent-critic' },
  { t: 4280, id: 'e-citation-critic' },
  { t: 4560, id: 'e-duplication-critic' },
  { t: 4840, id: 'e-related-critic' },
  { t: 5340, id: 'critic_aggregator' },
  { t: 5800, id: 'e-critic-report' },
  { t: 6260, id: 'report_generator' },
]

const NODE_W = 232
const NODE_H = 124

const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#64748b',
  running: '#22d3ee',
  completed: '#34d399',
  failed: '#fb7185',
}

/* Edges keep a soft draw-in on reveal but no neon halo — status is
   conveyed by the stroke colour alone. */
function edgeClass(status: NodeStatus, revealed: boolean, animated: boolean) {
  void status
  const draw = revealed && !animated ? 'edge-draw' : ''
  return draw
}

function parseResult(result?: string): { text: string; amber: boolean } | null {
  if (!result) return null
  const flags = result.match(/^(\d+)\s*flag/i)
  if (flags) {
    const n = Number(flags[1])
    return { text: result, amber: n > 0 }
  }
  return { text: result, amber: false }
}

function layoutPositions(): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    nodesep: 44,
    ranksep: 120,
    marginx: 32,
    marginy: 24,
  })
  STEPS.forEach((s) => g.setNode(s.node, { width: NODE_W, height: NODE_H }))
  CONNECTIONS.forEach((c) => g.setEdge(c.from, c.to))
  dagre.layout(g)

  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of g.nodes()) {
    const n = g.node(id)
    positions[id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 }
  }
  return positions
}

const EDGE_CONNECTIONS = CONNECTIONS.map((c) => ({
  id: c.id,
  from: c.from,
  to: c.to,
}))

function buildBaseEdges(): Edge[] {
  return EDGE_CONNECTIONS.map((c) => ({
    id: c.id,
    source: c.from,
    target: c.to,
    type: 'smoothstep',
    animated: false,
    className: '',
    style: {
      stroke: STATUS_COLORS.pending,
      strokeWidth: 2,
      opacity: 0,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: STATUS_COLORS.pending,
    },
  }))
}

/* ------------------------------------------------------------------ */
/* Custom node                                                         */
/* ------------------------------------------------------------------ */

function StepNode({ data }: NodeProps) {
  const d = data as StepData
  const { label, kicker, icon: Icon, status, duration, result, revealed, selected } = d
  const running = status === 'running'
  const completed = status === 'completed'
  const failed = status === 'failed'

  let glow: string
  let border = 'border-white/10'
  let kickerCls = 'text-slate-400'
  let iconCls = 'text-slate-400'
  let iconBg = 'bg-white/5'
  let dotCls = 'bg-slate-500'
  if (running) {
    glow = 'node-glow-running'
    border = 'border-cyan-400/50'
    kickerCls = 'text-cyan-200'
    iconCls = 'text-cyan-300'
    iconBg = 'bg-cyan-400/10'
    dotCls = 'bg-cyan-400'
  } else if (completed) {
    glow = 'node-glow-completed'
    border = 'border-emerald-400/35'
    kickerCls = 'text-emerald-300'
    iconCls = 'text-emerald-300'
    iconBg = 'bg-emerald-400/10'
    dotCls = 'bg-emerald-400'
  } else if (failed) {
    glow = 'node-glow-failed'
    border = 'border-rose-400/40'
    kickerCls = 'text-rose-300'
    iconCls = 'text-rose-300'
    iconBg = 'bg-rose-400/10'
    dotCls = 'bg-rose-400'
  } else {
    glow = 'node-glow-pending'
  }

  const badge = parseResult(result)

  return (
    <div
      className={`relative min-h-full rounded-xl border px-4 pb-3 pt-3.5 transition-all duration-300 hover:-translate-y-0.5 ${glow} ${
        selected ? 'ring-2 ring-cyan-400/40' : ''
      } ${border}`}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? undefined : 'scale(0.9)',
        background: 'linear-gradient(180deg, #131c2e 0%, #0d1422 100%)',
      }}
    >
      <Handle type="target" position={Position.Left} className="op-node-handle" />

      <div className="relative flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg} ring-1 ring-white/10 ${iconCls}`}
        >
          <Icon size={16} strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className={`block text-[10px] font-semibold uppercase tracking-[0.17em] ${kickerCls}`}>
            {kicker}
            {duration ? ` · ${(Math.round(duration / 100) / 10).toFixed(1)}s` : ''}
          </span>
          <span className="font-display mt-1 block truncate text-[15px] font-semibold leading-snug text-slate-50">
            {label}
          </span>
        </span>

        {running && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dotCls}`} />
          </span>
        )}
        {!running && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotCls}`} />}
      </div>

      {badge && !/^0\s*flag/i.test(badge.text) && (
        <div className="relative mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9.5px] font-medium ${
              badge.amber
                ? 'bg-amber-400/10 text-amber-300/90'
                : 'bg-white/5 text-slate-300/80 ring-1 ring-white/10'
            }`}
          >
            {badge.text}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="op-node-handle" />
    </div>
  )
}

const nodeTypes: NodeTypes = { step: StepNode }

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PipelineGraph({
  runId,
  statuses,
  durations,
  results,
  retry,
  selectedNode,
  onSelect,
}: PipelineGraphProps) {
  const base = useMemo(layoutPositions, [])

  /* Persisted manual overrides (React Flow drag) keyed per run. */
  const initial = useMemo(() => {
    const positions = { ...base }
    try {
      const raw = localStorage.getItem(`ds-pos-${runId}`)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, { x: number; y: number }>
        if (STEPS.every((s) => saved[s.node])) Object.assign(positions, saved)
      }
    } catch {
      /* storage unavailable — keep dagre layout */
    }

    const nodes: Node<StepData>[] = STEPS.map((s) => ({
      id: s.node,
      type: 'step',
      position: positions[s.node] ?? { x: 0, y: 0 },
      data: {
        label: s.label,
        kicker: s.kicker,
        icon: s.icon,
        status: statuses[s.node] ?? 'pending',
        revealed: false,
        selected: false,
      } satisfies StepData,
    }))
    return { nodes, edges: buildBaseEdges() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, base])

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timers: number[] = []
    REVEAL.forEach((item) => {
      timers.push(
        window.setTimeout(() => {
          setRevealed((prev) => new Set(prev).add(item.id))
        }, item.t),
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  /* Keep node/edge appearance in sync with live stream state. */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...(n.data as unknown as StepData),
          status: statuses[n.id] ?? 'pending',
          duration: durations[n.id],
          result: results[n.id],
          revealed: revealed.has(n.id),
          selected: selectedNode === n.id,
        } satisfies StepData,
      })),
    )

    setEdges((eds) =>
      eds.map((e) => {
        const sourceStatus = statuses[e.source] ?? 'pending'
        const color = STATUS_COLORS[sourceStatus]
        const shown = revealed.has(e.id)
        const animated = sourceStatus === 'running'
        return {
          ...e,
          animated,
          className: edgeClass(sourceStatus, shown, animated),
          style: {
            ...e.style,
            stroke: color,
            opacity: shown ? 1 : 0,
          },
          markerEnd: {
            ...(e.markerEnd as object),
            color,
          } as Edge['markerEnd'],
        }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, durations, results, revealed, selectedNode])

  const handleNodeClick = (_: unknown, node: Node) => onSelect(node.id)
  const handlePaneClick = () => onSelect(null)
  const handleDragStop = () => {
    try {
      localStorage.setItem(
        `ds-pos-${runId}`,
        JSON.stringify(Object.fromEntries(nodes.map((n) => [n.id, n.position]))),
      )
    } catch {
      /* storage full/unavailable — positions stay session-only */
    }
  }

  const retryEdge: Edge | null = useMemo(() => {
    if (retry === 'none') return null
    return {
      id: 'e-retry',
      source: 'critic_aggregator',
      target: 'citation_tracer',
      type: 'smoothstep',
      animated: retry === 'active',
      className: retry === 'active' ? 'edge-glow-cyan' : 'edge-glow-emerald',
      style: {
        stroke: retry === 'active' ? '#22d3ee' : '#34d399',
        strokeWidth: 1.8,
        strokeDasharray: retry === 'active' ? undefined : '5 5',
        opacity: 0.9,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: retry === 'active' ? '#22d3ee' : '#34d399',
      },
    }
  }, [retry])

  return (
    <ReactFlow
      nodes={nodes}
      edges={retryEdge ? [...edges, retryEdge] : edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onNodeDragStop={handleDragStop}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.4}
      maxZoom={1.35}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      className="h-full w-full"
    >
      <Background color="rgba(148, 163, 184, 0.35)" gap={30} size={1.5} variant={BackgroundVariant.Dots} />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>
  )
}