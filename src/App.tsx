import { useEffect, useRef, useState } from 'react';
import SettingsPanel from './components/SettingsPanel';
import WorkflowCanvas from './components/WorkflowCanvas';
import YamlEditor from './components/YamlEditor';
import RunPanel from './components/RunPanel';
import { parseWorkflowYaml, generateSampleWorkflow } from './utils/yamlParser';
import type { WorkflowDef } from './types/workflow';
import type { WorkflowRun } from './api/client';
import { getWorkflowRun, listWorkflowRuns } from './api/client';

function App() {
  const [yamlText, setYamlText] = useState(generateSampleWorkflow());
  const [parseError, setParseError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [rightTab, setRightTab] = useState<'run' | 'settings'>('run');
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    handleParse();
    loadHistory();
  }, []);

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

  const handleParse = () => {
    try {
      const wf = parseWorkflowYaml(yamlText);
      setWorkflow(wf);
      setParseError(null);
    } catch (err: any) {
      setParseError(err.message);
    }
  };

  const loadHistory = async () => {
    try {
      const runs = await listWorkflowRuns();
      setRunHistory(runs.items || runs || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="h-14 bg-slate-900 text-white flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-500 rounded" />
          <h1 className="font-semibold text-sm">YiNeng Workflow Console <span className="text-slate-400 font-normal">v0.1.0 POC</span></h1>
        </div>
        <div className="text-xs text-slate-400">
          引擎: http://localhost:8002
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="w-80 shrink-0">
          <YamlEditor
            value={yamlText}
            onChange={setYamlText}
            onParse={handleParse}
            error={parseError}
          />
        </div>

        <div className="flex-1 min-w-0">
          <WorkflowCanvas workflow={workflow} activeRun={activeRun} />
        </div>

        <div className="w-80 shrink-0 flex flex-col">
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => setRightTab('run')}
              className={`flex-1 py-2 text-xs font-medium ${rightTab === 'run' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              运行
            </button>
            <button
              onClick={() => setRightTab('settings')}
              className={`flex-1 py-2 text-xs font-medium ${rightTab === 'settings' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              设置
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === 'run' ? (
              <RunPanel
                activeRun={activeRun}
                onRunStarted={(run) => {
                  setActiveRun(run);
                  loadHistory();
                }}
                onRunUpdated={(run) => setActiveRun(run)}
              />
            ) : (
              <SettingsPanel />
            )}
          </div>

          <div className="flex-1 border-t border-slate-200 bg-white overflow-auto">
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-700">历史记录</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {runHistory.length === 0 && (
                <div className="px-4 py-3 text-xs text-slate-400">暂无记录</div>
              )}
              {runHistory.map((run) => (
                <button
                  key={run.run_id}
                  onClick={() => setActiveRun(run)}
                  className="w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">{run.run_id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass(run.status)}`}>{run.status}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {run.current_node || '-'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
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

export default App;
