import { useState } from 'react';
import type { WorkflowRun, WorkflowRunRequest } from '../api/client';
import {
  runWorkflow,
  approveWorkflowRun,
  rejectWorkflowRun,
  resumeWorkflowRun,
} from '../api/client';

interface Props {
  activeRun: WorkflowRun | null;
  onRunStarted: (run: WorkflowRun) => void;
  onRunUpdated: (run: WorkflowRun) => void;
}

export default function RunPanel({ activeRun, onRunStarted, onRunUpdated }: Props) {
  const [workflowPath, setWorkflowPath] = useState('/home/ubuntu/web-dev-agent-poc/workflow.yaml');
  const [inputsJson, setInputsJson] = useState('{"requirement": "\u521b\u5efa\u4e00\u4e2a\u7b80\u5355\u7684\u4ea7\u54c1\u9700\u6c42\u6587\u6863"}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const inputs = JSON.parse(inputsJson);
      const req: WorkflowRunRequest = { workflow_path: workflowPath, inputs };
      const run = await runWorkflow(req);
      onRunStarted(run);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject' | 'resume') => {
    if (!activeRun) return;
    try {
      let run: WorkflowRun;
      if (action === 'approve') run = await approveWorkflowRun(activeRun.run_id);
      else if (action === 'reject') run = await rejectWorkflowRun(activeRun.run_id);
      else run = await resumeWorkflowRun(activeRun.run_id);
      onRunUpdated(run);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="font-semibold text-sm text-slate-700">运\u884c\u63a7\u5236</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Workflow 路径</label>
          <input
            type="text"
            value={workflowPath}
            onChange={(e) => setWorkflowPath(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Inputs (JSON)</label>
          <textarea
            value={inputsJson}
            onChange={(e) => setInputsJson(e.target.value)}
            className="w-full h-24 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded"
        >
          {loading ? '启动中...' : '启动 Workflow'}
        </button>

        {activeRun && (
          <div className="border border-slate-200 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Run ID</span>
              <span className="text-xs font-mono truncate max-w-[140px]">{activeRun.run_id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">状态</span>
              <StatusBadge status={activeRun.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">当前节点</span>
              <span className="text-xs font-semibold">{activeRun.current_node || '-'}</span>
            </div>

            {activeRun.status === 'waiting_approval' && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleAction('approve')}
                  className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                >
                  通过
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                >
                  驳回
                </button>
              </div>
            )}

            {activeRun.status === 'running' && (
              <button
                onClick={() => handleAction('resume')}
                className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded"
              >
                继续
              </button>
            )}
          </div>
        )}

        {activeRun?.result && (
          <div className="border border-slate-200 rounded p-3">
            <h3 className="text-xs font-semibold text-slate-700 mb-2">运\u884c\u7ed3\u679c</h3>
            <pre className="text-[10px] font-mono bg-slate-50 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(activeRun.result, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'completed' ? 'bg-green-100 text-green-700' :
    status === 'running' ? 'bg-blue-100 text-blue-700' :
    status === 'failed' ? 'bg-red-100 text-red-700' :
    status === 'waiting_approval' ? 'bg-amber-100 text-amber-700' :
    'bg-slate-100 text-slate-600';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${className}`}>
      {status}
    </span>
  );
}
