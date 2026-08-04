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
      const newLevel = levels[curr] + 1;
      if (levels[next] === undefined || newLevel > levels[next]) {
        levels[next] = newLevel;
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
