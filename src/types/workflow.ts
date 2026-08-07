export interface WorkflowNode {
  id: string;
  type: 'agent' | 'approval' | 'end';
  agent?: string;
  role?: string;
  interrupt_after?: boolean;
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
