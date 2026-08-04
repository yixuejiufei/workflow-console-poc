# YiNeng Workflow Console (POC)

基于 React + ReactFlow 的最小可用多 Agent 编排可视化控制台。

## 功能

- 左侧 YAML 编辑器：编写 / 粘贴 workflow.yaml
- 中间画布：ReactFlow 自动渲染节点与边（Agent / 审批 / 结束）
- 右侧运行面板：启动 workflow、查看状态、人工审批 / 驳回 / 继续
- 设置面板：LLM 模式、默认模型、LiteLLM 配置、连接测试
- 实时轮询：活动 run 每 2 秒刷新状态
- 历史记录：快速切换查看已有 run

## 技术栈

- React 19 + TypeScript + Vite
- ReactFlow 画布
- Tailwind CSS
- Axios

## 快速开始

```bash
cd /home/ubuntu/workflow-console-poc
npm install
npm run dev
```

打开 `http://localhost:3002`。

默认代理到后端 `http://localhost:8002`（由 Vite `vite.config.ts` 配置）。

## 使用流程

1. 在左侧粘贴 workflow.yaml，点击"解析图"
2. 在右侧填入服务器上可访问的 `workflow_path`，例如：
   ```
   /home/ubuntu/YiNengFactory/tests/fixtures/test-workflow/workflow.yaml
   ```
3. 填写 `inputs` JSON，点击"启动 Workflow"
4. 画布上的节点会随状态高亮（running / completed / waiting_approval / failed）

## 注意事项

- LLM 模式：`engine` 表示走 LiteLLM 网关（即 LiteLLM 方式），`factory` 表示直连模型 API。
- 当前默认 workflow 路径使用 `/home/ubuntu/web-dev-agent-poc/workflow.yaml`，该 workflow 使用 `ark/deepseek-v4-flash` 模型经 LiteLLM 代理。

## 未来增强

- [ ] 拖拽编排（直接在画布上连线、添加节点）
- [ ] 保存 workflow 到服务器（需要引擎提供 workflow 上传 API）
- [ ] WebSocket 实时状态推送
- [ ] 详细节点日志与产物预览
- [ ] 多 workflow 项目切换
