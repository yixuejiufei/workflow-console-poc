import { useEffect, useState } from 'react';
import type { WorkflowSummary } from '../api/client';
import { listWorkflows, createWorkflow } from '../api/client';

interface Props {
  selected: WorkflowSummary | null;
  onSelect: (wf: WorkflowSummary) => void;
  onCreated?: () => void;
  // YAML 编辑器（Agent 页签风格，放在左侧列表下方）
  yamlText: string;
  onYamlChange: (value: string) => void;
  onParse: () => void;
  parseError: string | null;
  onSave: () => void;
  saving: boolean;
  savedMsg: string | null;
}

export default function WorkflowListPanel({
  selected,
  onSelect,
  onCreated,
  yamlText,
  onYamlChange,
  onParse,
  parseError,
  onSave,
  saving,
  savedMsg,
}: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新建工作流表单
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await listWorkflows();
      setWorkflows(data?.workflows || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setCreateError('请输入工作流名称');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createWorkflow(newName.trim(), newDesc.trim());
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      await refresh();
      // 自动选中新工作流
      const created = workflows.find((w) => w.id === res.id) || {
        id: res.id,
        name: res.name,
        version: '0.1.0',
        node_count: 1,
        path: res.path,
        abs_path: '',
      };
      onSelect(created);
      onCreated?.();
    } catch (e: any) {
      setCreateError(e?.response?.data?.detail || e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-sm text-slate-700">工作流</h2>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateError(null); }}
          className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          + 新建工作流
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {showCreate && (
          <div className="border-b border-slate-200 p-4 space-y-2 bg-blue-50/50">
            <h3 className="text-xs font-semibold text-slate-700">新建工作流</h3>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如: my-workflow"
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">描述</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="工作流用途描述"
                className="w-full h-14 px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            {createError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{createError}</div>}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs rounded"
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </div>
        )}

        {/* 工作流列表 */}
        <div className="divide-y divide-slate-100">
          {loading && <div className="px-4 py-6 text-xs text-slate-400 text-center">加载中...</div>}
          {!loading && workflows.length === 0 && (
            <div className="px-4 py-6 text-xs text-slate-400 text-center">暂无工作流，点击右上角"新建工作流"创建</div>
          )}
          {workflows.map((wf) => (
            <button
              key={wf.path}
              onClick={() => { onSelect(wf); setError(null); }}
              className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selected?.path === wf.path ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">{wf.name}</span>
                <span className="text-[9px] text-slate-400 font-mono">{wf.version}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{wf.id}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-slate-400">{wf.node_count} 节点</span>
                <span className="text-[9px] text-slate-400 font-mono">{wf.path}</span>
              </div>
              {wf.description && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate">{wf.description}</div>
              )}
            </button>
          ))}
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded m-2">{error}</div>}

        {/* 选中工作流的 YAML 编辑器（Agent 页签风格） */}
        {selected && (
          <div className="border-t border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">{selected.name} 配置</h3>
              <span className="text-[9px] text-slate-400 font-mono">{selected.path}</span>
            </div>

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
                className="w-full h-56 px-2 py-1.5 text-[10px] font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
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
        )}
      </div>
    </div>
  );
}