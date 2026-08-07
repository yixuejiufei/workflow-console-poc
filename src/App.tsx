import { useEffect, useRef, useState, useCallback } from 'react';
import SettingsPanel from './components/SettingsPanel';
import WorkflowCanvas from './components/WorkflowCanvas';
import EventLog from './components/EventLog';
import NodeEditModal from './components/NodeEditModal';
import AgentConfigPanel from './components/AgentConfigPanel';
import WorkflowListPanel from './components/WorkflowListPanel';
import { useWorkflowEvents } from './hooks/useWorkflowEvents';
import { parseWorkflowYaml, serializeWorkflow } from './utils/yamlParser';
import type { WorkflowDef, WorkflowNode } from './types/workflow';
import type { WorkflowRun, WorkflowSummary } from './api/client';
import {
  getWorkflowRun,
  listWorkflowRuns,
  getArtifactPreviewUrl,
  getWorkflowConfig,
  listWorkflows,
  readProjectFile,
  writeProjectFile,
  runWorkflow,
} from './api/client';
import { extractArtifacts } from './utils/artifacts';

/** 从 run 的 inputs 中提取 requirement 文本 */
function requirementFromInputs(inputs: Record<string, any> | undefined): string {
  if (!inputs) return '';
  if (typeof inputs.requirement === 'string') return inputs.requirement;
  try { return JSON.stringify(inputs); } catch { return ''; }
}

type TopTab = 'workflow' | 'agent' | 'settings';
type DrawerContent = 'history' | 'events' | null;

function App() {
  const [topTab, setTopTab] = useState<TopTab>('workflow');
  const [yamlText, setYamlText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerContent>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [runRequirement, setRunRequirement] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const { events, connected, clearEvents } = useWorkflowEvents('');

  const handleParse = useCallback((text?: string) => {
    const toParse = text ?? yamlText;
    try {
      const wf = parseWorkflowYaml(toParse);
      setWorkflow(wf);
      setParseError(null);
    } catch (err: any) {
      setParseError(err.message);
    }
  }, [yamlText]);

  const loadHistory = useCallback(async () => {
    try {
      const runs = await listWorkflowRuns();
      setRunHistory(runs?.runs || runs?.items || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // 初始化 & 加载工作流列表
  useEffect(() => {
    listWorkflows().then((data) => {
      const wfs = data?.workflows || [];
      if (wfs.length > 0) {
        setSelectedWorkflow(wfs[0]);
        readProjectFile(wfs[0].path)
          .then((f) => {
            setYamlText(f.content);
            handleParse(f.content);
          })
          .catch(() => {});
      } else {
        const { generateSampleWorkflow } = require('./utils/yamlParser');
        const sample = generateSampleWorkflow();
        setYamlText(sample);
        handleParse(sample);
      }
    }).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  // 选中工作流时加载文件
  useEffect(() => {
    if (!selectedWorkflow) return;
    readProjectFile(selectedWorkflow.path)
      .then((f) => {
        setYamlText(f.content);
        handleParse(f.content);
      })
      .catch((err) => setParseError(err?.response?.data?.detail || err.message));
  }, [selectedWorkflow?.path]);

  // activeRun 变化时加载该 run 真实 workflow 配置来渲染画布
  useEffect(() => {
    if (!activeRun?.run_id) return;
    getWorkflowConfig(activeRun.run_id).then((cfg) => {
      if (cfg?.content) {
        setYamlText(cfg.content);
        handleParse(cfg.content);
      }
    }).catch(() => {});
  }, [activeRun?.run_id]);

  // run 轮询
  useEffect(() => {
    if (activeRun && ['running', 'waiting_approval', 'queued', 'pending'].includes(activeRun.status)) {
      intervalRef.current = window.setInterval(async () => {
        try {
          const run = await getWorkflowRun(activeRun.run_id);
          setActiveRun(run);
          if (!['running', 'waiting_approval', 'queued', 'pending'].includes(run.status)) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            loadHistory();
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeRun?.run_id, activeRun?.status]);

  // 直接运行工作流
  const handleRun = async () => {
    if (!selectedWorkflow?.abs_path || !runRequirement.trim()) return;
    setRunning(true);
    setRunError(null);
    try {
      const inputs = { requirement: runRequirement.trim() };
      const run = await runWorkflow({
        workflow_path: selectedWorkflow.abs_path,
        inputs,
      });
      setActiveRun(run);
      // 保留输入内容，便于"再跑一次"
      clearEvents();
      loadHistory();
    } catch (e: any) {
      setRunError(e?.response?.data?.detail || e.message);
    } finally {
      setRunning(false);
    }
  };

  // 画布节点编辑 → 保存 → 更新 workflow → 更新 YAML
  const handleNodeSave = (nodeId: string, updates: Partial<WorkflowNode>, newEdges: { target: string; label?: string }[]) => {
    if (!workflow) return;
    const wf: WorkflowDef = {
      ...workflow,
      nodes: { ...workflow.nodes },
      edges: [],
    };
    const node = { ...wf.nodes[nodeId] };
    if (updates.agent !== undefined) node.agent = updates.agent;
    if (updates.interrupt_after !== undefined) node.interrupt_after = updates.interrupt_after;
    wf.nodes[nodeId] = node;

    const otherEdges = workflow.edges.filter((e) => e.source !== nodeId);
    wf.edges = [
      ...otherEdges,
      ...newEdges.map((e, i) => ({
        id: `${nodeId}->${e.target}${e.label ? '-' + e.label : ''}${i > 0 ? '-' + i : ''}`,
        source: nodeId,
        target: e.target,
        label: e.label,
      })),
    ];

    setWorkflow(wf);
    const newYaml = serializeWorkflow(wf);
    setYamlText(newYaml);
  };

  // 保存工作流到引擎
  const handleSaveWorkflow = async () => {
    if (!selectedWorkflow) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      await writeProjectFile(selectedWorkflow.path, yamlText);
      setSavedMsg('已保存 ✓');
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e: any) {
      setSavedMsg(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const projectDir = activeRun?.workflow_path
    ? activeRun.workflow_path.substring(0, activeRun.workflow_path.lastIndexOf('/'))
    : null;

  // 当前运行的结果产物
  const currentArtifacts = activeRun?.status === 'completed' && activeRun?.result
    ? extractArtifacts(activeRun.result, activeRun.workflow_path ? activeRun.workflow_path.substring(0, activeRun.workflow_path.lastIndexOf('/')) : '')
    : [];

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="h-14 bg-slate-900 text-white flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-500 rounded" />
          <h1 className="font-semibold text-sm">YiNeng Workflow Console <span className="text-slate-400 font-normal">v0.1.12 POC</span></h1>
        </div>

        <nav className="flex items-center gap-1 h-full">
          {(
            [
              { key: 'workflow', label: '工作流' },
              { key: 'agent', label: 'Agent' },
              { key: 'settings', label: '设置' },
            ] as { key: TopTab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTopTab(t.key)}
              className={`px-4 h-full text-xs font-medium transition-colors ${topTab === t.key ? 'text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-xs">
          <div className={`flex items-center gap-1.5 ${connected ? 'text-green-400' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-slate-500'}`} />
            {connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
          </div>
          <div className="text-slate-400">
            引擎: http://localhost:8002
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {topTab === 'workflow' && (
          <>
            {/* 左侧：工作流列表 + YAML 编辑器（Agent 页签风格） */}
            <div className="w-80 shrink-0 border-r border-slate-200">
              <WorkflowListPanel
                selected={selectedWorkflow}
                onSelect={(wf) => {
                  setSelectedWorkflow(wf);
                  setSelectedNode(null);
                  setDrawer(null);
                  setSavedMsg(null);
                }}
                yamlText={yamlText}
                onYamlChange={setYamlText}
                onParse={() => handleParse()}
                parseError={parseError}
                onSave={handleSaveWorkflow}
                saving={saving}
                savedMsg={savedMsg}
              />
            </div>

              {/* 中间主区域：画布 */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex overflow-hidden relative">
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <WorkflowCanvas
                      workflow={workflow}
                      activeRun={activeRun}
                      onNodeClick={(nodeId) => setSelectedNode(nodeId)}
                      runRequirement={runRequirement}
                      onRequirementChange={setRunRequirement}
                      onRun={handleRun}
                      running={running}
                    />
                  </div>

                  {/* 节点编辑弹窗 */}
                  {selectedNode && (
                    <NodeEditModal
                      nodeId={selectedNode}
                      workflow={workflow}
                      activeRunId={activeRun?.run_id || null}
                      onClose={() => setSelectedNode(null)}
                      onSave={(nodeId, updates, edges) => {
                        handleNodeSave(nodeId, updates, edges);
                        setSelectedNode(null);
                      }}
                    />
                  )}
                </div>

                {/* 底部：运行状态 + 历史/事件 */}
                <div className="shrink-0 bg-white border-t border-slate-200">
                  <div className="flex items-center gap-2 px-4 py-2">
                    {/* 运行状态 */}
                    {activeRun && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-mono text-slate-400 truncate max-w-[100px]">{activeRun.run_id}</span>
                        <StatusBadge status={activeRun.status} />
                        {activeRun.current_node && (
                          <span className="text-slate-400">节点: {activeRun.current_node}</span>
                        )}
                        {/* 审批/继续按钮 */}
                        {activeRun.status === 'waiting_approval' && (
                          <span className="text-amber-600 text-[10px]">等待审批</span>
                        )}
                      </div>
                    )}

                    {/* 产物预览（完成时显示） */}
                    {currentArtifacts.length > 0 && (
                      <div className="flex items-center gap-1">
                        {currentArtifacts.map((a, idx) => (
                          <a
                            key={idx}
                            href={getArtifactPreviewUrl(activeRun!.run_id, a.path)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded hover:bg-green-100 font-medium"
                          >
                            {a.label}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* 运行错误提示 */}
                    {runError && (
                      <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded">{runError}</span>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setDrawer(drawer === 'history' ? null : 'history')}
                        className={`text-xs px-3 py-1.5 rounded border font-medium ${
                          drawer === 'history'
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        历史记录
                      </button>
                      <button
                        onClick={() => setDrawer(drawer === 'events' ? null : 'events')}
                        className={`text-xs px-3 py-1.5 rounded border font-medium ${
                          drawer === 'events'
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        事件
                      </button>
                      {selectedWorkflow && (
                        <span className="text-[10px] text-slate-400 font-mono">{selectedWorkflow.path}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            {/* 右侧抽屉（仅历史/事件） */}
            {drawer && (
              <div className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden z-10">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-semibold text-slate-700">
                    {drawer === 'history' && '历史记录'}
                    {drawer === 'events' && '事件'}
                  </h3>
                  <button onClick={() => setDrawer(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
                </div>
                <div className="flex-1 overflow-auto">
                  {drawer === 'history' && (
                    <div className="divide-y divide-slate-100">
                      {runHistory.length === 0 && (
                        <div className="px-4 py-6 text-xs text-slate-400 text-center">暂无记录</div>
                      )}
                      {runHistory.map((run) => {
                        const pDir = run.workflow_path ? run.workflow_path.substring(0, run.workflow_path.lastIndexOf('/')) : '';
                        const artifacts = run.result ? extractArtifacts(run.result, pDir) : [];
                        return (
                          <button
                            key={run.run_id}
                            onClick={() => {
                              setActiveRun(run);
                              setRunRequirement(requirementFromInputs(run.inputs));
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-slate-50"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">{run.run_id}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass(run.status)}`}>{run.status}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {run.current_node || '-'}
                            </div>
                            {artifacts.length > 0 && (
                              <div className="mt-1">
                                {artifacts.map((a, idx) => (
                                  <a
                                    key={idx}
                                    href={getArtifactPreviewUrl(run.run_id, a.path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-block text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 mr-1"
                                  >
                                    {a.label}
                                  </a>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {drawer === 'events' && (
                    <EventLog events={events} runId={activeRun?.run_id} />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {topTab === 'agent' && (
          <AgentConfigPanel
            runId={activeRun?.run_id || null}
            projectDir={projectDir}
          />
        )}

        {topTab === 'settings' && (
          <SettingsPanel />
        )}
      </main>
    </div>
  );
}

function statusClass(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'running': return 'bg-blue-100 text-blue-700';
    case 'failed': return 'bg-red-100 text-red-700';
    case 'waiting_approval': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'completed' ? 'bg-green-100 text-green-700' :
    status === 'running' ? 'bg-blue-100 text-blue-700' :
    status === 'failed' ? 'bg-red-100 text-red-700' :
    status === 'waiting_approval' ? 'bg-amber-100 text-amber-700' :
    'bg-slate-100 text-slate-600';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${className}`}>
      {status}
    </span>
  );
}

export default App;