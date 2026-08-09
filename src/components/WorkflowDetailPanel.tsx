import type { WorkflowSummary } from '../api/client';

interface Props {
  selected: WorkflowSummary | null;
  yamlText: string;
  onYamlChange: (value: string) => void;
  onParse: () => void;
  parseError: string | null;
  onSave: () => void;
  saving: boolean;
  savedMsg: string | null;
}

/* 工作流详情显示区（右侧）：元信息 + YAML 配置编辑器 */
export default function WorkflowDetailPanel({
  selected,
  yamlText,
  onYamlChange,
  onParse,
  parseError,
  onSave,
  saving,
  savedMsg,
}: Props) {
  if (!selected) {
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden border-l border-slate-200">
        <div className="px-4 py-6 text-xs text-slate-400 text-center">从左侧选择工作流查看配置</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden border-l border-slate-200">
      {/* 头部：工作流元信息 */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <h2 className="font-semibold text-sm text-slate-700 truncate">{selected.name}</h2>
        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
          {selected.id} · v{selected.version}
        </div>
        <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">{selected.path}</div>
        {selected.description && (
          <div className="text-[9px] text-slate-400 mt-1">{selected.description}</div>
        )}
      </div>

      {/* YAML 配置编辑器 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="border border-slate-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-semibold text-slate-700">Workflow YAML</h4>
            <div className="flex items-center gap-1">
              <button
                onClick={onParse}
                className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                解析图
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="text-[10px] px-2 py-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <textarea
            value={yamlText}
            onChange={(e) => onYamlChange(e.target.value)}
            className="w-full h-64 px-2 py-1.5 text-[10px] font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
            placeholder="# workflow 配置..."
            spellCheck={false}
          />
          {parseError && (
            <div className="mt-2 text-[10px] text-red-600 bg-red-50 p-2 rounded">{parseError}</div>
          )}
          {savedMsg && (
            <div className={`mt-2 text-[10px] ${savedMsg.includes('失败') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'} p-2 rounded`}>
              {savedMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
