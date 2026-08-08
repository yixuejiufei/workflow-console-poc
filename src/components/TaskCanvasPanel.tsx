import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { listWorkflows, runWorkflow, getWorkflowRun, listWorkflowRuns } from '../api/client';
import type { WorkflowSummary, WorkflowRun } from '../api/client';

interface TaskInstance {
  id: string;
  name: string;
  workflowId: string;
  workflowName: string;
  workflowPath: string;
  absPath: string;
  requirement: string;
  status: 'pending' | 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  runId?: string;
  activeRun?: WorkflowRun | null;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'running': return 'bg-blue-100 text-blue-700';
    case 'queued': return 'bg-yellow-100 text-yellow-700';
    case 'pending': return 'bg-slate-100 text-slate-600';
    case 'failed': return 'bg-red-100 text-red-700';
    case 'waiting_approval': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'completed': return '已完成';
    case 'running': return '进行中';
    case 'queued': return '排队中';
    case 'pending': return '未运行';
    case 'failed': return '失败';
    case 'waiting_approval': return '待审批';
    default: return status;
  }
}

/* 任务标题 + 状态徽章节点 */
function TaskHeaderNode({ data }: any) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded shadow-sm border border-slate-200 min-w-[280px]">
      <span className="text-xs font-semibold text-slate-700">{data.name}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusBadgeClass(data.status)}`}>
        {statusLabel(data.status)}
      </span>
    </div>
  );
}

/* BEGIN 运行按钮节点 */
function TaskBeginNode({ data }: any) {
  const disabled = !data.requirement?.trim() || data.running || ['running', 'queued'].includes(data.status);
  return (
    <div
      style={{
        background: '#eff6ff',
        borderColor: '#2563eb',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 130,
        textAlign: 'center',
      }}
      className="shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className="text-[10px] font-bold text-blue-600 tracking-wider mb-1">begin</div>
      <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) data.onRun?.(); }}
        disabled={disabled}
        className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1.5 rounded font-medium w-full ${
          disabled
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {data.running || data.status === 'running' ? (
          <><span className="w-2 h-2 bg-blue-300 rounded-full animate-pulse" /> 运行中...</>
        ) : (
          <><span>▶</span> 运行</>
        )}
      </button>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/* 用户需求输入节点 */
function TaskUserInputNode({ data }: any) {
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
        value={data.requirement || ''}
        onChange={(e) => { e.stopPropagation(); data.onRequirementChange?.(e.target.value); }}
        placeholder="输入需求..."
        rows={2}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-amber-500 resize-none bg-white"
      />
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

/* 工作流节点（web-dev / end） */
function TaskWorkflowNode({ data }: any) {
  const isEnd = data.id === '__end__';
  const style = {
    background: isEnd ? '#f0fdf4' : data.status === 'running' ? '#eff6ff' : data.status === 'completed' ? '#f0fdf4' : '#ffffff',
    borderColor: isEnd ? '#22c55e' : data.status === 'running' ? '#3b82f6' : data.status === 'completed' ? '#22c55e' : '#3b82f6',
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: '8px 12px',
    minWidth: 130,
    textAlign: 'center' as const,
    boxShadow: data.status === 'running' ? '0 0 0 3px rgba(59,130,246,0.25)' : undefined,
  };
  return (
    <div style={style}>
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <div className={`font-semibold text-xs ${isEnd ? 'text-green-700' : 'text-slate-800'}`}>
        {isEnd ? 'end' : data.id}
      </div>
      {data.status && (
        <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${statusBadgeClass(data.status)}`}>
          {statusLabel(data.status)}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

const nodeTypes = {
  taskHeader: TaskHeaderNode,
  taskBegin: TaskBeginNode,
  taskUserInput: TaskUserInputNode,
  taskWorkflow: TaskWorkflowNode,
};

export default function TaskCanvasPanel() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // 加载可选工作流 & 恢复活跃任务
  useEffect(() => {
    Promise.all([
      listWorkflows(),
      listWorkflowRuns(),
    ]).then(([wfData, runData]) => {
      const wfs = wfData?.workflows || [];
      setWorkflows(wfs);
      const allRuns = runData?.runs || runData?.items || [];
      // 恢复最近的 run 为任务（最多 10 个）
      const restored: TaskInstance[] = [];
      for (const run of allRuns.slice(-10)) {
        const wfPath = run.workflow_path || '';
        const wfSummary = wfs.find(w => wfPath.endsWith(w.path) || wfPath.endsWith('/' + w.path));
        restored.push({
          id: `task-${run.run_id}`,
          name: wfSummary ? `${wfSummary.name} #${restored.length + 1}` : `Run ${run.run_id.slice(0, 8)}`,
          workflowId: wfSummary?.id || '',
          workflowName: wfSummary?.name || '',
          workflowPath: wfSummary?.path || wfPath,
          absPath: wfSummary?.abs_path || wfPath,
          requirement: run.inputs?.requirement || '',
          status: ['pending', 'queued', 'running', 'waiting_approval', 'completed', 'failed'].includes(run.status) ? run.status : 'completed',
          runId: run.run_id,
          activeRun: run,
        });
      }
      if (restored.length > 0) {
        setTasks(restored);
      }
    }).catch(() => {});
  }, []);

  // 新建任务
  const handleAddTask = useCallback((wf: WorkflowSummary) => {
    const newTask: TaskInstance = {
      id: `task-${Date.now().toString(36)}`,
      name: `${wf.name} #${tasks.length + 1}`,
      workflowId: wf.id,
      workflowName: wf.name,
      workflowPath: wf.path,
      absPath: wf.abs_path || '',
      requirement: '',
      status: 'pending',
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    setShowPicker(false);
  }, [tasks.length]);

  // 更新单个任务
  const updateTask = useCallback((taskId: string, patch: Partial<TaskInstance>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  }, []);

  // 运行任务
  const handleRunTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.absPath || !task.requirement.trim() || ['running', 'queued'].includes(task.status)) return;
    updateTask(taskId, { status: 'pending' }); // reset
    try {
      const run = await runWorkflow({
        workflow_path: task.absPath,
        inputs: { requirement: task.requirement.trim() },
      });
      updateTask(taskId, { runId: run.run_id, status: run.status, activeRun: run });
    } catch {
      updateTask(taskId, { status: 'failed' });
    }
  }, [tasks, updateTask]);

  // 更新 requirement
  const handleRequirementChange = useCallback((taskId: string, value: string) => {
    updateTask(taskId, { requirement: value });
  }, [updateTask]);

  // 轮询活跃任务
  useEffect(() => {
    const activeTasks = tasks.filter(t => ['running', 'queued'].includes(t.status) && t.runId);
    if (activeTasks.length === 0) return;
    const iv = setInterval(async () => {
      for (const t of activeTasks) {
        try {
          const run = await getWorkflowRun(t.runId!);
          updateTask(t.id, { status: run.status, activeRun: run });
        } catch {}
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [tasks, updateTask]);

  // 构建画布节点
  const allNodes = useMemo<Node[]>(() => {
    const nodes: Node[] = [];
    tasks.forEach((task, idx) => {
      const ox = 30 + idx * 520; // 每任务水平偏移
      const oy = 40;
      const headerY = oy;
      const rowY = oy + 55;

      // 任务标题
      nodes.push({
        id: `${task.id}__header`,
        type: 'taskHeader',
        position: { x: ox, y: headerY },
        data: { name: task.name, status: task.status },
      });

      // begin
      nodes.push({
        id: `${task.id}__begin`,
        type: 'taskBegin',
        position: { x: ox, y: rowY },
        data: {
          requirement: task.requirement,
          running: false,
          status: task.status,
          onRun: () => handleRunTask(task.id),
          onRequirementChange: (v: string) => handleRequirementChange(task.id, v),
        },
      });

      // userinput
      nodes.push({
        id: `${task.id}__userinput`,
        type: 'taskUserInput',
        position: { x: ox + 165, y: rowY },
        data: {
          requirement: task.requirement,
          onRequirementChange: (v: string) => handleRequirementChange(task.id, v),
        },
      });

      // web-dev 工作流节点
      const executeNodeStatus = task.activeRun
        ? task.activeRun.status === 'completed'
          ? (task.activeRun.executed_nodes || [task.activeRun.current_node]).includes('web-dev') ? 'completed' : ''
          : task.activeRun.current_node === 'web-dev' ? 'running' : ''
        : '';

      nodes.push({
        id: `${task.id}__web-dev`,
        type: 'taskWorkflow',
        position: { x: ox + 400, y: rowY },
        data: { id: 'web-dev', status: task.status === 'running' ? (executeNodeStatus || '') : '' },
      });

      // end
      nodes.push({
        id: `${task.id}__end`,
        type: 'taskWorkflow',
        position: { x: ox + 560, y: rowY },
        data: { id: '__end__', status: task.status === 'completed' ? 'completed' : '' },
      });
    });
    return nodes;
  }, [tasks, handleRunTask, handleRequirementChange]);

  // 构建边
  const allEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    tasks.forEach(task => {
      const tid = task.id;
      edges.push(
        { id: `${tid}__begin->userinput`, source: `${tid}__begin`, target: `${tid}__userinput` },
        { id: `${tid}__userinput->web-dev`, source: `${tid}__userinput`, target: `${tid}__web-dev` },
        { id: `${tid}__web-dev->end`, source: `${tid}__web-dev`, target: `${tid}__end` },
      );
    });
    return edges;
  }, [tasks]);

  const [nodes, setNodes, onNodesChange] = useNodesState(allNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

  useEffect(() => {
    setNodes(allNodes);
    setEdges(allEdges);
  }, [allNodes, allEdges, setNodes, setEdges]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* 主画布区域 */}
      <div className="flex-1 bg-slate-50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
        >
          <Background gap={16} size={1} color="#cbd5e1" />
          <Controls />
          <MiniMap nodeColor={(n) => (n.type === 'taskHeader' ? '#e2e8f0' : n.data?.status === 'running' ? '#3b82f6' : '#94a3b8')} />
        </ReactFlow>
      </div>

      {/* 底部 + 按钮 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={() => setShowPicker(true)}
          className="w-11 h-11 rounded-full bg-blue-600 text-white text-2xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all flex items-center justify-center"
          title="基于现有工作流新建任务"
        >
          +
        </button>
      </div>

      {/* 工作流选择弹窗 */}
      {showPicker && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20" onClick={() => setShowPicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 w-80 border border-slate-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">选择工作流创建任务</h3>
            {workflows.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4">暂无可用工作流</div>
            ) : (
              <div className="space-y-1">
                {workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => handleAddTask(wf)}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-semibold text-slate-700">{wf.name}</div>
                    <div className="text-slate-400 text-[10px] mt-0.5">{wf.description || wf.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}