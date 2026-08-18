import { useEffect, useState } from 'react';
import { getLLMSettings, saveLLMSettings, testLLMConnection, getLLMStatus, fetchLiteLLMModels } from '../api/client';
import type { LLMSettings, LLMStatus, LiteLLMModelInfo } from '../api/client';

export default function SettingsPanel() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  // v0.1.55: 引擎模式下「默认模型」下拉 —— litellm 可用模型列表（实测过滤白名单）
  const [models, setModels] = useState<LiteLLMModelInfo[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [manualModel, setManualModel] = useState(false);

  useEffect(() => {
    load();
  }, []);

  // v0.1.55: 引擎模式时拉取 litellm 可用模型（走引擎代理端点，issue-093；前端不接触完整 key）
  useEffect(() => {
    if (!settings || settings.mode !== 'engine') {
      setModels(null);
      return;
    }
    let cancelled = false;
    setModelLoading(true);
    (async () => {
      try {
        const list = await fetchLiteLLMModels();
        if (cancelled) return;
        setModels(list);
      } catch (err: any) {
        if (!cancelled) {
          setModels(null);
          console.warn('加载 litellm 模型列表失败:', err?.response?.data?.detail || err?.message || err);
        }
      } finally {
        if (!cancelled) setModelLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.mode]);

  const load = async () => {
    try {
      const [s, st] = await Promise.all([getLLMSettings(), getLLMStatus()]);
      setSettings(s);
      setStatus(st);
    } catch (err: any) {
      setSaveResult({ ok: false, message: err?.response?.data?.detail || err.message });
    }
  };

  const updateField = (field: keyof LLMSettings, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleTest = async () => {
    if (!settings) return;
    setLoading(true);
    setTestResult(null);
    try {
      const res = await testLLMConnection({
        mode: settings.mode,
        litellm_base_url: settings.litellm_base_url,
        litellm_master_key: settings.litellm_master_key || undefined,
        litellm_virtual_key: settings.litellm_virtual_key || undefined,
        default_model: settings.default_model,
      });
      setTestResult({ status: res.status, message: res.message || JSON.stringify(res) });
    } catch (err: any) {
      setTestResult({ status: 'error', message: err?.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    setSaveResult(null);
    try {
      await saveLLMSettings(settings);
      setSaveResult({ ok: true, message: '已保存并热生效' });
      await load();
    } catch (err: any) {
      setSaveResult({ ok: false, message: err?.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!settings) {
    return <div className="p-4 text-xs text-slate-500">加载中...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 overflow-auto">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-slate-700">LLM 设置</h2>
        {status && (
          <span className={`text-[10px] px-2 py-0.5 rounded ${status.llm_ready ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {status.llm_ready ? '就绪' : '未就绪'}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {status && (
          <div className="bg-slate-50 rounded p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">生效模型</span><span className="font-medium">{status.effective_model}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">默认模型</span><span>{status.default_model}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Agent 模型</span><span>{status.agent_model}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">模式</span><span>{status.mode}</span></div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">模式</label>
          <select
            value={settings.mode || 'engine'}
            onChange={(e) => updateField('mode', e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          >
            <option value="engine">engine（走 LiteLLM 网关）</option>
            <option value="factory">factory（直连模型 API）</option>
          </select>
          <p className="text-[10px] text-slate-400 mt-1">engine 模式才是 LiteLLM 代理方式</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">默认模型</label>
          {settings.mode === 'engine' && !manualModel ? (
            <div className="flex gap-1 items-center">
              <select
                value={models?.some(m => m.id === settings.default_model) ? (settings.default_model || '') : '__custom__'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setManualModel(true);
                  } else {
                    updateField('default_model', e.target.value);
                  }
                }}
                disabled={modelLoading}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
              >
                {modelLoading && <option value="">加载可用模型...</option>}
                {!modelLoading && models === null && (
                  <option value="__custom__">{settings.default_model || '无法连接 litellm，点 ✎ 手动输入'}</option>
                )}
                {!modelLoading && models !== null && models.filter(m => m.available).map(m => (
                  <option key={m.id} value={m.id}>✅ {m.id}</option>
                ))}
                {!modelLoading && models !== null && models.filter(m => !m.available).map(m => (
                  <option key={m.id} value={m.id} disabled>⚠️ {m.id}（当前 key 无权限）</option>
                ))}
                {!modelLoading && settings.default_model && models !== null && !models.some(m => m.id === settings.default_model) && (
                  <option value="__custom__">自定义: {settings.default_model}</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => setManualModel(true)}
                title="手动输入模型名"
                className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
              >✎</button>
            </div>
          ) : (
            <div className="flex gap-1 items-center">
              <input
                type="text"
                value={settings.default_model || ''}
                onChange={(e) => updateField('default_model', e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
              {settings.mode === 'engine' && (
                <button
                  type="button"
                  onClick={() => setManualModel(false)}
                  title="返回下拉选择"
                  className="shrink-0 px-2 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                >▾</button>
              )}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-1">engine 模式下为 litellm 可用模型下拉（实测过滤 key 白名单）；✎ 可手动输入自定义值</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">LiteLLM Base URL</label>
          <input
            type="text"
            value={settings.litellm_base_url || ''}
            onChange={(e) => updateField('litellm_base_url', e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">LiteLLM Master Key</label>
          {/* 不用 type="password"：keep-alive 常驻 DOM 会让浏览器密码管理器误判
              整个页面为登录表单，点击任意按钮弹「要保存密码吗？」；CSS 掩码保持圆点显示 */}
          <input
            type="text"
            value={settings.litellm_master_key || ''}
            onChange={(e) => updateField('litellm_master_key', e.target.value)}
            autoComplete="off"
            style={{ WebkitTextSecurity: 'disc' }}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">主密钥（未设置虚拟 key 时使用）</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">LiteLLM Virtual Key</label>
          <input
            type="text"
            value={settings.litellm_virtual_key || ''}
            onChange={(e) => updateField('litellm_virtual_key', e.target.value)}
            autoComplete="off"
            style={{ WebkitTextSecurity: 'disc' }}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">按角色/项目分配的虚拟 key，优先于主密钥（成本拆分与限流）</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={loading}
            className="flex-1 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 text-white text-xs font-medium rounded"
          >
            {loading ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-medium rounded"
          >
            保存
          </button>
        </div>

        {testResult && (
          <div className={`text-xs p-2 rounded ${testResult.status === 'ok' || testResult.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.message}
          </div>
        )}

        {saveResult && (
          <div className={`text-xs p-2 rounded ${saveResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {saveResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
