---
id: module-pi-subagents
type: module-design
status: active
title: pi-subagents — 委派核心之上的 Agent 工具
parent: architecture
depends-on: [module-pi-delegation]
tags: [pi-extension, subagents]
---

## 职责

`pi-subagents` 是 **[[module-pi-delegation]] 的第一个消费者**，也是该框架可扩展性的
证明：面向 LLM 的子代理能力。它只拥有子代理专属的东西——`Agent` +
`get_subagent_result` 工具、agent 定义（发现 / 优先级 / 信任）、定义 → spawn
的映射，以及后台完成的投递。它包含**零私有子节点组装代码**：一切与会话形态相关的东西
都走核心的 `SessionOptions`。每个选择是如何定下来的：见下面的决策日志。

## Public surface（公开接口，barrel，`index.ts`）

- **default 导出**——零配置的纯 pi 扩展入口（`pi` manifest 指向这里）；用默认绑定构建自己的
  `DelegationService`，在 spawn 时从工具的 `ExtensionContext` 投影出父级。
  该投影包含公开的 `modelRegistry`，使核心自建的 runtime 能在每次子节点 spawn
  之前镜像其他扩展所做的 provider 注册，而无需检查它们的配置，也不依赖 pi 的私有
  runtime 字段。它还携带 `isProjectTrusted`，因此纯 pi 子节点继承其会话的项目信任，
  而不是 pi 的受信任默认值。**这个后备服务在生命周期上以会话为作用域**：在
  `session_shutdown` 时扩展会 await `disposeChildrenOf(parent)` 并丢弃该服务，因此
  vanilla pi 的后台子节点绝不会比其父会话活得更久、带着无法投递的完成结果继续烧
  token（PR #302 复查发现）。嵌入方注入的服务刻意不被触碰——它的生命周期属于嵌入方
  （ThinkRail 在 `removeSession` 中级联处理）。默认工厂与旧式工厂按每次工厂调用拥有
  各自的完成生命周期：重载结束该生命周期，而父级轮次中止则不会。工具返回之后，
  迟到的工具更新会被 Pi 丢弃。
- `createSubagentsExtension(options?)`——兼容的、以 runner 为作用域的扩展工厂。选项包括
  `service?`、`delegationRoot?`、`scope?`、`isEnabled?` 与 `canDeliverCompletion?`。
- `createSubagents(options: SubagentsExtensionOptions & { service: DelegationService })`——
  一个显式保留的、可移植的父级所有者，只暴露 `extension`、`flushCompletions()`
  与同步的 `dispose()`。其注入的服务仍然由嵌入方拥有。一个不可变的父级身份在首次
  `session_start` 时建立；把该所有者复用于另一个父级会被拒绝。当前的发送方、
  待处理的完成声明、flush 守卫与永久关闭标志都位于被重复调用的扩展回调之外。
  重载关闭只以身份安全的方式解绑旧发送方；下一次 `session_start` 绑定新的发送方并
  flush 保留的结果。其他关闭原因与显式处置会永久关闭投递、清空待处理声明并忽略未来的
  结果；重新绑定不能重新打开它。嵌入方必须显式处置该所有者，因为 Pi 的
  `AgentSession.dispose()` 不发出扩展关闭事件。前台的错误详情暂存仍然留在 runner
  本地。
- `isEnabled` 控制工具的可用性与启动，独立于完成投递。它默认为启用；为 false 时在
  `session_start` 就把两个工具从活动集合中移除，并在子节点组装之前、
  以及异步设置之后（紧接 `runQueued` 之前）重新检查。迟到的禁用会在拒绝之前处置那个
  尚未启动的子节点。`canDeliverCompletion` 默认为 true，临时同时门控对话记录追加与自
  动唤醒，而不关闭所有者、也不丢失待处理结果。嵌入方在临时删除回滚之后、
  或注册变得可寻址之后执行 flush。
- `SUBAGENT_COMPLETION_MESSAGE`——网页端完成卡片所依据的自定义消息类型。
- 定义：`AgentDefinition`、`discoverAgentDefinitions`、`parseAgentDefinition`、
  `BUILTIN_AGENTS`。
- 映射：`toSpawnMapping`、`resolveModelRef`、`buildChildSystemPrompt`、
  `RECURSION_GUARD_TOOLS`。

## 工具

| 工具 | 行为 |
| --- | --- |
| `Agent({ subagent_type, task, model?, run_in_background? })` | 在每个父级模型轮次之前对定义做快照（会话中途可编辑），然后把具名的那个定义加上可选的调用模型映射到 `SessionOptions`，并通过 `createChild` + `runQueued` spawn；描述与执行闭包使用同一份快照，因此会话中途的编辑不会让宣称的模型策略与执行不一致。模型优先级为定义钉住 → 调用模型 → 活的父级；定义钉住会静默胜过传入的调用值，而可用 agent 描述会在使用前宣告每个定义的钉住值或调用/父级选择。描述还说明子代理不能调用 MCP 工具——子节点从不加载 MCP 引擎（无论是在 pi 还是 ThinkRail 中，精选子集都没有它），因此父级自己调用它们并把结果放进任务里传递。前台：await 结果并搭乘工具信号；`error` 结果会抛出（工具错误，理由优先）——而错误工具结果**仍然携带该运行的最终 `details`**：pi 会把抛出的工具错误结果替换为 `{content, details: {}}`，因此扩展在抛出之前按 `toolCallId` 暂存结果详情，并通过 `tool_result` 钩子覆写重新注入它们（暂存在 `turn_end`——定稿之后——以及 `session_shutdown` 时被清扫，因此在工具定稿之前被中止的轮次不会遗留条目）；失败运行的卡片保留其子会话 id，对话记录仍然可打开（PR #304 复查发现）。后台：**绝不搭乘父级轮次的中止信号**（脱离的运行能在父级中止后存活——核心规范语义，有测试钉住）；立即返回 `{childSessionId}` 文本；终态结果注入一条 `subagent-completion` 自定义消息（`deliverAs: "followUp"`；是否触发轮次遵循下面的用户停止策略）。活的 `onUpdate` 详情流入 `partialResult`（REPLACE）。结果限制在 50k 字符——完整文本留在子节点对话记录中。 |
| `get_subagent_result({ session_id })` | **经过血缘校验**：`record.parentSessionId` 不是调用会话的子节点会走未知 id 的错误路径——在使用共享（工作区作用域）服务时，一个标签页不得读取或标记收集另一个父级的子节点（PR #302 复查发现）。通过 `findChild` + `collectResult` 读取核心注册表：终态 → 最终文本 + 详情，经过与前台结果**相同的理由优先、50k 有界塑形**（标记为已收集；出错运行先报告其 `errorMessage`——核心决策 #24）；运行中 → 状态快照；未知 id → 错误，指出重启丢失的情形 + 推导出的对话记录路径。 |

两个工具都在 `session_start`（由 `bindExtensions` 发出）内部注册。`Agent` 还会在
`before_agent_start` 为第一个 provider 轮次重新注册，并在每个 `turn_end`
为下一个轮次重新注册；pi 会立刻替换同名工具，因此每个轮次都为其描述与执行获得同一份
定义快照，而编辑无需 `/reload` 即可生效。当嵌入方停用这些工具时，注册保持完好：
同一会话内的重新启用与脱离的完成投递都不需要扩展重载或替换。

只有既有的脱离 `run.then` 继续会添加待处理结果。所有者绝不扫描子节点、
也不推断脱离状态，待处理条目只为投递而保留对结果的引用，而不是第二份对话记录、
输出存储或生命周期注册表。一次 flush 只使用当前发送方，并在同步 Pi
发送之前声明每个结果；可重入的 flush 无法重复它。同步发送失败会恢复声明，
除非已经发生处置。恰好一次意味着被 Pi 的即发即忘 API 同步接受，而不是最终的
provider 响应。消息塑形仍然理由优先、50k 有界，遵循同样的中止原因策略；
不涉及宿主的完成队列。

## 定义：发现、优先级与信任

按信任顺序先到先得——**内置 → 个人（`<agentDir>/agents/*.md`）
→ 项目（`<cwd>/.pi/agents/*.md`、`<cwd>/.agents/agents/*.md`）**——因此工作树定义绝不
能遮蔽内置或个人名字（见下面决策 6），且项目定义只在 `ctx.isProjectTrusted()` 时加载。内置是 **TS 常量**（`builtins.ts`：scout / planner / worker /
reviewer——用户敲定），不是 `.md` 文件，因此它们能在 `bun build --compile`
中存活并通过类型检查；只有 `worker` 能修改文件，其提示词禁止 history/index 类
git（`commit`/`add`/`stash`/`reset`/`push`）：子节点共享父级的工作树与分支，
自我提交会切碎父级的历史，并把工作与跟踪它的东西（在 ThinkRail 中，
是每个计划步骤的提交映射）脱开；提交由父级/宿主负责，git 读取保持开放。
用户编写的定义保持社区的 `.md` + frontmatter 约定（`name`、`description`、`tools`、
`model`、`thinking`、`max_turns`、`inherit_project_context`、`skills`、
`extensions`；正文 = 系统提示词）。格式错误的文件被跳过，绝不致命。四个内置都设置
`extensions: true`（嵌入方的精选子集——在纯 pi 零配置下不生效），并为只读角色把
spec 读取工具（`spec_grep`/`spec_get`/`spec_graph`）加入允许清单，为 scout 加入 web
工具（`web_search`/`fetch_content`）。只有 reviewer 选择使用项目上下文：
它的判断依赖仓库的指引，其提示词只接受归因于指定目标的实质性、可达、未缓解的发现。
它必须证伪候选发现、完成目标、按根因去重，并以一个显式结论收尾；GitHub
复查与线程语义留在这个可移植角色之外。

## 映射（策略，而非机制）

`toSpawnMapping`：定义 + 可选的调用模型 → `SessionOptions` +
`RunOptions.maxTurns`。生效的引用遵循定义钉住 → 调用模型 → 父级继承，
因此只有未钉住的定义才能使用按调用的模型。模型引用会针对会话可用的模型做模糊解析
（`provider/id` → 精确 id → 唯一前缀；歧义或未知的生效引用会大声抛出）。
子节点系统提示词 = 定义正文 → 子代理桥接 → 环境块（cwd、git 分支、平台）——**稳定
素材在前**，以便复用 KV-cache 前缀。
递归守卫（`excludeTools: ["Agent", "get_subagent_result"]`）是无条件的。
`extensions: true` 透传给核心的精选子集选项（核心决策 #25）——该集合持有哪些扩展是**
嵌入方**的选择，绝不是本包的选择。

## 边界

- **允许的依赖：** `pi-delegation`（仅经由其 barrel）；pi SDK + `typebox` 作为
  **peerDependencies**；`node:*`。
- **禁止：** 任何 `@thinkrail/*` 包（必须在 vanilla pi 下可用）；`@earendil-works/pi-tui`
  （纯 pi 的底线是默认渲染）；`pi-delegation/src/*` 内部。
- 网页卡片 / 对话记录视图是*展示*侧，按工具名（`registerToolRenderer("Agent", …)`）连接——
  它们位于 `apps/web`（`chat/tools/subagent`），绝不在这里。

## 用户停止

脱离的完成使用来自 [[module-pi-delegation]] 的最终结果 `details.abortReason`，
而不是第二个已停止子节点注册表或 UI 生成的消息。当它是 `"user"` 时，展示并持久化的
`subagent-completion` 使用 `deliverAs: "followUp", triggerTurn: false`：
它既不唤醒空闲的父级，也不中止工作中的父级，也不禁用后续委派。自然完成、
失败与非用户中止保持 `triggerTurn: true`。会话永久关闭会完全抑制投递；
保留所有者的重载只是暂停投递。除非调用方显式提供用户原因，独立 Pi 的行为保持不变。

## 验证

包内的单元测试套件（`bun test`），包括一个双扩展回归：一个扩展注册合成 provider，
零配置的 subagents 扩展通过它进行委派。公开 Pi 会话测试钉住带门控重放、真实的
reload 间隙、永久关闭、同步发送失败、可重入 flush 与默认/旧式 runner 隔离。端到端：
`e2e/subagents.live.spec.ts`（`@agent`——真实宿主驱动真实子节点：前台扇出、
后台完成、对话记录读取）。核心 SPEC 的纯 pi 底线：
**`bun run smoke:subagents`**——本扩展以默认绑定运行在仓库钉住的 vanilla pi CLI
下，位于隔离的一次性 agent 目录；仅按需运行（需要 pi 认证、消耗真实 token），
绝不是提交/CI 门禁。

## 决策日志（与用户共同敲定，2026-08）

0. **自建而非采用第三方。** 第三方 pi 子代理扩展被调研过两次，一次采用被尝试后回滚；被调研的
   选项总是与我们多会话的嵌入式宿主、编译后二进制和网页渲染器不匹配（其中一些用子进
   程 spawn、进程级注册表/发现、TUI 管理）——不过其中两个所证明的进程内 spawn
   模式（pi SDK 作为 peerDependency）正是核心复用的（核心决策 #17）。
   我们按会话发现的修复以上游 tintinweb/pi-subagents PR #223 的形式存续（不再是依赖）。
1. **可移植的工作区包**——一个纯 pi 扩展（pi SDK 作为 `peerDependency`），消费
   `pi-delegation`。ThinkRail 的 server 按会话嵌入该工厂，把宿主绑定的
   `DelegationService` 交给它；在 vanilla pi 下，扩展用默认绑定构造该服务。
   它必须能在纯 pi 中加载并工作（核心 SPEC 的纯 pi 底线）。*取代原先"宿主拥有的打包
   扩展"决策——在 PR #261 复查轮中反转；调研 +理由：核心决策日志 #17–21。*
2. **工具命名：Claude Code 风格**——`Agent`（spawn；模型是按该约定训练的）+
   `get_subagent_result`（收集脱离的结果）。没有 `steer_subagent`。
3. **范围：前台 + 并行扇出 + 后台运行。** 并行扇出 = 一条消息中的多个 `Agent` 调用（pi 并发
   运行一个批次的工具调用；核心的信号量给它们定速）——没有 `tasks[]`/链式 DSL，
   模型自己编排链的顺序。
4. **对话记录持久化，随时可打开**——子节点是磁盘上的隐藏 pi 会话；网页卡片链接到一个只读的
   对话记录视图，在运行中、完成后以及宿主重启后都能用。后台完成投递（`sendMessage`，
   遵循上面的用户停止策略）会在宿主重启时丢失，并在其会话开始关闭后停止——可接受，
   与其他 followUp 消息同类；对话记录本身无论如何都存活。
5. **内置 agent：一个小的精选集合**，针对 ThinkRail 的规范优先工作流调校（名单 + TS 常量
   形态：见上面的定义）；个人 + 工作树定义可以再添加。
6. **优先级/信任：工作树定义绝不能遮蔽内置或个人名字**（对应技能的同类不变量；社区库的排序
   相反——正是它让"仓库自带 `Explore.md`"的攻击成真）。工作树定义搭乘项目既有的信任
   姿态（与 pi 原生的 `.pi` 资源相同）；没有单独的准入门禁（早先的用户决策）。
7. **子节点上下文：默认狭窄，按定义选择启用。** 子节点看到定义正文 + 环境块（内容：见上面的
   映射）+ 任务；可选项：`inherit_project_context`（工作树 AGENTS.md）、
   `skills:`（显式列表）。没有父对话继承；fork 模式继承是已记录的增长路径（核心
   `origin: fork`）。依据（2026-08，已核对源码）：参考实现分成两类——默认狭窄加可选
   项（nicobailon——采用最多，3.1k★ / 56k dl/wk——gotgenes-replace、tintinweb）
   与项目感知（pi 示例、gotgenes-append）；nicobailon 的狭窄模型被选为多模式系统最干
   净的基底，并把 gotgenes 的 KV-cache 提示词排序（稳定素材在前）
   纳入我们自己的布局。
8. **按调用的模型是未钉住定义的后备。** 当定义没有 `model` 时，`Agent.model` 让父级在其保留
   的 runtime 世代中挑选任何无歧义的可用模型。定义钉住会静默胜过传入的调用值（用户敲
   定），而不是失败或变得可覆写；工具的可用 agent 列表会暴露该钉住值，使优先级可见。
   定义发现按父级模型轮次做快照，防止活动编辑把宣称的钉住值与执行闭包拆开。
   两个来源都未设置时，核心保留父级模型继承。
