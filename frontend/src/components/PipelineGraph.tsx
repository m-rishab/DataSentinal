/* React Flow + dagre pipeline graph with minimal dark design system.
   NO glow effects, NO gradients. Flat cards with muted status colors.
   Running nodes pulse opacity only. Failed nodes show error state clearly. */

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
  AlertCircle,
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

// Design system colors (muted, desaturated)
const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#3a3f47',
  running: '#6b96c4',
  completed: '#4a9d7f',
  failed: '#c4645f',
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

function buildBaseEdges(): Edge[] {
  return CONNECTIONS.map((c) => ({
    id: c.id,
    source: c.from,
    target: c.to,
    type: 'smoothstep',
    animated: false,
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
/* Custom node — flat card with status colors, no glow                */
/* ------------------------------------------------------------------ */

function StepNode({ data }: NodeProps) {
  const d = data as StepData
  const { label, kicker, icon: Icon, status, duration, result, revealed, selected } = d
  const running = status === 'running'
  const completed = status === 'completed'
  const failed = status === 'failed'
  const pending = status === 'pending'

  // Background color from design system
  const bgColor = selected ? '#1a1e23' : '#14171b'
  const borderColor = failed
    ? STATUS_COLORS.failed
    : running
    ? STATUS_COLORS.running
    : completed
    ? STATUS_COLORS.completed
    : 'rgba(255, 255, 255, 0.08)'

  const textColor = failed
    ? STATUS_COLORS.failed
    : running
    ? STATUS_COLORS.running
    : completed
    ? STATUS_COLORS.completed
    : '#8b9099'

  const parsed = parseResult(result)

  return (
    <div
      className={`relative rounded-xl border-2 transition-all ${running ? 'pulse-running' : ''}`}
      style={{
        width: NODE_W,
        height: NODE_H,
        background: bgColor,
        borderColor,
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'scale(1)' : 'scale(0.9)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className="flex h-full flex-col justify-between p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: `color-mix(in srgb, ${textColor} 15%, transparent)`,
                color: textColor,
              }}
            >
              <Icon size={16} />
            </div>
            <div>
              <div className="text-tiny" style={{ color: '#5a5f68' }}>
                {kicker}
              </div>
              <div className="text-small font-medium" style={{ color: '#e4e6eb' }}>
                {label}
              </div>
            </div>
          </div>

          {/* Status indicator */}
          {failed && (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${STATUS_COLORS.failed} 20%, transparent)` }}
            >
              <AlertCircle size={14} style={{ color: STATUS_COLORS.failed }} />
            </div>
          )}
        </div>

        {/* Footer - result or duration */}
        <div className="flex items-center justify-between">
          {parsed && (
            <div
              className="rounded px-2 py-1 text-tiny font-medium"
              style={{
                background: parsed.amber
                  ? 'color-mix(in srgb, #c4645f 15%, transparent)'
                  : `color-mix(in srgb, ${textColor} 10%, transparent)`,
                color: parsed.amber ? '#c4645f' : textColor,
              }}
            >
              {parsed.text}
            </div>
          )}
          {duration && duration > 0 && (
            <div className="text-tiny" style={{ color: '#5a5f68' }}>
              {(duration / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  step: StepNode,
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
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
  const [revealedIds, setRevealedIds] = useState(new Set<string>())

  // Staggered reveal animation
  useEffect(() => {
    const timers = REVEAL.map((r) =>
      window.setTimeout(() => {
        setRevealedIds((prev) => new Set([...prev, r.id]))
      }, r.t)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const positions = useMemo(() => layoutPositions(), [])

  const initialNodes: Node[] = useMemo(
    () =>
      STEPS.map((s) => ({
        id: s.node,
        type: 'step',
        position: positions[s.node] || { x: 0, y: 0 },
        data: {
          label: s.label,
          kicker: s.kicker,
          icon: s.icon,
          status: 'pending',
          revealed: false,
          selected: false,
        },
      })),
    [positions]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildBaseEdges())

  // Update nodes based on statuses
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const status = statuses[node.id] || 'pending'
        const duration = durations[node.id]
        const result = results[node.id]
        const revealed = revealedIds.has(node.id)
        const selected = selectedNode === node.id

        return {
          ...node,
          data: {
            ...node.data,
            status,
            duration,
            result,
            revealed,
            selected,
          },
        }
      })
    )
  }, [statuses, durations, results, revealedIds, selectedNode, setNodes])

  // Update edges based on source node status
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const sourceStatus = statuses[edge.source] || 'pending'
        const revealed = revealedIds.has(edge.id)
        const color = STATUS_COLORS[sourceStatus]
        const animated = sourceStatus === 'running'

        return {
          ...edge,
          animated,
          style: {
            ...edge.style,
            stroke: color,
            opacity: revealed ? 1 : 0,
          },
          markerEnd: {
            ...edge.markerEnd,
            color,
          },
        }
      })
    )
  }, [statuses, revealedIds, setEdges])

  // Add retry edge if citation is being refined
  useEffect(() => {
    if (retry === 'active') {
      const retryEdge: Edge = {
        id: 'e-retry-citation',
        source: 'critic_aggregator',
        target: 'citation_tracer',
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: STATUS_COLORS.running,
          strokeWidth: 2,
          strokeDasharray: '5,5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: STATUS_COLORS.running,
        },
      }
      setEdges((eds) => {
        if (eds.some((e) => e.id === 'e-retry-citation')) return eds
        return [...eds, retryEdge]
      })
    }
  }, [retry, setEdges])

  return (
    <div className="h-full w-full" style={{ background: '#0d0f12' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.05)"
        />
        <Controls
          style={{
            background: '#14171b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
          }}
        />
      </ReactFlow>
    </div>
  )
}
