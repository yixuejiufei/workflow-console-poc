import { useEffect, useState } from 'react';
import type { WorkflowDef, WorkflowNode, SmartOrchestratorNodeConfig } from '../types/workflow';
import { getNodeConfig, readProjectFile } from '../api/client';

interface Props {
  nodeId: string | null;
  workflow: WorkflowDef | null;
  activeRunId: string | null;
  onClose: () => void;
  onSave: (nodeId: string, updates: Partial<WorkflowNode>, edges: { target: string; label?: string }[]) => void;
}

function decodeUnicodeEscapes(text: string): string {
  // 将 \\uXXXX 转义序列解码为真实字符（如 \\u9875 -> 页）
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * 归一化 workflow.yaml 节点里的 agent 引用为引擎可访问路径。
 * workflow.yaml 可写 `agent: main.yaml`（相对文件名），但引擎 agent 配置走 DB config store，
 * 虚拟路径为 `agents/{name}.yaml`（listAgents 返回的 path）——`main.yaml` 直读会被沙箱 Access denied。
 * 规则：`agent.yaml`（单 agent 项目）与 `agents/...` 保持原样；其他（`main.yaml` 等）加 `agents/` 前缀。
 */
function toAgentStorePath(agentRef: string): string {
  const norm = agentRef.startsWith('/') ? agentRef.slice(1) : agentRef;
  if (!norm) return norm;
  if (norm === 'agent.yaml' || norm.startsWith('agents/')) return norm;
  return `agents/${norm}`;
}

/** SmartOrchestratorConfig 默认值（与引擎 SmartOrchestratorConfig schema 对齐） */
const SMART_DEFAULT: SmartOrchestratorNodeConfig = {
  router_model: 'deepseek-v4-flash',
  orchestrator_model: 'deepseek-v4-flash',
  max_subtasks: 5,
  subtask_timeout_s: 300,
  decision_timeout_s: 30,
  fallback_to: 'simple',
  available_workflows: ['factory-workflow'],
  parallel_max_workers: 3,
};

export default function NodeEditModal({ nodeId, workflow, activeRunId, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [configContent, setConfigContent] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // 普通 agent 节点编辑表单状态
  const [agent, setAgent] = useState('');
  const [nextTarget, setNextTarget] = useState('');
  const [nextLabel, setNextLabel] = useState('');
  const [interruptAfter, setInterruptAfter] = useState(false);

  // SmartOrchestrator 节点编辑表单状态 (v0.1.58)
  const [smartCfg, setSmartCfg] = useState<SmartOrchestratorNodeConfig>(SMART_DEFAULT);
  const [wfListRaw, setWfListRaw] = useState<string>('factory-workflow');

  const [editError, setEditError] = useState<string | null>(null);

  const node: WorkflowNode | undefined = nodeId ? workflow?.nodes[nodeId] : undefined;
  const outgoingEdges = workflow?.edges.filter((e) => e.source === nodeId) || [];
  const isSmart = node?.type === 'smart_orchestrator';

  useEffect(() => {
    setEditing(false);
    setSaved(false);
    setConfigContent(null);
    setConfigError(null);
    // SmartOrchestrator 节点没有 agent，跳过 agent.yaml 加载
    if (!nodeId || !node?.agent) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (activeRunId) {
      // 有 run 上下文：从 run 读取节点 Agent 配置（可定位到该 run 的 workflow 文件）
      getNodeConfig(activeRunId, nodeId)
        .then((res) => {
          setConfigContent(res.content);
          setConfigError(null);
        })
        .catch((err) => {
          setConfigError(err?.response?.data?.detail || err.message || '加载失败');
        })
        .finally(() => setLoading(false));
    } else {
      // 无 run 上下文（如新建/从未运行的工作流）：直接读项目文件里的 agent.yaml 原文
      // 归一化 agent 引用：workflow.yaml 里可写 main.yaml（相对文件名），但引擎 agent 配置
      // 走 DB config store（agents/{name}.yaml 虚拟路径）——main.yaml 直读会被沙箱 Access denied
      readProjectFile(toAgentStorePath(node.agent))
        .then((res) => {
          setConfigContent(res.content);
          setConfigError(null);
        })
        .catch((err) => {
          setConfigError(err?.response?.data?.detail || err.message || '加载失败');
        })
        .finally(() => setLoading(false));
    }
  }, [activeRunId, nodeId, node?.agent]);

  // 点击编辑时填充表单
  useEffect(() => {
    if (!editing || !node) return;
    setEditError(null);
    if (isSmart) {
      // SmartOrchestrator 表单：用 node.config（缺省 SMART_DEFAULT）
      const cfg = node.config ? { ...SMART_DEFAULT, ...node.config } : SMART_DEFAULT;
      setSmartCfg(cfg);
      setWfListRaw((cfg.available_workflows || []).join('\n'));
    } else {
      setAgent(node.agent || '');
      setInterruptAfter(!!node.interrupt_after);
      const defaultEdge = outgoingEdges.find((e) => !e.label);
      setNextTarget(defaultEdge?.target || '');
      setNextLabel(outgoingEdges.find((e) => e.label)?.label || '');
    }
  }, [editing, nodeId]);

  if (!nodeId || !node) return null;

  const handleSave = () => {
    setEditError(null);
    if (isSmart) {
      // SmartOrchestrator 节点：解析 available_workflows 多行文本（每行一个 workflow id），去重/去空
      const wfs = wfListRaw
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
      if (wfs.length === 0) {
        setEditError('available_workflows 不能为空（至少 1 个子 workflow）');
        return;
      }
      if (!smartCfg.router_model?.trim()) {
        setEditError('router_model 不能为空');
        return;
      }
      if (!smartCfg.orchestrator_model?.trim()) {
        setEditError('orchestrator_model 不能为空');
        return;
      }
      const updates: Partial<WorkflowNode> = {
        type: 'smart_orchestrator',
        config: {
          ...smartCfg,
          available_workflows: Array.from(new Set(wfs)),
          max_subtasks: Number(smartCfg.max_subtasks ?? 5),
          subtask_timeout_s: Number(smartCfg.subtask_timeout_s ?? 300),
          decision_timeout_s: Number(smartCfg.decision_timeout_s ?? 30),
          parallel_max_workers: Number(smartCfg.parallel_max_workers ?? 3),
          fallback_to: smartCfg.fallback_to || 'simple',
        },
      };
      onSave(nodeId, updates, []);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    // 普通 agent 节点保存
    if (!agent.trim()) {
      setEditError('agent 不能为空');
      return;
    }
    const updates: Partial<WorkflowNode> = {
      agent: agent.trim(),
      interrupt_after: interruptAfter,
    };
    const newEdges: { target: string; label?: string }[] = [];
    if (nextTarget.trim()) {
      newEdges.push({ target: nextTarget.trim(), label: nextLabel.trim() || undefined });
    }
    onSave(nodeId, updates, newEdges);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl border border-slate-200 w-96 max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between sticky top-0">
          <h3 className="font-semibold text-sm text-slate-700">
            节点: {nodeId}
            {isSmart && <span className="ml-2 text-[10px] text-purple-600 font-normal">(SmartOrchestrator)</span>}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          {!editing ? (
            <>
              {/* 只读视图 */}
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">类型</span>
                <span className="col-span-2 font-medium">
                  {node.type}
                  {isSmart && <span className="ml-1 text-purple-600">🧠</span>}
                </span>
              </div>
              {node.role && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">role</span>
                  <span className="col-span-2 font-medium">{node.role}</span>
                </div>
              )}
              {node.agent && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">agent</span>
                  <span className="col-span-2 font-mono break-all">{node.agent}</span>
                </div>
              )}
              {/* SmartOrchestrator config 只读展示 */}
              {isSmart && node.config && (
                <div className="border-t border-slate-200 pt-3 space-y-1.5">
                  <div className="text-slate-500 mb-1">SmartOrchestrator 配置</div>
                  <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">router_model</span><span className="col-span-2 font-mono">{node.config.router_model}</span></div>
                  <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">orchestrator_model</span><span className="col-span-2 font-mono">{node.config.orchestrator_model}</span></div>
                  {node.config.max_subtasks !== undefined && (
                    <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">max_subtasks</span><span className="col-span-2">{node.config.max_subtasks}</span></div>
                  )}
                  {node.config.subtask_timeout_s !== undefined && (
                    <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">subtask_timeout_s</span><span className="col-span-2">{node.config.subtask_timeout_s}</span></div>
                  )}
                  {node.config.decision_timeout_s !== undefined && (
                    <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">decision_timeout_s</span><span className="col-span-2">{node.config.decision_timeout_s}</span></div>
                  )}
                  {node.config.fallback_to && (
                    <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">fallback_to</span><span className="col-span-2">{node.config.fallback_to}</span></div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-500">available_workflows</span>
                    <span className="col-span-2 font-mono text-[10px]">{(node.config.available_workflows || []).join(', ')}</span>
                  </div>
                  {node.config.parallel_max_workers !== undefined && (
                    <div className="grid grid-cols-3 gap-2"><span className="text-slate-500">parallel_max_workers</span><span className="col-span-2">{node.config.parallel_max_workers}</span></div>
                  )}
                </div>
              )}
              {!isSmart && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">审批断点</span>
                  <span className="col-span-2">{node.interrupt_after ? '是' : '否'}</span>
                </div>
              )}

              {outgoingEdges.length > 0 && (
                <div>
                  <div className="text-slate-500 mb-1">下一节点</div>
                  <div className="space-y-1">
                    {outgoingEdges.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 font-mono text-[10px] bg-slate-50 p-1.5 rounded">
                        <span className="text-slate-600">&rarr; {e.target}</span>
                        {e.label && <span className="ml-auto text-slate-400">[{e.label}]</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 普通 agent 节点的 yaml 预览（SmartOrchestrator 不需要） */}
              {!isSmart && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-slate-500 mb-1">Agent 配置</div>
                  {!node.agent && (
                    <div className="bg-slate-50 text-slate-500 p-2 rounded text-[10px]">
                      该节点未配置 agent。
                    </div>
                  )}
                  {node.agent && loading && (
                    <div className="text-slate-400 text-[10px]">加载中...</div>
                  )}
                  {node.agent && configError && (
                    <div className="text-red-600 bg-red-50 p-2 rounded text-[10px]">
                      {configError}
                      {configError.includes('not found') && (
                        <div className="mt-1 text-slate-500">提示：该节点引用的 Agent 文件不存在，请先在「Agent」页签创建名为 {node.agent} 的 Agent。</div>
                      )}
                    </div>
                  )}
                  {node.agent && configContent !== null && (
                    <pre className="font-mono text-[10px] bg-slate-50 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                      {decodeUnicodeEscapes(configContent)}
                    </pre>
                  )}
                </div>
              )}

              <button
                onClick={() => setEditing(true)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded"
              >
                编辑
              </button>
            </>
          ) : (
            <>
              {/* 编辑视图 */}
              {isSmart ? (
                <SmartOrchestratorForm
                  cfg={smartCfg}
                  wfListRaw={wfListRaw}
                  onCfgChange={setSmartCfg}
                  onWfListChange={setWfListRaw}
                />
              ) : (
                <>
                  <div>
                    <label className="block text-slate-500 mb-1">agent</label>
                    <input
                      type="text"
                      value={agent}
                      onChange={(e) => setAgent(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">下一节点 (next)</label>
                    <input
                      type="text"
                      value={nextTarget}
                      onChange={(e) => setNextTarget(e.target.value)}
                      placeholder="__end__ 或节点 id"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">条件标签 (可选)</label>
                    <input
                      type="text"
                      value={nextLabel}
                      onChange={(e) => setNextLabel(e.target.value)}
                      placeholder="如: passed / failed / approved"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={interruptAfter}
                      onChange={(e) => setInterruptAfter(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-slate-600">审批断点 (interrupt_after)</span>
                  </label>
                </>
              )}

              {editError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{editError}</div>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded"
                >
                  保存
                </button>
              </div>
            </>
          )}

          {saved && !editing && (
            <div className="text-xs text-green-600 bg-green-50 p-2 rounded">节点已保存 ✓（同步到 YAML）</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** SmartOrchestrator 节点编辑表单（v0.1.58） */
function SmartOrchestratorForm({
  cfg,
  wfListRaw,
  onCfgChange,
  onWfListChange,
}: {
  cfg: SmartOrchestratorNodeConfig;
  wfListRaw: string;
  onCfgChange: (cfg: SmartOrchestratorNodeConfig) => void;
  onWfListChange: (raw: string) => void;
}) {
  const set = (patch: Partial<SmartOrchestratorNodeConfig>) => onCfgChange({ ...cfg, ...patch });
  return (
    <>
      <div className="text-slate-500 text-[11px] mb-1">SmartOrchestrator（issue-095）：router LLM 判定任务复杂度，simple 直接调子 workflow，complex 串行拆解，parallel 并发执行，fallback 兜底</div>
      <div>
        <label className="block text-slate-500 mb-1">router_model</label>
        <input
          type="text"
          value={cfg.router_model}
          onChange={(e) => set({ router_model: e.target.value })}
          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-slate-500 mb-1">orchestrator_model</label>
        <input
          type="text"
          value={cfg.orchestrator_model}
          onChange={(e) => set({ orchestrator_model: e.target.value })}
          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-slate-500 mb-1">available_workflows <span className="text-slate-400">（每行 1 个，逗号也可）</span></label>
        <textarea
          value={wfListRaw}
          onChange={(e) => onWfListChange(e.target.value)}
          rows={3}
          placeholder={'factory-workflow\ncoding-workflow'}
          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-slate-500 mb-1">max_subtasks</label>
          <input
            type="number" min={1} max={20}
            value={cfg.max_subtasks ?? 5}
            onChange={(e) => set({ max_subtasks: Number(e.target.value) })}
            className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">parallel_max_workers</label>
          <input
            type="number" min={1} max={10}
            value={cfg.parallel_max_workers ?? 3}
            onChange={(e) => set({ parallel_max_workers: Number(e.target.value) })}
            className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-slate-500 mb-1">decision_timeout_s</label>
          <input
            type="number" min={1}
            value={cfg.decision_timeout_s ?? 30}
            onChange={(e) => set({ decision_timeout_s: Number(e.target.value) })}
            className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">subtask_timeout_s</label>
          <input
            type="number" min={10}
            value={cfg.subtask_timeout_s ?? 300}
            onChange={(e) => set({ subtask_timeout_s: Number(e.target.value) })}
            className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-slate-500 mb-1">fallback_to</label>
        <select
          value={cfg.fallback_to ?? 'simple'}
          onChange={(e) => set({ fallback_to: e.target.value as 'simple' | 'error' })}
          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
        >
          <option value="simple">simple（router 失败走默认 workflow）</option>
          <option value="error">error（router 失败直接报错）</option>
        </select>
      </div>
    </>
  );
}