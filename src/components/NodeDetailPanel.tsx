import { useEffect, useState } from 'react';
import type { WorkflowDef, WorkflowNode } from '../types/workflow';
import { getWorkflowRun } from '../api/client';

interface Props {
  nodeId: string | null;
  workflow: WorkflowDef | null;
  activeRunId: string | null;
  onClose: () => void;
}

interface AgentInfo {
  node: string;
  role?: string;
  agent?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export default function NodeDetailPanel({ nodeId, workflow, activeRunId, onClose }: Props) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const node: WorkflowNode | undefined = nodeId ? workflow?.nodes[nodeId] : undefined;
  const outgoingEdges = workflow?.edges.filter((e) => e.source === nodeId) || [];

  useEffect(() => {
    if (!activeRunId || !nodeId) {
      setAgentInfo(null);
      return;
    }
    setLoading(true);
    getWorkflowRun(activeRunId)
      .then((run) => {
        const workflowPath = run?.workflow_path as string | undefined;
        if (!workflowPath) return;
        // TODO: 引擎暂无提供节点 agent YAML 内容接口，需要 engine-request
      })
      .finally(() => setLoading(false));
  }, [activeRunId, nodeId]);

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
          <div className="bg-amber-50 text-amber-700 p-2 rounded text-[10px]">
            引擎暂未提供节点 Agent YAML 内容读取接口。需创建 engine-request 后在此展示 test.yaml 等文件内容。
          </div>
          {agentInfo?.agent && (
            <div className="mt-2 font-mono text-[10px] text-slate-600">{agentInfo.agent}</div>
          )}
        </div>

        {loading && <div className="text-slate-400">加载中...</div>}
      </div>
    </div>
  );
}
