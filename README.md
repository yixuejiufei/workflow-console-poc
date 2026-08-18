# YiNeng Workflow Console (POC)

基于 React + ReactFlow 的多 Agent 编排可视化控制台。**v0.1.18**

## 功能

- **顶级导航**：任务画布 / 工作流 / Agent / 设置 四个页签位于顶部黑色横条
- **任务画布**（多工作流实例同屏监控）：
  - 画布同时渲染多个工作流实例，直观查看任务状态（进行中 / 排队中 / 待审批 / 已完成）
  - 底部 `+` 按钮 → 选择工作流 → 生成新任务实例（每个实例：任务标题+状态徽章 → begin → userinput → web-dev → end）
  - 刷新后自动从引擎恢复最近 10 个 run 为任务，状态/需求自动回填
  - **按时间倒序**：任务按创建时间倒序排列（最新在前），整理模式各分类内同样倒序
  - **任务编号显示**：任务信息条显示引擎 run_id（如 `wf-021f9b2f91e2`），与【工作流】历史记录编号一致；新建未运行任务显示「新任务」，运行后自动切换为 run_id
  - 实时轮询：running/queued 任务每 2 秒刷新状态
  - **组拖拽**：拖任务标题（如 Web Dev Workflow #1）→ 该任务全部 5 个节点一起移动；点击「整理」后拖分类标题 → 该分类所有任务一起移动
  - 轮询状态刷新不重置拖拽位置；任务增删/切换整理时才恢复自动布局
- **工作流管理**（与 Agent 对称）：
  - 左侧列表：切换已有工作流 + 下方 YAML 编辑器（[解析图] [保存]）
  - 右侧画布：ReactFlow 渲染节点与边，节点高亮实时反映运行状态
  - [＋ 新建工作流]：表单创建 → 引擎生成模板 `workflows/{name}.yaml`
  - **双向绑定**：画布编辑（节点弹窗 只读→编辑→保存）实时同步 YAML；YAML 改动解析后更新画布
  - **画布节点化运行**：`begin(▶运行) → userinput(参数输入) → 节点 → end`
    - begin 节点：参考 end 节点样式，内含【▶ 运行工作流】按钮（需求为空时置灰）
    - userinput 节点：内嵌输入框，需求直接填在画布节点中
    - 点击历史记录中的 run → 输入框自动回填当时输入的 requirement
    - 运行完成后输入内容保留，可一键「再跑一次」
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

- **v0.1.60**：适配引擎 issue-094/096/097 三个修复 —— `Agent` 页签新增 agent 删除能力 + 创建表单支持 path 字段：
  - `src/api/client.ts` 改动：
    - `createAgent` 签名改为 `CreateAgentRequestPayload`（name/path/model/description）—— path 字段走 issue-097（引擎从 path 自动提取 agent_id）
    - 新增 `deleteAgent(agentId, version?)` —— 封装 DELETE /api/v1/agents/{id}?version=xxx，返回 `DeleteAgentResult` 类型契约
    - 新增 `DeleteAgentResult` / `DeleteAgentBlocking` 类型（响应 + 409 阻断明细）
  - `src/components/AgentConfigPanel.tsx` 改动：
    - 每个 agent 列表项增加 🗑 红色按钮（外层 div + 内层 button 避免嵌套 button + e.stopPropagation 阻止选中穿透）
    - `handleDelete` 函数 + `window.confirm` 确认 + 409 解析（`blocking_workflows` 列表展示 workflow_id/node_id/agent_ref）
    - `newPath` state + 「YAML 路径（可选，如 agents/deploy.yaml；留空自动生成）」输入框
    - 列表重构：`<button>` 改为 `<div>` 嵌套 `<button>`（避免 button 套 button）
  - 验收：
    - ✅ tsc --noEmit 通过（0 errors）
    - ✅ vite HMR 自动热加载（无重启）
    - ✅ 浏览器实测：4 个 agent 列表均显示 🗑 按钮；新建表单含 path 输入框
    - ✅ 引擎端 curl 验证：POST 带 path 创建 + DELETE 孤儿 200 + 错误响应 404
  - ⚠️ **PD 风险发现**（已写 issue-100）：引擎引用检查对裸 slug `agent: dev` 漏检，dev 在 E2E 中被误删；已通过 POST /agents 重建为 v0.1.0（高级字段需用户手动恢复）
- **v0.1.59**：修复 v0.1.58 适配遗漏 —— `src/App.tsx:256` 顶部标题硬编码从 `v0.1.57 POC` 改为 `v0.1.58 POC`（v0.1.58 提交 `0fe8f06` 时仅改了 package.json + README，源码标题忘改，浏览器渲染仍显示 v0.1.57 POC）。`AgentConfigPanel.tsx` 中保留的 v0.1.57 注释是历史 changelog 标记，按用户规则不改。

- **v0.1.58**：适配引擎 v1.5.1 新功能（issue-095/096/097/098）——【Workflow】节点编辑器支持 `SmartOrchestrator`（智能编排）节点类型（紫底紫框，🧠 图标）：
  - `types/workflow.ts`：`NodeType` 联合类型加 `'smart_orchestrator'`；新增 `SmartOrchestratorNodeConfig` 接口（与引擎 `src/yineng_factory/schemas/orchestrator.py` 对齐：router_model / orchestrator_model / max_subtasks / subtask_timeout_s / decision_timeout_s / fallback_to / available_workflows / parallel_max_workers）；`WorkflowNode` 加 `config?` / `inputs?` 字段
  - `utils/yamlParser.ts`：`inferNodeType` 识别 `type=smart_orchestrator`；`parseWorkflowYaml` 透传 `config` / `inputs` 字段；`serializeWorkflow` 输出 `type` 字段 + `serializeSmartConfigPretty` 渲染多行 config（含 `available_workflows` 数组）；普通 agent 节点格式不变（向后兼容已有 workflow.yaml）
  - `components/NodeEditModal.tsx`：只读视图分支显示 SmartOrchestrator config；编辑视图 `SmartOrchestratorForm` 子组件（8 个字段表单：router_model / orchestrator_model / available_workflows 多行输入 / max_subtasks / parallel_max_workers / decision_timeout_s / subtask_timeout_s / fallback_to 下拉）；保存时只传 config + type，不动 edges
  - `components/NodeDetailPanel.tsx`：只读详情面板同步支持 SmartOrchestrator config 展示
  - `components/WorkflowCanvas.tsx`：`nodeColor` / `nodeBorder` 加 `smart_orchestrator` 紫色配色（区别 agent 蓝色 / approval 橙色 / end 绿色）
  - `App.tsx` `handleNodeSave`：透传 `type` / `config` / `inputs` 字段；SmartOrchestrator 类型保留原 edges（不重建）
  - **端到端验证**：8002 已升级 v1.5.1（git tag `v1.5.1`，commit `3f925cf`）；POST `/project/file` 写入含 `type: smart_orchestrator` 的 workflow → POST `/workflow/run` 触发 → `executed_nodes: ['smart_orchestrator']`，35s 内 completed，router 判定 simple 路径调起子 workflow（`run_id=sub-3933ded9c2d4`），issue-096/097/098 测试 14 passed，issue-095 测试 13 passed
  - **未启用 B2 subworkflow tools**（设计文档/prompt/draft 已就绪，`main.yaml` 仍为 v0.1.4）；浏览器手动验证流程见下一步
- **v0.1.57**：【Agent】中间配置区表单化——agent.yaml 文本编辑改为「Agent 配置」表单（显式编辑/保存模式，与节点弹窗一致）：默认只读展示字段（名称/模型/温度/Prompt 版本/图入口/描述/LLM 地址），点【编辑】进入表单可改（模型为下拉——复用 `YiNengProject-coding-agent-poc` 虚拟 key 可用模型数据源 `/settings/llm/models`，✅ 可用 / ⚠️ 无权限置灰 / ✎ 手动兜底；名称不可改），【保存】合并回 YAML 提交引擎（版本自动 +0.0.1），【取消】放弃修改。高级字段（命名空间/图入口/引擎模式/LLM 地址）收进「高级配置」折叠；完整 YAML 编辑保留为「▾ 高级 YAML 编辑」折叠（含 input_schema 等结构化字段）
- **v0.1.56**：【Agent】新建 Agent 表单「模型」改为下拉——只显示 `YiNengProject-coding-agent-poc` 虚拟 key 可用模型（数据源 = 引擎 `/settings/llm/models`，实测过滤：✅ 可用 / ⚠️ 无权限置灰；✎ 手动输入兜底）。与设置页同款交互（v0.1.55 下拉复用）
- **v0.1.55**：【设置】引擎模式下「默认模型」改为下拉选择 litellm 可用模型——数据源 = 引擎代理端点 `GET /api/v1/settings/llm/models`（**issue-093**，v1.4.4 已实现）：引擎内部用虚拟 key（`YiNengProject-coding-agent-poc`）实测过滤，返回 `[{id, available}]`。前端不接触完整 key（引擎 `/settings/llm` 返回掩码 key，直连 litellm 会 401——实测）。下拉中 ✅=可用、⚠️=无权限（置灰禁选）、当前值不在列表时显示「自定义: xxx」；✎ 按钮切换回手动输入（非 engine 模式保持原输入框）。引擎未实现时优雅降级为手动输入
- **v0.1.54**：【任务测评】时间戳时区修复——根因：后端列表/详情接口返回无时区后缀的 naive ISO（UTC 墙钟），`parseRunTimestamp` 用 `new Date(ts)` 按浏览器本地时区（CST）解析，显示偏早 8 小时，与 trace 节点时间线（正确 epoch）形成倒挂。修复：对无时区 ISO 字符串补 `'Z'` 按 UTC 解析（后端契约：naive ISO 即 UTC 墙钟）；带时区后缀 ISO（+00:00/Z）与 epoch 秒/毫秒路径不变。tsc --noEmit 通过
- **v0.1.52**：【任务测评】三项优化——①中间画布鼠标滚轮恢复为放大/缩小（与【任务画布】一致）。根因：ReviewCanvas ReactFlow 设了 `panOnScroll`，把滚轮改成了平移模式；删除该 prop 即恢复 ReactFlow 默认的滚轮缩放。②左侧任务列表每项追加 `⏱ Xm Ys` 执行总时间（日期时间后）。③右侧任务详情头部追加 `⏱ Xm Ys` 执行总时间。复用既有 `formatDuration(ms)`（节点时间线/trace 已在用），新增 `runDurationMs(started_at, ended_at)` 适配函数——有 ended_at 用区间差，否则用 `Date.now()-started_at`（running 状态）。**附带前端兼容修复**：`WorkflowRun` 类型字段名误为 `finished_at`，但引擎 `workflow_runs` 表实际字段名是 `ended_at`（PG 直查确认）。修复：类型改为 `started_at/ended_at: string | number`，新增 `parseRunTimestamp` 自动识别（数字 < 1e12 视为秒 × 1000 转毫秒，>= 1e12 视为已是毫秒；ISO 字符串走 `new Date`），formatTime/runDurationMs 都走它。**⚠️ 修正**：本任务测评实现时新会话撞号创建 issue-081（实际上原 issue-081 + 082 已由工厂-engine 在 v0.7.8 commit 795648d + 61d467b 修复闭环——`time.time()` 全部替换为 `datetime.utcnow().isoformat()`，三端点统一返回 ISO 字符串；697 passed；详情见 closed/issue-081.md 重建记录）。前端 `parseRunTimestamp` 兼容逻辑保留作为防御性编程（兼容历史运行数据 + 防 API 契约回退），无副作用
- **v0.1.51**：【工作流】画布节点弹窗「Agent 配置」报 `Access denied: main.yaml`——根因：workflow.yaml 节点 `agent:` 写的是相对文件名（`main.yaml`），无 run 上下文时 NodeEditModal 直接 `readProjectFile(node.agent)`，但引擎 agent 配置走 DB config store（虚拟路径 `agents/{name}.yaml`），`_is_agent_yaml` 只认 `agent.yaml`/`agents/` 前缀，`main.yaml` 直读落入磁盘沙箱 → Access denied。修复：新增 `toAgentStorePath()` 归一化——`agent.yaml`（单 agent 项目如 web-dev-agent-poc）与 `agents/...` 保持原样，其他（`main.yaml` 等）加 `agents/` 前缀走 DB store
- **v0.1.50**：【任务画布】新建工作流任务未运行时渲染真实节点结构（不再 fallback 单节点 web-dev）——根因：`getWorkflowNodeIds` 仅从 run 记录提取节点，新建未运行任务（无 activeRun）时直接 fallback `['web-dev']`，画布显示 begin→userinput→web-dev→end。修复：①TaskInstance 新增 `wfNodes` 字段——新建任务时异步 `readProjectFile(wf.path)` + `parseWorkflowYaml` 解析 workflow.yaml 实际节点顺序（过滤 __begin__/__userinput__/__end__）；②loadData 从 localStorage 恢复旧格式未运行任务时异步补解析 wfNodes；③`getWorkflowNodeIds` 优先级：executed_nodes → current_node → wfNodes → web-dev（最终兜底）；④updateTask 上移至 loadData 之前（依赖顺序修复，避免 TDZ）
- **v0.1.49**：①【任务画布】预览页面默认展示 deploy agent 部署渲染后的最终页面——探测 `outputs/deploy.html` 存在则预览按钮直接指向 deploy 产物；无 deploy 时回退 `outputs/index.html` 汇总页（新增 `artifactDeployOk` 状态区分）②【任务测评】节点时间线每个 completed 节点新增「产物 ↗」跳转按钮——探测 `outputs/{nodeId}.html` 存在即显示，点击直达该节点产物（`nodeArtifactOk` 缓存）
- **v0.1.48**：修复【预览页面】内相对链接丢失 outputs/ 段（点击 404）——根因：`getArtifactPreviewUrl`/`checkRunArtifact` 用 `encodeURIComponent(filePath)` 整体编码，把 `outputs/index.html` 编成 `outputs%2Findex.html`，浏览器不把 `%2F` 当路径分隔符，导致预览页（index.html）内相对链接（deploy.html 等）基于 `.../artifact-files/` 解析、丢掉 `outputs/` 段 → 点击 404。修复：新增 `encodeArtifactPath` 逐段编码并保留 `/` 分隔符，链接恢复为 `.../artifact-files/outputs/deploy.html`（预览页正常）
- **v0.1.47**：【任务画布】按 workflow 实际节点渲染（去掉 web-dev 硬编码）——根因：addTaskNodes 固定生成 begin→userinput→web-dev→end 四节点，选择非 web-dev 工作流（如 Factory Workflow：main→dev→test→deploy）运行时画布仍显示 web-dev 结构。修复：①新增 getWorkflowNodeIds() 从 run 记录提取实际节点顺序（executed_nodes → current_node → fallback 单节点 web-dev），addTaskNodes 按节点列表动态生成 `task__wf-<nodeId>` 节点横向排列（NODE_GAP=130）；②edges 改为逐节点串联 userinput→节点1→…→节点N→end；③任务拖拽从硬编码后缀列表改为动态匹配 `__` 前缀子节点；④workflowNodeStatus() 按 executed_nodes/current_node 判断各节点 completed/running 状态
- **v0.1.46**：【Agent】页签布局对齐【任务测评】【工作流】左中右实现——去掉整页 header，改为与任务测评一致的三栏：左侧 w-72 Agent 列表（header「Agent 列表」+「+ 新建 Agent」按钮、新建表单内嵌左栏）；中间 flex-1 详细配置（输入 Schema / System Prompt / agent.yaml）；右侧 w-80 Agent 基本信息（名称/版本/模型/温度/Prompt 版本/图入口/描述/路径）
- **v0.1.45**：【Agent】三栏布局顺序修正——中栏（详细配置）与右栏（Agent 信息）DOM 顺序调整，确保视觉排列为「左侧列表 → 中间详细配置 → 右侧基本信息」（flex 布局按 DOM 顺序渲染，先前中/右顺序颠倒）
- **v0.1.44**：【Agent】页签改三栏布局——左侧 Agent 列表（+新建表单），中间为详细配置区（输入 Schema / System Prompt / agent.yaml 编辑与保存），右侧为 Agent 基本信息（名称/版本/模型/温度/Prompt 版本/图入口/描述/路径）；选中任一 Agent 三栏联动显示
- **v0.1.43**：顶部页签切换自动刷新数据——keep-alive 常驻渲染下组件只 mount 一次，切 tab 不会重新拉数据（必须 F5 才能看到新任务）。修复：任务画布 / 任务测评 / 工作流列表三个面板接收 `active` prop，从 hidden 变为 active 时自动 `refresh()`（用 prevActiveRef 检测 false→true 边沿，不重复刷新）；切回 tab 即可看到最新任务/工作流，无需手动 F5
- **v0.1.42**：【任务测评】左侧任务列表新增「删除」按钮——每个任务行右侧加 🗑 按钮（复用任务画布删除交互模式：自定义确认弹窗 + `DELETE /workflow/runs/{run_id}`，v0.6.8 引擎已支持删除 run 记录 + snapshot）；删除当前选中任务时同步清空中间画布与右侧详情；删除失败显示错误提示，不丢列表
- **v0.1.41**：【设置】新增「LiteLLM Virtual Key」输入框——设置页面 LLM 设置支持配置虚拟 key（按角色/项目分配，用于成本拆分与限流），引擎 LLM client 优先使用虚拟 key（issue-027 已支持）；对接引擎 issue-068（`LLMSettingsRequest` 加 `litellm_virtual_key` 字段 + `ENGINE_CONFIG_FIELDS` 白名单），引擎实现前保存/测试会忽略该字段
- **v0.1.40**：任务测评新增「Trace 时间线」——对接引擎 issue-056 trace 回放 API（`GET /runs/{run_id}/trace`，v0.5.4+）：展示 run 完整生命周期（run.start → span → generation → tool.start/end → run.end），按事件类型着色 + 图标（LLM/工具/任务起止），显示 token 消耗、耗时、工具名、结果摘要；引擎未实现时优雅降级提示
- **v0.1.39**：修复【任务画布】「预览页面」按钮消失 + 【任务测评】新增「产出预览」——根因：v0.5.x 引擎产物改为 snapshot 磁盘 + artifact-files 端点（run 详情 `result`/`artifacts` 为空），旧逻辑依赖 `activeRun.result` 提取产物导致按钮不显示。修复：新增 `checkRunArtifact` 探测 `artifact-files/outputs/index.html`（HEAD 200 = 有产物），任务画布 completed 任务探测通过后显示预览按钮，任务测评详情头部同步加「产出预览 ↗」按钮
- **v0.1.38**：任务测评页签 4 项优化——①userinput 节点只读展示用户输入内容（textarea readOnly，内容来自 run.inputs 字符串字段）②end 虚拟节点在 run completed 时显示「已完成」（不再显示「未执行」）③Token 消耗图标 🔤 → 艺术字体大写 T（衬线体 + 圆底）④新增「工具调用次数」列（扳手图标，读引擎 `node_metrics.tool_calls` 契约——issue-051 已提交，引擎实现前显示 —）
- **v0.1.37**：新增顶级页签【任务测评】（任务画布后、工作流前）——三栏布局：左侧所有任务列表（listWorkflowRuns，run_id/状态/时间）；中间画布加载选中任务，按执行结果渲染每个节点状态（completed/running/failed/pending 着色 + 脉冲动画）；右侧详情节点时间线（执行顺序、每节点完成情况，耗时/Token/LLM 调用次数读引擎 `node_metrics` 契约——issue-048 已提交，引擎实现前显示 —）；画布 fitView 复用两段式逻辑（可见 + measure 后平滑过渡）；节点 metrics 契约字段已加入 client.ts 类型
- **v0.1.36**：修复浏览器误弹「要保存密码吗？」——根因：SettingsPanel 的 LiteLLM Master Key 输入框是 `type="password"`，keep-alive 常驻 DOM 使 Chrome 密码管理器误判整个页面为登录表单，点击任意按钮（工作流保存等）即弹保存密码提示。修复：密钥框改 `type="text"` + CSS 掩码（`-webkit-text-security: disc` 保持圆点显示）+ `autoComplete="off"`，浏览器不再识别为密码字段
- **v0.1.35**：【工作流】userinput 节点三态高度自适应（对齐任务画布实现）——未聚焦时 textarea 高度与 begin 节点精确等高（DEFAULT_H 布局单位）；聚焦后 auto-resize 随内容增长，最高画布高度 1/3，超出滚动条；失焦恢复默认高度 + overflow hidden；本地 state + 防抖 + nodrag nopan 保留
- **v0.1.34**：【工作流】画布仅编辑不可运行 + userinput 模板 + 中文失焦修复——①begin 节点移除「▶ 运行工作流」按钮，改为纯起点标记（画布仅可编辑，运行统一走【任务画布】）；②userinput 输入内容作为模板持久化（localStorage 按工作流 id），【任务画布】用该工作流创建任务时自动预填到生成任务的 userinput 输入框；③WorkflowCanvas UserInputNode 改本地 state + 300ms 防抖提交（修复输入中文时 IME 组合输入被节点重建打断导致的焦点丢失），textarea 加 nodrag nopan 可框选
- **v0.1.33**：【工作流】画布进入 tab 立即平滑过渡——两段式 fitView：①可见瞬间立即 fit（不等节点 measure，用近似尺寸）→ 进入【工作流】tab 直接开始 300ms 平滑过渡，消除之前 ~260ms 静止等待；②measure 完成后再次 fit 校正（从近似位置平滑微调到精确居中，位移小无感）；hidden 期间不空转、不污染逻辑保留
- **v0.1.32**：【工作流】画布缩放延迟优化——进入 tab 后不再等 3 秒才缩放：①keep-alive 下 hidden tab（非活动）画布不可见、节点无法测量尺寸，原实现 hidden 期间轮询空转 3 秒后以错误尺寸强制 fit → 改为可见性检测（画布 rect 宽 0 时不计时、不强制 fit），切到 tab 可见后节点 measure 完成立即 fitView（延迟从 ~2-3s 降到 ~0.5s）；②fitView 加 duration 300ms 平滑过渡，消除 scale(1)→fit 的瞬跳
- **v0.1.31**：【工作流】画布默认渲染优化——节点默认位置居中并放大：①改为节点尺寸测量完成后手动 fitView（修复原 fitView prop 在自定义节点未测量时执行导致的偏左/过小，节点 bbox 严格居中）；②fitView padding 0.08（比任务画布 0.12 更紧凑）+ maxZoom 1.5，节点整体放大；③begin/userinput 节点宽度对齐任务画布（130/200），视觉统一；④顺带修复：删除选中工作流后清空画布与 YAML（此前画布残留已删工作流节点）
- **v0.1.30**：【工作流】列表删除功能——列表项新增 🗑 删除按钮（自定义确认弹窗，不用原生 confirm）；调引擎 `DELETE /api/v1/workflows/{id}`（v0.4.20，issue-047 实现）：成功刷新列表并清除选中，409（有 run 引用）显示引擎错误信息；client.ts 新增 deleteWorkflow
- **v0.1.29**：【工作流】页签三栏布局——左侧工作流列表（选中加载到中间画布）、中间画布（不变）、右侧新增详情显示区（选中工作流的元信息 + Workflow YAML 配置编辑器 + 解析图/保存）；配置信息从左侧移至右侧，左侧仅保留列表与新建
- **v0.1.28**：userinput 输入框优化——①聚焦最大高度调整为画布高度 1/3（原 2/3），超出滚动条；②textarea 加 nodrag nopan class，鼠标可框选输入框内文字编辑（此前 React Flow 画布平移拦截 mousedown 拖拽导致无法框选）
- **v0.1.27**：userinput 输入框高度自适应——未聚焦时高度与 begin 节点一致（38px 输入框，节点等高）；聚焦后随文字内容自适应增长，最高为画布高度 2/3，超出显示滚动条；失焦后恢复默认高度
- **v0.1.26**：userinput 输入框打字失焦修复——TaskUserInputNode 改为本地 state + 300ms 防抖提交：打字只更新节点内部 state（不触发父组件 setTasks → 不重建 React Flow nodes → 不失焦），防抖后提交全局（持久化/运行按钮照常）；此前受控 textarea 每次击键回写全局导致 React Flow 节点 data 全量重建、偶发失焦
- **v0.1.25**：未运行任务刷新不丢（localStorage 持久化）——无 runId 的 pending 任务存入 localStorage，刷新/重开页面自动恢复，与引擎恢复的 run 合并展示；运行/删除/确认后自动从 localStorage 移除
- **v0.1.24**：任务画布切换页签不丢状态（keep-alive）——顶部 tab 切换改为所有页签常驻渲染 + 非活动隐藏（组件不卸载），新建的未运行任务切换页签再回来不再消失；此前条件渲染导致 TaskCanvasPanel 卸载、纯前端 state 丢失
- **v0.1.23**：任务画布删除确认改用前端自定义弹窗——点击「🗑 删除」弹出项目内确认弹窗（显示任务名、取消/确认删除按钮），不再使用浏览器原生 confirm 对话框；视觉与工作流选择弹窗统一
- **v0.1.22**：默认进入页签调整为【任务画布】——页面加载后直接显示任务画布（原默认【工作流】），顶部 tab 导航不受影响，可随时切换
- **v0.1.21**：任务画布新增删除功能——任务标题栏加「🗑 删除」按钮（红底、防误点确认弹窗）；有 run_id 的任务删除时调用引擎 `DELETE /api/v1/workflow/runs/{run_id}` 同步删除记录（端点见 issue-046，实现前失败仅本地移除并 console 提示），无 run_id 的新任务直接本地移除；同时修复 v0.1.20 漏改的页面 header 版本号（0.1.19 → 0.1.21）
- **v0.1.20**：工作流页签节点弹窗修复——(1) 切换工作流时清空不匹配的 activeRun，避免节点配置读取串台到其他 run 的 workflow（曾报 `Node 'xxx' not found in workflow`）；(2) 无 run_id 时改用 readProjectFile 直接读取 agent.yaml，从未运行过的工作流节点也可查看 Agent 配置；(3) agent 文件缺失时显示友好创建提示（引导到 Agent 页签创建）
- **v0.1.19**：任务画布增强——(1) 已完成任务且引擎有可访问产物时，任务状态栏显示「预览页面 ↗」按钮（与工作流 tab 历史记录 output_path 预览一致，新标签页打开）；(2) 运行中任务的工作流节点（web-dev）添加蓝色呼吸脉冲动画特效（参考工作流 tab 画布实现，`node-pulse` 1.5s 无限循环）
- **v0.1.18**：确认持久化——任务画布「✓ 确认」操作调用引擎 `POST /workflow/runs/{run_id}/confirm` 持久化，刷新页面后已确认任务不再重新出现；引擎 v0.4.14 新增 confirm 端点（数据库级持久化见 issue-042）
- **v0.1.17**：任务画布时间倒序——任务按创建时间倒序排列（最新在前），整理模式组内同样倒序；任务信息条改用引擎 run_id 显示（如 `wf-021f9b2f91e2`），与工作流历史记录编号一致，新建未运行任务显示「新任务」、运行后自动切换为 run_id
- **v0.1.16**：任务画布组拖拽——拖任务标题整组移动（标题为唯一拖拽点，begin/userinput/web-dev/end 不可单独拖）；整理模式下拖分类标题移动整个分类；轮询刷新保留拖拽位置
- **v0.1.15**：任务画布增强——默认垂直排列；新增「整理」按钮按状态分组（未开始/进行中/待审批/已完成待人类核实/已失败待人类核实）；已完成/已失败任务可「✓ 确认」后从画布隐藏
- **v0.1.14**：新增【任务画布】tab——多工作流实例同屏渲染（任务标题+状态徽章→begin→userinput→web-dev→end）；底部 + 按钮选择工作流新建任务；刷新自动恢复最近 10 个 run；running/queued 每 2s 轮询
- **v0.1.13**：节点标签对齐 `begin-userinput-webdev-end` 链——BEGIN→begin、用户需求 INPUT→userinput、__end__→end（引擎 ID 不变）
- **v0.1.12**：运行控制画布节点化——BEGIN 节点（▶运行按钮）+ 用户需求 INPUT 节点（参数输入框），节点链 `begin→userinput→节点→__end__`
- **v0.1.11**：运行区移到画布顶部（工作流最前面）；历史记录点击自动回填 requirement；运行后保留输入内容，支持「再跑一次」
- **v0.1.10**：运行交互精简——移除"运行控制"抽屉，画布底部直接加用户需求输入框，输入为空时运行按钮置灰；引擎 `/api/v1/workflows` 补 `abs_path` 字段
- **v0.1.9**：工作流 tab 重构——列表 + 画布双向绑定、节点弹窗编辑、底部工具栏 + 右侧抽屉（运行/历史/事件）
- **v0.1.8**：顶级导航重构 + Agent 管理页（列表/编辑/新建）+ 修复 `\\u` 双反斜杠乱码
- **v0.1.7**：产物路径相对项目目录；节点执行高亮；运行面板产物预览

## 未来增强

- [ ] 拖拽编排（直接在画布上连线、添加节点）
- [ ] WebSocket 实时状态推送
- [ ] 详细节点日志
- [ ] 生产化部署（nginx serve dist）
