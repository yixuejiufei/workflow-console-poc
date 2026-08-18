/**
 * 节点类型扩展 (v0.1.58, 适配引擎 issue-095 SmartOrchestrator):
 * - 'agent': 普通 agent 节点 (引擎 NodeConfig.type=null + .agent 必填)
 * - 'approval': 审批断点节点 (interrupt_after=true)
 * - 'end': 终止节点 (__end__)
 * - 'smart_orchestrator': 引擎 SmartOrchestrator 节点 (issue-095)
 *   → NodeConfig.type='smart_orchestrator' + .config 必填（SmartOrchestratorConfig）
 *   → .agent 字段不需要
 */

export type NodeType = 'agent' | 'approval' | 'end' | 'smart_orchestrator';

/** 引擎 SmartOrchestratorConfig 子集 (与 src/yineng_factory/schemas/orchestrator.py 对齐) */
export interface SmartOrchestratorNodeConfig {
  /** 路由决策 LLM（轻量模型） */
  router_model: string;
  /** 编排 LLM（复杂推理） */
  orchestrator_model: string;
  /** 最大拆解子任务数 (complex/parallel 路径)，默认 5 */
  max_subtasks?: number;
  /** 子工作流执行超时（秒），默认 300 */
  subtask_timeout_s?: number;
  /** router 决策超时（秒），默认 30 */
  decision_timeout_s?: number;
  /** router 失败/超时时兜底：simple 走默认工作流 / error 直接报错，默认 simple */
  fallback_to?: 'simple' | 'error';
  /** 允许调用的子 workflow 白名单（去重） */
  available_workflows: string[];
  /** parallel 路径下最大并发子工作流数，默认 3 */
  parallel_max_workers?: number;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  agent?: string;
  role?: string;
  interrupt_after?: boolean;
  /** SmartOrchestrator 节点专属配置（type='smart_orchestrator' 时必填） */
  config?: SmartOrchestratorNodeConfig;
  /** 输入映射：state 字段 -> 节点输入字段（透传 workflow state） */
  inputs?: Record<string, string>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  version: string;
  description?: string;
  namespace?: string;
  initial_state: string;
  nodes: Record<string, WorkflowNode>;
  edges: WorkflowEdge[];
}