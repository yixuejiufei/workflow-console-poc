import { useEffect, useState } from 'react';
import * as yaml from 'js-yaml';
import {
  readProjectFile,
  writeProjectFile,
  listAgents,
  createAgent,
  fetchLiteLLMModels,
  type AgentSummary,
  type LiteLLMModelInfo,
} from '../api/client';

interface Props {
  runId: string | null;
  projectDir: string | null;
}

interface AgentInfo {
  name?: string;
  version?: string;
  model?: string;
  temperature?: number | null;
  prompt_version?: string;
  graph_entry?: string;
  description?: string;
  input_schema?: Array<{
    name: string;
    type?: string;
    label?: string;
    required?: boolean;
    description?: string;
  }>;
}

const DEFAULT_SYSTEM_PROMPT = `# 角色定义

你是 {name}，一个 AI Agent。

# 输出要求

- 清晰、准确地响应用户
- 只输出结果，不输出解释
`;

const DEFAULT_AGENT_YAML = (name: string) => `name: ${name}
version: 0.1.0
namespace: ${name.replace(/-/g, '_')}
model: deepseek-v4-flash
litellm_base_url: http://localhost:4000
temperature: 0.7
prompt_version: v1.0
tools_dir: tools
auto_discover_tools: true
graph_entry: graphs.${name}:app
engine_mode: engine
input_schema:
- name: input
  type: text
  label: "输入"
  required: true
  description: "用户输入"
`;

export default function AgentConfigPanel({ runId }: Props) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selected, setSelected] = useState<AgentSummary | null>(null);
  const [agentYaml, setAgentYaml] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptPath, setPromptPath] = useState<string>('prompts/system.md');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // 新建 Agent 表单
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('deepseek-v4-flash');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  // v0.1.56: 新建 Agent 模型下拉 —— 只显示 YiNengProject-coding-agent-poc 虚拟 key 可用模型
  const [agentModels, setAgentModels] = useState<LiteLLMModelInfo[] | null>(null);
  const [agentModelLoading, setAgentModelLoading] = useState(false);
  const [newModelManual, setNewModelManual] = useState(false);
  // v0.1.57: 中间配置区表单化编辑（显式编辑/保存模式，与节点弹窗交互一致）
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AgentInfo>({});
  const [editModelManual, setEditModelManual] = useState(false);
  const [showAdvancedYaml, setShowAdvancedYaml] = useState(false);

  const refreshAgents = async () => {
    try {
      const data = await listAgents();
      setAgents(data?.agents || []);
      // v0.1.57: 选中项同步最新版本号（表单/YAML 保存后引擎 seed bump，避免右侧面板版本滞后）
      setSelected((prev) => {
        if (!prev) return prev;
        const updated = (data?.agents || []).find((a) => a.path === prev.path);
        return updated || prev;
      });
    } catch (e: any) {
      setError(`加载 Agent 列表失败: ${e?.response?.data?.detail || e.message}`);
    }
  };

  useEffect(() => {
    refreshAgents();
    // v0.1.56: 拉取虚拟 key 可用模型列表（设置页同款数据源）
    let cancelled = false;
    setAgentModelLoading(true);
    (async () => {
      try {
        const list = await fetchLiteLLMModels();
        if (!cancelled) setAgentModels(list);
      } catch (err: any) {
        if (!cancelled) {
          setAgentModels(null);
          console.warn('加载 litellm 模型列表失败:', err?.response?.data?.detail || err?.message || err);
        }
      } finally {
        if (!cancelled) setAgentModelLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 选中 agent 时加载配置
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setSavedMsg(null);

    const agentPath = selected.path;
    const agentPromptPath = `prompts/${selected.name}.md`;

    Promise.all([
      readProjectFile(agentPath, runId || undefined).catch((e) => {
        throw new Error(`读取 ${agentPath} 失败: ${e?.response?.data?.detail || e.message}`);
      }),
      // 优先 agent 专属 prompt；不存在则回落 system.md
      readProjectFile(agentPromptPath, runId || undefined)
        .then((f) => ({ content: f.content, path: agentPromptPath }))
        .catch(() =>
          readProjectFile('prompts/system.md', runId || undefined)
            .then((f) => ({ content: f.content, path: 'prompts/system.md' }))
            .catch(() => ({ content: DEFAULT_SYSTEM_PROMPT.replace('{name}', selected.name), path: 'prompts/system.md' }))
        ),
    ])
      .then(([agentFile, promptFile]) => {
        setAgentYaml(agentFile.content);
        setSystemPrompt(promptFile.content);
        setPromptPath(promptFile.path);
        try {
          setForm((yaml.load(agentFile.content) as AgentInfo) || {});
        } catch {
          setForm({});
        }
        setEditing(false);
        setShowAdvancedYaml(false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected?.path, runId]);

  const handleSavePrompt = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await writeProjectFile(promptPath, systemPrompt, runId || undefined);
      setSavedMsg('System Prompt 已保存 ✓');
    } catch (e: any) {
      setError(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgent = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await writeProjectFile(selected.path, agentYaml, runId || undefined);
      setSavedMsg('Agent 配置已保存 ✓');
      refreshAgents();
      try {
        setForm((yaml.load(agentYaml) as AgentInfo) || {});
      } catch { /* ignore */ }
      setEditing(false);
    } catch (e: any) {
      setError(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // v0.1.57: 表单编辑 handlers —— 显式编辑/保存模式
  const handleEdit = () => {
    try {
      setForm((yaml.load(agentYaml) as AgentInfo) || {});
    } catch {
      setForm({});
    }
    setEditModelManual(false);
    setEditing(true);
    setError(null);
    setSavedMsg(null);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    try {
      setForm((yaml.load(agentYaml) as AgentInfo) || {});
    } catch {
      setForm({});
    }
  };

  const handleSaveForm = async () => {
    if (!selected) return;
    if (!form.model || !form.model.trim()) {
      setError('模型不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const obj: any = (yaml.load(agentYaml) as any) || {};
      const merged: any = { ...obj };
      if (form.description !== undefined) merged.description = form.description;
      if (form.model !== undefined) merged.model = form.model.trim();
      if (form.temperature !== undefined && form.temperature !== null) merged.temperature = form.temperature;
      else if (form.temperature === null) delete merged.temperature;
      if (form.prompt_version !== undefined) merged.prompt_version = form.prompt_version;
      if (form.namespace !== undefined) merged.namespace = form.namespace;
      if (form.graph_entry !== undefined) merged.graph_entry = form.graph_entry;
      if (form.engine_mode !== undefined) merged.engine_mode = form.engine_mode;
      if (form.litellm_base_url !== undefined) merged.litellm_base_url = form.litellm_base_url;
      const newYaml = yaml.dump(merged, { indent: 2, lineWidth: -1 });
      setAgentYaml(newYaml);
      await writeProjectFile(selected.path, newYaml, runId || undefined);
      setSavedMsg('Agent 配置已保存 ✓（版本自动 +0.0.1）');
      refreshAgents();
      try {
        setForm((yaml.load(newYaml) as AgentInfo) || {});
      } catch { /* ignore */ }
      setEditing(false);
    } catch (e: any) {
      setError(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError('请输入 Agent 名称');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await createAgent(newName.trim(), newModel, newDesc.trim());
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setSavedMsg(`Agent "${res.name}" 已创建 ✓`);
      await refreshAgents();
      // 自动选中新 agent
      const created = agents.find((a) => a.path === res.path) || { name: res.name, path: res.path, model: res.model, version: '0.1.0' };
      setSelected(created);
    } catch (e: any) {
      setError(`创建失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setCreating(false);
    }
  };

  let agentInfo: AgentInfo | null = null;
  try {
    agentInfo = agentYaml ? (yaml.load(agentYaml) as AgentInfo) : null;
  } catch { /* 解析失败时保留 null */ }

  return (
    <div className="flex-1 flex min-w-0 relative">
      {/* 左侧：Agent 列表 */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-sm text-slate-700">Agent 列表</h2>
          <button
            onClick={() => { setShowCreate(!showCreate); setError(null); }}
            className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            + 新建 Agent
          </button>
        </div>

        {showCreate && (
          <div className="border-b border-slate-200 p-3 space-y-2 bg-blue-50/50 shrink-0">
            <h3 className="text-xs font-semibold text-slate-700">新建 Agent</h3>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如: web-dev, test-agent"
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">模型</label>
              {!newModelManual ? (
                <div className="flex gap-1 items-center">
                  <select
                    value={agentModels?.some(m => m.id === newModel) ? newModel : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setNewModelManual(true);
                      } else {
                        setNewModel(e.target.value);
                      }
                    }}
                    disabled={agentModelLoading}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                  >
                    {agentModelLoading && <option value="">加载可用模型...</option>}
                    {!agentModelLoading && agentModels === null && (
                      <option value="__custom__">{newModel || '无法连接 litellm，点 ✎ 手动输入'}</option>
                    )}
                    {!agentModelLoading && agentModels !== null && agentModels.filter(m => m.available).map(m => (
                      <option key={m.id} value={m.id}>✅ {m.id}</option>
                    ))}
                    {!agentModelLoading && agentModels !== null && agentModels.filter(m => !m.available).map(m => (
                      <option key={m.id} value={m.id} disabled>⚠️ {m.id}（当前 key 无权限）</option>
                    ))}
                    {!agentModelLoading && newModel && agentModels !== null && !agentModels.some(m => m.id === newModel) && (
                      <option value="__custom__">自定义: {newModel}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNewModelManual(true)}
                    title="手动输入模型名"
                    className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                  >✎</button>
                </div>
              ) : (
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setNewModelManual(false)}
                    title="返回下拉选择"
                    className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                  >▾</button>
                </div>
              )}
              <p className="text-[9px] text-slate-400 mt-0.5">仅显示 YiNengProject-coding-agent-poc 虚拟 key 可用模型（实测过滤）</p>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">描述</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Agent 用途描述"
                className="w-full h-14 px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs rounded"
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto divide-y divide-slate-100">
          {agents.length === 0 && !loading && (
            <div className="px-4 py-6 text-xs text-slate-400 text-center">暂无 Agent，点击上方"新建 Agent"创建</div>
          )}
          {agents.map((agent) => (
            <button
              key={agent.path}
              onClick={() => { setSelected(agent); setError(null); setSavedMsg(null); }}
              className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selected?.path === agent.path ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">{agent.name}</span>
                <span className="text-[9px] text-slate-400 font-mono">{agent.version}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{agent.model}</div>
              <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">{agent.path}</div>
              {agent.description && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate">{agent.description}</div>
              )}
            </button>
          ))}
        </div>
        {error && <div className="text-[10px] text-red-600 bg-red-50 p-2 border-t border-red-100">{error}</div>}
      </div>

      {/* 中间：详细配置（Schema / Prompt / agent.yaml） */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">{selected.name} 详细配置</h3>
              <span className="text-[9px] text-slate-400 font-mono truncate">{selected.path}</span>
            </div>

            {loading && <div className="text-xs text-slate-400">加载中...</div>}

            {agentInfo?.input_schema && agentInfo.input_schema.length > 0 && !loading && (
              <div className="border border-slate-200 rounded p-3">
                <h4 className="text-[11px] font-semibold text-slate-700 mb-2">输入 Schema</h4>
                <div className="space-y-1.5">
                  {agentInfo.input_schema.map((f) => (
                    <div key={f.name} className="text-[10px] border border-slate-100 rounded p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{f.name}</span>
                        <span className="text-slate-400">{f.type || 'text'}</span>
                        {f.required && <span className="text-red-500">*</span>}
                      </div>
                      <div className="text-slate-600 mt-0.5">{f.label || f.name}</div>
                      {f.description && <div className="text-slate-400 mt-0.5">{f.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-semibold text-slate-700">System Prompt</h4>
                <button
                  onClick={handleSavePrompt}
                  disabled={saving}
                  className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded"
                >
                  {saving ? '保存中...' : '保存 Prompt'}
                </button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-40 px-2 py-1.5 text-[10px] font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                placeholder="// 系统提示词..."
              />
            </div>

            <div className="border border-slate-200 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-semibold text-slate-700">Agent 配置</h4>
                <div className="flex gap-1">
                  {!editing ? (
                    <button
                      onClick={handleEdit}
                      className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                      编辑
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="text-[10px] px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveForm}
                        disabled={saving}
                        className="text-[10px] px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!editing ? (
                <div className="text-[10px] space-y-1.5">
                  <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">名称</span><span className="font-medium text-right break-all">{agentInfo?.name || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">模型</span><span className="font-mono text-right break-all">{agentInfo?.model || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">温度</span><span className="font-medium">{agentInfo?.temperature ?? '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">Prompt 版本</span><span className="font-medium">{agentInfo?.prompt_version || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">图入口</span><span className="font-mono text-right break-all" title={agentInfo?.graph_entry}>{agentInfo?.graph_entry || '-'}</span></div>
                  {agentInfo?.description && <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">描述</span><span className="text-right break-all">{agentInfo.description}</span></div>}
                  {agentInfo?.litellm_base_url && <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">LLM 地址</span><span className="font-mono text-right break-all">{agentInfo.litellm_base_url}</span></div>}
                  <p className="text-[9px] text-slate-400 pt-1">点击「编辑」修改配置，保存后版本自动 +0.0.1</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">名称（不可修改）</label>
                    <input
                      type="text"
                      value={form.name ?? ''}
                      disabled
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 bg-slate-50 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">模型</label>
                    {!editModelManual ? (
                      <div className="flex gap-1 items-center">
                        <select
                          value={agentModels?.some(m => m.id === form.model) ? form.model : '__custom__'}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') setEditModelManual(true);
                            else setForm((f) => ({ ...f, model: e.target.value }));
                          }}
                          disabled={agentModelLoading}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                        >
                          {agentModelLoading && <option value="">加载可用模型...</option>}
                          {!agentModelLoading && agentModels === null && (
                            <option value="__custom__">{form.model || '无法连接 litellm，点 ✎ 手动输入'}</option>
                          )}
                          {!agentModelLoading && agentModels !== null && agentModels.filter(m => m.available).map(m => (
                            <option key={m.id} value={m.id}>✅ {m.id}</option>
                          ))}
                          {!agentModelLoading && agentModels !== null && agentModels.filter(m => !m.available).map(m => (
                            <option key={m.id} value={m.id} disabled>⚠️ {m.id}（当前 key 无权限）</option>
                          ))}
                          {!agentModelLoading && form.model && agentModels !== null && !agentModels.some(m => m.id === form.model) && (
                            <option value="__custom__">自定义: {form.model}</option>
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => setEditModelManual(true)}
                          title="手动输入模型名"
                          className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                        >✎</button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          value={form.model ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setEditModelManual(false)}
                          title="返回下拉选择"
                          className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                        >▾</button>
                      </div>
                    )}
                    <p className="text-[9px] text-slate-400 mt-0.5">仅显示 YiNengProject-coding-agent-poc 虚拟 key 可用模型（实测过滤）</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-500 mb-0.5">温度</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={form.temperature ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value === '' ? null : Number(e.target.value) }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Prompt 版本</label>
                      <input
                        type="text"
                        value={form.prompt_version ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, prompt_version: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">描述</label>
                    <textarea
                      value={form.description ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full h-16 px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <details className="border border-slate-100 rounded p-2">
                    <summary className="text-[10px] text-slate-500 cursor-pointer">高级配置</summary>
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">命名空间</label>
                        <input
                          type="text"
                          value={form.namespace ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, namespace: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">图入口</label>
                        <input
                          type="text"
                          value={form.graph_entry ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, graph_entry: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">引擎模式</label>
                        <input
                          type="text"
                          value={form.engine_mode ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, engine_mode: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">LLM 地址</label>
                        <input
                          type="text"
                          value={form.litellm_base_url ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, litellm_base_url: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </details>
                  <p className="text-[9px] text-slate-400">输入 Schema 等结构化字段请展开下方「高级 YAML 编辑」</p>
                </div>
              )}

              {!showAdvancedYaml ? (
                <button
                  onClick={() => setShowAdvancedYaml(true)}
                  className="mt-2 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  ▾ 高级 YAML 编辑
                </button>
              ) : (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-[10px] font-semibold text-slate-600">高级 YAML 编辑（含 input_schema 等完整字段）</h5>
                    <button
                      onClick={handleSaveAgent}
                      disabled={saving}
                      className="text-[10px] px-2 py-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded"
                    >
                      {saving ? '保存中...' : '保存 YAML'}
                    </button>
                  </div>
                  <textarea
                    value={agentYaml}
                    onChange={(e) => setAgentYaml(e.target.value)}
                    className="w-full h-32 px-2 py-1.5 text-[10px] font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    placeholder="# agent 配置..."
                  />
                </div>
              )}
            </div>

            {savedMsg && <div className="text-xs text-green-600 bg-green-50 p-2 rounded">{savedMsg}</div>}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            请选择左侧 Agent 查看详细配置
          </div>
        )}
      </div>

      {/* 右侧：Agent 基本信息 */}
      <div className="w-80 shrink-0 border-l border-slate-200 bg-slate-50/50 overflow-y-auto">
        {selected ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">Agent 信息</h3>
              <span className="text-[9px] text-slate-400 font-mono truncate" title={selected.path}>{selected.version}</span>
            </div>

            {loading && <div className="text-xs text-slate-400">加载中...</div>}

            {agentInfo && !loading && (
              <div className="border border-slate-200 rounded p-3 space-y-2 bg-white">
                <h4 className="text-[11px] font-semibold text-slate-700">基本信息</h4>
                <div className="text-[10px] space-y-1.5">
                  <div className="flex justify-between gap-2"><span className="text-slate-500">名称</span><span className="font-medium text-right break-all">{agentInfo.name || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500">版本</span><span className="font-medium">{agentInfo.version || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500">模型</span><span className="font-medium text-right break-all">{agentInfo.model || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500">温度</span><span className="font-medium">{agentInfo.temperature ?? '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500">Prompt 版本</span><span className="font-medium">{agentInfo.prompt_version || '-'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-500">图入口</span><span className="font-mono text-right break-all" title={agentInfo.graph_entry}>{agentInfo.graph_entry || '-'}</span></div>
                </div>
                {agentInfo.description && (
                  <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">{agentInfo.description}</div>
                )}
              </div>
            )}

            <div className="text-[9px] text-slate-400 font-mono break-all bg-slate-100 rounded p-2">{selected.path}</div>
          </div>
        ) : (
          <div className="p-4 text-xs text-slate-400">请选择左侧 Agent 查看基本信息</div>
        )}
      </div>
    </div>
  );
}
