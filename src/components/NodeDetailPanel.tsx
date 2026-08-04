import { useEffect, useState } from 'react';
import type { WorkflowDef, WorkflowNode } from '../types/workflow';
import { getNodeConfig } from '../api/client';

interface Props {
  nodeId: string | null;
  workflow: WorkflowDef | null;
  activeRunId: string | null;
  onClose: () => void;
}

export default function NodeDetailPanel({ nodeId, workflow, activeRunId, onClose }: Props) {
  const [configContent, setConfigContent] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const node: WorkflowNode | undefined = nodeId ? workflow?.nodes[nodeId] : undefined;
  const outgoingEdges = workflow?.edges.filter((e) => e.source === nodeId) || [];

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
        <h3 className="font-semibold text-sm text-slate-700">节点: {nodeId}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
          &times;
        </button>
      </div>

      <div className="p-4 space-y-3 text-xs">
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
            <div className="text-red-600 bg-red-50 p-2 rounded text-[10px]">{configError}</div>
          )}
          {node.agent && configContent !== null && (
            <pre className="font-mono text-[10px] bg-slate-50 p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap">
              {configContent}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
