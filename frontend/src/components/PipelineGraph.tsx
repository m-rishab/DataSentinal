/* React Flow + dagre audit pipeline graph.
   Flat cards, muted status colors, no neon. Selection + hover focus the
   connected path and dim everything else. Keyboard accessible. */

import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { AlertCircle } from 'lucide-react'
import { PIPELINE, CONNECTIONS } from '../lib/steps'
import { downloadGraphPng } from '../lib/graphExport'
import type { RetryState } from '../lib/graphExport'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'
export type GraphFilter = 'all' | 'running' | 'completed' | 'failed'

interface StepData extends Record<string, unknown> {
  label: string
  kicker: string
  category: string
  status: NodeStatus
  duration?: number
  result?: string
  revealed: boolean
  selected: boolean
  dimmed: boolean
  matched: boolean
}

interface PipelineGraphProps {
  statuses: Record<string, NodeStatus>
  durations: Record<string, number>
  results: Record<string, string>
  retry: RetryState
  selectedNode: string | null
  onSelect: (node: string | null) => void
  filter?: GraphFilter
  runId?: string
}

const NODE_W = 240
const NODE_H = 118

const COLOR = {
  pending: '#3a414d',
  running: '#6b96c4',
  completed: '#4a9d7f',
  failed: '#c4645f',
}

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

function parseResult(result?: string): { text: string; amber: boolean } | null {
  if (!result) return null
  const flags = result.match(/^(\d+)\s*flag/i)
  if (flags) return { text: result, amber: Number(flags[1]) > 0 }
  return { text: result, amber: false }
}

function layoutPositions(): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 44, ranksep: 118, marginx: 36, marginy: 28 })
  PIPELINE.forEach((s) => g.setNode(s.node, { width: NODE_W, height: NODE_H }))
  CONNECTIONS.forEach((c) => g.setEdge(c.from, c.to))
  dagre.layout(g)
  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of g.nodes()) {
    const n = g.node(id)
    positions[id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 }
  }
  return positions
}

function buildBaseEdges(): Edge[] {
  return CONNECTIONS.map((c) => ({
    id: c.id,
    source: c.from,
    target: c.to,
    type: 'smoothstep',
    animated: false,
    style: { stroke: COLOR.pending, strokeWidth: 2, opacity: 0 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: COLOR.pending },
  }))
}

/* Node ids connected (both directions) to a focus node. */
function pathSetFrom(focus: string | null): Set<string> {
  if (!focus) return new Set(PIPELINE.map((s) => s.node))
  const adjacent = new Map<string, Set<string>>()
  for (const c of CONNECTIONS) {
    if (!adjacent.has(c.from)) adjacent.set(c.from, new Set())
    if (!adjacent.has(c.to)) adjacent.set(c.to, new Set())
    adjacent.get(c.from)!.add(c.to)
    adjacent.get(c.to)!.add(c.from)
  }
  const visited = new Set<string>([focus])
  const queue = [focus]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adjacent.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return visited
}

/* ------------------------------------------------------------------ */
/* Custom node                                                         */
/* ------------------------------------------------------------------ */

function StepNode(props: NodeProps) {
  const { id, data } = props
  const { label, kicker, category, status, duration, result, revealed } = data as StepData
  const selected = Boolean((data as StepData).selected)
  const dimmed = Boolean((data as StepData).dimmed)
  const running = status === 'running'
  const completed = status === 'completed'
  const failed = status === 'failed'
  const color = COLOR[status]
  const parsed = parseResult(result)

  return (
    <div
      data-node-id={id}
      className={`relative rounded-xl border transition-all duration-300 ${
        selected ? 'ring-2 ring-offset-2 ring-offset-[#10141a]' : ''
      } ${running ? 'pulse-soft' : ''}`}
      style={{
        width: NODE_W,
        height: NODE_H,
        background: 'var(--color-panel)',
        borderColor: failed ? color : running ? 'color-mix(in srgb, ' + color + ' 70%, transparent)' : completed ? 'color-mix(in srgb, ' + color + ' 45%, transparent)' : 'var(--color-line)',
        boxShadow: selected ? 'var(--shadow-lift)' : 'none',
        opacity: revealed ? (dimmed ? 0.3 : 1) : 0,
        transform: revealed ? (selected ? 'scale(1.02)' : 'scale(1)') : 'scale(0.92)',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} className="op-node-handle" />
      <Handle type="source" position={Position.Right} className="op-node-handle" />

      <div className="flex h-full flex-col justify-between p-3.5">
        {/* Header: number · category · status dot */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-[0.625rem] font-bold tabular-nums"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
            >
              {kicker.slice(0, 2)}
            </span>
            <span className="truncate font-mono text-[0.625rem] font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--color-muted)' }}>
              {category}
            </span>
          </div>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${running ? 'pulse-soft' : ''}`}
            style={{ background: failed ? COLOR.failed : running ? COLOR.running : completed ? COLOR.completed : COLOR.pending }}
            title={status}
          />
        </div>

        {/* Title */}
        <div className="mt-1 truncate font-display text-[0.9375rem] font-semibold leading-snug" style={{ color: 'var(--color-primary)' }}>
          {label}
        </div>

        {/* Footer: result metric + duration */}
        <div className="mt-1 flex items-center justify-between gap-2">
          {failed ? (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold" style={{ color: COLOR.failed }}>
              <AlertCircle size={12} /> Failed
            </span>
          ) : parsed ? (
            <span
              className="truncate rounded px-1.5 py-0.5 font-mono text-[0.65625rem] font-medium"
              style={{
                background: parsed.amber
                  ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)'
                  : `color-mix(in srgb, ${color} 10%, transparent)`,
                color: parsed.amber ? 'var(--color-warning)' : color,
              }}
            >
              {parsed.text}
            </span>
          ) : status === 'running' ? (
            <span className="font-mono text-[0.65625rem] font-medium" style={{ color: 'var(--color-muted)' }}>
              inspecting…
            </span>
          ) : (
            <span className="font-mono text-[0.65625rem] font-medium text-muted">
              {status === 'pending' ? 'queued' : 'ok'}
            </span>
          )}
          {duration != null && duration > 0 && !isNaN(duration) && (
            <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-muted">
              {(duration / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = { step: StepNode }

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function PipelineGraph({ statuses, durations, results, retry, selectedNode, onSelect, filter = 'all', runId = 'audit' }: PipelineGraphProps) {
  const [revealedIds, setRevealedIds] = useState(new Set<string>())
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    const timers = REVEAL.map((r) =>
      window.setTimeout(() => {
        setRevealedIds((prev) => new Set([...prev, r.id]))
      }, r.t),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const positions = useMemo(() => layoutPositions(), [])

  const focusId = selectedNode ?? hoverId
  const path = useMemo(() => pathSetFrom(focusId), [focusId])

  const initialNodes: Node[] = useMemo(
    () =>
      PIPELINE.map((s) => ({
        id: s.node,
        type: 'step',
        position: positions[s.node] || { x: 0, y: 0 },
        data: {
          label: s.label,
          kicker: s.kicker,
          category: s.category,
          status: 'pending',
          revealed: false,
          selected: false,
          matched: true,
        },
      })),
    [positions],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildBaseEdges())

  /* Merge live status + focus + filter state into nodes. */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const status = statuses[node.id] || 'pending'
        const selected = selectedNode === node.id
        const onPath = focusId == null || (focusId === node.id || path.has(node.id))
        const matched = filter === 'all' || (status === 'running' && filter === 'running') || (status === 'completed' && filter === 'completed') || (status === 'failed' && filter === 'failed')
        const revealed = revealedIds.has(node.id)
        return {
          ...node,
          data: {
            ...node.data,
            status,
            duration: durations[node.id],
            result: results[node.id],
            revealed,
            selected,
            id: node.id,
            dimmed: focusId != null && !onPath,
            matched,
          },
          style: { opacity: matched ? undefined : 0.12 },
        }
      }),
    )
  }, [statuses, durations, results, revealedIds, selectedNode, focusId, path, filter, setNodes])

  /* Edges: status colour, draw-in, focus dimming. */
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const sourceStatus = statuses[edge.source] || 'pending'
        const color = COLOR[sourceStatus]
        const revealed = revealedIds.has(edge.id)
        const onPath = focusId == null || (path.has(edge.source) && path.has(edge.target))
        const animated = sourceStatus === 'running'
        return {
          ...edge,
          animated,
          style: {
            ...edge.style,
            stroke: color,
            strokeWidth: animated ? 2.4 : 2,
            opacity: revealed ? (onPath ? 1 : 0.18) : 0,
          },
          markerEnd: edge.markerEnd
            ? { type: MarkerType.ArrowClosed, width: 20, height: 20, color }
            : undefined,
        }
      }),
    )
  }, [statuses, revealedIds, focusId, path, setEdges])

  /* Retry edge (critic → citation tracer) while refining. */
  useEffect(() => {
    if (retry === 'none') return
    const retryEdge: Edge = {
      id: 'e-retry-citation',
      source: 'critic_aggregator',
      target: 'citation_tracer',
      type: 'smoothstep',
      animated: retry === 'active',
      style: retry === 'active'
        ? { stroke: COLOR.running, strokeWidth: 2, strokeDasharray: '5,5' }
        : { stroke: COLOR.completed, strokeWidth: 2, opacity: 0.7 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: retry === 'active' ? COLOR.running : COLOR.completed },
    }
    setEdges((eds) => {
      if (eds.some((e) => e.id === 'e-retry-citation')) return eds.map((e) => (e.id === 'e-retry-citation' ? retryEdge : e))
      return [...eds, retryEdge]
    })
  }, [retry, setEdges])

  const onFullscreen = () => {
    const host = document.getElementById('graph-host')?.parentElement
    if (!host) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void host.requestFullscreen().catch(() => {})
  }

  const onExport = () => downloadGraphPng(statuses, durations, results, retry, runId)

  return (
    <div
      id="graph-host"
      className="relative h-full w-full"
      style={{ background: 'var(--color-page)' }}
      aria-label="Audit pipeline graph: seven agents investigating the dataset. Use the controls to zoom and pan."
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id === selectedNode ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        onNodeMouseEnter={(_, node) => setHoverId(node.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(141,155,178,0.08)" />
        <MiniMap
          pannable
          zoomable
          style={{ background: 'var(--color-surface)' }}
          nodeColor={(n) => {
            const s = (statuses[n.id] ?? 'pending') as NodeStatus
            return COLOR[s]
          }}
          nodeStrokeWidth={0}
          maskColor="rgba(11,14,19,0.72)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lift)',
          }}
        />
      </ReactFlow>

      {/* Custom control cluster */}
      <div
        className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5"
        aria-label="Graph controls"
      >
        <button
          type="button"
          onClick={onExport}
          className="btn px-2.5 py-1.5 !text-[0.6875rem]"
          title="Download graph as PNG"
          aria-label="Download graph as PNG"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onFullscreen}
          className="btn px-2.5 py-1.5 !text-[0.6875rem]"
          title="Toggle fullscreen"
          aria-label="Toggle fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  )
}