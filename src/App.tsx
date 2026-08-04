import { useEffect, useRef, useState } from 'react';
import SettingsPanel from './components/SettingsPanel';
import WorkflowCanvas from './components/WorkflowCanvas';
import YamlEditor from './components/YamlEditor';
import RunPanel from './components/RunPanel';
import EventLog from './components/EventLog';
import NodeDetailPanel from './components/NodeDetailPanel';
import { useWorkflowEvents } from './hooks/useWorkflowEvents';
import { parseWorkflowYaml, generateSampleWorkflow } from './utils/yamlParser';
import type { WorkflowDef } from './types/workflow';
import type { WorkflowRun } from './api/client';
import { getWorkflowRun, listWorkflowRuns, getArtifactPreviewUrl } from './api/client';

function App() {
  const [yamlText, setYamlText] = useState(generateSampleWorkflow());
  const [parseError, setParseError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [rightTab, setRightTab] = useState<'run' | 'settings' | 'events'>('run');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const { events, connected, clearEvents } = useWorkflowEvents('');

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
      setRunHistory(runs?.runs || runs?.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunStarted = (run: WorkflowRun) => {
    setActiveRun(run);
    setRightTab('run');
    clearEvents();
    loadHistory();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="h-14 bg-slate-900 text-white flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-500 rounded" />
          <h1 className="font-semibold text-sm">YiNeng Workflow Console <span className="text-slate-400 font-normal">v0.1.6 POC</span></h1>
        </div>
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

      <main className="flex-1 flex overflow-hidden">
        <div className="w-80 shrink-0">
          <YamlEditor
            value={yamlText}
            onChange={setYamlText}
            onParse={handleParse}
            error={parseError}
          />
        </div>

        <div className="flex-1 min-w-0 relative">
          <WorkflowCanvas
            workflow={workflow}
            activeRun={activeRun}
            onNodeClick={(nodeId) => setSelectedNode(nodeId)}
          />
          <NodeDetailPanel
            nodeId={selectedNode}
            workflow={workflow}
            activeRunId={activeRun?.run_id || null}
            onClose={() => setSelectedNode(null)}
          />
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
              onClick={() => setRightTab('events')}
              className={`flex-1 py-2 text-xs font-medium ${rightTab === 'events' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              事件
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
                onRunStarted={handleRunStarted}
                onRunUpdated={(run) => setActiveRun(run)}
              />
            ) : rightTab === 'events' ? (
              <EventLog events={events} runId={activeRun?.run_id} />
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
              {runHistory.map((run) => {
                const artifacts = run.result ? extractArtifacts(run.result) : [];
                return (
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
                    {artifacts.length > 0 && (
                      <div className="mt-1.5">
                        <a
                          href={getArtifactPreviewUrl(run.run_id, artifacts[0].path)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-block text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        >
                          产物预览
                        </a>
                      </div>
                    )}
                  </button>
                );
              })}
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

function extractArtifacts(result: any): { label: string; path: string }[] {
  const found: { label: string; path: string }[] = [];
  const seen = new Set<string>();

  const add = (label: string, path: string) => {
    if (!path || typeof path !== 'string' || seen.has(path)) return;
    const lower = path.toLowerCase();
    const isPathLike = path.startsWith('/') || path.startsWith('http');
    const isArtifactLike = /\.(html|css|js|png|jpg|jpeg|svg|txt|pdf|zip)$/i.test(lower) || /[\\/]outputs[\\/]/i.test(path) || /[\\/]artifacts[\\/]/i.test(path);
    if (!isPathLike || !isArtifactLike) return;
    seen.add(path);
    found.push({ label, path });
  };

  if (result.output_path) add('输出文件', result.output_path);

  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        add(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => walk(v));
      } else if (typeof value === 'object') {
        walk(value);
      }
    }
  };

  walk(result);
  return found;
}

export default App;
