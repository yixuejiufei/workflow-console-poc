import type { WorkflowEvent } from '../hooks/useWorkflowEvents';

interface Props {
  events: WorkflowEvent[];
  runId?: string | null;
}

export default function EventLog({ events, runId }: Props) {
  const filtered = runId
    ? events.filter((e) => e.run_id === runId || (!e.run_id && e.event_type !== 'pong'))
    : events;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
        <h3 className="text-xs font-semibold text-slate-700">实时事件</h3>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <div className="text-xs text-slate-400 px-2 py-1">暂无事件</div>
        )}
        {filtered.map((e, idx) => (
          <div key={idx} className="text-[10px] font-mono border-b border-slate-100 pb-1 last:border-0">
            <div className="flex items-center gap-2">
              <span className={eventTypeClass(e.event_type)}>{e.event_type}</span>
              {e.node_name && <span className="text-slate-600">node={e.node_name}</span>}
              {e.timestamp && (
                <span className="text-slate-400 ml-auto">
                  {new Date(e.timestamp * 1000).toLocaleTimeString()}
                </span>
              )}
            </div>
            {e.error && <div className="text-red-600 truncate">{e.error}</div>}
            {e.data && Object.keys(e.data).length > 0 && (
              <pre className="text-[9px] text-slate-500 mt-0.5 truncate">
                {JSON.stringify(e.data)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function eventTypeClass(type: string) {
  if (type.startsWith('node.')) return 'text-blue-600 font-medium';
  if (type.startsWith('graph.')) return 'text-purple-600 font-medium';
  if (type.startsWith('approval.')) return 'text-amber-600 font-medium';
  if (type.startsWith('tool.')) return 'text-green-600 font-medium';
  if (type.startsWith('llm.')) return 'text-indigo-600 font-medium';
  return 'text-slate-600 font-medium';
}
