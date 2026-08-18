import { useEffect, useState } from 'react';
import type { WorkflowDef, WorkflowNode } from '../types/workflow';
import { getNodeConfig } from '../api/client';

interface Props {
  nodeId: string | null;
  workflow: WorkflowDef | null;
  activeRunId: string | null;
  onClose: () => void;
}

function decodeUnicodeEscapes(text: string): string {
  // 将 \\uXXXX 转义序列解码为真实字符（如 \\u9875 -> 页）
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export default function NodeDetailPanel({ nodeId, workflow, activeRunId, onClose }: Props) {
  const [configContent, setConfigContent] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const node: WorkflowNode | undefined = nodeId ? workflow?.nodes[nodeId] : undefined;
  const outgoingEdges = workflow?.edges.filter((e) => e.source === nodeId) || [];
  const isSmart = node?.type === 'smart_orchestrator';

  useEffect(() => {
    setConfigContent(null);
    setConfigError(null);
    if (!activeRunId || !nodeId || !node?.agent) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getNodeConfig(activeRunId, nodeId)
      .then((res) => {
        setConfigContent(res.content);
        setConfigError(null);
      })
      .catch((err) => {
        setConfigError(err?.response?.data?.detail || err.message || '加载失败');
      })
      .finally(() => setLoading(false));
  }, [activeRunId, nodeId, node?.agent]);

  if (!nodeId || !node) return null;

  return (
    <div className="absolute right-4 top-16 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-10 max-h-[80vh] overflow-auto">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-700">
          节点: {nodeId}
          {isSmart && <span className="ml-2 text-[10px] text-purple-600 font-normal">(SmartOrchestrator)</span>}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
          &times;
        </button>
      </div>

      <div className="p-4 space-y-3 text-xs">
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
        {/* v0.1.58: SmartOrchestrator config 只读展示 */}
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
              <div className="text-red-600 bg-red-50 p-2 rounded text-[10px]">{configError}</div>
            )}
            {node.agent && configContent !== null && (
              <pre className="font-mono text-[10px] bg-slate-50 p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap">
                {decodeUnicodeEscapes(configContent)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}