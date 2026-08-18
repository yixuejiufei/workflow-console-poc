import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  useNodesState,
  useEdgesState,
  useStore,
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
    case 'smart_orchestrator': return '#faf5ff';  // v0.1.58: 紫色区分智能编排节点
    default: return '#ffffff';
  }
};

const nodeBorder = (type: string) => {
  switch (type) {
    case 'approval': return '#f59e0b';
    case 'end': return '#22c55e';
    case 'smart_orchestrator': return '#a855f7';  // purple-500
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

/** BEGIN 节点：仅流程起点标记（工作流画布仅可编辑、不可运行，无运行按钮）
 *  垂直 padding 经实测调整：与 userinput 未聚焦节点精确等高（offsetH≈70） */
function BeginNode() {
  return (
    <div
      style={{
        background: '#eff6ff',
        borderColor: '#2563eb',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '15px 14px',
        minWidth: 130,
        textAlign: 'center',
      }}
      className="shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-blue-600 tracking-wider">begin</div>
      <div className="text-[10px] text-slate-400 mt-0.5">起点</div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/** 用户需求参数输入节点（宽度对齐任务画布 TaskUserInputNode）
 *  三态高度自适应（与任务画布一致）：
 *  - 未聚焦：textarea DEFAULT_H=23px（布局单位，节点与 begin 精确等高）
 *  - 聚焦：auto-resize（scrollHeight 驱动），MAX_H = 画布高度 1/3，超出滚动条
 *  - 失焦：恢复 23px + overflow hidden
 *  本地 state + 300ms 防抖提交：打字只更新节点内部 state（不触发父组件 →
 *  不重建 React Flow nodes → 不打断 IME 中文组合输入 → 不失焦） */
function UserInputNode({ data }: any) {
  const [val, setVal] = useState<string>(data.requirement || '');
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // React Flow 容器高度（画布高度）——聚焦最大高度 = 画布 1/3
  const canvasH = useStore(s => s.height) || 600;
  const DEFAULT_H = 23;
  const MAX_H = Math.max(80, Math.floor(canvasH / 3));

  const autoResize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const target = Math.min(el.scrollHeight, MAX_H);
    el.style.height = target + 'px';
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
  }, [MAX_H]);

  // 外部值变化（切换工作流加载模板/防抖提交回写）时同步本地
  useEffect(() => {
    setVal(data.requirement || '');
  }, [data.requirement]);

  // 卸载时清理定时器
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleFocus = () => {
    setFocused(true);
    requestAnimationFrame(autoResize);
  };

  const handleBlur = () => {
    setFocused(false);
    if (taRef.current) {
      taRef.current.style.height = DEFAULT_H + 'px';
      taRef.current.style.overflowY = 'hidden';
    }
  };

  const handleChange = (v: string) => {
    setVal(v);
    autoResize();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => data.onRequirementChange?.(v), 300);
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderColor: '#f59e0b',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '8px 10px',
        minWidth: 200,
      }}
      className="shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-amber-600 tracking-wider mb-1">userinput</div>
      <textarea
        ref={taRef}
        value={val}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => { e.stopPropagation(); handleChange(e.target.value); }}
        placeholder="输入需求描述，如：创建一个简单的web版本的计算器..."
        style={{
          height: focused ? undefined : DEFAULT_H + 'px',
          maxHeight: MAX_H + 'px',
          overflowY: focused ? 'auto' : 'hidden',
        }}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-amber-500 resize-none bg-white nodrag nopan"
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
          label: n.id === '__end__' ? 'end' : n.id,
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
      data: {},
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

  // React Flow 实例（onInit 时注入，避免额外 Provider）
  const rfRef = useRef<any>(null);
  // 画布容器（keep-alive 下 hidden tab 不可见，用于可见性检测）
  const containerRef = useRef<HTMLDivElement>(null);

  // 默认渲染：节点尺寸测量完成后手动 fitView —— 修复 fitView prop 在自定义节点
  // 尺寸未测量时执行导致的不居中/过小问题；同一工作流只 fit 一次，不覆盖用户拖拽
  // 注意：useNodesState 的 nodes 在节点 measure 后引用不变（内部 store 不回写
  // useState），所以 effect 只依赖 workflow?.id，用 interval 轮询等待 onInit 就绪
  // + 节点 measure 完成（getNodes() 返回 store 节点含 measured）
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = workflow?.id || 'none';
    if (fittedKeyRef.current === key) return;
    let tries = 0;
    let fittedOnce = false; // 可见瞬间已触发首次 fit（立即平滑过渡，不等 measure）
    const iv = window.setInterval(() => {
      const inst = rfRef.current;
      if (!inst) {
        // onInit 尚未触发（最多等 3s）
        if (++tries > 60) window.clearInterval(iv);
        return;
      }
      // keep-alive：hidden tab 不可见（rect 宽 0），节点无法 measure →
      // 不计时、不强制 fit（避免 hidden 期间空转 3s 后以错误尺寸 fit 污染）
      const el = containerRef.current;
      if (el && el.getBoundingClientRect().width === 0) {
        tries = 0;
        return;
      }
      tries++;
      const storeNodes = inst.getNodes?.() || [];
      const allMeasured =
        storeNodes.length > 0 &&
        storeNodes.every((n: any) => n.measured?.width && n.measured?.height);
      // ① 可见瞬间立即 fit（未 measure 用近似尺寸）→ 进入 tab 直接平滑过渡，
      //    不等 measure 完成的静止等待
      if (!fittedOnce) {
        fittedOnce = true;
        requestAnimationFrame(() => {
          inst.fitView({ padding: 0.08, maxZoom: 1.5, duration: 300 });
        });
      }
      // ② measure 完成后校正（从近似位置平滑微调到精确居中）
      if (allMeasured) {
        window.clearInterval(iv);
        fittedKeyRef.current = key;
        requestAnimationFrame(() => {
          inst.fitView({ padding: 0.08, maxZoom: 1.5, duration: 300 });
        });
      }
    }, 50);
    return () => window.clearInterval(iv);
  }, [workflow?.id]);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (node.id === BEGIN_ID || node.id === USERINPUT_ID) return;
          onNodeClick?.(node.id);
        }}
        onInit={(instance) => { rfRef.current = instance; }}
        nodeTypes={nodeTypes}
      >
        <Background gap={16} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap nodeColor={(n) => n.data?.border || '#ccc'} />
      </ReactFlow>
    </div>
  );
}
