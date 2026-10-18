---
id: submodule-server-host-plan-review
type: submodule-design
status: active
title: 计划评审 —— 一个隐藏的委派子代理，而不是评审者聊天
parent: submodule-server-host
depends-on: [submodule-server-host, submodule-server-todos, module-pi-delegation]
references: [submodule-server-todos, submodule-server-reviews, submodule-server-agent]
tags: [host, review]
---

## 职责

独立于写下它的 agent，评审一个已完成的计划步骤，并把结果变成状态：该事项的评审记录、Review
标签页里的发现项，以及在修复预算允许时 —— 一个交付给工作者聊天的修复请求。

文件：`requestReview.ts`（流程）、`reviewerRole.ts`（评审者的提示词 + 输出契约）、
`planReviewQueue.ts`（按计划的串行化 + 按事项的认领）。

## 为什么用子代理而不是聊天

最初的实现把评审者当作**第二个可见的 pi 会话**，按计划钉住，持有自己的工具
（`add_review_comment`、`review_verdict`、`reflect_finding`）。那种形状付出的比得到的多：

- **一个会话就是一条要一直看守的生命期。** 一个崩溃、被中止，或只是完成了自己的轮次却没调用
  `review_verdict` 的评审者，会让该事项的 `pending` 标记永远挂着，转着 `Reviewing…` 并让
  Review All 死锁。要从那种状态恢复，需要一条 settle tee、一个 评审者→工作者 注册表、一个终止
  分类器，以及一个按 settle 而非按结果推进的队列（`reviewerSessionMonitor`、`reviewQueue`）——
  大约 400 行，唯一的工作就是注意到某个会话已经停了。
- **工具把裁决变成了轮次中途的副作用。** `review_verdict` 在评审者还在流式输出时就把持久标记
  清掉了，于是下游每一道守卫都必须区分"裁决已记录"与"轮次结束"，而来源必须钉在一个
  `currentReview` 映射里，那个映射会被下一个包覆盖。
- **用户从来就不想要那个聊天。** 它唯一的用处就是看着评审者思考。

一个委派子代理把这一切颠倒过来：`runReviewSubagent` 返回一个 **promise**。完成就是 resolve，
失败就是 reject，整个恢复面坍缩成一个调用 `cancelTodoReview` 的 `catch`。评审者不需要我们的
任何工具 —— 它用 `read`/`grep`/`find`/`ls`/`bash` 读代码，返回一个围栏 JSON 裁决，由宿主解析
并应用。

## 不变量

- **评审者使用宿主的新聊天默认值，加上仓库的评审者配置。** `runReview` 把子代理的模型解析为
  钉定的 `reviewModel`，否则 `resolveNewChatModel({})`：AppConfig 的 `defaultModel`，回退到第一个
  可用模型（没有可用模型时不使用模型）—— 绝不是静默继承来的工作者模型。评审者的**思考力度**
  同样解析：钉定的 `reviewEffort`，否则 AppConfig 的 `defaultEffort`，回退到 `medium`；有可用
  模型时，解析器会按选中的模型对它做夹取。`runReview` **无条件**传 `thinkingLevel` —— 省略该
  层级会让 pi-delegation 继承父工作者的力度，于是一个未设置的配置会静默地让评审者跑在工作者的
  力度上而不是默认值上。`runReviewSubagent` 以 `contextFiles: true` 与 `extensions: true` 生成
  子代理，而 `REVIEWER_TOOLS` 携带 `spec_grep`/`spec_get`/`spec_graph` 以及
  `read`/`grep`/`find`/`ls`/`bash`，复刻内建 `reviewer` agent 的上下文/工具策略，使计划评审
  遵循仓库指引并能审计不变量。只有系统提示词 + JSON 输出契约不同（宿主解析裁决）。
- **宿主拥有评审者的角色，包只拥有事实。** `reviewerRole.ts` 持有系统提示词（评审顺序、什么算
  一条发现项、JSON 契约）；`todos.renderReviewPackage` 渲染一个改动集*引用*与工作者的主张，且不
  点名任何工具。一个指示评审者使用它并不持有的工具的包，就是一段自相矛盾的提示词 —— 这次拆分
  防止的正是这个 bug。
- **模型输出不可信。** `parseVerdict` 对裁决词严格，并通过 contracts 的 `isPlanReviewResult`
  校验每一条发现项：每条都需要非空 `id` + `body`、一个（若存在则来自已知枚举的）`kind`，以及
  一个连贯的正值行区间（一行需要路径，`endLine` 需要 `startLine`，`endLine >= startLine`）——
  否则一个畸形的定位会在 `fileFinding` 的锚点解析中抛出并静默丢掉这条发现项。基数也被强制：
  一个不带发现项的 `request_changes` 会被拒绝（那会让工作者无从修复地搁浅），而一个 `approve`
  可以不携带任何发现项。任何非法输出都是一次失败的评审，而不是静默 approve：标记被清除，事项
  回到未评审。`parseVerdict` 还**显式构造结果**（只构造
  verdict/summary/readingOrder/findings —— `readingOrder` 是评审者可选的、有序的
  `{ path, why }` 列表，由契约校验器封顶在 `REVIEW_READING_ORDER_LIMIT`；**每一次被接受的裁决**
  都在与它的发现项和成功的裁决记录**同一次** `withReviewLock` 持有中，通过
  `reviews.setReviewGuide` 替换该工作区评审的 `guide` —— 评审者未给时摘要与顺序为空。因此一个
  排队的 Clear 会把 guide 与发现项一起移除，绝不会只在提交中途移除 guide。被拒绝的、提交/记录
  失败的，以及被未解决发现项挡住的 approve 都保持原 guide 不变，绝不出现新的成功徽标。guide 的
  持久化在接受之后仍是尽力而为；一次修复准备/发送失败会保留已接受的 request-changes guide 以及
  现有的周期/标记补偿。工作者交付仍留在锁外）而不是摊开模型对象，所以一个模型幻觉出来的仅宿主
  字段 —— 例如 `blockedByOpenFindings` —— 绝不可能存活下来误导卡片；宿主只从它自己的未解决
  发现项检查中设置它。
- **`reviewing` 标记在开始/入队时同步设置**，所以面板在客户端重新读取计划的那一刻就脉动 ——
  在任何 await 之前。一次被接受的按钮评审或自动评审也会在同一步同步记录工作区活动 —— 一次评审
  是对工作区的劳作，和一次聊天轮次一样，所以它让该行留在 Settled 架之外。
- **一次分离的失败会被发布，而不只是记日志。** `todo.startReview`/`todo.reviewAll` 在评审入队
  的那一刻就 ack；随后运行在一条分离路径上失败（提供商错误、非法输出、中止），而它自己没有聊天
  能展示这件事。`startPlanReview` 清除 `reviewing` 标记并调用 `reviewFailedPublisher`
  （`ReviewFailedPayload`，在 `review.failed` 上广播），这样计划页可以举起一个 toast —— 面板
  规范要求该 toast 携带失败。负载携带所属的 `sessionId`，所以只有那个计划的视图会 toast（不是
  工作区里的每个计划）；同一会话的分屏视图按 toast 正文去重。被 await 的工具路径无需发布：它
  reject 给工作者。由 `planReview.test.ts` 里的 ack 后失败测试钉定。
- **`autoCycles` 必须与实际发生的事相符。** 只有在工作者真的接受了修复请求时 `1` 才成立；一次
  被拒绝的修复 —— 发送**或**它任何准备步骤（快照/包/标记）失败 —— 或一次被拒的修复闩锁会重记
  `2`（终态），且总是在把已标记的发现项回滚为 `draft` 之后。`deliverFixToWorker` 把 准备+发送
  包在同一个 catch 里，正是为了让一次准备失败不能作为抛出溜出去、把乐观的 `1` 留在那里。写 `1`
  却没有交付请求会让事项搁浅：自动重评审的触发在等一个没有任何东西会产生的增量，而之后的一次
  评审会把该周期读作已用掉。由 `planReview.test.ts` 里的 发送被拒 与 准备被拒 测试钉定。
- **一次 approve 是一个裁决，不是一次结算。** `recordVerdict` 只在 `itemOpenFindings` 为空时才把
  事项结算为 `reviewed`；否则它清除标记、保留记录，并报告 `approve-blocked`，好告诉工作者去解决
  它修好的东西。修复周期的第 2 轮是与第 1 轮分开的运行，所以没有任何结构性东西阻止一次 approve
  落在一条未解决的 `sent` 发现项之上 —— 只有这道检查能阻止。
- **工具路径在快照改动集之前 await 产物协调。** `request_review` 在 `todo_update` 之后立即触发，
  而 `maybeAttachChangeArtifacts` 可能仍在提交该步骤的工作。`handleRequestReview` 在
  `startTodoReview` 之前 await `settleChangeArtifacts`（与 `listTodos` 使用的同一道屏障），所以
  评审者绝不会看到一个没有改动集的步骤，也绝不会快照一个被取代的产物。按钮路径不需要这种
  await —— 用户是在一个已经协调好的计划上启动它的。由 `planReview.test.ts` 里的持锁协调顺序
  测试钉定。
- **一次认领绝不能活得比取它的那次调用更久。** `handleRequestReview` 认领该事项，所以认领之后的
  每一次退出 —— 包括 `startTodoReview` 在一个没有改动集的步骤上抛出 —— 都必须执行释放。泄漏它
  会把该步骤卡成"已在评审中"，直到宿主重启。两者都由 `planReview.test.ts` 钉定。
- **两个入口共享同一个上限。** 工作者的 `request_review` 工具与 Start review 按钮算出同一个
  `canAutoFix`；工具路径在工具结果文本里报告它，按钮路径通过发送修复来对它行事。没有共享上限，
  工具路径就会 修复 → 评审 → 修复 无限循环。
- **静态工具指引是策略中立的；工具结果携带下一步动作。** 依 `canAutoFix`，`composeText` 可以说
  “修复并再次 request_review”，也可以说“现在不要修复 —— 报告给用户”。所以
  `requestReviewTool` 的 description/promptGuidelines **必须不**硬编码“总是修复并重评审” ——
  它们告诉工作者遵照工具结果所述的下一步动作，这样更强的系统级提示词也无法覆盖已配置的停止。
- **面向工作者的发现项身份是持久化的评论，不是模型的 id。** `fileFinding` 把每条发现项持久化为
  一条新的 `rc_*` 评论；模型自己的 id（`f1`…）是瞬态的。在工具路径上工具结果*就是*交付，所以当
  工作者被要求修复（`canAutoFix`）时，`recordVerdict` 在一个 `withReviewLock` 事务里提交这些
  `rc_*` 评论并把它们标记为 `sent` 给发起会话（在花掉该周期之前），结果文本/卡片命出它们的
  规范 id。提交与标记必须原子：否则一次并发的 Review clear 或一次在途的非草稿冲突，会留下工作
  者从未收到规范 id 的未解决发现项，把之后的一次 approve 卡在它无法命名的草稿之后 —— 所以一次
  标记失败会删除刚提交的草稿并拒绝该请求。否则 `resolve_comment` —— 它只按持久化 id 关闭分配给
  这个工作者的 `sent` 评论 —— 永远无法满足未解决发现项的门禁，把 request_changes → 修复 →
  approve 卡死。终态路径（"不要修复"）把它们留作 `draft` 给用户。提交本身在每条路径上都是全有
  或全无：若后续写入抛出，`fileFindings` 会删除它已持久化的草稿，且它总是在 `withReviewLock`
  内运行（按钮路径与 auto-fix 关闭路径在提交周围取锁；工具路径已持有它），所以一次并发的
  Review 发送无法在两次写入之间把某条发现项标成 `sent` 从而击破那项补偿 —— 一条已发送的发现项
  无法被删除，且会未交付地搁浅。在**按钮路径**上提交走得更远：`deliverFixToWorker` 在（必然
  无锁的）聊天发送之前，在**一次** `withReviewLock` 持有中提交、记录周期、挑选草稿并标记它们
  `sent`，所以没有交错的 Review 发送能在提交与预留之间标记刚提交的草稿 —— 那会让
  `itemFixFindings`（仅草稿）变空，并把一个不带规范 id 的通用请求交给工作者，同时还花掉一个
  周期。失败按提交是否完成来分叉：一次*提交*失败会抛出（什么都没记录 → 评审取消），任何*提交
  之后*的失败会记录周期 2 以把自动周期还回去，并把已标记的发现项回滚为草稿。周期记录写入本身
  在每条路径上都是提交事务的一部分：若它在发现项持久化之后抛出，它们会在同一把锁下被撤销 ——
  任何 `sent` 指派都回滚，然后删除草稿（`unfileFindings`）—— 之后取消才传播，所以一次 sidecar
  失败绝不会留下一条工作者从未收到其 id 的未解决发现项。记录写入本身也是原子的：
  `recordAgentChangesRequested`（以及 `approveTodoReview`）把该事项的记录、它的自动周期计数与
  它的 pending 标记清除持久化为**一次**快照写入（`commitReviewTransition`），绝不是三次，所以
  一次部分失败不可能把事项搁在"周期已用尽、pending 仍设置"的 `changes_requested` 状态。由
  工具路径的发现项身份测试、`planReview.test.ts` 里的 交错发送 / 部分持久化 / 交付前竞态 /
  记录失败 回归测试，以及 `reviewFlow.test.ts` 里的单快照原子性测试钉定。
- **agent 的会话内入口受门禁；按钮不受。** 工作者的 `request_review` 工具始终被注册，但只有在
  `agentReviewEnabled` 配置标志打开时才留在会话的活跃工具集里。宿主注入
  `setAgentReviewEnabledResolver(() => getConfig().agentReviewEnabled !== false)`，这样 agent 模块
  绝不取一条 settings 边（见 `agent/SPEC.md`），而切换该设置会调用 `refreshAgentReviewTool()`
  把改动**实时**应用到打开的会话（空闲会话同步应用，流式会话在它下一个 `agent_settled` 时应用）。
  因为 `setActiveToolsByName` 只从活跃工具的指引重建系统提示词，丢掉该工具也就丢掉了它的指引
  —— 没有任何陈旧的"总是 request_review"指令能在禁用后存活。它只门禁该工具：Review 按钮
  （`startPlanReview`）及其下游的自动修复 / 自动重评审是独立的，且始终可用。
- **每个计划同时一次评审，每个步骤至多一次。** 两个入口都在计划的链上串行
  （`planReviewQueue.onPlanChain`）：按钮路径经 `enqueuePlanReview`（即发即忘），工作者的
  `request_review` 工具则 await `onPlanChain` 取它的结果。该链让 Review All —— 以及一个面对另
  一步骤按钮评审的工具请求 —— 不会同时开两条提供商流；按事项的认领让两份裁决不会争着落到同一
  条记录上。

## 边界

- **Owns / public surface（拥有 / 公开接口）：** `startPlanReview(workspaceId, sessionId, itemId, runSubagent?)`,
  `maybeAutoReReview(workspaceId, sessionId)`, `installRequestReviewSeam()`,
  `setReviewFailedPublisher(fn)`, 以及纯函数 `parseVerdict` / `composeText`；`planReviewQueue` 的 `enqueuePlanReview` / `onPlanChain` / `claimItemReview` /
  `releaseItemReview` / `itemReviewActive` / `planReviewRunning`.
- **允许的依赖：** `agent`（`runReviewSubagent`、`sendReviewFixToSession`、
  `getSessionWorkspaceId`、`notifyExtUi`）、`todos`、`reviews`、`settings`，以及宿主兄弟
  `ackSend` / `reviewLock` / `todoReview`（修复闩锁 + 发现项范围界定）。
- **绝不触碰：** 从 `todoReview` 导入 `requestReview`（依赖只单向流动，所以双方都在没有任何
  导入的 `planReviewQueue` 里读取在途状态）；越过 barrel 深入 `todos/reviews.ts` 或 `reviews/*`
  的内部。
- **测试：** `planReview.test.ts` 通过 `startPlanReview` 的最后一个参数注入一个桩运行器，并对着
  一个假模型的工作者会话驱动真实的 记录 → 提交发现项 → 交付 路径，所以裁决语义在没有提供商的
  情况下也被覆盖。一个集成测试省略该桩，让真实的 `runReviewSubagent` 创建一个委派子代理（假
  模型、脚本化裁决），并端到端地走一遍 子代理创建 → request_changes → 规范发现项解决 → 重评审
  → approve。`requestReview.test.ts` 钉定纯解析/组合规则。
