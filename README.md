# YiNeng Workflow Console (POC)

基于 React + ReactFlow 的多 Agent 编排可视化控制台。**v0.1.10**

## 功能

- **顶级导航**：工作流 / Agent / 设置 三个页签位于顶部黑色横条，与标题同级别
- **工作流管理**（与 Agent 对称）：
  - 左侧列表：切换已有工作流 + 下方 YAML 编辑器（[解析图] [保存]）
  - 右侧画布：ReactFlow 渲染节点与边，节点高亮实时反映运行状态
  - [＋ 新建工作流]：表单创建 → 引擎生成模板 `workflows/{name}.yaml`
  - **双向绑定**：画布编辑（节点弹窗 只读→编辑→保存）实时同步 YAML；YAML 改动解析后更新画布
  - **直接运行**：画布底部输入框填用户需求（默认空，为空时运行按钮置灰）→ [▶ 运行工作流] 一键启动
  - 底部工具栏：运行状态 / 历史记录 / 事件 从右侧抽屉打开
- **Agent 管理**：列表 + 配置编辑 + [＋ 新建 Agent]（引擎 `agents/{name}.yaml` + `prompts/{name}.md`）
- **设置面板**：LLM 模式、默认模型、LiteLLM 配置、连接测试
- **实时状态**：活动 run 轮询刷新，画布节点高亮（running / completed / waiting_approval / failed）
- **产物预览**：运行完成后可直接打开生成的 HTML 产物

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

1. 打开工作流页签，左侧列表选择工作流（或新建）
2. 在底部输入框填写用户需求（对应 `inputs.requirement`）
3. 点击 [▶ 运行工作流]（输入为空时按钮置灰）
4. 画布节点随状态高亮，完成后右侧抽屉可看历史 / 产物预览

## 配置存储

- 配置：文件系统（引擎项目目录，`workflows/*.yaml`、`agents/*.yaml`、`prompts/*.md`）
- 运行状态：PostgreSQL（workflow_runs + LangGraph PostgresCheckpointSaver）

## 注意事项

- LLM 模式：`engine` 表示走 LiteLLM 网关，`factory` 表示直连模型 API。
- 引擎需运行在 `http://localhost:8002`（FastAPI + WebSocket）。

## 更新日志

- **v0.1.10**：运行交互精简——移除"运行控制"抽屉，画布底部直接加用户需求输入框，输入为空时运行按钮置灰；引擎 `/api/v1/workflows` 补 `abs_path` 字段
- **v0.1.9**：工作流 tab 重构——列表 + 画布双向绑定、节点弹窗编辑、底部工具栏 + 右侧抽屉（运行/历史/事件）
- **v0.1.8**：顶级导航重构 + Agent 管理页（列表/编辑/新建）+ 修复 `\\u` 双反斜杠乱码
- **v0.1.7**：产物路径相对项目目录；节点执行高亮；运行面板产物预览

## 未来增强

- [ ] 拖拽编排（直接在画布上连线、添加节点）
- [ ] WebSocket 实时状态推送
- [ ] 详细节点日志
- [ ] 生产化部署（nginx serve dist）
