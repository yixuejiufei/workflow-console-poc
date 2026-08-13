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
import { listWorkflowRuns, getWorkflowRun, getWorkflowConfig, checkRunArtifact, getArtifactPreviewUrl, getRunTrace, deleteWorkflowRun } from '../api/client';
import type { WorkflowRun, RunTrace, TraceTimelineEntry } from '../api/client';
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

function formatTime(ts?: string | number): string {
  const ms = parseRunTimestamp(ts);
  if (ms === undefined) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * v0.1.52：兼容 run 时间戳的两种格式——
 * - listWorkflowRuns 返回 ISO 字符串（"2026-08-13T07:05:48.424230"）
 * - getWorkflowRun 返回 Unix 秒浮点数（1786575948.42423）
 * 数字 < 1e12 视为秒（× 1000 转毫秒），>= 1e12 视为已是毫秒。
 * traceTimestamp 已统一为 ISO 字符串，不走这里。
 */
function parseRunTimestamp(ts?: string | number): number | undefined {
  if (ts == null || ts === '') return undefined;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  const asNum = Number(ts);
  if (!isNaN(asNum) && /^\d+(\.\d+)?$/.test(ts)) return asNum < 1e12 ? asNum * 1000 : asNum;
  const d = new Date(ts).getTime();
  return isNaN(d) ? undefined : d;
}

/** v0.1.52：把任务执行区间（started_at → ended_at，进行中用 now）转成毫秒，交给现有 formatDuration(ms) 统一格式。引擎实际返回字段名是 ended_at（不是 finished_at）。 */
function runDurationMs(startedAt?: string | number, endedAt?: string | number): number | undefined {
  const start = parseRunTimestamp(startedAt);
  if (start === undefined) return undefined;
  const end = parseRunTimestamp(endedAt) ?? Date.now();
  return Math.max(0, end - start);
}

/** issue-056：trace 事件 timestamp 为 Unix 秒，转为毫秒字符串供 formatTime 显示。 */
function traceTimestamp(ts: number): string {
  if (ts == null) return '';
  // 秒级时间戳（< 1e12）转毫秒；已是毫秒级（>= 1e12）直接用
  return String(ts < 1e12 ? ts * 1000 : ts);
}

/** Token 图标：艺术字体大写 T（衬线体 + 圆底，形似 token 标志） */
function TokenIcon() {
  return (
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 font-serif font-black italic"
      style={{ fontSize: 9, lineHeight: 1 }}
      title="Token 消耗"
    >
      T
    </span>
  );
}

/** 工具调用图标：扳手 */
function ToolIcon() {
  return (
    <span className="inline-flex items-center justify-center" title="工具调用次数">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </span>
  );
}

/** 从 run.inputs 提取 userinput 展示文本（取所有字符串值，非字符串跳过） */
function extractInputText(inputs?: Record<string, unknown>): string {
  if (!inputs) return '';
  const lines: string[] = [];
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'string' && v.trim()) {
      lines.push(v.trim());
    }
  }
  return lines.join('\n');
}

/** 节点执行状态（参考 WorkflowCanvas 状态逻辑） */
function nodeStatus(run: WorkflowRun | null, nodeId: string): string {
  if (!run) return 'pending';
  // end 虚拟节点：completed 的 run 视为正常结束
  if (nodeId === '__end__' && run.status === 'completed') return 'completed';
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

/** userinput 输入标记（只读展示用户输入内容） */
function ReviewUserInputNode({ data }: any) {
  const content: string = data?.content || '';
  return (
    <div style={{ background: '#fffbeb', borderColor: '#f59e0b', borderWidth: 2, borderStyle: 'solid', borderRadius: 8, padding: '8px 10px', minWidth: 200, maxWidth: 260, textAlign: 'center' }} className="shadow-sm">
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-amber-600 tracking-wider mb-1">userinput</div>
      {content ? (
        <textarea
          readOnly
          value={content}
          rows={Math.min(Math.max(content.split('\n').length, 2), 6)}
          className="w-full text-[10px] text-slate-700 bg-white border border-amber-200 rounded px-2 py-1 resize-none focus:outline-none cursor-default nodrag nopan"
          style={{ lineHeight: 1.5 }}
        />
      ) : (
        <div className="text-[9px] text-slate-400">（无输入内容）</div>
      )}
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
      { id: USERINPUT_ID, type: 'userinput', position: { x: 180, y: baseY }, data: { content: extractInputText(run?.inputs as Record<string, unknown>) } },
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
  // 产物存在性探测（v0.5.x 引擎产物走 artifact-files 端点）
  const [artifactOk, setArtifactOk] = useState<boolean | null>(null);
  // v0.1.49：节点级产物存在性缓存（outputs/{nodeId}.html，探测通过后节点显示产物跳转按钮）
  const [nodeArtifactOk, setNodeArtifactOk] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    if (run?.run_id && run.status === 'completed') {
      setArtifactOk(null);
      checkRunArtifact(run.run_id).then(ok => { if (!cancelled) setArtifactOk(ok); });
    } else {
      setArtifactOk(null);
    }
    return () => { cancelled = true; };
  }, [run?.run_id, run?.status]);

  // v0.1.49：探测已完成节点的产物文件（outputs/{nodeId}.html）
  useEffect(() => {
    let cancelled = false;
    if (run?.run_id && run.status === 'completed') {
      const executed = run.executed_nodes || [];
      const targets = executed.filter(n => n !== '__end__' && nodeArtifactOk[n] === undefined);
      targets.forEach(async (n) => {
        const ok = await checkRunArtifact(run.run_id!, `outputs/${n}.html`);
        if (!cancelled) setNodeArtifactOk(prev => ({ ...prev, [n]: ok }));
      });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.run_id, run?.status, run?.executed_nodes]);

  // issue-056 契约：trace 回放时间线（run.start → span → generation → run.end）
  const [trace, setTrace] = useState<RunTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (run?.run_id) {
      setTraceLoading(true);
      setTrace(null);
      getRunTrace(run.run_id)
        .then(t => { if (!cancelled) setTrace(t); })
        .catch(() => { if (!cancelled) setTrace(null); })
        .finally(() => { if (!cancelled) setTraceLoading(false); });
    }
    return () => { cancelled = true; };
  }, [run?.run_id]);

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm text-slate-700 truncate">{run.run_id}</h2>
          {artifactOk && (
            <a
              href={getArtifactPreviewUrl(run.run_id, 'outputs/index.html')}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium shrink-0"
            >
              产出预览 ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusBadgeClass(run.status)}`}>{statusLabel(run.status)}</span>
          <span className="text-[10px] text-slate-400">{formatTime(run.started_at)}</span>
          <span className="text-[10px] text-slate-400">⏱ {formatDuration(runDurationMs(run.started_at, run.ended_at))}</span>
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
                    <div className="flex items-center gap-1 shrink-0">
                      {nodeId !== '__end__' && st === 'completed' && nodeArtifactOk[nodeId] && (
                        <a
                          href={getArtifactPreviewUrl(run.run_id, `outputs/${nodeId}.html`)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium"
                          title={`查看 ${nodeId} 产物`}
                        >
                          产物 ↗
                        </a>
                      )}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(st)}`}>{statusLabel(st)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span title="耗时">⏱ {formatDuration(m?.duration_ms)}</span>
                    <span className="inline-flex items-center gap-1" title="Token 消耗">
                      <TokenIcon />
                      {m?.tokens_in !== undefined || m?.tokens_out !== undefined ? `${(m?.tokens_in || 0) + (m?.tokens_out || 0)}` : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1" title="工具调用次数">
                      <ToolIcon />
                      {m?.tool_calls !== undefined ? m.tool_calls : '—'}
                    </span>
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

          {/* issue-056 契约：完整 trace 时间线（run.start → span → generation → run.end） */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold text-slate-700">Trace 时间线</h4>
              {traceLoading && <span className="text-[9px] text-slate-400">加载中…</span>}
              {!traceLoading && trace && (
                <span className="text-[9px] text-slate-400">{trace.timeline?.length || 0} 个事件</span>
              )}
            </div>
            {!traceLoading && !trace && (
              <div className="text-[9px] text-slate-400 bg-slate-50 p-2 rounded">
                Trace 回放需引擎 v0.5.4+ 支持（issue-056，当前引擎可能未实现）
              </div>
            )}
            {trace && trace.timeline && trace.timeline.length > 0 && (
              <div className="relative pl-4">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
                {trace.timeline.map((ev, idx) => (
                  <TraceEventItem key={idx} ev={ev} isLast={idx === trace.timeline.length - 1} />
                ))}
              </div>
            )}
            {trace && (!trace.timeline || trace.timeline.length === 0) && (
              <div className="text-[9px] text-slate-400">该 run 无 trace 事件</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** issue-056：单条 trace 事件展示（按事件类型着色 + 图标）。 */
function TraceEventItem({ ev, isLast }: { ev: TraceTimelineEntry; isLast: boolean }) {
  const { type, node_name, name, data } = ev;
  const dotColor =
    type === 'run.start' ? 'bg-slate-500' :
    type === 'run.end' ? 'bg-slate-700' :
    type === 'span' && data?.status === 'completed' ? 'bg-green-500' :
    type === 'span' && data?.status === 'running' ? 'bg-blue-500 animate-pulse' :
    type === 'span' && data?.status === 'failed' ? 'bg-red-500' :
    type === 'generation' ? 'bg-indigo-500' :
    type === 'tool.start' || type === 'tool.end' ? 'bg-amber-500' :
    'bg-slate-300';
  const typeLabel =
    type === 'generation' ? '🤖 LLM' :
    type === 'tool.start' ? '🔧 工具开始' :
    type === 'tool.end' ? '🔧 工具结束' :
    type === 'tool.error' ? '🔧 工具错误' :
    type === 'run.start' ? '▶️ 任务开始' :
    type === 'run.end' ? '⏹ 任务结束' :
    type;
  const usage = data?.usage as Record<string, any> | undefined;
  const usageText = usage ? `T ${(usage.prompt_tokens || 0) + (usage.completion_tokens || 0)}` : '';
  const latency = data?.latency_ms != null ? `⏱ ${formatDuration(data.latency_ms)}` : '';
  const status = data?.status ? ` ${data.status}` : '';
  const toolName = data?.tool_name ? ` ${data.tool_name}` : '';
  const result = data?.result != null ? ` → ${String(data.result).slice(0, 40)}` : '';

  return (
    <div className={`relative pb-2 ${isLast ? '' : ''}`}>
      <span className={`absolute left-[-16px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow ${dotColor}`} />
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-slate-400 shrink-0">{formatTime(traceTimestamp(ev.timestamp))}</span>
        <span className="text-[10px] font-medium text-slate-700 truncate">{typeLabel}{toolName}</span>
      </div>
      <div className="flex items-center gap-2 ml-auto text-[9px] text-slate-400 mt-0.5">
        {node_name && <span className="font-mono text-slate-500">{node_name}</span>}
        <span className="text-slate-400">{name}</span>
        {status && <span>{status}</span>}
        {usageText && <span>{usageText}</span>}
        {latency && <span>{latency}</span>}
        {result && <span className="text-slate-500 truncate">{result}</span>}
      </div>
    </div>
  );
}

/* ---------- 主组件：三栏 ---------- */

export default function TaskReviewPanel({ active }: { active?: boolean }) {
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

  // 切换回本 tab 时刷新列表（keep-alive：组件常驻，仅 hidden，需 active 变化触发）
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive) {
      refresh();
    }
  }, [active, refresh]);

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

  // 删除任务：确认弹窗（复用任务画布交互模式）
  const [pendingDelete, setPendingDelete] = useState<WorkflowRun | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDeleteRun = useCallback(async () => {
    if (!pendingDelete) return;
    const run = pendingDelete;
    setDeleting(true);
    setError(null);
    try {
      await deleteWorkflowRun(run.run_id);
      // 本地移除（无论引擎调用是否成功，保证 UI 响应）
      setRuns(prev => prev.filter(r => r.run_id !== run.run_id));
      // 若删除的是当前选中项，清除选中详情
      if (selectedRunId === run.run_id) {
        setSelectedRunId(null);
        setSelectedRun(null);
        setWorkflow(null);
      }
      setPendingDelete(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '删除任务失败');
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, selectedRunId]);

  return (
    <div className="flex-1 flex min-w-0 relative">
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
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(run.status)}`}>{statusLabel(run.status)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(run); setError(null); }}
                      className="text-[9px] px-1 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 font-medium"
                      title="删除任务"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{run.workflow_path || '-'}</div>
                <div className="text-[9px] text-slate-300 mt-0.5">{formatTime(run.started_at)}<span className="ml-1.5 text-slate-400">⏱ {formatDuration(runDurationMs(run.started_at, run.ended_at))}</span></div>
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-[10px] text-red-600 bg-red-50 p-2 border-t border-red-100">{error}</div>}
        {/* 删除任务确认弹窗（复用任务画布交互模式） */}
        {pendingDelete && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-40" onClick={() => { if (!deleting) setPendingDelete(null); }}>
            <div className="bg-white rounded-xl shadow-2xl p-5 w-80 border border-slate-200" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">删除任务</h3>
              <p className="text-xs text-slate-500 mb-4">
                确定删除任务 <span className="font-mono font-semibold text-slate-700">{pendingDelete.run_id}</span> 吗？删除后不可恢复。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                  className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteRun}
                  disabled={deleting}
                  className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50"
                >
                  {deleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
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
