import { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  useNodesState,
  useEdgesState,
  Position,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import type { WorkflowDef } from '../types/workflow';
import type { WorkflowRun } from '../api/client';

interface Props {
  workflow: WorkflowDef | null;
  activeRun: WorkflowRun | null;
  onNodeClick?: (nodeId: string) => void;
}

const nodeColor = (type: string) => {
  switch (type) {
    case 'approval': return '#fffbeb';
    case 'end': return '#f0fdf4';
    default: return '#ffffff';
  }
};

const nodeBorder = (type: string) => {
  switch (type) {
    case 'approval': return '#f59e0b';
    case 'end': return '#22c55e';
    default: return '#3b82f6';
  }
};

function statusStyle(status: string) {
  switch (status) {
    case 'running':
      return { background: '#eff6ff', borderColor: '#3b82f6', boxShadow: '0 0 0 4px rgba(59,130,246,0.3)' };
    case 'completed':
      return { background: '#f0fdf4', borderColor: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)' };
    case 'failed':
      return { background: '#fef2f2', borderColor: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.25)' };
    case 'waiting_approval':
      return { background: '#fffbeb', borderColor: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.25)' };
    default:
      return {};
  }
}

function CustomNode({ data }: any) {
  const style = {
    background: data.color,
    borderColor: data.border,
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: '8px 12px',
    minWidth: 160,
    textAlign: 'center' as const,
    transition: 'all 0.3s ease',
    ...statusStyle(data.status),
  };
  return (
    <div
      style={style}
      className={`${data.statusClass} ${data.status === 'running' ? 'node-running-active' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="font-semibold text-slate-800">{data.label}</div>
      {data.role && <div className="text-xs text-slate-500 mt-1">role: {data.role}</div>}
      {data.agent && <div className="text-xs text-slate-400 truncate">{data.agent}</div>}
      {data.status && (
        <div className={`mt-1 text-xs font-bold px-2 py-0.5 rounded inline-block ${statusBadgeClass(data.status)}`}>
          {data.status}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'running': return 'bg-blue-100 text-blue-700';
    case 'failed': return 'bg-red-100 text-red-700';
    case 'waiting_approval': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function nodeStatusClass(status: string) {
  switch (status) {
    case 'completed': return 'react-flow__node-completed';
    case 'running': return 'react-flow__node-running';
    case 'failed': return 'react-flow__node-failed';
    case 'waiting_approval': return 'react-flow__node-waiting';
    default: return '';
  }
}

const nodeTypes = { custom: CustomNode };

export default function WorkflowCanvas({ workflow, activeRun, onNodeClick }: Props) {
  const initialNodes = useMemo<Node[]>(() => {
    if (!workflow) return [];
    const executed = new Set(activeRun?.executed_nodes || []);
    return Object.values(workflow.nodes).map(n => {
      let status = '';
      if (activeRun) {
        // 已完成/failed 的 workflow：current_node 也视为 completed/failed
        if (activeRun.status === 'completed') {
          if (executed.has(n.id) || activeRun.current_node === n.id) status = 'completed';
        } else if (activeRun.status === 'failed') {
          if (executed.has(n.id) || activeRun.current_node === n.id) status = 'failed';
        } else if (activeRun.current_node === n.id) {
          status = 'running';
        } else if (executed.has(n.id)) {
          status = 'completed';
        }
      }
      return {
        id: n.id,
        type: 'custom',
        position: n.position || { x: 0, y: 0 },
        data: {
          label: n.id,
          role: n.role,
          agent: n.agent,
          color: nodeColor(n.type),
          border: nodeBorder(n.type),
          status,
          statusClass: nodeStatusClass(status),
        },
      };
    });
  }, [workflow, activeRun]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!workflow) return [];
    return workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: activeRun?.current_node === e.source,
      style: activeRun?.current_node === e.source ? { stroke: '#3b82f6', strokeWidth: 3 } : {},
    }));
  }, [workflow, activeRun]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div className="w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background gap={16} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap nodeColor={(n) => n.data?.border || '#ccc'} />
      </ReactFlow>
    </div>
  );
}
