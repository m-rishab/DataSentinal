/* React Flow + dagre audit pipeline graph.
   Flat cards, muted status colors, no neon. Selection + hover focus the
   connected path and dim everything else. Keyboard accessible. */

import { useEffect, useMemo, useState, type CSSProperties, type Ref } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { AlertCircle } from 'lucide-react'
import { PIPELINE, CONNECTIONS, stepByNode } from '../lib/steps'
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
  search?: string
  onSearchChange?: (q: string) => void
  searchInputRef?: Ref<HTMLInputElement>
}

const NODE_W = 240
const NODE_H = 118

const COLOR = {
  pending: '#98a3ad',
  running: '#5b7ea6',
  completed: '#2f9e74',
  failed: '#cf4f4c',
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
    type: 'flow',
    animated: false,
    style: { stroke: COLOR.pending, strokeWidth: 2, opacity: 0 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: COLOR.pending },
    data: { runningColor: COLOR.pending },
  }))
}

/* Custom edge: base path + moving dashed "data flow" overlay while the
   upstream agent is running. Uses CSS `.edge-flow` (marching ants) plus a
   soft drop-shadow so active edges read as live data movement. */
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, animated }: EdgeProps) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetPosition, targetX, targetY })
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {animated && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth={2.6}
          opacity={0.9}
          className="edge-flow"
          style={{ filter: 'drop-shadow(0 0 4px rgba(91,126,166,0.35))', strokeLinecap: 'round' }}
        />
      )}
    </>
  )
}

const edgeTypes = { flow: FlowEdge }

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
        selected ? 'ring-2 ring-offset-2' : ''
      }`}
      style={{
        width: NODE_W,
        height: NODE_H,
        background: 'var(--color-surface)',
        ['--tw-ring-offset-color' as string]: 'var(--color-page)',
        borderColor: failed ? color : running ? 'color-mix(in srgb, ' + color + ' 70%, transparent)' : completed ? 'color-mix(in srgb, ' + color + ' 45%, transparent)' : 'var(--color-line)',
        boxShadow: selected ? 'var(--shadow-lift)' : 'none',
        opacity: revealed ? (dimmed ? 0.3 : 1) : 0,
        transform: revealed ? (selected ? 'scale(1.02)' : 'scale(1)') : 'scale(0.92)',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} className="op-node-handle" />
      <Handle type="source" position={Position.Right} className="op-node-handle" />

      {/* Running / failed radial glow behind the card */}
      {running && <span className="node-glow" style={{ zIndex: 0, '--glow': COLOR.running } as CSSProperties} />}
      {failed && <span className="node-glow fail" style={{ zIndex: 0 }} />}

      <div className="relative z-10 flex h-full flex-col justify-between p-3.5">
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

export default function PipelineGraph({ statuses, durations, results, retry, selectedNode, onSelect, filter = 'all', runId = 'audit', search = '', onSearchChange, searchInputRef }: PipelineGraphProps) {
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

  /* Merge live status + focus + filter + search state into nodes. */
  useEffect(() => {
    const q = search.trim().toLowerCase()
    setNodes((nds) =>
      nds.map((node) => {
        const status = statuses[node.id] || 'pending'
        const selected = selectedNode === node.id
        const onPath = focusId == null || (focusId === node.id || path.has(node.id))
        const matchedFilter = filter === 'all' || (status === 'running' && filter === 'running') || (status === 'completed' && filter === 'completed') || (status === 'failed' && filter === 'failed')
        const step = stepByNode(node.id)
        const matchedSearch = !q || (node.id.includes(q) || (step?.label.toLowerCase().includes(q) ?? false) || (step?.category.toLowerCase().includes(q) ?? false))
        const matched = matchedFilter && matchedSearch
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
            matched: matchedFilter,
          },
          style: { opacity: matched ? undefined : 0.08 },
        }
      }),
    )
  }, [statuses, durations, results, revealedIds, selectedNode, focusId, path, filter, search, setNodes])

  /* Edges: status colour, draw-in, focus dimming, live-flow overlay. */
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
          data: { ...edge.data, runningColor: color },
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
      type: 'flow',
      animated: retry === 'active',
      style: retry === 'active'
        ? { stroke: COLOR.running, strokeWidth: 2, strokeDasharray: '5,5' }
        : { stroke: COLOR.completed, strokeWidth: 2, opacity: 0.7 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: retry === 'active' ? COLOR.running : COLOR.completed },
      data: { runningColor: retry === 'active' ? COLOR.running : COLOR.completed },
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
    <ReactFlowProvider>
      <div
        id="graph-host"
        className="relative h-full w-full"
        style={{ background: 'var(--color-canvas)' }}
        aria-label="Audit pipeline graph: seven agents investigating the dataset. Use the controls to zoom and pan."
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => onSelect(node.id === selectedNode ? null : node.id)}
          onPaneClick={() => onSelect(null)}
          onNodeMouseEnter={(_, node) => setHoverId(node.id)}
          onNodeMouseLeave={() => setHoverId(null)}
          fitView
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(31,42,57,0.10)" />
          <MiniMap
            pannable
            zoomable
            style={{ background: 'var(--color-surface)' }}
            nodeColor={(n) => {
              const s = (statuses[n.id] ?? 'pending') as NodeStatus
              return COLOR[s]
            }}
            nodeStrokeWidth={0.5}
            maskColor="rgba(250,249,245,0.82)"
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

        {/* Agent search */}
        <div
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', boxShadow: 'var(--shadow-lift)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Find agent… ( / )"
            aria-label="Search agents"
            className="w-36 bg-transparent font-mono text-[0.6875rem] outline-none placeholder:text-muted"
            style={{ color: 'var(--color-primary)' }}
          />
          {search && (
            <button type="button" onClick={() => onSearchChange?.('')} className="btn btn-ghost shrink-0 px-1.5 py-0.5 !text-[0.65625rem]" aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {/* Custom control cluster */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5" aria-label="Graph controls">
          <GraphToolbar positions={positions} />
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
    </ReactFlowProvider>
  )
}

/* Fit-view / reset-layout toolbar (inside provider so it can use useReactFlow). */
function GraphToolbar({ positions }: { positions: Record<string, { x: number; y: number }> }) {
  const { fitView, setNodes } = useReactFlow()
  return (
    <>
      <button
        type="button"
        onClick={() => fitView({ padding: 0.14, duration: 650 })}
        className="btn px-2.5 py-1.5 !text-[0.6875rem]"
        title="Fit all agents into view"
        aria-label="Fit view"
      >
        ⊡
      </button>
      <button
        type="button"
        onClick={() => {
          setNodes((nds) => nds.map((n) => ({ ...n, position: positions[n.id] ?? n.position })))
          fitView({ padding: 0.14, duration: 650 })
        }}
        className="btn px-2.5 py-1.5 !text-[0.6875rem]"
        title="Reset to the ranked pipeline layout"
        aria-label="Reset layout"
      >
        ↺
      </button>
    </>
  )
}