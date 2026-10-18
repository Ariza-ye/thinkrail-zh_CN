---
id: module-workflow-tests
type: module-design
status: active
title: e2e/workflows — 无头工作流测试装置 + 场景
parent: architecture
references: [module-thinkrail-workflow, submodule-server-agent, submodule-workflow-skills, module-server]
tags: [testing, workflow-system, pi]
---

## 职责

无头工作流测试套件：通过工作流技能（[[module-thinkrail-workflow]]）驱动一个**真实的进程内 pi agent**，
**没有浏览器也没有 HTTP 宿主**，并用严格的判定模型决定通过/失败。通过 `bun run test:workflows` 按需
运行（自己的 Playwright 配置 `playwright.workflows.config.ts` —— 没有 `webServer`；刻意保留本地
PI-auth 设置，而不是浏览器 agent 套件的 real-Central 模式）。它隔离的 `PI_CODING_AGENT_DIR` 与钉住
的模型由 `env.ts` **按 worker 进程**克隆（pid 后缀，认证 + 设置拷入）：worker 绝不能共用一个 agent
目录 —— 一个垂死 worker 的会话处置与下一个 worker 的新生会话在共享的 `sessions/` 树中重叠，会把一次
失败变成跨越之后每一个活会话测试的 ENOENT 级联。`env.ts` 还设置隔离的 `HOME`/vendor-home 集合，因此
可移植的技能发现绝不读取开发者的私人库。它需要 pi 认证并花费真实的提供商 token —— 绝不是
`bun run test`、pre-commit、CI 门禁或浏览器 `e2e`/`e2e:agent` 脚本的一部分（主配置 `testIgnore` 了
这个目录）。

**判定模型（这里一切都在服务的不变量）：LLM 绝不确定 *pass*。**
- *绑定：* 对捕获的事件日志与工作区做确定性检查 + 信号 —— 一次技能加载就是对某 `SKILL.md` 的 `read`；
  产物在磁盘上被断言；被禁止的工具/路径不存在。
- *仅输入/诊断：* persona 应答器与用户模拟器（廉价 LLM）生成用户侧输入；watchdog 的在轨评估只会带着
  诊断中止（测试随后经由其未被触发的停止信号而失败）；judge 对每个场景的评分表做**顾问式**评分（警告 +
  运行日志，绝不是测试失败）。

## 测试装置（`harness/`，barrel `index.ts` —— spec 文件唯一的导入表面）

新增一个工作流测试 = 一次 `defineScenario` 调用：`{ name, skill, workspace, preset?, entry?,
user?, dialog?, stopWhen?, forbid?, watchdog?, expect, judge?, record? }`。

- `session` —— 在生产 `@thinkrail/server/agent` barrel（`createSession` 等）之上的生命周期；在 pi
  运行时初始化之前设置 `PI_CODING_AGENT_DIR`、`HOME` 以及受支持的 vendor-home 覆盖（`env.ts`，最先
  导入）；来自停止信号的中止是预期结果 —— 但只是*被请求*的那种（`promptTurn` 仅在调用方确认某个信号/
  预算已请求它时才吞掉一个中止形状的错误；未被请求的 "aborted" 是提供商/网络崩溃，会重新抛出）。
  绝不 `setModel`。
- `events` —— `EventLog`：一个进程级的 `setSessionPublisher` 订阅者无条件缓冲每个会话的事件（捕获不会
  漏掉早期事件）；查询 + `waitFor` + 紧凑的对话记录渲染；增量是 APPEND，`partialResult` 是 REPLACE。
- `workspace` —— e2e 数据目录下的一次性 git cwd（`empty` / `code-only` / `specced` / 自定义种子）。
- `dialog` —— 通过**生产的 `answerQuestion` 桥**回答 `ask_user_question` 轮次，走一条阶梯：脚本匹配
  器 → persona（已校验；畸形 → 下一级）→ 确定性回退（`skip` / `pickRecommended`）。没有脚本的面谈永远
  不会让一次运行卡住，一个*抛异常*的脚本（场景作者代码）也不会：它会直接降级到确定性回退，并把错误记录在
  该轮次上 —— 绝不是未处理的 rejection。投递失败也是轮次：`answerQuestion` 可以在事后 reject（一个慢的
  persona 回答被用户模拟器的下一条消息取代），这会记录在该轮次上，而不是抛出 —— 必须赢下这场竞争的场景会
  把它们的轮次写成脚本（脚本这一级在 `tool_execution_start` 时同步回答）。一个活回答会解决阻塞的工具并
  继续它当前的运行；一个由重启修复的 ack 回答会触发新的轮次。dialog 跟踪每一次投递并暴露 `settle()` ——
  当所有由此产生的工作都结束时 resolve（包含级联轮次，失控轮次由预算绊线约束）—— 场景在做出判定之前等待
  它：检查绝不与一个回答所启动的工作竞争。
- `presets` —— 流程中途进入：产物预设（工作流原生的 —— task-spec 即工作流的脊梁）与对话记录夹具
  （通过服务器的 `setSessionManagerFactory` 接缝调用 `SessionManager.open`；一个夹具 =
  `session.jsonl` + `workspace/` 快照，其中记录的 cwd 会在临时副本中被重写）。夹具经由录制模式产生：
  `THINKRAIL_WORKFLOW_RECORD=1` + 某个场景的 `record` 名字 → `fixtures/<name>/`。**夹具 markdown 在
  静止时被掩码** —— 快照里的每个 `*.md` 都存为 `*.md.test`（录制时掩码，重放进一次性 cwd 时解除），
  因此夹具 spec（`id: acme-root` 等）绝不会出现在宿主仓库自己的规范图中：spec 发现用 glob 匹配
  `*.md`，只有一份硬编码的目录忽略清单，因此未掩码的夹具会浮现在产品的 Specs 轨道和每一次 `spec_grep`
  中。*被否决的替代方案：* 扩展 `pi-spec-graph` 的忽略清单 —— 忽略 `e2e/` 会吞掉这份真实规范，一个基于
  名字的 "fixtures" 忽略会为了一处仓库本地的测试关切而改变一个可移植包的语义，而掩码还会屏蔽其他每一个
  `*.md` 扫描器，而不只是 spec 发现。
- `signals` —— 日志之上的谓词；`stopWhen`（通过 → 中止，主要的成本控制）与 `forbid`（失败 → 立即
  中止）。
- `watchdog` —— 确定性的预算绊线（轮次 / 工具调用 / 墙钟时间，默认在每个场景上）+ 可选的轮次间在轨
  评估。
- `userSim` —— 被模拟的人（与 `dialog` 共享该场景的 persona 简报）：编写开场与追加消息（follow-up），
  直到某个信号、预算或 `DONE`。
- `checks` / `judge` / `runlog` —— 绑定判定；顾问式评分表评分器；每次运行一行 JSON 追加到**被
  gitignore 的** `e2e/.workflow-runs.jsonl`（在被清空的 e2e 数据目录之外 —— 按决策属于本地证据；
  第 14 条的暂停理由住在 [[submodule-workflow-skills]]）。一个在判定之前就抛出的运行会记录 `crashed` +
  一个失败的确定性判定 —— 日志绝不会声称一次检查从未运行的通过（`THINKRAIL_WORKFLOW_RUNLOG` 重定向
  该文件，使单元测试能对记录做断言而不污染本地证据）。
- `scenario` —— 编排（播种 → 预设 → 启动 → 挂接 → 对话循环 → dialog 安定 → 判定 → 运行记录），拆除在
  `finally` 中 —— 也覆盖最早的步骤：对话记录夹具工厂的替换与 `startSession` 都住在受保护区域内，因此
  那里抛出仍会恢复进程级的接缝；`workflowTest` 把一个场景注册为 Playwright 测试（打 `@agent` 标签）。

依赖方向是单向的：`scenario` → 一切；`dialog`/`signals`/`userSim`/`watchdog` → `events`/`session`；
`checks`/`judge` 读取冻结的日志；只有 `session`/`presets`/`dialog`/`judge`/`userSim`/`watchdog` 触碰
服务器 barrel（会话、回答桥、`completeOnce`）。

## 边界

- **允许的依赖：** `@thinkrail/server/agent`（为本装置新增的子路径导出 —— 记录在 [[module-server]]；该
  barrel 的行为见 [[submodule-server-agent]]）、`@earendil-works/pi-coding-agent`（`SessionManager`）、
  `@thinkrail/contracts`（类型）、`@playwright/test`、`../fixtures/paths`、Node。
- **绝不触碰：** `@thinkrail/server` 的根导出（会求值仅 Bun 的 `host`）、`apps/*`、任何浏览器/页面夹具、
  模型选择（`setModel` 会在运行中途把一个默认值持久化进共享的隔离 agent 目录）。
- **可被 Node 加载的服务器 barrel。** 测试装置运行在 Playwright 的 Node 进程中，因此
  `@thinkrail/server/agent` 背后的模块图必须在没有仅 Bun 解析的情况下加载：不允许目录形式或无扩展名的
  深导入，不允许在 `node_modules` 下用裸 `require` 加载 TypeScript。一次违规会让每个活场景在创建会话时
  失败，早于任何技能运行 —— 套件曾以这种方式静默不可运行，直到 2026-10。

## 套件

- `harness.unit.spec.ts` —— 纯部件（解析器、谓词、检查、预算绊线）针对合成日志；没有活 agent，不需要
  认证。
- `routing.live.spec.ts` —— 路由套件（切片 2）：两个路由器的分类表里每条路由一个场景 —— 工作流可达的
  根路由通过常开规则到达；dispatcher 通过应用确切的 `/skill:` 种子被强制加载（该种子会注入技能内容，
  因此不预期读取它自己的 SKILL.md）。brainstorming 路由从其默认入口的两端钉住：一个小的、被明确指定的
  行为改动与一个缺陷报告（它必须在任何源码编辑之前到达 bug 分支）。通过 = 被路由 worker 的技能加载信号；
  直接工作的行绕过 worker 技能并产出一个有依据的结果。直接编辑断言钉住结果工作树，而不是报告词汇或
  agent 选了哪个合法变更工具这类附带事项。
- `smoke.live.spec.ts` —— 证明基础设施的活场景：一次流程中途的 `brainstorming` 往返，它必须在不重新
  进入根路由器的情况下恢复（产物预设 + persona 回答 + 用户模拟器 + 磁盘上的决策），以及对话记录续接
  （重新打开的夹具能回忆流程中途状态）。
- `importing.live.spec.ts` —— 第一份切片 3 的 worker 覆盖：`importing-a-codebase` 在一个文档丰富的
  夹具上端到端 —— 文档采纳提议（候选被提供并**就地**采纳，一个已完成的计划文件从不被提供也不被触碰，
  已填充的架构槽位不重新起草）—— 外加一个无候选的回归变体（只有 README/CHANGELOG/TODO 存在 → 该提议
  必须不触发，普通导入路径不变）。夹具文档从场景代码内联播种（静止时没有 `*.md` 夹具文件 —— 上文的
  掩码顾虑不会出现）。
- 后续（仅场景定义）：其余 worker 流程端到端（切片 3：`starting-a-new-project` / `brainstorming`
  完整运行）—— 在 [[module-thinkrail-workflow]] § 测试 中跟踪。
