import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  useNodesState,
  useEdgesState,
  Position,
  applyNodeChanges,
} from 'reactflow';
import type { Node, Edge, NodeChange } from 'reactflow';
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
  confirmed?: boolean;
}

/** 任务分类 */
type TaskCategory = 'unstarted' | 'running' | 'pending_approval' | 'completed_unconfirmed' | 'failed_unconfirmed';

const CATEGORY_ORDER: TaskCategory[] = ['unstarted', 'running', 'pending_approval', 'completed_unconfirmed', 'failed_unconfirmed'];

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  unstarted: '未开始',
  running: '进行中',
  pending_approval: '待审批',
  completed_unconfirmed: '已完成待人类核实',
  failed_unconfirmed: '已失败待人类核实',
};

function getCategory(task: TaskInstance): TaskCategory | null {
  if (task.confirmed) return null; // 已确认 → 隐藏
  if (!task.runId || task.status === 'pending') return 'unstarted';
  if (task.status === 'running' || task.status === 'queued') return 'running';
  if (task.status === 'waiting_approval') return 'pending_approval';
  if (task.status === 'completed') return 'completed_unconfirmed';
  if (task.status === 'failed') return 'failed_unconfirmed';
  return 'unstarted';
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

/* 分类标题节点 */
function CategoryHeaderNode({ data }: any) {
  const colors: Record<string, string> = {
    unstarted: '#e2e8f0',
    running: '#dbeafe',
    pending_approval: '#fef3c7',
    completed_unconfirmed: '#dcfce7',
    failed_unconfirmed: '#fee2e2',
  };
  return (
    <div
      style={{
        background: colors[data.category] || '#f1f5f9',
        borderLeft: `4px solid ${data.borderColor || '#94a3b8'}`,
        borderRadius: 4,
        padding: '6px 14px',
        minWidth: 260,
      }}
    >
      <span className="text-xs font-bold text-slate-600">{data.label}</span>
      {data.count !== undefined && (
        <span className="text-[10px] text-slate-400 ml-2">({data.count})</span>
      )}
    </div>
  );
}

/* 任务标题 + 状态徽章 + 确认按钮 */
function TaskHeaderNode({ data }: any) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded shadow-sm border border-slate-200 min-w-[360px]">
      <span className="text-xs font-semibold text-slate-700">{data.name}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusBadgeClass(data.status)}`}>
        {statusLabel(data.status)}
      </span>
      {(data.status === 'completed' || data.status === 'failed') && !data.confirmed && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onConfirm?.(); }}
          className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium ml-auto"
        >
          ✓ 确认
        </button>
      )}
      {data.confirmed && (
        <span className="text-[10px] text-slate-400 ml-auto">已确认</span>
      )}
    </div>
  );
}

/* BEGIN 运行按钮节点 */
function TaskBeginNode({ data }: any) {
  const disabled = !data.requirement?.trim() || ['running', 'queued'].includes(data.status);
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
  categoryHeader: CategoryHeaderNode,
  taskHeader: TaskHeaderNode,
  taskBegin: TaskBeginNode,
  taskUserInput: TaskUserInputNode,
  taskWorkflow: TaskWorkflowNode,
};

const TASK_ROW_H = 175;

export default function TaskCanvasPanel() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [organized, setOrganized] = useState(false);
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // 加载可选工作流 & 恢复活跃任务
  useEffect(() => {
    Promise.all([
      listWorkflows(),
      listWorkflowRuns(),
    ]).then(([wfData, runData]) => {
      const wfs = wfData?.workflows || [];
      setWorkflows(wfs);
      const allRuns = runData?.runs || runData?.items || [];
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
    updateTask(taskId, { status: 'pending' });
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

  // 确认任务（已完成/已失败 → 从画布隐藏）
  const handleConfirmTask = useCallback((taskId: string) => {
    updateTask(taskId, { confirmed: true });
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

  // 构建画布节点（过滤已确认 + 按需分组）
  const allNodes = useMemo<Node[]>(() => {
    const visible = tasks.filter(t => !t.confirmed);
    if (visible.length === 0) return [];

    const nodes: Node[] = [];

    if (organized) {
      // 按分类分组
      const groups: Record<TaskCategory, TaskInstance[]> = {
        unstarted: [],
        running: [],
        pending_approval: [],
        completed_unconfirmed: [],
        failed_unconfirmed: [],
      };
      for (const t of visible) {
        const cat = getCategory(t);
        if (cat && groups[cat]) groups[cat].push(t);
      }

      const sectionGap = 40;
      let y = 20;

      for (const cat of CATEGORY_ORDER) {
        const group = groups[cat];
        if (group.length === 0) continue;

        // 分类标题
        nodes.push({
          id: `cat-${cat}`,
          type: 'categoryHeader',
          position: { x: 20, y },
          data: { category: cat, label: CATEGORY_LABEL[cat], count: group.length },
        });
        y += 36;

        for (const task of group) {
          addTaskNodes(nodes, task, 30, y, {
            onRun: () => handleRunTask(task.id),
            onRequirementChange: (v: string) => handleRequirementChange(task.id, v),
            onConfirm: () => handleConfirmTask(task.id),
          });
          y += TASK_ROW_H;
        }
        y += sectionGap;
      }
    } else {
      // 垂直排列（默认）
      for (let i = 0; i < visible.length; i++) {
        const task = visible[i];
        addTaskNodes(nodes, task, 30, 20 + i * TASK_ROW_H, {
          onRun: () => handleRunTask(task.id),
          onRequirementChange: (v: string) => handleRequirementChange(task.id, v),
          onConfirm: () => handleConfirmTask(task.id),
        });
      }
    }

    return nodes;
  }, [tasks, organized, handleRunTask, handleRequirementChange, handleConfirmTask]);

  // 构建边
  const allEdges = useMemo<Edge[]>(() => {
    const visible = tasks.filter(t => !t.confirmed);
    const edges: Edge[] = [];
    for (const task of visible) {
      const tid = task.id;
      edges.push(
        { id: `${tid}__begin->userinput`, source: `${tid}__begin`, target: `${tid}__userinput` },
        { id: `${tid}__userinput->web-dev`, source: `${tid}__userinput`, target: `${tid}__web-dev` },
        { id: `${tid}__web-dev->end`, source: `${tid}__web-dev`, target: `${tid}__end` },
      );
    }
    return edges;
  }, [tasks]);

  const [nodes, setNodes] = useNodesState(allNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

  // 组拖拽：拖分类标题 → 该分类所有任务一起移动；拖任务标题 → 该任务所有子节点一起移动
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(prevNodes => {
      const extra: NodeChange[] = [];

      for (const change of changes) {
        if (change.type === 'position' && change.position && change.dragging) {
          const currentPos = change.position;
          const prevPos = nodePositionsRef.current[change.id];

          if (prevPos) {
            const dx = currentPos.x - prevPos.x;
            const dy = currentPos.y - prevPos.y;

            if (dx !== 0 || dy !== 0) {
              // 分类标题拖拽 → 移动该分类下所有任务节点
              if (change.id.startsWith('cat-')) {
                const cat = change.id.slice(4);
                const taskIdsInCat = new Set(
                  tasks.filter(t => getCategory(t) === cat).map(t => t.id)
                );
                for (const node of prevNodes) {
                  if (node.id === change.id) continue;
                  const baseId = node.id.includes('__') ? node.id.split('__')[0] : node.id;
                  if (taskIdsInCat.has(baseId)) {
                    extra.push({
                      id: node.id,
                      type: 'position',
                      position: {
                        x: node.position.x + dx,
                        y: node.position.y + dy,
                      },
                    });
                  }
                }
              }

              // 任务标题拖拽 → 移动该任务所有子节点
              if (change.id.endsWith('__header')) {
                const baseId = change.id.replace('__header', '');
                const childSuffixes = ['__begin', '__userinput', '__web-dev', '__end'];
                for (const suffix of childSuffixes) {
                  const childId = `${baseId}${suffix}`;
                  const childNode = prevNodes.find(n => n.id === childId);
                  if (childNode) {
                    extra.push({
                      id: childId,
                      type: 'position',
                      position: {
                        x: childNode.position.x + dx,
                        y: childNode.position.y + dy,
                      },
                    });
                  }
                }
              }
            }
          }

          nodePositionsRef.current[change.id] = { x: currentPos.x, y: currentPos.y };
        }
      }

      return applyNodeChanges([...changes, ...extra], prevNodes);
    });
  }, [setNodes, tasks]);

  // 节点结构变化（增删任务/切换整理）时重置布局；仅数据变化（状态轮询）时保留拖拽位置
  const prevNodeIdsRef = useRef<string>('');
  useEffect(() => {
    const nodeIds = allNodes.map(n => n.id).sort().join(',');
    if (prevNodeIdsRef.current !== nodeIds) {
      prevNodeIdsRef.current = nodeIds;
      nodePositionsRef.current = {};
      setNodes(allNodes);
    } else {
      setNodes(prev => allNodes.map(newNode => {
        const oldNode = prev.find(n => n.id === newNode.id);
        return oldNode ? { ...newNode, position: oldNode.position } : newNode;
      }));
    }
    setEdges(allEdges);
  }, [allNodes, allEdges, setNodes, setEdges]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-3">
        <button
          onClick={() => setOrganized(!organized)}
          className={`text-xs px-3 py-1 rounded font-medium border transition-colors ${
            organized
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {organized ? '取消整理' : '整理'}
        </button>
        {organized && (
          <span className="text-[10px] text-slate-400">
            按状态分类 · {tasks.filter(t => !t.confirmed).length} 个任务
          </span>
        )}
        {!organized && (
          <span className="text-[10px] text-slate-400">
            {tasks.filter(t => !t.confirmed).length} 个任务 · 纵向排列
          </span>
        )}
      </div>

      {/* 主画布区域 */}
      <div className="flex-1 bg-slate-50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
        >
          <Background gap={16} size={1} color="#cbd5e1" />
          <Controls />
          <MiniMap />
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

/** 向节点数组添加一个任务的 5 个节点 */
function addTaskNodes(
  nodes: Node[],
  task: TaskInstance,
  ox: number,
  oy: number,
  handlers: {
    onRun: () => void;
    onRequirementChange: (v: string) => void;
    onConfirm: () => void;
  },
) {
  const executeNodeStatus = task.activeRun
    ? task.activeRun.status === 'completed'
      ? (task.activeRun.executed_nodes || [task.activeRun.current_node]).includes('web-dev') ? 'completed' : ''
      : task.activeRun.current_node === 'web-dev' ? 'running' : ''
    : '';
  const taskNodeStatus = task.status;
  const wfNodeStatus = task.status === 'running' ? (executeNodeStatus || '') : task.status === 'completed' ? 'completed' : '';

  nodes.push({
    id: `${task.id}__header`,
    type: 'taskHeader',
    position: { x: ox, y: oy },
    data: {
      name: task.name,
      status: taskNodeStatus,
      confirmed: task.confirmed,
      onConfirm: handlers.onConfirm,
    },
  });

  nodes.push({
    id: `${task.id}__begin`,
    type: 'taskBegin',
    position: { x: ox, y: oy + 50 },
    draggable: false,
    data: {
      requirement: task.requirement,
      status: taskNodeStatus,
      onRun: handlers.onRun,
    },
  });

  nodes.push({
    id: `${task.id}__userinput`,
    type: 'taskUserInput',
    position: { x: ox + 165, y: oy + 50 },
    draggable: false,
    data: {
      requirement: task.requirement,
      onRequirementChange: handlers.onRequirementChange,
    },
  });

  nodes.push({
    id: `${task.id}__web-dev`,
    type: 'taskWorkflow',
    position: { x: ox + 400, y: oy + 50 },
    draggable: false,
    data: { id: 'web-dev', status: wfNodeStatus },
  });

  nodes.push({
    id: `${task.id}__end`,
    type: 'taskWorkflow',
    position: { x: ox + 560, y: oy + 50 },
    draggable: false,
    data: { id: '__end__', status: task.status === 'completed' ? 'completed' : '' },
  });
}