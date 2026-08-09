import { useEffect, useState } from 'react';
import type { WorkflowSummary } from '../api/client';
import { listWorkflows, createWorkflow, deleteWorkflow } from '../api/client';

interface Props {
  selected: WorkflowSummary | null;
  onSelect: (wf: WorkflowSummary | null) => void;
  onCreated?: () => void;
}

export default function WorkflowListPanel({
  selected,
  onSelect,
  onCreated,
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

  // 删除工作流（自定义确认弹窗，不用浏览器原生 confirm）
  const [pendingDelete, setPendingDelete] = useState<WorkflowSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // 确认删除工作流（调引擎 DELETE /api/v1/workflows/{id}）
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkflow(pendingDelete.id);
      // 若删除的是当前选中项，清除选中
      if (selected?.id === pendingDelete.id) {
        onSelect(null);
      }
      setPendingDelete(null);
      await refresh();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      // 409 时 detail 是对象 {message, run_ids}
      const msg = typeof detail === 'object' && detail?.message
        ? detail.message + (detail.run_ids?.length ? ` (run: ${detail.run_ids.join(', ')})` : '')
        : detail || e.message;
      setDeleteError(msg);
    } finally {
      setDeleting(false);
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
            <div
              key={wf.path}
              onClick={() => { onSelect(wf); setError(null); }}
              role="button"
              tabIndex={0}
              className={`w-full px-4 py-3 text-left cursor-pointer hover:bg-slate-50 ${selected?.path === wf.path ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 truncate">{wf.name}</span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-[9px] text-slate-400 font-mono">{wf.version}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(wf); setDeleteError(null); }}
                    className="text-[9px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 font-medium"
                    title="删除工作流"
                  >
                    🗑
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{wf.id}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-slate-400">{wf.node_count} 节点</span>
                <span className="text-[9px] text-slate-400 font-mono">{wf.path}</span>
              </div>
              {wf.description && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate">{wf.description}</div>
              )}
            </div>
          ))}
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded m-2">{error}</div>}
      </div>

      {/* 删除工作流确认弹窗（自定义，不用浏览器原生 confirm） */}
      {pendingDelete && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
          onClick={() => { if (!deleting) setPendingDelete(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-5 w-80 border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700 mb-3">删除工作流</h3>
            <p className="text-xs text-slate-600 mb-1">
              确定删除工作流 <span className="font-semibold text-slate-800">{pendingDelete.name}</span> 吗？
            </p>
            <p className="text-[10px] text-slate-400 font-mono mb-3">{pendingDelete.id}</p>
            <p className="text-[10px] text-slate-400 mb-3">将删除工作流定义文件；有 run 引用时引擎会拒绝（409）。</p>
            {deleteError && (
              <div className="mb-3 text-[10px] text-red-600 bg-red-50 p-2 rounded">{deleteError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="text-xs px-3 py-1.5 border border-slate-300 text-slate-600 rounded hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}