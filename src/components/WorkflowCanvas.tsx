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
  runRequirement?: string;
  onRequirementChange?: (v: string) => void;
  onRun?: () => void;
  running?: boolean;
}

const BEGIN_ID = '__begin__';
const USERINPUT_ID = '__userinput__';

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

/** BEGIN 节点：运行工作流按钮（参考 end 节点样式） */
function BeginNode({ data }: any) {
  const disabled = !data.requirement?.trim() || data.running;
  return (
    <div
      style={{
        background: '#eff6ff',
        borderColor: '#2563eb',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 150,
        textAlign: 'center',
      }}
      className="shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-blue-600 tracking-wider mb-1.5">BEGIN</div>
      <button
        onClick={(e) => { e.stopPropagation(); data.onRun?.(); }}
        disabled={disabled}
        className={`flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded font-medium w-full ${
          disabled
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {data.running ? (
          <><span className="w-2 h-2 bg-blue-300 rounded-full animate-pulse" /> 运行中...</>
        ) : (
          <><span>▶</span> 运行工作流</>
        )}
      </button>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/** 用户需求参数输入节点 */
function UserInputNode({ data }: any) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderColor: '#f59e0b',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 220,
      }}
      className="shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-amber-600 tracking-wider mb-1.5">用户需求 INPUT</div>
      <textarea
        value={data.requirement || ''}
        onChange={(e) => { e.stopPropagation(); data.onRequirementChange?.(e.target.value); }}
        placeholder="输入需求描述，如：创建一个简单的web版本的计算器..."
        rows={2}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 resize-none bg-white"
      />
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

const nodeTypes = { custom: CustomNode, begin: BeginNode, userinput: UserInputNode };

export default function WorkflowCanvas({
  workflow,
  activeRun,
  onNodeClick,
  runRequirement = '',
  onRequirementChange,
  onRun,
  running = false,
}: Props) {
  const initialNodes = useMemo<Node[]>(() => {
    if (!workflow) return [];
    const executed = new Set(activeRun?.executed_nodes || []);
    const wfNodes = Object.values(workflow.nodes).map(n => {
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

    // 现有节点整体右移，为 begin / userinput 留出空间
    const shifted = wfNodes.map(n => ({
      ...n,
      position: { x: (n.position?.x ?? 0) + 380, y: n.position?.y ?? 0 },
    }));

    // begin / userinput 与 initial_state 节点同一水平线
    const startNode = workflow.nodes[workflow.initial_state];
    const baseY = startNode?.position?.y ?? 250;

    const beginNode: Node = {
      id: BEGIN_ID,
      type: 'begin',
      position: { x: 20, y: baseY },
      data: { requirement: runRequirement, running, onRun },
    };
    const userInputNode: Node = {
      id: USERINPUT_ID,
      type: 'userinput',
      position: { x: 200, y: baseY },
      data: { requirement: runRequirement, onRequirementChange },
    };
    return [beginNode, userInputNode, ...shifted];
  }, [workflow, activeRun, runRequirement, running, onRun, onRequirementChange]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!workflow) return [];
    const wfEdges = workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: activeRun?.current_node === e.source,
      style: activeRun?.current_node === e.source ? { stroke: '#3b82f6', strokeWidth: 3 } : {},
    }));
    // begin → userinput → initial_state
    const startEdges: Edge[] = [
      { id: `${BEGIN_ID}->${USERINPUT_ID}`, source: BEGIN_ID, target: USERINPUT_ID },
      { id: `${USERINPUT_ID}->${workflow.initial_state}`, source: USERINPUT_ID, target: workflow.initial_state },
    ];
    return [...startEdges, ...wfEdges];
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
        onNodeClick={(_, node) => {
          if (node.id === BEGIN_ID || node.id === USERINPUT_ID) return;
          onNodeClick?.(node.id);
        }}
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
