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
  result?: any;
  error?: string;
  started_at?: string;
  finished_at?: string;
  node_states?: Record<string, NodeState>;
}

export interface NodeState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  started_at?: string;
  finished_at?: string;
  output?: any;
  error?: string;
}

export const runWorkflow = (req: WorkflowRunRequest) =>
  api.post('/workflow/run', req).then(r => r.data);

export const listWorkflowRuns = () =>
  api.get('/workflow/runs').then(r => r.data);

export const getWorkflowRun = (runId: string) =>
  api.get(`/workflow/runs/${runId}`).then(r => r.data);

export const approveWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/approve`).then(r => r.data);

export const rejectWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/reject`).then(r => r.data);

export const resumeWorkflowRun = (runId: string) =>
  api.post(`/workflow/runs/${runId}/resume`).then(r => r.data);

export const getQueueStatus = () =>
  api.get('/workflow/queue').then(r => r.data);

export default api;
