import { useEffect, useState } from 'react';
import type { WorkflowDef, WorkflowNode } from '../types/workflow';
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

export default function NodeEditModal({ nodeId, workflow, activeRunId, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [configContent, setConfigContent] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // 编辑表单状态
  const [agent, setAgent] = useState('');
  const [nextTarget, setNextTarget] = useState('');
  const [nextLabel, setNextLabel] = useState('');
  const [interruptAfter, setInterruptAfter] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const node: WorkflowNode | undefined = nodeId ? workflow?.nodes[nodeId] : undefined;
  const outgoingEdges = workflow?.edges.filter((e) => e.source === nodeId) || [];

  useEffect(() => {
    setEditing(false);
    setSaved(false);
    setConfigContent(null);
    setConfigError(null);
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
      readProjectFile(node.agent)
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
    setAgent(node.agent || '');
    setInterruptAfter(!!node.interrupt_after);
    const defaultEdge = outgoingEdges.find((e) => !e.label);
    setNextTarget(defaultEdge?.target || '');
    setNextLabel(outgoingEdges.find((e) => e.label)?.label || '');
    setEditError(null);
  }, [editing, nodeId]);

  if (!nodeId || !node) return null;

  const handleSave = () => {
    if (!agent.trim()) {
      setEditError('agent 不能为空');
      return;
    }
    const updates: Partial<WorkflowNode> = {
      agent: agent.trim(),
      interrupt_after: interruptAfter,
    };
    // 构造新的出边（默认边 + 条件边）
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
          <h3 className="font-semibold text-sm text-slate-700">节点: {nodeId}</h3>
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
                <span className="col-span-2 font-medium">{node.type}</span>
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
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">审批断点</span>
                <span className="col-span-2">{node.interrupt_after ? '是' : '否'}</span>
              </div>

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