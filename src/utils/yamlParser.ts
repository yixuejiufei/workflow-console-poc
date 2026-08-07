import { load } from 'js-yaml';
import type { WorkflowDef, WorkflowNode, WorkflowEdge } from '../types/workflow';

const LEVEL_GAP = 220;
const NODE_GAP = 120;

export function parseWorkflowYaml(text: string): WorkflowDef {
  const data = load(text) as any;
  const nodes: Record<string, WorkflowNode> = {};
  const edges: WorkflowEdge[] = [];

  // Build DAG edges from next/default/conditions
  Object.entries(data.nodes || {}).forEach(([id, nodeData]: [string, any]) => {
    nodes[id] = {
      id,
      type: id === '__end__' ? 'end' : nodeData.interrupt_after ? 'approval' : 'agent',
      agent: nodeData.agent,
      role: nodeData.role,
      interrupt_after: nodeData.interrupt_after,
    };

    const next = nodeData.next || {};
    if (next.default && next.default !== id) {
      edges.push({ id: `${id}->${next.default}`, source: id, target: next.default });
    }
    if (next.conditions) {
      Object.entries(next.conditions).forEach(([label, target]: [string, any]) => {
        if (target !== id) {
          edges.push({ id: `${id}->${target}-${label}`, source: id, target, label });
        }
      });
    }
  });

  // 补全边上的节点（如 __end__），避免后续布局时访问 undefined
  edges.forEach(e => {
    if (!nodes[e.target]) {
      nodes[e.target] = {
        id: e.target,
        type: e.target === '__end__' ? 'end' : 'agent',
      };
    }
    if (!nodes[e.source]) {
      nodes[e.source] = {
        id: e.source,
        type: 'agent',
      };
    }
  });

  // Simple topological layout
  const levels = computeLevels(data.initial_state, edges);
  const levelWidths: Record<number, number> = {};
  Object.entries(levels).forEach(([nodeId, level]) => {
    levelWidths[level] = (levelWidths[level] || 0) + 1;
    nodes[nodeId].position = { x: 100 + level * LEVEL_GAP, y: 0 };
  });

  const counters: Record<number, number> = {};
  Object.entries(levels).forEach(([nodeId, level]) => {
    counters[level] = (counters[level] || 0) + 1;
    const count = levelWidths[level];
    const offset = (counters[level] - 1 - (count - 1) / 2) * NODE_GAP;
    nodes[nodeId].position = {
      x: 100 + level * LEVEL_GAP,
      y: 250 + offset,
    };
  });

  return {
    id: data.id,
    name: data.name,
    version: data.version,
    description: data.description,
    namespace: data.namespace,
    initial_state: data.initial_state,
    nodes,
    edges,
  };
}

function computeLevels(start: string, edges: WorkflowEdge[]): Record<string, number> {
  const levels: Record<string, number> = { [start]: 0 };
  const adj: Record<string, string[]> = {};
  edges.forEach(e => {
    adj[e.source] = adj[e.source] || [];
    adj[e.source].push(e.target);
  });

  const queue = [start];
  while (queue.length) {
    const curr = queue.shift()!;
    for (const next of adj[curr] || []) {
      // 只给未分配层级的节点赋值，避免 DAG 中的环导致层级无限增长、主线程卡死
      if (levels[next] === undefined) {
        levels[next] = levels[curr] + 1;
        queue.push(next);
      }
    }
  }

  return levels;
}

export function generateSampleWorkflow(): string {
  return `id: web-product-line
name: Web 产品智能产线
description: 从需求到部署的全流程多 Agent 工作流
version: "0.1.0"
namespace: web-product-line

initial_state: product

nodes:
  product:
    agent: agents/product.yaml
    interrupt_after: true
    next:
      default: design

  design:
    agent: agents/design.yaml
    interrupt_after: true
    next:
      default: develop

  develop:
    agent: agents/develop.yaml
    next:
      default: test

  test:
    agent: agents/test.yaml
    next:
      conditions:
        passed: review
        failed: develop

  review:
    agent: agents/review.yaml
    interrupt_after: true
    next:
      conditions:
        approved: deploy
        rejected: develop

  deploy:
    agent: agents/deploy.yaml
    next:
      default: __end__
`;
}

export function serializeWorkflow(wf: WorkflowDef): string {
  // Reverse of parseWorkflowYaml: converts WorkflowDef back to YAML text
  // Build a map of source -> edges for determining next/default/conditions
  const outgoing: Record<string, { target: string; label?: string }[]> = {};
  wf.edges.forEach(e => {
    if (!outgoing[e.source]) outgoing[e.source] = [];
    outgoing[e.source].push({ target: e.target, label: e.label });
  });

  // Group outgoing edges by label: if all edges have labels, use conditions; otherwise default + conditions
  let lines = `id: ${wf.id}\n`;
  lines += `name: ${wf.name}\n`;
  if (wf.description) lines += `description: ${wf.description}\n`;
  lines += `version: "${wf.version}"\n`;
  if (wf.namespace) lines += `namespace: ${wf.namespace}\n`;
  lines += `\ninitial_state: ${wf.initial_state}\n\n`;
  lines += 'nodes:\n';

  Object.entries(wf.nodes).forEach(([id, node]) => {
    if (id === '__end__') return; // synthetic
    lines += `  ${id}:\n`;
    if (node.agent) lines += `    agent: ${node.agent}\n`;
    if (node.interrupt_after) lines += `    interrupt_after: true\n`;
    
    const edges = outgoing[id] || [];
    // Separate labeled edges (conditions) from unlabeled (default)
    const labeled = edges.filter(e => e.label);
    const unlabeled = edges.filter(e => !e.label);
    
    if (labeled.length > 0) {
      lines += '    next:\n';
      if (unlabeled.length > 0) {
        lines += `      default: ${unlabeled[0].target}\n`;
      }
      lines += '      conditions:\n';
      labeled.forEach(e => {
        lines += `        ${e.label}: ${e.target}\n`;
      });
    } else if (unlabeled.length > 0) {
      lines += '    next:\n';
      lines += `      default: ${unlabeled[0].target}\n`;
    }
  });

  return lines;
}
