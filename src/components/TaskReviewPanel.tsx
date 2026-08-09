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
import { listWorkflowRuns, getWorkflowRun, getWorkflowConfig } from '../api/client';
import type { WorkflowRun } from '../api/client';
import { parseWorkflowYaml } from '../utils/yamlParser';
import type { WorkflowDef } from '../types/workflow';

const BEGIN_ID = '__begin__';
const USERINPUT_ID = '__userinput__';

/* ---------- 工具 ---------- */

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'running': return 'bg-blue-100 text-blue-700';
    case 'failed': return 'bg-red-100 text-red-700';
    case 'waiting_approval': return 'bg-amber-100 text-amber-700';
    case 'queued': return 'bg-yellow-100 text-yellow-700';
    case 'pending': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'completed': return '已完成';
    case 'running': return '进行中';
    case 'failed': return '失败';
    case 'waiting_approval': return '待审批';
    case 'queued': return '排队中';
    case 'pending': return '未执行';
    default: return status;
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 节点执行状态（参考 WorkflowCanvas 状态逻辑） */
function nodeStatus(run: WorkflowRun | null, nodeId: string): string {
  if (!run) return 'pending';
  const executed = run.executed_nodes || [];
  if (run.status === 'completed') {
    return (executed.includes(nodeId) || run.current_node === nodeId) ? 'completed' : 'pending';
  }
  if (run.status === 'failed') {
    return (executed.includes(nodeId) || run.current_node === nodeId) ? 'failed' : 'pending';
  }
  if (run.status === 'waiting_approval') {
    return run.current_node === nodeId ? 'waiting_approval' : (executed.includes(nodeId) ? 'completed' : 'pending');
  }
  if (run.current_node === nodeId) return 'running';
  return executed.includes(nodeId) ? 'completed' : 'pending';
}

function nodeColor(status: string) {
  switch (status) {
    case 'completed': return '#f0fdf4';
    case 'running': return '#eff6ff';
    case 'failed': return '#fef2f2';
    case 'waiting_approval': return '#fffbeb';
    default: return '#ffffff';
  }
}

function nodeBorder(status: string) {
  switch (status) {
    case 'completed': return '#22c55e';
    case 'running': return '#3b82f6';
    case 'failed': return '#ef4444';
    case 'waiting_approval': return '#f59e0b';
    default: return '#94a3b8';
  }
}

/* ---------- 节点组件 ---------- */

/** 工作流执行节点（按状态着色） */
function ReviewWorkflowNode({ data }: any) {
  const style = {
    background: nodeColor(data.status),
    borderColor: nodeBorder(data.status),
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: '8px 12px',
    minWidth: 130,
    textAlign: 'center' as const,
    boxShadow: data.status === 'running' ? '0 0 0 4px rgba(59,130,246,0.3)' : undefined,
    transition: 'all 0.3s ease',
  };
  const isEnd = data.id === '__end__';
  return (
    <div style={style} className={`${data.status === 'running' ? 'node-running-active' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className={`font-semibold text-xs ${isEnd ? 'text-green-700' : 'text-slate-800'}`}>
        {isEnd ? 'end' : data.id}
      </div>
      <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${statusBadgeClass(data.status)}`}>
        {statusLabel(data.status)}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/** begin 起点标记 */
function ReviewBeginNode() {
  return (
    <div style={{ background: '#eff6ff', borderColor: '#2563eb', borderWidth: 2, borderStyle: 'solid', borderRadius: 8, padding: '8px 12px', minWidth: 100, textAlign: 'center' }} className="shadow-sm">
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-blue-600 tracking-wider">begin</div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/** userinput 输入标记 */
function ReviewUserInputNode() {
  return (
    <div style={{ background: '#ffffff', borderColor: '#f59e0b', borderWidth: 2, borderStyle: 'solid', borderRadius: 8, padding: '8px 12px', minWidth: 130, textAlign: 'center' }} className="shadow-sm">
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-amber-600 tracking-wider">userinput</div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

const nodeTypes = {
  reviewNode: ReviewWorkflowNode,
  begin: ReviewBeginNode,
  userinput: ReviewUserInputNode,
};

/* ---------- 画布组件 ---------- */

function ReviewCanvas({ workflow, run }: { workflow: WorkflowDef | null; run: WorkflowRun | null }) {
  const initialNodes = useMemo<Node[]>(() => {
    if (!workflow) return [];
    const wfNodes = Object.values(workflow.nodes).map(n => ({
      id: n.id,
      type: 'reviewNode',
      position: n.position || { x: 0, y: 0 },
      data: { id: n.id, status: nodeStatus(run, n.id) },
    }));
    // 整体右移给 begin/userinput 让位
    const shifted = wfNodes.map(n => ({ ...n, position: { x: (n.position?.x ?? 0) + 320, y: n.position?.y ?? 0 } }));
    const startNode = workflow.nodes[workflow.initial_state];
    const baseY = startNode?.position?.y ?? 200;
    return [
      { id: BEGIN_ID, type: 'begin', position: { x: 20, y: baseY }, data: {} },
      { id: USERINPUT_ID, type: 'userinput', position: { x: 180, y: baseY }, data: {} },
      ...shifted,
    ];
  }, [workflow, run]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!workflow) return [];
    const wfEdges = workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: run?.current_node === e.source,
      style: run?.current_node === e.source ? { stroke: '#3b82f6', strokeWidth: 3 } : {},
    }));
    return [
      { id: `${BEGIN_ID}->${USERINPUT_ID}`, source: BEGIN_ID, target: USERINPUT_ID },
      { id: `${USERINPUT_ID}->${workflow.initial_state}`, source: USERINPUT_ID, target: workflow.initial_state },
      ...wfEdges,
    ];
  }, [workflow, run]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const rfRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // fitView：可见 + measure 完成后两段式（参考 WorkflowCanvas）
  useEffect(() => {
    const key = run?.run_id || 'none';
    if (fittedKeyRef.current === key) return;
    let tries = 0;
    let fittedOnce = false;
    const iv = window.setInterval(() => {
      const inst = rfRef.current;
      if (!inst) { if (++tries > 60) window.clearInterval(iv); return; }
      const el = containerRef.current;
      if (el && el.getBoundingClientRect().width === 0) { tries = 0; return; }
      tries++;
      const storeNodes = inst.getNodes?.() || [];
      const allMeasured = storeNodes.length > 0 && storeNodes.every((n: any) => n.measured?.width && n.measured?.height);
      if (!fittedOnce) {
        fittedOnce = true;
        requestAnimationFrame(() => inst.fitView({ padding: 0.1, maxZoom: 1.5, duration: 300 }));
      }
      if (allMeasured) {
        window.clearInterval(iv);
        fittedKeyRef.current = key;
        requestAnimationFrame(() => inst.fitView({ padding: 0.1, maxZoom: 1.5, duration: 300 }));
      }
    }, 50);
    return () => window.clearInterval(iv);
  }, [run?.run_id]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => { rfRef.current = instance; }}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        panOnScroll
      >
        <Background gap={16} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap nodeColor={(n) => nodeBorder((n.data as any)?.status || '')} />
      </ReactFlow>
    </div>
  );
}

/* ---------- 详情时间线 ---------- */

function ReviewDetailPanel({ run, workflow }: { run: WorkflowRun | null; workflow: WorkflowDef | null }) {
  if (!run) {
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden border-l border-slate-200">
        <div className="px-4 py-6 text-xs text-slate-400 text-center">从左侧选择任务查看节点时间线</div>
      </div>
    );
  }
  const metrics = run.node_metrics || {};
  // 节点顺序：执行顺序优先，未执行的按拓扑顺序补全
  const executed = run.executed_nodes || [];
  const allNodes = workflow ? Object.keys(workflow.nodes) : [];
  const order = [...executed, ...allNodes.filter(n => !executed.includes(n))];

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden border-l border-slate-200">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <h2 className="font-semibold text-sm text-slate-700 truncate">{run.run_id}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusBadgeClass(run.status)}`}>{statusLabel(run.status)}</span>
          <span className="text-[10px] text-slate-400">{formatTime(run.started_at)}</span>
        </div>
        {run.workflow_path && <div className="text-[9px] text-slate-400 font-mono mt-1 truncate">{run.workflow_path}</div>}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-semibold text-slate-700">节点时间线</h4>
            <span className="text-[9px] text-slate-400">{order.length} 个节点</span>
          </div>

          {/* 时间线 */}
          <div className="relative pl-4">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
            {order.map((nodeId, idx) => {
              const m = metrics[nodeId];
              const st = nodeStatus(run, nodeId);
              const isLast = idx === order.length - 1;
              const dotColor =
                st === 'completed' ? 'bg-green-500' :
                st === 'failed' ? 'bg-red-500' :
                st === 'running' ? 'bg-blue-500 animate-pulse' :
                st === 'waiting_approval' ? 'bg-amber-500' : 'bg-slate-300';
              return (
                <div key={nodeId} className={`relative pb-3 ${isLast ? '' : ''}`}>
                  <span className={`absolute left-[-16px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow ${dotColor}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 font-mono truncate">{nodeId === '__end__' ? 'end' : nodeId}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(st)}`}>{statusLabel(st)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span title="耗时">⏱ {formatDuration(m?.duration_ms)}</span>
                    <span title="Token 消耗">🔤 {m?.tokens_in !== undefined || m?.tokens_out !== undefined ? `${(m?.tokens_in || 0) + (m?.tokens_out || 0)}` : '—'}</span>
                    {m?.llm_calls !== undefined && <span title="LLM 调用次数">🤖 {m.llm_calls} 次</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* metrics 未就绪提示 */}
          {Object.keys(metrics).length === 0 && (
            <div className="mt-2 text-[9px] text-slate-400 bg-slate-50 p-2 rounded">
              耗时 / Token 消耗需引擎节点级 metrics 支持（issue-048，引擎实现后自动填充）
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- 主组件：三栏 ---------- */

export default function TaskReviewPanel() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listWorkflowRuns();
      const all = data?.runs || data?.items || [];
      setRuns(all);
    } catch (e: any) {
      setError(e?.message || '加载任务列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 选中任务：加载详情 + 工作流配置
  const handleSelect = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    setLoadingDetail(true);
    setError(null);
    try {
      const run = await getWorkflowRun(runId);
      setSelectedRun(run);
      // 加载该 run 的工作流配置渲染画布
      try {
        const cfg = await getWorkflowConfig(runId);
        if (cfg?.content) {
          setWorkflow(parseWorkflowYaml(cfg.content));
        }
      } catch {
        setWorkflow(null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
      setSelectedRun(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return (
    <div className="flex-1 flex min-w-0">
      {/* 左侧：任务列表 */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-sm text-slate-700">任务列表</h2>
          <button
            onClick={refresh}
            className="text-[10px] px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded"
          >
            刷新
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && <div className="px-4 py-6 text-xs text-slate-400 text-center">加载中...</div>}
          {!loading && runs.length === 0 && (
            <div className="px-4 py-6 text-xs text-slate-400 text-center">暂无任务，去【任务画布】创建运行</div>
          )}
          <div className="divide-y divide-slate-100">
            {runs.map((run) => (
              <button
                key={run.run_id}
                onClick={() => handleSelect(run.run_id)}
                className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 ${selectedRunId === run.run_id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-slate-600 truncate">{run.run_id}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(run.status)}`}>{statusLabel(run.status)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{run.workflow_path || '-'}</div>
                <div className="text-[9px] text-slate-300 mt-0.5">{formatTime(run.started_at)}</div>
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-[10px] text-red-600 bg-red-50 p-2 border-t border-red-100">{error}</div>}
      </div>

      {/* 中间：画布 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 relative">
          {loadingDetail && (
            <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center text-xs text-slate-400">加载中...</div>
          )}
          {!selectedRun && !loadingDetail && (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">从左侧选择任务查看节点执行情况</div>
          )}
          {selectedRun && <ReviewCanvas workflow={workflow} run={selectedRun} />}
        </div>
      </div>

      {/* 右侧：详情时间线 */}
      <div className="w-80 shrink-0">
        <ReviewDetailPanel run={selectedRun} workflow={workflow} />
      </div>
    </div>
  );
}
