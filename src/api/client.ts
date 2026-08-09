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
  started_at?: string;
  finished_at?: string;
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

export interface NodeConfigResponse {
  run_id: string;
  node_id: string;
  agent_path: string;
  role: string | null;
  content: string;
}

export const getNodeConfig = (runId: string, nodeId: string) =>
  api.get<NodeConfigResponse>(`/workflow/runs/${runId}/nodes/${nodeId}/config`).then(r => r.data);

export const getArtifactPreviewUrl = (runId: string, filePath: string) =>
  `/api/v1/workflow/runs/${runId}/artifact-files/${encodeURIComponent(filePath)}`;

/**
 * 探测 run 是否存在产物（v0.5.x 引擎产物走 snapshot 磁盘 + artifact-files 端点，
 * run 详情 result/artifacts 字段为空，需探测端点判断）。
 * 默认探测 web-dev 产物固定路径 outputs/index.html。
 * 注意：artifact-files 端点仅支持 GET（HEAD 返回 405），探测后取消 body 读取。
 */
export const checkRunArtifact = (runId: string, filePath = 'outputs/index.html') =>
  fetch(`/api/v1/workflow/runs/${runId}/artifact-files/${encodeURIComponent(filePath)}`)
    .then(r => {
      if (r.ok && r.body) r.body.cancel();
      return r.ok;
    })
    .catch(() => false);

export interface LLMSettings {
  mode: 'engine' | 'factory' | null;
  litellm_base_url: string | null;
  litellm_master_key: string | null;
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

export const createAgent = (name: string, model: string, description: string) =>
  api.post('/agents', { name, model, description }).then(r => r.data);

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

export default api;
