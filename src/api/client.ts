import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

export interface WorkflowRunRequest {
  workflow_path: string;
  project_id?: string;
  inputs?: Record<string, any>;
}

export interface WorkflowRun {
  run_id: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  current_node: string | null;
  executed_nodes?: string[];
  workflow_path?: string;
  inputs?: Record<string, any>;
  result?: any;
  error?: string;
  started_at?: string | number;
  ended_at?: string | number;
  confirmed?: boolean;
  // issue-048 契约：节点级 metrics（引擎实现前为空）
  node_metrics?: Record<string, NodeMetrics>;
}

export interface NodeMetrics {
  started_at?: number;
  ended_at?: number;
  duration_ms?: number;
  status?: string;
  tokens_in?: number;
  tokens_out?: number;
  llm_calls?: number;
  // issue-051 契约：工具调用次数（引擎实现前为 undefined）
  tool_calls?: number;
}

// issue-056 契约：workflow run trace 回放（完整生命周期时间线）
export interface TraceTimelineEntry {
  timestamp: number;
  type: string;        // run.start | run.end | span | generation | tool.start | tool.end | ...
  node_name: string | null;
  name: string;
  data: Record<string, any>;
}

export interface RunTrace {
  run_id: string;
  trace_id?: string;
  status: string;
  started_at?: number;
  ended_at?: number;
  duration_ms?: number;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  metadata?: Record<string, any>;
  node_metrics?: Record<string, NodeMetrics>;
  timeline: TraceTimelineEntry[];
  scores?: Array<{ name: string; value: number; comment?: string }>;
}


export interface NodeConfigResponse {
  run_id: string;
  node_id: string;
  agent_path: string;
  role: string | null;
  content: string;
}

export const getNodeConfig = (runId: string, nodeId: string) =>
  api.get<NodeConfigResponse>(`/workflow/runs/${runId}/nodes/${nodeId}/config`).then(r => r.data);

/**
 * artifact-files 端点 URL 编码：逐段 encodeURIComponent 并保留 "/" 分隔符。
 * 若整体 encodeURIComponent（把 "/" 编成 %2F），浏览器不认 %2F 为路径分隔符，
 * 导致 index.html 内相对链接（deploy.html）基于 .../artifact-files/ 解析、丢掉 outputs/ 段 → 404。
 */
const encodeArtifactPath = (filePath: string) =>
  filePath.split('/').map(encodeURIComponent).join('/');

export const getArtifactPreviewUrl = (runId: string, filePath: string) =>
  `/api/v1/workflow/runs/${runId}/artifact-files/${encodeArtifactPath(filePath)}`;

/**
 * 探测 run 是否存在产物（v0.5.x 引擎产物走 snapshot 磁盘 + artifact-files 端点，
 * run 详情 result/artifacts 字段为空，需探测端点判断）。
 * 默认探测 web-dev 产物固定路径 outputs/index.html。
 * 注意：artifact-files 端点仅支持 GET（HEAD 返回 405），探测后取消 body 读取。
 */
export const checkRunArtifact = (runId: string, filePath = 'outputs/index.html') =>
  fetch(`/api/v1/workflow/runs/${runId}/artifact-files/${encodeArtifactPath(filePath)}`)
    .then(r => {
      if (r.ok && r.body) r.body.cancel();
      return r.ok;
    })
    .catch(() => false);

export interface LLMSettings {
  mode: 'engine' | 'factory' | null;
  litellm_base_url: string | null;
  litellm_master_key: string | null;
  litellm_virtual_key: string | null;
  langfuse_host: string | null;
  langfuse_public_key: string | null;
  langfuse_secret_key: string | null;
  default_model: string | null;
  default_temperature: number | null;
}

export interface LLMStatus {
  llm_ready: boolean;
  missing: string[];
  mode: string;
  default_model: string;
  agent_model: string;
  effective_model: string;
}

export const runWorkflow = (req: WorkflowRunRequest) =>
  api.post('/workflow/run', req).then(r => r.data);

export const listWorkflowRuns = () =>
  api.get('/workflow/runs').then(r => r.data);

export const getWorkflowRun = (runId: string) =>
  api.get(`/workflow/runs/${runId}`).then(r => r.data);

/** issue-056 契约：获取 workflow run 完整 trace 回放（时间线 + 聚合指标）。 */
export const getRunTrace = (runId: string) =>
  api.get<RunTrace>(`/workflow/runs/${runId}/trace`).then(r => r.data);

export const getWorkflowConfig = (runId: string) =>
  api.get(`/workflow/runs/${runId}/workflow-config`).then(r => r.data);

export interface ProjectFile {
  status: string;
  path: string;
  content: string;
}

export const readProjectFile = (path: string, runId?: string) =>
  api.get<ProjectFile>('/project/file', { params: { path, run_id: runId } }).then(r => r.data);

export const writeProjectFile = (path: string, content: string, runId?: string) =>
  api.post('/project/file', { path, content, run_id: runId }).then(r => r.data);

export interface AgentSummary {
  name: string;
  path: string;
  model: string;
  version: string;
  description?: string;
}

export const listAgents = () =>
  api.get('/agents').then(r => r.data);

export interface CreateAgentRequestPayload {
  name: string;
  path?: string;        // issue-097: agent yaml 路径（可选），如 agents/deploy.yaml。留空走自动生成
  model?: string;
  description?: string;
}

/** issue-097: path 字段加入 createAgent 请求（v0.1.60） */
export const createAgent = (req: CreateAgentRequestPayload) =>
  api.post('/agents', req).then(r => r.data);

// issue-094/096: DELETE /api/v1/agents/{agent_id}?version=xxx
//   - version 留空删除全部版本；指定时只删该版本
//   - 返回 {deleted, deleted_version, path, versions, history_rows}
//   - 错误：404 agent_not_found / version_not_found；400 slug 含 '/'；409 被 workflow 引用（含 blocking_workflows）
export interface DeleteAgentResult {
  deleted: boolean;
  deleted_version: string | null;   // 单版本删除时 = 被删版本；全删时 = null
  path: string | null;
  versions: string[];              // 被删除的所有版本列表
  history_rows: number;
}

export interface DeleteAgentBlocking {
  detail: string;
  blocking_workflows: Array<{
    workflow_id: string;
    node_id: number;
    agent_ref: string;
  }>;
}

export const deleteAgent = (agentId: string, version?: string) =>
  api.delete<DeleteAgentResult>(`/agents/${agentId}`, { params: { version } }).then(r => r.data);

export interface WorkflowSummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  node_count: number;
  path: string;
  abs_path?: string;
}

export const listWorkflows = () =>
  api.get('/workflows').then(r => r.data);

export const createWorkflow = (name: string, description: string) =>
  api.post('/workflows', { name, description }).then(r => r.data);

export const approveWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/approve`).then(r => r.data);

export const rejectWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/reject`).then(r => r.data);

export const resumeWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/resume`).then(r => r.data);

export const confirmWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/confirm`).then(r => r.data);

export const deleteWorkflowRun = (runId: string) =>
  api.delete(`/workflow/runs/${runId}`).then(r => r.data);

export const deleteWorkflow = (workflowId: string) =>
  api.delete(`/workflows/${workflowId}`).then(r => r.data);

export const getQueueStatus = () =>
  api.get('/workflow/queue').then(r => r.data);

export const getLLMSettings = () =>
  api.get('/settings/llm').then(r => r.data);

export const saveLLMSettings = (settings: Partial<LLMSettings>) =>
  api.post('/settings/llm', settings).then(r => r.data);

export const testLLMConnection = (settings: Partial<LLMSettings>) =>
  api.post('/settings/llm/test', settings).then(r => r.data);

export const getLLMStatus = () =>
  api.get('/settings/llm/status').then(r => r.data);

// ── litellm 可用模型（设置页「默认模型」下拉数据源，v0.1.55）──
// 走引擎代理端点 GET /api/v1/settings/llm/models（issue-093）：
// 引擎内部用 settings.yaml 完整 key 调 litellm /v1/models + 实测过滤，返回 [{id, available}]
// 前端不接触完整 key（引擎 /settings/llm 返回的是掩码 key，直连 litellm 会 401）

export interface LiteLLMModelInfo {
  id: string;
  available: boolean;
}

export const fetchLiteLLMModels = (): Promise<LiteLLMModelInfo[]> =>
  api.get('/settings/llm/models').then(r => r.data);

export default api;
