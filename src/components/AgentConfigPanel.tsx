import { useEffect, useState } from 'react';
import * as yaml from 'js-yaml';
import {
  readProjectFile,
  writeProjectFile,
  listAgents,
  createAgent,
  type AgentSummary,
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

  const refreshAgents = async () => {
    try {
      const data = await listAgents();
      setAgents(data?.agents || []);
    } catch (e: any) {
      setError(`加载 Agent 列表失败: ${e?.response?.data?.detail || e.message}`);
    }
  };

  useEffect(() => {
    refreshAgents();
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
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
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
                <h4 className="text-[11px] font-semibold text-slate-700">agent.yaml</h4>
                <button
                  onClick={handleSaveAgent}
                  disabled={saving}
                  className="text-[10px] px-2 py-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded"
                >
                  保存 agent.yaml
                </button>
              </div>
              <textarea
                value={agentYaml}
                onChange={(e) => setAgentYaml(e.target.value)}
                className="w-full h-40 px-2 py-1.5 text-[10px] font-mono border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                placeholder="# agent 配置..."
              />
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
