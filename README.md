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
