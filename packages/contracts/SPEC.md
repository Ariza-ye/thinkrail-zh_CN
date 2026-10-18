---
id: module-contracts
type: module-design
status: active
title: 线上协议契约
parent: architecture
depends-on: []
references: [central-integration, module-pi-background-commands]
tags: [wire]
---

## 职责

浏览器↔宿主的线上协议主干：协议的唯一事实来源。包含类型，以及一个小的无依赖运行时：WS 方法与频道常量、
协议与特性版本、那个小的配置默认值、窄范围的跨环守卫，以及两个客户端共同驱动的退出确认规则。它是
`apps/web` 唯一可以依赖的包——正是这一点让 UI 能够独立于宿主发布。

## 边界

- **拥有：** 线上协议——实体类型、`pi` 的事件/消息类型（再导出）、WS 方法与频道注册表，以及协议版本。
  其中包含 **`WsErrorCode`**——*宿主命名*的封闭失败集合（`WsResponse.errorCode`，目前是 `UNKNOWN_COMMIT`、
  `PUSH_AUTH_FAILED`、`NOT_GIT` 和 `ALREADY_OPEN`（两种 `project.open` 拒绝：不是仓库的文件夹，
  以及已被某个工作区占有的文件夹）、`RESOURCE_UNAVAILABLE` 和 `SUBAGENT_TRANSCRIPT_NOT_FOUND`——最后一个是
  `subagent.getTranscript` 的**永久性**缺失，正是它停止对话记录对话框的轮询。已知的子会话若第一个对话记录
  文件尚未写出，则改为返回空消息并附带其当前状态，因此仍在运行的执行保持可轮询；传输层抖动仍只是普通
  `error` 的瞬时错误，值得重试——以及复查者 UI 必须区分的四种 `change.*` 结果：
  **`STALE_VIEW`**（某个 `expect` 哈希不再与宿主读到的内容一致 → 重新读取差异并重新提供）、
  **`SCOPE_IMMUTABLE`**（该 scope 的修改侧是一个提交，因此并未描述工作树中的任何内容）、
  **`RANGE_INVALID`**（某个 span 落在它所声明的那一侧之外，或对仅字节资源请求了范围回退）、
  **`RECEIPT_UNKNOWN`**（撤销一个宿主已不再持有的回执——环深 20，随进程消亡），以及
  **`UNSUPPORTED_CHANGE`**（所选变更是一个符号链接或仅模式的改动，这条面向字节的写入路径刻意拒绝）），
  这样客户端可以对某一具体失败做出反应，而不必去模式匹配错误消息。一个失败只有在客户端对它采取不同行为时
  才值得拥有一个错误码；其余一切都保持为普通的 `error` 字符串。预期的、与具体方法相关的结果仍然是带类型的
  方法结果，而不是通用 WS 失败；不存在当前布局的协议。
- **Public surface（公开接口，barrel，`index.ts`）：** `piProtocol` + `domain` + `nativeClient` 的
  `export type *`（`NativeUpdateState` / `NativeUpdateBridge`、`NativeWindowState` /
  `NativeWindowControlsBridge`、`NativeFontBridge`（已安装字体列表）、
  `NativeQuitHint` / `NativeCommand` / `NativeShortcutsBridge`，以及
  `NativeNotificationInput` / `NativeNotificationBridge`，即可选的、外壳本地的桌面能力）；
  来自 `quitConfirmation` 的 `QUIT_CONFIRMATION` + **`createQuitConfirmation`** +
  `QuitConfirmationDependencies`；值再导出
  `DEFAULT_CONFIG`、`THEME_MODES`、`isThemeMode`、`isSystemThemePair`、`normalizeThemePreference`、
  `JBCENTRAL_QUOTA_REFRESH_SECONDS`、`isJbcentralQuotaRefreshSeconds`、`isJbcentralConnected`、
  `SESSION_RENAME_PROTOCOL_VERSION`、`SESSION_TITLE_MAX_LENGTH`、`normalizeSessionTitle`、
  `LINE_WIDTH_COLUMNS` + **`isLineWidth(value)`**（同步的聊天/文件折行列共用的 40–240 整数契约）、
  `MAX_HISTORY_LIMIT`、`MAX_HISTORY_QUERY_LENGTH`、`TODO_NUDGE_PREFIX` +
  **`isControlMessage(text)`**（对该标记的唯一共享解读——客户端在 hydration 时隐藏这类发送，宿主在历史
  索引中跳过它们且不把它们计为 `message_sent`；双方在此达成一致，而不是各自重新推导 `startsWith`）+
  **`isRetriedAttempt(messages, index)`**（对 pi 已持久化但被后续尝试取代的自动重试尝试的唯一共享解读——
  客户端的 hydration 隐藏这些轮次，宿主的历史索引器跳过它们的文本；双方都会占用索引槽位，因此跳转锚点
  保持对齐），以上均来自 `domain`；来自 `piProtocol` 的
  **`isTranscriptMessageRole(role)`** 和 **`isSessionWorking(state)`**（运行中或有待处理的后台工作——
  每个徽标和概览所用的那个唯一“工作中”判定）（`isTranscriptMessageRole` 是一个对话记录可携带哪些角色的
  唯一定义：宿主按它过滤 `session.getMessages`，*并且* `history` 按它统计 `messageIndex`，因此两份差一个
  角色的副本会静默地移动之后每一个跳转锚点）；`wsProtocol` 的 `export *`（值）
  （`WS_METHODS`、`WS_CHANNELS`、各类型化映射、`PROTOCOL_VERSION`，以及特性引入版本）。
- **允许的依赖：** 运行时没有。**仅类型**的 devDeps 指向 `@earendil-works/pi-ai` +
  `@earendil-works/pi-agent-core`，**从其包根**导入（仅类型 → 构建时被擦除）。
- **部署义务：** 线上协议契约描述宿主行为与兼容性，绝不描述提供它的启动器或部署。一个特性的线上协议形态
  由浏览器、桌面端和未来的客户端共享。
  相互独立的、仅类型的原生客户端能力描述的是可选的外壳本地桥接，而不是宿主的 WS 方法：
  `NativeUpdateState` 和 `NativeUpdateBridge` 承载更新呈现与显式本地操作；
  `NativeWindowState` 和 `NativeWindowControlsBridge` 承载最大化/全屏快照，以及无边框原生窗口委派给 HTML
  控件的 minimize / toggle-maximize / close 操作；`NativeQuitHint`、`NativeCommand` 和
  `NativeShortcutsBridge` 推送已确认的退出提示与转发来的原生菜单命令，并为自行确认退出手势的客户端提供
  `quit()`；`NativeNotificationInput` 和 `NativeNotificationBridge` 承载
  `show({ title, subtitle?, body, silent? })`（即发即忘的 OS 通知，没有回调也没有 id）以及可选的
  `isWindowFocused()`，后者报告 OS 层面的窗口焦点（即使 DevTools 拥有渲染器焦点也为 true）。同一个 web
  bundle 在未导入任何原生 SDK 的情况下就能发现这些能力。可选的 `HostUpdateNotice` 承载封闭的 CLI 宿主更新
  生命周期；受协议门控的 `host.update` 是一个空请求，只能启动启动器预先绑定的更新器。浏览器从不提供命令、
  路径、频道、版本、URL、重启或订阅源权限。
- **绝不触碰：** 任何对 `pi` 包的*值*导入；对 `@earendil-works/pi-coding-agent` 的**任何**导入（哪怕是
  `type`）（它会拉入 `node:fs`）；pi-ai 的**提供商 / API 子路径**
  （`/providers/*`、`/api/*`、`/bedrock-provider`、…… ——它们会静态加载 Node 提供商 SDK）；以及导入
  `server` / `shared` / `web`。

## 目录

- **piProtocol.ts** — 来自 pi 包根的 `import type` 再导出（仅类型 → 构建时被擦除）：
  - `@earendil-works/pi-ai`：`Model`、`Message`、`UserMessage`、`AssistantMessage`、
    `ToolResultMessage`、`TextContent`、`ThinkingContent`、`ImageContent`、`ToolCall`、
    `AssistantMessageEvent`、`Usage`、`StopReason`；
  - **`WireModel`** = `Pick<Model<string>, "id"|"name"|"provider"|"contextWindow"|"reasoning">` **+ 那一个
    计算字段 `thinkingLevels`**（pi-ai 的 `getSupportedThinkingLevels`，在宿主侧于 `toWireModel` 中映射；
    客户端→宿主的参数携带它但不起作用）**+ 三个可选的模型选择器元数据投影**——`cost`
    （`{input, output}` 每 Mtok 的标价，pi `ModelCost` 的子集）、`input`（可接受的模态）以及
    **`auth`**（`WireModelAuth`：提供商的 `ProviderAuthKind` 加上 pi 的 `detail` 标签——与
    `provider.status` 报告的是同一套词表，按模型投影，因此选择器可以显示 "plan" 而不必显示每 token 价格，
    也无需那次重型的状态调用）——之所以可选，是因为比 **`MODEL_PICKER_PROTOCOL_VERSION`**（v77）更旧的宿主
    会省略它们；这就是模型**在线上协议中**的形态
    （`model.list`/`model.refresh`/`model.default`、`session.create` 的结果与参数、
    `session.setModel` 的参数、`SessionSummary.model`）。它是正好等于 UI 所渲染内容的**允许清单**，而*不是*
    一个 `Omit`：扩展/提供商的 `Model.baseUrl` 和 `headers` 可能携带路由凭证，而允许清单**默认拒绝**
    （fail closed）——未来新增的 `Model` 字段（无论是否机密）默认被排除。宿主从 `{provider,id}` 重新解析出
    真正的 `Model`——因此客户端既不能读到机密，也不能注入一个 `baseUrl` 让 agent 去调用（见 `agent` 模块的
    SPEC）。**`sameModel(a, b)`** 是每个环节都在使用的那个唯一身份判定——`{provider, id}`；没有其他字段
    属于身份，因为名称、上下文、价格和层级都是可能滞后于一次刷新的目录快照；
  - `@earendil-works/pi-agent-core`：`AgentEvent`、`AgentMessage`、`ThinkingLevel`（包含
    `off` 的那一个）；
  - 本地渲染联合类型 **`PiEvent`**——真正的超集 `AgentSessionEvent` 位于仅 Node 的
    `pi-coding-agent` 中，因此在这里被**镜像**（`agent_end.willRetry` + `agent_settled` /
    `queue_update` / `compaction_*` / `auto_retry_*` / `summarization_retry_*` /
    `session_info_changed` / `thinking_level_changed` 成员，外加 `bash_execution_update`——仅为联合类型保真
    而镜像；宿主从不调用 `executeBash`，因此 UI 永远收不到它）。
    事件携带的每一条消息（`message_*`、`turn_end`、`agent_end.messages`）都被定型为
    **`WireAgentMessage`**——即 `TranscriptMessage` 加上 `WireBranchSummary` / `WireBashExecution`
    镜像——绝不是 pi-agent-core 的 `AgentMessage`。那个类型是 `Message` 加上编译时恰好包含的任何
    `CustomAgentMessages` 增补：pi-coding-agent 只在 Node 构建中加上那些自定义角色，而 pi-agent-core 自身
    不再添加它们，因此同一个 `PiEvent` 否则会在服务端和浏览器中表示两个不同的联合类型（在浏览器里，
    自定义消息守卫被收窄为 `never`）。
    `agent_settled` 是一个宿主投影，携带最后一次尝试报告的终结元数据
    （`stopReason` + 可选的 `errorMessage`）：`agent_end.willRetry` 只覆盖提供商的自动重试，
    当随后还有压缩或排队的续跑时，它并不是自动工作的终点。
    `compaction_end.result` 被定型为 **`CompactionEndResult`**——pi 仅 Node 的 `CompactionResult` 的允许清单
    镜像，正好携带压缩通知所渲染的内容（`tokensBefore` + 可选的 `estimatedTokensAfter`）；宿主自行构造这个
    投影，而不是把 pi 那个更丰富的对象整体 cast，且线上数据仍然不可信，因此 reducer 会守卫字段形态，
    而不是假定它们；
  - **`SessionEventPayload`**（`{ sessionId, event: PiEvent }`）——`pi.event` 推送帧。
  - 那些廉价收益的镜像（声明于仅 Node 的 `pi-coding-agent`）：**`SessionStats`** + **`ContextUsage`**
    （token/成本/上下文条——仅用于显示）以及 **`SlashCommandInfo`** + **`SlashCommandSourceInfo`**
    （命令自动补全行，由运行中的 `session.getCommands`、仅技能的会前 `skill.list`
    以及映射后的提示词模板列表返回），还有 **`SkillCatalogEntry`** + **`SkillDecision`**
    （`load`/`untrusted`/`pending-ack`/`disabled`）——工作区技能管理器的 `skills.state` 行。
  - **`ExtensionCatalogEntry`**（`{ name, title, description?, enabled, tools, hasChildExtensions }`）——一个
    宿主注册表中的 ThinkRail 扩展，即 `extension.list` 所报告的样子；`name` 是
    `AppConfig.disabledExtensions` 列表用作键的身份，`tools` 是其父工厂注册的名称。
  - **`SessionSummary`**——宿主为 hydration 报告的一个聊天会话（读取侧）；`live`
    区分内存中的会话与仅存在于磁盘的会话。前端会就地 hydration 本地放置的会话，并将其余会话列入聊天历史
    以便显式重新打开。可选的 **`openTodos`**（该聊天 TODO 计划中非 `done` 条目的数量）只由 `session.list`
    填充（宿主经 todos 模块装饰），用于历史/状态呈现；缺失 = 未知，按 0 处理。一个活跃摘要的可选
    **`lastSettlement`** 保留宿主观察到的终结状态（`null` = 该活跃执行仍在进行，或没有助手就已结束），
    以便重连时能呈现 Pi 从其重建后的上下文中移除的最终失败；缺失意味着本宿主进程尚未观察到终结，
    以持久化的对话记录为准。可选的 **`queue`**（**`SessionQueueState`**：pi 待处理的 `steering`/`followUp`
    文本加上 `hasImages?: true`，即宿主对已排队浏览器发送的保守聚合）仅在非空时搭乘活跃摘要——它是客户端
    待处理条带的 hydration 种子，因为 `queue_update` 只在变化时触发，而一个在运行中途接入的客户端否则永远
    不会得知在它连接之前已排队的消息。同一个聚合还会充实投影后的 `queue_update` 事件；图像字节从不搭乘这个
    读取侧队列状态。在规范化状态协议下，可选的 **`state`** 携带与全工作区快照/推送所安装的完全相同的
    `SessionState`，使对话记录 hydration 能证明它渲染的是哪一个完成，而无需一个注意专用的纪元。破坏性操作
    使用单独的 **`SessionQueueContent`** / **`QueuedMessageContent`** 形态，它们把每个被排空消息的文本和
    可选图像恰好返回一次，使输入框能恢复完整内容，又不让普通的队列广播变重。
    `session.getMessages` 返回 `{ summary, messages }`（对话记录是
    **`TranscriptMessage[]`**——即 pi 规范的 `Message` 联合类型，被 **`WireCustomMessage`** 拓宽
    （pi-coding-agent 仅 Node 的 `CustomMessage` 的仅类型镜像，因此诸如 ask 回复这类由扩展注入的消息也能
    穿越线上协议），并被 **`WireCompactionSummary`** 拓宽（仅 Node 的
    `CompactionSummaryMessage` 的镜像：`summary`/`tokensBefore`/`timestamp`），即一次压缩的已解析上下文
    记录——pi 把它放在保留的尾部之前并丢弃被摘要的消息，因此转发它才能让压缩边界在重新加载/重新打开后
    存活，而不是渲染出一段从对话中途开始的对话记录。在磁盘重新打开之后，摘要反映的是此刻活跃的会话）。
    宿主可以发送的角色全集由运行时守卫 **`isTranscriptMessageRole(role)`** 钉住：它是服务端对话记录过滤与
    历史索引的唯一来源，二者的对齐使历史命中的 `messageIndex` 对客户端的 `turnIdByMessageIndex` 仍然有效
    ——若某一侧新增了角色而另一侧没有，就会静默地移动之后每一个跳转锚点。
  - **聊天标题**——`SessionSummary.title` 仍是那个非空的读取投影（在 pi 尚无持久名称时为
    `Chat`）。附加式的 `session.rename` 变更接受
    `{ workspaceId, sessionId, title }`，拒绝其修剪后单行形式为空或超过
    `SESSION_TITLE_MAX_LENGTH`（80）的标题，并返回一个 ack；`SESSION_RENAME_PROTOCOL_VERSION` 把该变更与
    相关控件钉在 v66，使较新的客户端在面对较旧宿主时隐藏它们。既有的 Pi 事件
    `session_info_changed { name?: string }` 是手动与自动修改的唯一实时领域更新，
    而 `session.list`/`session.getMessages` 会修复漏掉的事件。没有任何标题来源/出处、唯一性、
    工作区耦合或新的推送频道穿越线上协议；会话 id 仍是唯一权威。
  - **扩展 UI 帧** **`ExtUiRequest`** / **`ExtUiResponse`**——我们对 pi 进程内 `uiContext` 调用的线上协议
    形态（`select`/`confirm`/`input`/`editor` 往返；`notify`/`setStatus`/`setWidget`/
    `setTitle`/`dismiss` 为即发即忘），承载于 `pi.extensionUi` 频道。
  - **`ask_user_question`** 的线上协议类型——**`AskUserQuestionArgs`**（`AskUserQuestionItem` +
    `AskUserQuestionOption`——后者携带可选的 `recommendedReason`，卡片会把它在选项下作为一行 `Why:`
    内联渲染：即 agent 编写的问题，以及工具卡片从 `toolCall` 块读取的内容）、
    **`AskUserQuestionResult`**（`AskUserQuestionAnswer[]` + `cancelled`：浏览器的回复）、
    **`AskUserQuestionAckDetails`**（仅当重启修复在接入之前关闭一个悬挂的实时阻塞调用时使用的工具结果
    `details`）以及 **`AskUserAnswersDetails`** + **`ASK_USER_ANSWERS_CUSTOM_TYPE`** 常量、
    **`AskUserAnswersMessage`**（宿主构建器被编译期约束要产出的、正确配对的 tag↔details 形态）
    和共享的 **`isAskUserAnswersMessage`** 守卫（全部位于 `wsProtocol`，即携带值的那一半）：一个符合条件的
    实时回复会成为原生工具结果；`length`/`error`/`aborted` 的助手调用是终结性的、永不可回答；重启之后，
    回复以 `ask-user-answers` 自定义消息的形式传输，通过 `details.toolCallId` 配对。
    `WireCustomMessage.customType` 本身保持为
    `string`——命名空间是开放的（任何 pi 扩展都可以铸造自定义消息，且它们都会穿越线上协议），因此严格性
    位于生产者 + 守卫：它校验 details 的*形态*（线上数据不可信——另一进程，可能还是另一个协议版本）。
    该能力是一个**宿主拥有的 pi 自定义工具**（服务端 `agent/askUserQuestion`——设计理由见其 SPEC）；
    聊天会**内联**渲染问卷，并通过 `session.answerQuestion` 回复
    （以工具调用 id 关联；当该调用未知/已回答/已被取代时，明确报错拒绝）。
  - **待办计划复查修复**的线上协议类型——**`TODO_REVIEW_FIX_CUSTOM_TYPE`** 常量、
    **`TodoReviewFixMessage`**（tag↔details 形态）+ 其 **`isTodoReviewFixMessage`** 守卫（位于
    `wsProtocol`），以及 **`ReviewFixDetails`** / **`ReviewFixComment`**（位于 `domain`）：计划复查裁决
    提出的修复请求以**结构化的自定义消息**（customType 为
    `todo-review-fix`）到达 worker，而不是合成一个用户轮次（#363）。消息的 `content` 仍是 agent 所读取的
    渲染后的包文本；`details`（条目 id/标题、可选备注，以及精简的、已解析路径/行的发现）才是聊天卡片渲染的
    内容——宿主在发送时从其锚点解析每个发现的 `path`/行，因此客户端不再重新解析任何东西。见
    [[submodule-server-todos]] + [[submodule-web-chat]]。
- **domain.ts**——应用实体：`Project`（git 仓库 + 唯一 `slug` + 可选的 **`closed: true`**——即持久化的
  “开放侧栏”归属位；缺失表示开放，以保持向后兼容，而关闭永不改变项目的 id，也不删除其工作区关联——
  外加技能信任字段 **`trusted`**（按项目的授权）、**`acknowledgedSkills`**（再次确认新技能——哪些已提交的
  别名已获认可）和 **`disabledSkills`** / **`disabledGroups`**（项目基线层面的按技能、按组关闭——一个组可以是
  插件、一个来源层级，或特殊的 `@plugins`），它们门控其技能能贡献什么；工作区在该基线之上叠加
  **`Workspace.skillOverrides`**（按技能开关）；
  **`SubagentOverride`**（`"on" | "off"`）+ 可选的 **`Workspace.subagentsOverride`** 让工作区强制开启或关闭
  子代理，而缺失则继承宿主的 `AppConfig.subagentsEnabled` 默认值；
  可选的 **`Workspace.subagentMaxConcurrentOverride`** 同样覆盖 `AppConfig.subagentMaxConcurrent`；
  “它有 spec 吗？”**不是**一个字段——它是惰性查询 `project.hasSpecs`，因为那是一次全树遍历），
  **`ProjectPathStatus`**（一个候选路径的类型——`repo` / `initable` / `missing` / `notDirectory`——以便 UI
  打开、提议执行 `git init`，或显示错误）、`Workspace`（git 工作树；其可选的 **`renamed`** 标志是命名生命
  周期——缺失 = **尚未命名**（一个新的 `workspace-N`，或某个较旧宿主的临时遍历留下未加锁的记录），因此
  agent 的 `set_title` 仍可给它命名；`true` = 已命名（自动或由用户命名），此后永不自动改动；
  其可选的 **`kind: "default"`** 标记内置的按项目 **Default workspace**——即把项目文件夹本身当作一个工作区，
  每个项目恰好一个，在 `workspace.list` 中固定排在首位，在服务端不可移除也不可重命名；
  **`kind: "external"`** 标记一个显式附加的、用户拥有的工作树，ThinkRail 可以忘记它，但绝不能重命名或收回；
  缺失 = 一个由 ThinkRail 管理的工作树工作区；可选的字母量 **`initialTerminalPending: true`** 是宿主拥有的
  供给标记，仅在工作区仍需宿主预留时携带：宿主预留那个确定性的终端，然后清除它；缺失意味着不再有供给工作
  ——使用显式的线上协议字段，绝不依赖 id 约定；**settled 生命周期**由另外四个宿主拥有的可选字段承载——
  **`lastActiveAt`**（毫秒——宿主见到的最新*真实*活动：一次聊天/agent 轮次、终端输入，或工作树 HEAD 的移动；
  选中或查看工作区刻意**不算**活动）、**`settledOverride`**（`"settled"` = 用户将其搁置，`"active"` = 用户
  将其固定为活跃；宿主在真实活动时清除其中任一，因此覆盖永不过期）及其 **`settledAt`** 时间戳，以及
  **`review`**（宿主对该分支最近已知的 `OpenBranchReview`，在宿主侧刷新，使每个客户端看到同一个 PR 状态，
  无需各自去获取）——划分成活跃行与 Settled 货架的是一个基于这些事实加上会话状态的客户端选择器，绝不是
  线上协议字段；**`WORKSPACE_SETTLE_PROTOCOL_VERSION`**（v78）把这些字段与 **`workspace.settle`** /
  **`workspace.unsettle`**（`{ id }`——Default 在服务端被拒绝；响应是更新后的记录，而 `workspace.updated`
  推送使每个客户端收敛）一起钉住。Settling 从不触碰磁盘；`workspace.remove` 仍是唯一的拆除手段，
  一次一行），
  **`OpenBranchReview`**（活跃分支的复查引用：PR 或 MR + 编号，外加可选的
  **`state`**——`"open" | "merged" | "closed"`，在 v78 之前的宿主上缺失并读作 open——以及
  **`changedAt`**，即提供商合并或关闭它的毫秒时间；没有任何操作），
  **`ExistingWorktreeCandidate`**（一行 `workspace.listExisting`：绝对 `path` + `branch`，或一行
  选择器会禁用的 `detached` 行），
  `FileNode`（文件树节点），
  **`ResourceMeta`**（一个资源的字节*究竟是什么*，由宿主决定并由
  `RESOURCE_META_PROTOCOL_VERSION` = v75 钉住：sha-256 `hash` + `byteLength`，资源不存在时两者都为 `null`；
  `text` = 合法 UTF-8、BOM 感知，且未被任何已知二进制魔数声明（一个 ASCII
  PDF 是仅字节文档；SVG 是文本）；可选的 `mime`，先按魔数字节、再按文件名嗅探。它搭乘
  `fs.readFile` 以及 `git.diffFile` 的两侧，后者的 `content` 在 `text` 为 false 时总是 `""`，
  而其 `originalOid` 是用于定位不可变 `/blob` 侧的已解析范围起点——宿主拒绝发送解码后的二进制，因此客户端
  从 `/files` + `/blob` HTTP 路由渲染仅字节资源，并用 `hash` 作为评论锚点或回退预期所命名的身份），
  **变更变更类型**——**`LineSpan`**（1 起始、闭区间；`count: 0` 命名 `start` *之前*的一个插入点）、
  **`RevertTarget`**（`file` = 该路径在 scope 中的整个变更，或 `range` = 作为一个跨**两侧的行 span** 的
  单个 hunk，绝不是补丁或 `@@` 头：两个客户端 diff 引擎对 hunk 的切分方式不同，而客户端绝不能规定字节）
  以及 **`ChangeReceipt`**（对一次 `change.*` 调用的回答*同时也是*其撤销令牌：`kind` 为 revert/undo，
  以 `before`/`after` 的哈希+长度+模式构成的身份，`null` 表示不存在，以及可选的 `trashed`——删除整个文件时
  交给回收站助手的、同目录下的绝对临时占用路径；该文件因此以那个临时名称留在 OS 回收站中），
  `Git*`/diff 类型——包括 **`GitDiffScope`**（Changes 面板正在 diff 什么：`branch` → 该工作区自偏离其 diff
  基线以来的工作（范围从二者的 merge-base 开始，绝不是基线的 tip）/ `uncommitted` → 工作树 vs `HEAD` /
  `commit` → 一个提交，`sha^` vs `sha` / `turn` → 宿主围绕一次 agent 运行所取的两次工作树**树快照**
  （`{ id, baseTree, headTree, startedAt }`，两侧都不可变，v80）；在线上协议中省略 = `branch`，
  因此较旧的客户端不受影响）、**`TurnChangeSet`**（一次被记录的 agent 运行：
  `{ id, workspaceId, sessionId, startedAt, settledAt, baseTree, headTree, changes }`——即该运行实际留下的
  内容，由 **`workspace.turns`** 提供并在 **`turn.changed`** 上推送，
  `TURN_CHANGES_PROTOCOL_VERSION` = v80）、
  **`GitCommit`**（scope 菜单列表中的一行提交），以及 **`BranchList`**：`remote` 仍是
  规范的完整 ref 字符串列表，而可选的、由宿主编写的 `remoteGroups` 携带每个已配置的
  远端及其 `{ ref, branch }` 行，用于两层呈现。该字段是附加式的，因此较新的 UI
  面对较旧宿主时会回退到完整 ref；一个 `null` 远端组保留那些配置已被移除的跟踪 ref，
  而不会在浏览器里臆造归属。
  工作区基线有**两个字段**来表示两层含义：`Workspace.baseBranch` 是*创建出处*（切出该工作树所用的 ref
  ——即回执的 `branch · from baseBranch` 所显示的；对于**用户拥有**的工作区，其出处不属于 ThinkRail 可以
  主张的范围，因此它是仓库默认值，作为*初始*复查目标，而 UI 不显示 `from`），
  可选的 **`Workspace.diffBase`** 则是*复查目标*（`workspace.setDiffBase`）；每次读取都在**服务端、同一处**
  解析 `diffBase ?? baseBranch`——把它们并成一个字段会让一个被重新指向的目标谎报分支来自何处；
  **`ProviderStatus`/`ProviderStatusReport`**
  ——Welcome 条带所渲染的认证提供商状态行（按提供商的 `configured` + 认证 `kind`：
  oauth / api-key / env / central / other——绝不是凭证值；`central` 标记一个内置提供商，
  其注册被 JetBrains AI (Central) 扩展替换，仅由注册身份推导，绝不从 Central 的配置推导；外加
  `canOAuth`/`canApiKey`/`canLogout`，它们门控该条带的应用内 Sign-in / Sign-out 入口——`canLogout` 仅对
  可移除的 auth.json 凭证为 true，对宿主无法取消的 env / runtime / models.json 认证为 false）；
  **应用内登录线上协议**——**`LoginFrame`**（流式的流程更新：`authUrl` / `deviceCode` / `select` / `prompt` /
  `progress` / `success` / `error`，它们在客户端**累积**，绝不是凭证值）、**`LoginPush`**
  （`provider.login` 帧，`{ loginId, providerId, frame }`）以及 **`LoginReply`**
  （`{ loginId, value }`——浏览器对 `select`/`prompt` 的回答）；JetBrains AI 线上协议（协议 v43）——
  **`JbcentralStatus`**，嵌套在 `ProviderStatusReport` 上，是封闭的、由宿主编写的生命周期：`absent`、
  `outdated`、`supported`、`configured`、`malformed-version`、`probe-failed`、`configuring` 或
  `load-failed`。认证以 **`supported`/`configured` 上的 `signedOut` 标志** 搭乘，而已配置状态还携带封闭的
  **`proxyStopped`** 观察结果；二者都不是独立的状态，因为凭证、代理进程健康与配置是三条独立的轴。
  两个标志都是*被正面观察到的否定事实*——不可用或不可读的探测报告 `false`，因此客户端绝不会渲染一个宿主
  并未证实的恢复要求。没有任何代理端口、PID、URL、状态文本或诊断信息穿越线上协议。仅在相关处出现可解析的
  安全版本、封闭的探测/失败原因，以及当前操作。
  `configuring` 同时覆盖一次已复查的 CLI 操作和针对最新被监视产物状态的合并式候选重建；`configured` 意味着
  **新工作所用的当前运行时**应用了该产物。
  `load-failed.configured` 说明最新观察到的全局状态是否请求了 Central，以便客户端可以
  提供封闭的 Retry/Disconnect 操作，而无需收到产物路径。历史性的活跃会话可能
  保留较旧的运行时，因此被刻意排除在此状态之外。**`JbcentralInstall`**
  携带宿主按 OS 的 `{platform,shell,command}` 官方安装计划。**`JbcentralActionResult`** 是
  封闭的 `applied` / `failed` 联合类型；失败原因区分安装、版本探测/支持、
  Central 操作、产物后置条件，以及封闭的运行时加载失败，而不携带任何消息。不存在
  待处理、重启、被阻塞会话、恢复、迁移、补偿或重新附着等结果。原始
  stdout/stderr、生成的扩展内容或路径、代理 URL/机密、诊断信息、受影响会话 id，
  以及原始 PI 模型在结构上都不存在；服务端与 web 把错误码映射到各自的通用文案）。协议
  v59 新增 **`JbcentralQuotaSnapshot`**，即单独的封闭配额读取：`hidden`、`available`、`stale` 或
  `unavailable`；只有 available/stale 携带有限的周期性 `remaining` / `total` 数字和一个观察
  时间戳。不存在账号/套餐/已用/加油/补满字段，也不存在原始失败文本；
  **主题/配置选择**——**`ThemeId`** 在线上协议中是一个开放字符串，因为宿主持久化不透明的选择，而独立发布的
  web 客户端拥有可用的清单目录；**`ThemeMode`** 是封闭的 `"fixed" | "system"` 行为，**`SystemThemePair`**
  携带一个不透明的浅色 id 加一个不透明的深色 id。`AppConfig.theme` 在两种模式下仍是可回退的固定选择；
  `AppConfig.systemThemePair` 在首次配置系统模式之前缺失，之后则能在回到固定模式后继续保留。实际外观从不
  穿越线上协议：每个系统模式客户端都针对自己的操作系统配色方案解析同一对 id。
  `THEME_SYSTEM_PROTOCOL_VERSION` 把这一点钉在 v58。
  这些字段是刻意附加的：用嵌套对象替换 `theme`
  会破坏旧客户端（或造出两个固定主题的权威来源），而在不透明 id 内编码
  一对 id 会把一个简单 id 变成未经验证的迷你协议。较新的 web 客户端
  会用那个特性引入常量对较旧宿主隐藏这些控件；
  **`ComposerGrowthLimit`**（`"compact" | "roomy" | "half-chat"`）是封闭的、由服务端同步的输入框
  高度偏好：分别为 6 个可视行、10 个可视行，或已挂载聊天面板的 50%；
  `"half-chat"` 是默认值，而把这些语义 id 翻译成几何尺寸的工作由 web 负责；
  **`LINE_WIDTH_COLUMNS`** 拥有那个共享的 `{ min: 40, max: 240, default: 120 }` 整数契约，供
  各自独立受限的聊天/文件可视折行列使用；**`isLineWidth`** 是线上协议两侧共同消费的那一个校验器；
  **`SUBAGENT_SETTINGS_PROTOCOL_VERSION`** 把全局/工作区控件钉在其 v57 的线上协议
  引入版本，使较新的 web 客户端对较旧宿主隐藏它们，而无需与不断前移的
  最新协议版本比较；**`JBCENTRAL_QUOTA_PROTOCOL_VERSION`** 同样钉住 v59 的配额读取 + 设置；
  **`WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION`** 钉住 v62 的 Windows 外壳设置，使较新的 web 客户端
  对只能保留但无法应用该配置字段的宿主隐藏它；
  **`PLAN_REVIEW_SUBAGENT_PROTOCOL_VERSION`** 钉住 v67 的复查重塑——复查者聊天已移除，因此
  `TodoPlan.reviewerSessionId` 和 `ReviewComment.reflection` 退出了线上协议，`todo.startReview` 返回
  一个裸 ack，而其分离式失败改由附加式的 `review.failed` 推送（`ReviewFailedPayload`）送达，
  因为复查已没有聊天来承载它。较旧的客户端会把被丢弃的字段读作缺失，因此这个版本钉住点正是让客户端能区分
  “该宿主没有复查者聊天”与“该宿主较旧”的东西，而不是靠推断；
  **`AppConfig`**（`{ theme, themeMode, systemThemePair?, analyticsEnabled, analyticsConsentConfirmed, terminalReplayKb,
  terminalWindowsShell, composerGrowthLimit, chatLineWidth, fileLineWidth, chatLineWidthBounded,
  fileLineWidthBounded, customLayoutPresets, defaultModel?, defaultEffort?, reviewModel?, reviewEffort?,
  favoriteModels, recentModels, reviewAutoFix, agentReviewEnabled, subagentsEnabled, subagentMaxConcurrent,
  jbcentralQuotaEnabled, jbcentralQuotaRefreshSeconds, disabledExtensions }`——一个可扩展的袋子；行宽字段在
  协议 v61 加入线上协议，`terminalWindowsShell` 在 v62。**`DEFAULT_MODEL_PROTOCOL_VERSION`** 钉住
  v72 的 AppConfig `defaultModel`/`defaultEffort` 以及宿主侧默认值解析；Settings 控件对较旧宿主隐藏。
  `defaultModel` 是一个完整且经允许清单过滤的 `WireModel`，`defaultEffort` 是一个可选的
  `ThinkingLevel`，而 `settings.update` 接受 `null` 以清除任一可选值。
  **`MODEL_PICKER_PROTOCOL_VERSION`**（v77）钉住选择器由宿主保管的列表：**`favoriteModels`**（完整的
  `WireModel`，按用户的显示顺序——客户端通过 `settings.update` 写入整个列表，
  身份由 `sameModel` 判定）以及 **`recentModels`**（最新优先，最多 **`RECENT_MODELS_LIMIT`** = 5，
  **由宿主维护**：它被排除在 `AppConfigUpdate` 之外，宿主在每次显式选择模型时追加
  ——一次指名模型的 `session.create` 以及每次 `session.setModel`）。二者默认都是 `[]`，因此
  客户端只按版本门控，绝不按字段是否存在门控。两个列表中的快照都会在渲染前由客户端
  重新指向实时目录；一个已离开目录的模型就干脆不被提供。
  `terminalWindowsShell`
  （`"auto" | "pwsh" | "powershell" | "cmd"`，默认 `"auto"`）只由 Windows 上的 `server/terminal` 读取，
  其他平台忽略——关于每个值会启动什么，见
  `submodule-server-terminal` 的外壳选择决策。
  **`PROJECT_TEMPLATE_PREVIEW_PROTOCOL_VERSION`** 钉住 v63 附加式的、位于项目内的 `template.list` /
  `template.get` 读取，使 Create Workspace 能在不发送宿主路径的情况下预览全局模板加上当前检出中的项目模板；
  较旧的宿主保留仅全局的回退。`themeMode` 默认 `"fixed"` 且没有配对 id，同时保留两种旧配置
  与显式的 Dark 默认值；`subagentsEnabled` 是宿主范围的子代理默认值（当前行为下为 `true`），
  仅由 `Workspace.subagentsOverride` 覆盖；`subagentMaxConcurrent`（**`SUBAGENT_MAX_CONCURRENT`** 内的
  整数 = 1–16，默认 4，由 `isSubagentMaxConcurrent` 校验；自
  **`SUBAGENT_CONCURRENCY_PROTOCOL_VERSION`** = v79 起进入线上协议）是一个聊天同时运行多少个子代理——
  更多的会排队——仅由 `Workspace.subagentMaxConcurrentOverride` 覆盖；**`settleIdleDays`**（默认 `7`，
  `null` = 永不；自 `WORKSPACE_SETTLE_PROTOCOL_VERSION` = v78 起进入线上协议）是静默工作区沉降到其项目
  货架之前的那段空闲窗口——之所以是一个宿主范围的数字，是因为“安静多久”是一种习惯，而不是项目事实；
  `agentReviewEnabled`（默认 `false`，自
  `AGENT_REVIEW_SETTING_PROTOCOL_VERSION` = v68 起进入线上协议）门控 worker 会话内的 `request_review`
  工具，并实时应用于已打开的会话——Review 按钮是独立的（见 [[submodule-server-host-plan-review]]）；
  `disabledExtensions`（默认 `[]`，自 `EXTENSION_CATALOG_PROTOCOL_VERSION` = v82 起进入线上协议）命名用户
  关闭的宿主注册表扩展——未知名称会被保留并忽略，宿主将其应用于新会话与已打开的会话（见
  [[submodule-server-extensions]]）；`customLayoutPresets` 是有界的、
  无资源引用的目录，并且是宿主同步的**唯一**布局值；当前/默认预设
  与组上限都是 web 本地的）；`analyticsEnabled` 是附加数据偏好与宿主门控，
  默认 `false`，而 `analyticsConsentConfirmed` 默认 `false`，记录初始选择的完成情况。
  `ANALYTICS_CONSENT_PROTOCOL_VERSION` 钉住这个 v65 契约，使较新的客户端不会对无法持久化它的较旧宿主
  展示同意流程。初始对话框先单独写入启用偏好，然后一起写入完成标记与当前偏好；Privacy Settings 则一起写入
  两者。较旧客户端仅写偏好的操作无法创建新的确认。安装 id 完全留在服务端；基础事件不受这两个标志控制，
  见 [[submodule-server-analytics]]）以 **`DEFAULT_CONFIG`** 回退承载它（在宿主侧持久化为 `config.json`，
  在 `server.welcome` 中下发，通过 `settings.update` 变更）。每个新用户聊天都会显式收到解析后的模型与
  effort，因此会话与 `model.default` 保持一致；显式请求字段各自单独获胜，
  而仅带 effort 的请求使用已配置的或回退的模型。计划复查子代理保留自己的模型策略。
  **`InterviewResponse`** 是从自动反馈弹窗接受的封闭 `"book" | "postpone" | "never"` 操作。
  没有任何使用次数、资格、忽略状态或客户端身份穿越线上协议。
  Contracts 刻意不导出任何主题目录的 enum/列表/标签：未来的清单可能铸造出一个在宿主构建时尚属未知的 id，
  而缺少它的客户端会解析到一个外观相同的随包回退；
  **`SpecGraphNode`/`SpecGraphSnapshot`**——Specs 查看器的读取 DTO，被**镜像**（与 `PiEvent` 一样），
  绝不从 `pi-spec-graph` 导入——线上协议只携带面板所渲染的内容（`type`/`status` 保持为 `string`：
  容忍磁盘上的任何内容）；
  **`TodoItem`/`TodoGroupItem`/`TodoPlan`/`TodoArtifact`** + **`TodoStatus`/`TodoOrigin`/
  `TodoArtifactKind`** 联合类型——聊天内的计划 DTO，从 `pi-todos/core` **镜像**而来（绝不导入），
  携带该聊天按会话的 TODO 列表。
  `TodoGroupItem` 还携带 **`status: TodoGroupStatus`**——该组的*任务*生命周期
  （`pending`/`active`/`done`），**由宿主**从各步骤派生（`pi-todos` 的 `groupStatus`），
  而非存储：把它发布出来意味着真值表只有一个家，没有客户端需要重新推导。一个 `commit`
  产物还携带 **`files?: GitFileChange[]`**（路径 + 状态 + `+/−`——与 Changes 面板在提交 scope 渲染的
  同一批行）——由 `todo.list` 的装饰从 git 派生（同样“只有一个家”的理由），从不存储；缺失 = 该 sha
  已无法解析，静默降级。
  `TodoItem.summary` / `TodoPlan.summary` 是 agent 的完成备注（按步骤 / 整个计划，按其存储内容），
  而 `TodoItem.verification` 是单独的自报检查行（确切命令 + 结果，或
  "not verified"——客户端把它渲染成一个徽标，标注为 agent 自己的声明，绝不是宿主门禁）。
  `TodoItem.commitSubject` 是第三个存储的完成时刻字段：宿主把该项的增量提交在其下的那个 git subject
  （`title` 是面板用的计划步骤，而这个才是落入仓库历史的那一行——见 [[submodule-server-todos]]）。
  它之所以出现在线上协议中，是因为该 DTO 镜像存储的条目，而不是因为今天有客户端渲染它；
  **`TodoItem.review?: TodoReviewInfo`**（+ **`TodoReviewState`** 联合类型）是宿主派生的复查装饰，
  仅出现在可复查的条目上（那些有宿主变更集的条目）：`state`
  （`unreviewed`/`reviewed`/`changes_requested`——`unreviewed` = 无存储记录）、`revision`（提交
  数——1 个 TODO = N 个提交）、`unreviewedShas`（自用户水印以来的提交——“自复查
  以来已变更”的增量）、`feedback` + `at`。复查状态存于宿主 sidecar，绝不放进 agent 可写的计划；
  见 [[submodule-server-todos]]。**`TodoPlan.unattributed?: GitFileChange[]`** 是宿主派生的
  剩余部分，由同一个 `todo.list` 装饰发布，仅在非空时出现：工作树中未归属于计划任何条目的
  未提交行——那些否则会在复查地图中不可见的变更（推导与理由：[[submodule-server-todos]]）。
  **`TodoPlan.adoptedCommits?: TodoItem[]`** 是已提交的对应部分，由同一个装饰发布，
  且仅在非空时出现：`base..HEAD` 中不属于任何条目的提交，以
  **仅存在于线上协议的 `done` 条目**形式呈现（`origin: "adopted"`、`id: "commit:<sha>"`、一个 `commit`
  产物），使一个未做计划就提交的聊天仍能显示——并复查——那些工作。它们从不被存储；
  `TodoOrigin` 的 **`"adopted"`** 成员仅存在于线上协议中（推导：[[submodule-server-todos]]）。
  **`DelegationRunDetails`** + **`DelegationRunStatus`** 联合类型——子代理 Agent 卡片 DTO，
  从 `pi-delegation` **镜像**（绝不导入）：搭乘 `tool_execution_update.partialResult`
  （REPLACE）、最终的 `Agent` 工具结果，以及 `subagent-completion` 自定义消息；
  子对话记录本身通过 `subagent.getTranscript` 读取，以
  `(workspaceId, parentSessionId, childSessionId)` 为键——其结果还携带该运行当前的
  注册表 `status`（宿主不再知道该运行后即缺失），即客户端“运行期间轮询”的
  信号。完成消息的 tag + 配对位于
  `wsProtocol`（携带值的那一半），与 ask-user-answers 的姿态完全一致：
  **`SUBAGENT_COMPLETION_CUSTOM_TYPE`** 常量（镜像 `pi-subagents` 的 `SUBAGENT_COMPLETION_MESSAGE`，
  绝不导入——又是 DTO 姿态）、**`SubagentCompletionMessage`**（被编译期约束的 tag↔details
  形态）以及共享的 **`isSubagentCompletionMessage`** 守卫——线上数据不可信，因此
  details 通过 **`isDelegationRunDetails`**（domain）校验：**封闭的状态联合**、每个
  必需的**数值用量字段**、`durationMs`，以及每个存在的可选展示字段都必须是字符串，
  绝不只是“存在一个对象”（PR #303 复查发现）。该校验器是形态检查的
  唯一归处——web 的 Agent 卡片读取器
  也经由它收窄——外加 **`customMessageText`**——对
  `WireCustomMessage.content`（string | blocks）的唯一文本提取，由 web 的事件 reducer 与 hydration 共享，
  使完成卡片的文本只推导一次。
  **历史搜索读取 DTO**——**`HistoryScope`**（该浮层的循环：本聊天 → 工作区 →
  项目 → 所有地方）；**`PromptHit`**（一个被召回的提示词；携带可选的 `messageIndex` +
  `anchorText`——保留最新那次出现的跳转锚点）以及 **`MessageHit`**（一处全文
  对话匹配；仅助手——用户角色的命中只会重复其自身 `PromptHit` 的文本，
  因此跳转入口放在那里；`messageIndex` 把 jump-to-message 锚定进
  `session.getMessages` 的顺序，`anchorText` 使锚点能容忍漂移），以及
  **`HistorySearchResult`**（提示词 + 全文消息两段，附总数与索引状态）；
  **复查 DTO**——**`Review`**（每个工作区一个未关闭的复查；`baseSha`——被复查差异的
  原始侧（分支范围的岔点，即该差异实际显示的内容——绝不是目标的
  tip，后者可能携带该复查从未展示过的上游提交），在**创建时**钉住为一个**完整提交 oid**，
  在复查的一生中不可变——外加 **`fileSessions`**，键 → 该
  键的复查聊天：每个文件一个聊天，在首次发送时定型，**空键**是那个无锚点的
  整体变更集桶，同样以那种方式定型，使第二条整体评论延续同一场讨论——
  以及 **`doneFiles`**，同样的键：用户标记复查已完成的文件，因此一个完全解决的
  文件只有在他们首肯时才离开列表；可选的 **`guide`**——一个 **`ReviewGuide`**：最新
  计划步骤裁决的 `summary`、其有序的 `ReviewReadingStep { path, why }` 的 `readingOrder`、
  该裁决与出处，由宿主编写，使 Changes 复查标签页能走一遍复查者的故事）、**`ReviewComment`**
  （`kind` inline/diff/file/review；`status` draft/sent/resolved/
  dismissed——与 **`anchorState`** anchored/moved/outdated 正交；按评论的 `sessionId`——
  它被发送进的那个聊天）、**`ReviewAnchor`**（`path` + `side` + `contentHash` + 一条有序的
  **`ReviewSelector`** 回退链：`lineRange` / `textQuote` / `diffHunk` / `structural` / `region`——
  `structural` 是按 scheme 定型的槽位，用于具有稳定标识的文档模型（`json-pointer`、`ipynb-cell`、
  `table-cell`、`md-heading`，外加渲染器铸造的任何 scheme：未知 scheme 逐字穿越线上协议，
  只校验形态），而 `region` 是归一化 `0..1` 的几何，对分页媒体带可选的
  1 起始 `page`，因此一条评论可以命名一个图像区域或一个笔记单元格，而不是一行；
  Ask-agent 的 hunk 评论用确切的已显示 hunk 头填充 `diffHunk`，而 `contentHash` 是对该资源
  字节（BYTES）的 sha-256（对合法 UTF-8 而言与原先的文本哈希字节一致）。
  **`REVIEW_RICH_ANCHORS_PROTOCOL_VERSION`** 把附加式的 `region` 成员与如今已被填充的
  `structural` 槽位钉在 v74，使渲染器丰富的客户端能区分“会保留它们”的宿主与
  “早于它们”的宿主，而不是让一个区域锚点被静默丢弃；一个 `side: "base"` 的锚点还携带 **`baseRef`**，
  即其行与片段被捕获时所对照的 ref，因为两个 diff 侧是两个行空间，外加
  它被捕获时所处的 **`scope`**——重新打开渲染该 blob 的那一个界面的差异身份）、
  **`ReviewSnapshot`**（`{ review, comments }`——即 `review.get`
  读取，带上 `workspaceId` 时也是 `review.changed` 推送负载 **`ReviewChangedPayload`**——
  全量快照，因此重放是幂等的）；
  **提示词模板 DTO**——**`TemplateScope`**（`"global"` | `"project"`——模板所在之处）、
  **`TemplateInfo`**（仅元数据：名称、可选的 `description`/`argumentHint`、`scope`、`filePath`——
  即 `template.list` 返回的内容；刻意不含正文，因此一次列举绝不会带上每个文件的全文），
  以及 **`Template`**（`TemplateInfo` + 完整 `content`——frontmatter + 正文——即按名
  `template.get`/`template.save` 的形态）；
  **布局预设 DTO**——可移植的 **`LayoutPreset`**，即在 `AppConfig.customLayoutPresets` 中同步的有界、无资源
  引用的帧语法：中心拓扑、左/右/底组几何、可见性/折叠、
  底部对齐，以及单例工具，但不含任何工作区、文件、差异、聊天、文档、终端、预览、
  注意或当前/默认选择身份。每种当前布局类型——包括投影后的
  `WorkspaceLayoutDocument`、`WorkbenchFrame` 和 `WorkspaceViewState`——都是 web 本地的，并刻意不在
  contracts 中。不存在任何当前布局的方法或推送频道。
- **nativeClient.ts**——宿主线上协议之外的、仅类型的可选原生客户端能力。桌面端
  更新桥接暴露单调的状态快照、提示检查/下载/安装操作、失败操作的
  身份，以及状态订阅，而不暴露订阅源选择。Available、byte-transfer、preparation、
  ready 和 installing 是不同的状态。字体桥接是一个 `list()`，返回本机
  已安装的字体族，供 web 客户端按设备的界面字体偏好使用（`NativeFontBridge`）；
  它不携带选择，也不做持久化，因为那个选择属于客户端。窗口控件桥接为窗口状态暴露同样的
  快照/操作/订阅形态。快捷键桥接推送退出提示变化
  （`hidden` / `armed` / `release` / `quitting`）和 `NativeCommand` id（目前是 `close-item`——关闭
  被聚焦的应用内条目——以及 `open-settings`——在无模态框打开时打开 Settings），其唯一操作 `quit()` 请求宿主
  执行一次普通的协调退出。通知桥接暴露 `show({ title, subtitle?, body, silent? })`（即发即忘的 OS 通知，
  没有回调也没有 id）以及可选的 `isWindowFocused()`，后者报告 OS 层面的窗口焦点——
  即使 DevTools 拥有渲染器焦点也为 true，与 `document.hasFocus()` 不同。浏览器
  连接没有这些桥接中的任何一个，也不渲染它们的任何入口。
- **quitConfirmation.ts**——退出确认手势的唯一归处，由桌面主进程
  （macOS Cmd+Q，按键状态通过 CoreGraphics 轮询）与 web 外壳（Linux Ctrl+Q，按键状态
  来自 keydown/keyup）共用。`QUIT_CONFIRMATION` 持有 1200 ms 长按、500 ms 双击窗口（从
  第一次释放开始计时）和 40 ms 轮询。`createQuitConfirmation` 是注入的
  `readHeld` / `canShowHint` / `now` / `every` / `onHint` / `quit` 之上的状态机：`press(held)`、`sync()`
  （此刻重新读取 held）、`cancel()`（已确认的手势则退出，未确认的则隐藏）、幂等的 `quitNow()`，以及
  `reset()`（回到空闲、提示隐藏；供退出请求失败的客户端使用）。一个
  退出只有在组合键被释放之后才会触发。它放在这里而不是 `shared`，因为 `apps/web` 只能导入
  contracts，而两份手势副本会漂移；它不依赖框架，也不触碰任何全局，
  因此仍符合无运行时依赖的规则。每个客户端只保留一层薄薄的按键状态适配器。
- **`HostUpdateNotice`**——可选的宿主线上协议 CLI 生命周期：当前版本、可用的更新版本、
  频道，以及可选的封闭 `available | running | succeeded | failed` 状态（缺失表示旧有的
  v64 提示）。`host.updateAvailable` 发布完整替换。协议 v70 增加无参数的
  `host.update`；没有任何输出、任意诊断、订阅源 URL、产物、平台路径或 shell 命令穿越
  线上协议。
- **wsProtocol.ts**——`WS_METHODS`（`project.*`——包括 **`project.close`**（把稳定记录标记为
  已关闭而不删除关联状态）、**`project.inspect`**（对一个路径分类）+ **`project.init`**
  （`git init` + 提交，然后打开）+ **`project.hasSpecs`**（按项目的惰性查询“是否包含已注册的
  spec？”供 Welcome 界面使用——这是一次全树遍历，因此只对被展示的项目请求，
  绝不急于对每个项目请求）/ `workspace.*`——尤其是 **`workspace.list { projectId,
  includeDiffStats? }`**，其中省略或为 true 会保留现有的完整行及计算出的聚合，
  `false` 返回相同的权威成员关系/顺序，但不做那个同步的、按工作区的 diff 统计
  扇出（导航恢复根本不使用它）/ `fs.*`（**`fs.readFile`** 回答
  `{ content, meta: ResourceMeta }`）/ `git.*` / **`spec.graph`**
  （Specs 查看器的整图读取，按工作区）/ **`todo.*`**——**`list`**/**`add`**/**`update`**/
  **`remove`**，即聊天按会话的 TODO 计划（以 `workspaceId` + `sessionId` 为键；`add` 把该条目
  标记为 `origin:"user"`），外加复查操作 **`review`**（批准：记录 `reviewed` + 该 sha
  水印）、**`requestFix`**（记录 `changes_requested` + 反馈，然后宿主把修复包发射进该条目自己的
  聊天——分离式，若在轮次开始前被拒绝则回滚）以及
  **`startReview`** / **`reviewAll`**（AGENT 复查：一个隐藏的复查子代理获得该条目的
  包并返回结构化裁决；发现以 `author: "agent"` 的复查评论形式到达；
  `TodoItem.review` 在裁决待定时携带 `reviewing`，在 agent 批准时携带 `reviewedBy`。
  `reviewAll` 报告它启动的数量，并在该计划的串行链仍然忙碌时报告 `alreadyRunning`）/
  **`terminal.*`**——**`reserve`**（幂等地建立一个宿主目录中的标签页，
  而不启动其 PTY；`INITIAL_TERMINAL_TAB_KEY` 命名那个每个前端都可以被动放置的宿主预置标签页）/
  **`attach`**（幂等的 get-or-create，以 `(workspaceId, tabKey)` 为键，
  返回 `created` + 用于重绘的 `replay`；这是 PTY 诞生的唯一方式，它取代了
  `create`+`alive`）/ **`list`**（标签页列表归宿主所有）/ `write` / `resize` /
  **`close`**（按 `tabKey`，除非 `force` 否则拒绝忙碌的 shell）/ `model.list` + **`model.refresh`**
  （等待宿主那次单一通道的目录刷新，并返回 **`RefreshedModels`**——刷新后的列表加上
  **`complete`**，即该轮是否在宿主封顶的等待时间内落定，因为只有落定的列表才是
  权威的；`force` 绕过 pi 的 4 小时新鲜度节流，因此用户发起的刷新确实会去抓取）/
  **`model.default`**（宿主解析出的模型与兼容的 effort：可用时为 AppConfig 的默认模型，
  否则为宿主已落定的可用列表中的第一个模型，再否则为 `null`；effort 是
  `defaultEffort ?? "medium"`，在存在模型时用 Pi 的 `clampThinkingLevel` 钳制）/
  **`model.contextSettings`** / **`model.setContextWindow`**（v76；二者都返回
  **`ModelContextSetting[]`**——合格 OpenAI 模型的 `provider`/`id`/`name`、pi 实际生效的
  `contextWindow`，以及 models.json 中显式的 `override`，或 pi 默认值对应的 `null`。该变更接受
  `{target: "available" | {provider,id}, contextWindow: number | null}`：`null` 移除覆盖；
  数字必须在 **`MODEL_CONTEXT_WINDOW_LIMITS`**（272,000–1,000,000）内满足
  **`isModelContextWindow`**，这是应用的编辑策略而非经验证的提供商容量，两侧都会
  强制执行。超出该范围的外部值会被读取而不钳制，而 `available` 目标只覆盖
  **`isSharedModelContextTarget`** 接受的设置（没有覆盖，或覆盖在范围内）：应用
  不可能写入的覆盖只能通过指名其 `{provider,id}` 来修改。保存会发出既有的
  `provider.changed` 失效通知；没有任何 AppConfig 状态或原始配置穿越线上协议）/
  **`model.clampThinking`**（pi 的
  `clampThinkingLevel`，用于一对 `{model, level}`——即会前选择器的 effort 调整，因此没有
  客户端重新推导 pi 的策略）/ **`provider.status`**
（认证提供商状态报告；每次读取都在宿主侧重新校验）/ **`provider.*` 应用内登录**
  （**`loginStart`**——铸造一个 `loginId` 并以**分离**方式运行 pi 的登录流程（`type` 为 `"oauth"` |
  `"api_key"`，issue #97——两条认证路线共乘一个频道；一次流程可能耗时数分钟，绝不能
  压在请求上，也不能阻塞 WS 泵）/ **`loginReply`**——回答一个实时 `select`/`prompt`，
  由 `loginId` 关联 / **`loginCancel`** / **`logout`** /
  **JetBrains AI** 一组 **`jbcentralConnect`** / **`jbcentralDisconnect`** /
  **`jbcentralStartProxy`** / **`jbcentralUpdate`** / **`jbcentralLogin`**（原生的全局 Central 操作，
  返回 `JbcentralActionResult`；任何一个都不接受客户端提供的可执行文件、产物路径、输出、URL 或机密）/
  **`jbcentralQuota`**（v59；可选的 `force` 绕过已完成缓存的年龄，但仍会加入一次
  进行中的读取；禁用/不健康时返回 `hidden` 而不调用配额））/
  **`workspace.listExisting`**（所选项目中未附着的 Git 工作树，其中 detached 行
  按状态禁用）/ **`workspace.openExisting`**（重新校验 + 把一个基于分支的检出注册为
  `kind: "external"`，发出普通的 `workspace.created`，而不改动 Git 或磁盘）/
  **`workspace.rename`**（`{ id, name }` → 加锁后的更新 `Workspace`；仅限受管理的工作树；
  改变显示名称，同时保留 Git 分支 + cwd，并广播普通的全量快照
  `workspace.updated`；`WORKSPACE_RENAME_PROTOCOL_VERSION` 钉住它的 v55 引入，使带有该操作的较新客户端
  在面对较旧宿主时省略它）/ **`workspace.openReview`**（活跃
  分支的可选 `OpenBranchReview` 元数据；可选的 `allowCached: true` 允许命中已落定的宿主
  缓存，而省略该参数则为独立发布的较旧客户端保留原本的强制新鲜行为；
  无论哪种形式，仍会加入一次已在进行的查询）/
  **`project.setTrust`**（持久化一个项目的信任授权 → 更新后的 `Project`；门控其已提交的
  跨 agent 技能别名；`resources: true` 同时授予 pi 层面的资源信任，见 Project trust）/
  **`skill.list`**（针对 `projectId` 的、仅技能的会前 `SlashCommandInfo[]` 预览，从该项目的当前检出解析，
  其**项目范围内的别名受信任门控**；最终的 worktree
  会话才是权威）/ **Skills 管理器一组**——**`project.aliasSkills`**（当前已提交的别名
  名称，供那个存在感门控的通知计数）/ **`project.acknowledgeSkills`**（确认在信任之后出现的
  技能）/ **`project.setSkillEnabled`**（项目基线）/ **`project.setGroupEnabled`**
  （在基线上开启/关闭一个插件 / 来源层级 / `@plugins`）/ **`workspace.setSkillOverride`**
  （按工作区的开启/关闭/清除 → 该 `Workspace`）/ **`workspace.setSubagentsOverride`**
  （`"on"` / `"off"` / `null` 表示继承 → 更新后的 `Workspace`）/
  **`workspace.setSubagentMaxConcurrent`**（一个 `SUBAGENT_MAX_CONCURRENT` 数字 / `null` 表示继承 →
  更新后的 `Workspace`，v79）/ **`workspace.setDiffBase`**（重新指向 diff 目标，
  `null` 把它清回创建基线——回显更新后的 `Workspace` **并**广播
  `workspace.updated`，因此每个客户端都收敛到该推送）/ **`workspace.watchReady`**（在加载技能的客户端
  捕获其新鲜度基线之前，等待新 watcher 的保守启动提示；
  `{ startupNudge }` 为 true，除非该 watcher 已被认作就绪，因此当事件推送丢失或启动失败时，
  重放的响应可以为客户端提供其保守回退；可选的 `prewarm: true` 把已启动的 watcher 标记为仅预热——
  宿主把这类 watcher 放在一个全局有界、可淘汰的池中，任何真实的预检/读取都会把它们从池中提升出来，
  见服务端 `watch` SPEC）/ **`git.status`** +
  **`git.diffFile`**（其两侧随 `ResourceMeta` 一起下发，其 `originalOid` 为 `/blob` 冻结该范围的
  原始侧），二者都接受可选的 **`scope: GitDiffScope`**（一个无法解析的 scope——例如一次 rebase 移除了的
  提交——会被*拒绝*，面板将其读作“重置 scope”，而不是卡在一个已死的 sha 上）/
  **`git.listCommits`**（该工作区分支自身的提交，`<diff base>..HEAD`，最新优先，在宿主侧封顶——
  scope 菜单那份惰性获取的列表）/ **`workspace.turns`**（`{ workspaceId }` → 该工作区已记录的 agent
  运行，最旧优先，在宿主侧封顶）/ **`change.*` 写入路径**
  （`CHANGE_MUTATIONS_PROTOCOL_VERSION` = v75）——**`change.revert`**（`{ workspaceId, path, scope,
  target, expect: { originalHash, modifiedHash } }` → `{ receipt }`：客户端指名*它看到了什么*，
  宿主在一个按工作区的锁下从自己的读取中重新推导该变更，任一侧哈希
  不匹配即返回 `STALE_VIEW` 且不写入任何内容——agent 在复查期间仍在工作，因此
  比较并交换就是全部保护；符号链接与仅模式的输入返回 `UNSUPPORTED_CHANGE`）以及
  **`change.undo`**（`{ workspaceId, receiptId, expect:
  { modifiedHash } }` → `{ receipt }`：回执就是逆操作，这就是为什么 UI 对每个 hunk 提供*Undo*
  而不是要求确认；它作为回答给出的 `undo` 回执本身可再撤销一次，因此
  重做不需要第三种方法）。回执只存在于宿主内存中（每个工作区：最多 20 个，最多
  64 MiB 的持有字节，最旧的先被淘汰，最新的始终保留；随工作区一起丢弃）：git
  和 OS 回收站已经提供了恢复，所以再加一个数据目录格式毫无收益——因此是
  `RECEIPT_UNKNOWN`，而不是一个线上协议层面的持久性承诺 / **`git.prefetch`**（尽力而为的后台抓取一个
  远端基线——New-Workspace 对话框的新鲜度预热；总是 ack `{ ok }`，当该抓取
  确实移动了本地远程跟踪 ref 时，宿主会接着向那些以该 ref 为 diff 基线的工作区发送无路径的
  `workspace.fsChanged` 帧，使其由 git 派生的读取重新收敛）/ **`skills.state`**（`SkillCatalogEntry[]`——
  完整目录 + 按技能的 `decision` + `group`——针对一个 `workspaceId`）/ **`extension.list`**
  （`ExtensionCatalogEntry[]`，无参数——宿主注册表与 `disabledExtensions` 合并；v82，
  **`EXTENSION_CATALOG_PROTOCOL_VERSION`**；不存在写入方法——Settings 开关写的是
  `settings.update { disabledExtensions }`）/ **`project.skills`**（同样的内容，项目范围内，
  供会前管理器使用）/ **`session.reloadResources`**（为一个运行中的会话重新扫描技能 + 重建系统提示词；
  流式期间被拒绝）/
  `session.*`——`create`/`prompt`/`steer`/`followUp`/**`clearQueue`**（排空 Pi 的 steering+followUp
  队列，返回完整的 `SessionQueueContent`；Pi 自己发出那个排空的 `queue_update`；可选的
  `requireTextOnly` 在宿主已观察到排队图像时拒绝且不排空，这即是手动
  压缩的前置条件）/**`removeQueued`**（`{ kind, index }` → `RemovedQueuedMessage`：丢弃或提取一条
  排队消息及其完整内容——条带上各行的编辑/移除；按位置寻址，因为 Pi 的
  队列条目是没有 id 的裸字符串，而宿主在 Pi 全有或全无的 `clearQueue` 之上模拟逐条移除，
  见服务端 agent SPEC）/**`abort`**（普通 abort 为 Interrupt 保留排队的通道；
  `{ restoreQueue: true }` 在发出 abort 信号前原子地排空完整内容，并在
  会话达到空闲后返回它，这是 Stop 的无损路径）/`dispose`/**`delete`**/`setModel`/
  `setThinkingLevel`/`compact`/`getStats`/`getCommands`/`extUiReply`/**`answerQuestion`**（内联
  `ask_user_question` 的回复，以工具调用 id 关联）/**`list`**/**`getMessages`**（
  读取侧）/ **`settings.update`**（合并 + 校验 + 持久化一个顶层的部分 `AppConfig`；拒绝
  非对象负载或未知键，并丢弃已退役的键；出现时，`customLayoutPresets` 和
  `systemThemePair` 是完整替换；进入系统模式要求存在一个完整的、既有或传入的
  配对。一个不带显式 `themeMode` 的旧式 `{ theme }` 变更意味着固定主题选择，并退出
  系统模式；返回合并后的配置）/
  **`feedback.respond`**（`{ action: InterviewResponse }` → ack；持久化该自动邀请的 book、
  postpone 或永久忽略结果；Settings 链接从不调用它；
  `FEEDBACK_INTERVIEW_PROTOCOL_VERSION` 钉住这个被寻址频道的 v56 引入，使宿主不会
  向一个省略了当前 `?protocol=` socket 能力的、独立发布的较旧客户端宣称其可用）/
  **`history.search`**（提示词召回 + 对话搜索读取；结果封顶、
  按新近度排序；消息那一段仅含助手——用户角色的命中改为以可跳转的
  `PromptHit` 呈现，绝不是一个单独的 `MessageHit`）/ **`review.*` 一组**——**`get`**（未关闭的
  复查 + 评论，惰性创建；读取时重新锚定）/ **`commentAdd`**/**`commentUpdate`**/
  **`commentDelete`**（撰写 + 手动解决/忽略；删除仅限 DRAFT——已发送的评论是一条
  记录，而已解决即是终局：线上协议中没有重开，也没有
  工作树回滚；`commentAdd` 接受 diff 标签页的
  `scope`，正是它让宿主能解析 base 侧锚点的 `baseRef`——并被持久化在
  锚点上）/ **`sendComment`**（一条评论 → 其文件所属的复查聊天，在该文件首次发送时创建
  然后 `followUp`）/ **`sendBatch`**（全部/选中的草稿，按键分组进各键的聊天；
  以**每一个**它触及的会话作为回答，按组顺序——只指名第一个会让其他
  聊天不可见，而它们的评论已经显示为已发送）——二者都携带 **`ReviewSendResult`**：
  `session.create` 的形态加上 **`reused`**，即只有宿主知道的那一个事实（这个聊天是被追加进去的，还是刚刚创建的？）。
  一个被复用的聊天可能是客户端从未见过的——另一个客户端，或本客户端在一次重新加载之后，
  因为复查状态和 pi 对话记录都比宿主活得更久——因此它必须被 HYDRATED，而不能当作新的打开；
  把它当作新的打开会给已经标记为已发送的评论显示一个空白对话 / **`fileDone`**
  （把一个完全解决的文件复查标记为完成；只要还有未解决的内容即被拒绝——一条新
  评论会重新打开该文件）/ **`close`**（原子清除：归档当前复查中非草稿的
  记录，丢弃草稿，替换活跃的复查，并向每个客户端发布全新的未关闭快照）
  ——外加
  **`template.*`**——提示词模板 CRUD
  （**`template.list`**、**`template.get`**——读取接受一个可选位置，`workspaceId` 或
  `projectId`，并拒绝同时给出两者；无位置即仅全局，而任一指定位置的形式都会把项目合并到
  全局之上；**`template.save`**、**`template.delete`**）——它们全部
  读写 pi 的提示词目录（全局 + 项目），因此模板保持 CLI 可移植，
  `WS_CHANNELS`（`server.welcome`——它携带初始的 `config: AppConfig`，连同 **`projects`**
  （未关闭的记录）和 **`recentProjects`**（所有已知记录，未关闭 + 已关闭），外加可选的
  **`hostUpdate: HostUpdateNotice`** 和 **`hostPlatform`**
  （`darwin | linux | win32`，对较旧宿主可选）——即 *宿主* 运行所在的 OS，因此一个提供
  由宿主执行命令的客户端（PR 设置对话框）能挑出正确的命令，而不是从浏览器去猜 /
  **`host.updateAvailable`**——向后兼容的完整 CLI 更新快照：最初在启动器发现较新版本时
  发布，随后随着一次 v70 宿主运行的状态推进到 running/succeeded/failed 而被替换；
  在发现失败/无更新时缺失 / **`project.updated`**——打开/重新打开/关闭之后
  完整持久化的 `Project` 快照，包含 `closed` 成员关系，使每个客户端
  原子地收敛其侧栏 + Recents，无需乐观移除 / `pi.event` / `pi.extensionUi` /
  **`session.created`**（初始 `SessionSummary`，在一个新的宿主拥有的会话注册时广播，
  使其他前端能在历史中列出它，而无需打开其本地放置）/ **`session.deleted`**（工作区 +
  会话 id；一个不可重放的领域事件，在永久删除后广播，使每个客户端移除该聊天
  并阻止过期的 hydration）/ **`settings.changed`**（完整的 `AppConfig`，包括自定义预设定义，
  广播使每个客户端收敛）/ **`feedback.interview`**（一个空的、被寻址的邀请，只发给宿主所声明的
  那个前端；不广播、不可订阅、不重放）/ **`provider.login`**——无会话的
  应用内登录流（每帧一个 `LoginPush`，
  以 `loginId` 为键；它是 `pi.extensionUi` 的同胞，因为登录发生在 Welcome 界面上、
  在任何会话存在之前）/ **`provider.changed`**——一条无数据的失效广播，在一次被监视的
  Central 状态/重建结果改变了宿主权威的提供商状态或当前模型代际之后发出；
  客户端会重新读取 `provider.status` 并使 `model.list` 失效，因此没有任何原始提供商/模型数据搭乘该推送 /
  `terminal.data` + **`terminal.exit`** + **`terminal.detached`**（被寻址的终端频道——发往
  那单个*已附着*的客户端而非广播，因此一个 shell 的字节永远不会
  到达另一个浏览器；当宿主不得不丢弃持有的输出时，`terminal.data` 可能携带 `truncated`，
  `terminal.detached` 表示另一个客户端接管了该标签页）/ **工作区生命周期
  三件套**——**`workspace.created`**
  / **`workspace.updated`** / **`workspace.removed`**——注册表成员关系的变化扇出到每个
  客户端，使其保持为共享的领域状态（架构 #9），全部由服务端的 `workspaces`
  发布器发出（绝不是按客户端的乐观变更）。`created`/`updated` 携带**完整持久化的
  `Workspace` 快照**（在传输层的最后值重放下是幂等的，例如一次 agent 重命名
  与一次手动重命名竞争时按 `id` 合并——绝不是增量）；`removed` 携带一对
  **`WorkspaceRemoved`** id（`{ projectId, id }`——记录已经消失）/ **`review.changed`**——一个工作区的复查
  状态发生变化（由服务端的 `reviews` 发布器在每次变更时发出——UI 编辑、agent 的
  `resolve_comment` 调用、重新锚定——使所有客户端收敛，与三件套同样的模式）/
  **`turn.changed`**——宿主刚刚为一次已落定的 agent 运行记录的 `TurnChangeSet`（由服务端的
  `turns` 发布器发出；每个客户端把它追加到该工作区的列表）/
  **`workspace.fsChanged`**——工作树变更通知器推送
  （**`WorkspaceFsChangedPayload`**：`{ workspaceId, paths, truncated, skillChange }`，
  相对工作树、已去重的路径，且封顶——`truncated` 表示通用路径列表不完整，必须
  被当作通配符处理；`skillChange: "none" | "detected" | "unknown"` 是一个**独立的语义
  事实**，在该封顶之前累计，因此一个具体的非技能溢出仍为 `none`，一个在封顶之后被省略的技能路径
  仍为 `detected`，而只有无路径的平台/启动不确定性才是 `unknown`；一个无路径且
  非 truncated/`none` 的帧是对整个工作区的失效通知，例如仓库元数据漂移）；它是
  **失效轻推，而不是数据**：客户端通过既有的读取方法重新读取，因此重复/重放的
  帧是无害的。
  `WsMethodMap` 类型化的请求/结果映射 +
  `WsParams`/`WsResult` 辅助类型，以及 `PROTOCOL_VERSION`。一个私有的类型检查把 `WS_METHODS` 与
  `WsMethodMap` 双向绑定，因此只存在于一边而不在另一边的方法会编译失败。请求 id 同时也是重连幂等键：
  一个未解决的客户端重放同一帧/id，宿主为 `(clientKey, requestId)` 返回那一个缓存结果，
  而不是再次执行处理器。两种*不是*请求的客户端→宿主帧闭合
  这个循环（因此有 **`WsClientMessage`**，按键判别）：**`WsAck`**（`{ ack: string[] }`）指名
  客户端已*读取*的响应——它是区分页面收到的回复与死在 socket 缓冲区里的回复的
  唯一东西，因此也是唯一让宿主释放保留结果的东西——而 **`WsResume`**
  （`{ resume: string[] }`），在每次（重）连接时先于重放发送，指名页面
  仍视为未解决的完整集合，使宿主可以释放其他一切。`resume` 之所以存在，是因为回执只
  与承载它的 socket 一样可靠，而没有任何东西会重新发送一个丢失的回执：重述活跃集合胜过
  确认那些确认。这个行为是按协议版本化的——一个会重放的 UI 绝不能对着
  一个去重之前的宿主流运行。

## 聊天资源

当前聊天的资源视图是两个既有能力所有者的投影，而不是一个通用
进程 API。`CHAT_RESOURCES_PROTOCOL_VERSION`（71）门控其方法与入口；到
v70 及更早的宿主绝不能收到这些请求。并不暗示存在任何原生的 Pi 后台任务协议。命令 DTO 镜像
[[module-pi-background-commands]] 而不导入该包。子代理保留其 Pi 子会话 id 与委派状态。

- `session.resources({workspaceId, sessionId})` 返回分开的命令与子代理摘要：
  所有当前活跃记录加上有界的近期终结记录。快照回显工作区
  与会话身份。命令镜像该所有者的有界快照；子代理摘要只携带
  子/父 id、角色、任务、状态、创建时间、可选的中止原因，以及——一旦终结——由
  [[module-pi-delegation]] 测得的运行时长（`durationMs`），而不是用量或报告。
  子代理角色/任务摘要封顶为 200/2,000 个字符，投影中按创建顺序保留最近二十个终结的
  子会话。这些是运行时目录；重启之后，既有的工具确认
  也不持久化的 PID 都不提供实时权威性。
- `backgroundCommand.output({workspaceId, sessionId, commandId})` 在校验其父级之后，
  返回当前有界的 `{available: true, command, output: {text, truncated}}`，或对未知、
  外来或已淘汰的命令返回 `{available: false}`。输出替换前一个快照；
  截断是显式的。它不接受任何文件系统路径或 PID。
- `backgroundCommand.stop({workspaceId, sessionId, commandId})` 和
  `subagent.stop({workspaceId, parentSessionId, childSessionId})` 请求取消一个被拥有的
  资源。已知的终结资源是幂等成功；未知、已过期或外来的 id
  共用 `RESOURCE_UNAVAILABLE` 错误码。不可用的父会话使用同一个错误码。
  成功的 `Ack` 确认的是意图，而不是观察到的终止。
- `subagent.stopAll({workspaceId, parentSessionId})` 捕获当前活跃的直接子会话，
  在返回 `Ack & {targeted: number}` 之前请求每一个取消，且从不等待子会话
  落定。单个子代理停止遵循同样的“仅确认意图”规则。两个操作都不
  停止父级、不删除子记录、不禁止未来的启动；生命周期的失效通知
  报告最终的落定。
- `session.resourcesChanged` 是一个带 scope 的 `{workspaceId, sessionId}` 失效通知，在成员关系或
  生命周期变化时发出。客户端重新读取快照；在启动确认之后，输出字节不搭乘任何广播或对话记录
  工具更新。既有的 `subagent.getTranscript` 保持不变。

`DelegationRunDetails.abortReason` 镜像由 [[module-pi-delegation]] 拥有的可选字符串。
没有该字段的历史 details 仍然有效；非字符串值会被其守卫拒绝。用户的
Stop 使用 `"user"`，使可移植的完成所有者能抑制空闲父级的唤醒，而无需一个
线上协议拥有的取消注册表。

`background-command-completion` 是一条被显示的 Pi 自定义消息，而不是目录更新。其受守卫的
线上协议 details 包含终端快照元数据（不含完整命令），加上该所有者的有界
纯文本诊断摘录和截断标志。对话可以渲染那条历史通知，
但绝不能从它推断当前的资源权威性；日志与控件仍使用带 scope 的读取。

每一次读取/控制都校验工作区成员关系与父级血缘，而不只是语法上
合法的 id。父会话与子会话 id 使用 Pi 的规范文法，包括内部的点；工作区、
命令和对话记录的权威性仍来自拥有它们的注册表，而不是一个不透明 id 的
拼写。启动能力保持面向 agent；不存在任何浏览器执行 shell 的方法。
重连会在 hydration 完成之前使旧的控制权威失效；瞬时的读取失败
绝不能变成一个成功的空快照。不支持的宿主会清除更早的资源投影。
近期命令输出是短暂的；已完成消息的摘录与子对话记录各有
其既有的 Pi 对话记录持久化，而不是第二个由线上协议拥有的历史存储。

## 项目信任

`PROJECT_TRUST_PROTOCOL_VERSION`（81）门控广义的项目信任面：信任摘要与
pi 层面的资源授权。面对较旧宿主的客户端两者都不发送。

- `project.trustSummary { projectId }` 为广义信任通知返回 `ProjectTrustSummary`：项目
  检出中的别名技能名称，以及 pi 层面的授权会加载的其自有 pi 资源的种类
  （`piResources: ProjectResourceKind[]`，没有则为空），因此该通知恰好指名那里有什么，并且
  只有当 `extensions` 或 `settings` 在其中时才声明它会运行代码，外加届时会有多少条 `.pi/mcp.json`
  条目等待批准（`mcpServers`）。
  较旧的宿主只回答 `project.aliasSkills`，客户端将其读作“仅有别名”。它读取
  项目自己的检出，不接受 `workspaceId`：信任是按项目的，而展示它的两个界面
  （Welcome 通知与 New Workspace）在它们所导向的工作区存在之前就会运行；Skills 对话框
  则在客户端侧加上其工作树目录中的未受信任别名。
- `project.setTrust` 接受可选的 `resources: true`：此时该授权也信任项目自有的 pi
  资源（`Project.piResourceTrust`——设置与扩展会运行代码）。没有它，授权只设置
  别名信任，因此一个不指名 pi 层面信任会加载什么的界面（较旧的客户端）永远不会
  启用它；`trusted: false` 同时撤销两者。

## MCP 服务器

`MCP_PROTOCOL_VERSION`（83，在 82 的扩展目录之后）门控 `mcp.*` 方法、`mcp.status` 频道以及可选的
`SessionResources.mcpServers` 列表；面对较旧宿主的客户端一个都不发送，并把
缺失的列表视为“没有 MCP”。引擎是 pi 内置的 MCP（[[submodule-server-agent]]）；这些 DTO 镜像
宿主从 pi 以及两个 `mcp.json` 文件读取到的内容，绝不是 pi 自己的类型——web 只依赖
contracts。

- 项目记录携带宿主在某次聊天加载其服务器时所应用的按项目策略：
  `Project.mcpApprovals` 把一个仓库定义的服务器名称映射到其整个 `.pi/mcp.json`
  条目的指纹（该条目只有在仍具有该指纹时才会加载，因此一次编辑即让批准失效），而
  `Project.mcpOverrides` 持有该项目对用户级服务器的启用与暴露设置，绝不写入
  `.pi/mcp.json`；`ProjectTrustSummary.mcpServers` 统计仓库的条目数（见项目信任）。
  该计数是可选的，因为早于 MCP 的项目信任宿主会省略它；客户端把缺失解释为零。
- 每个请求都指名其目标：配置用 `workspaceId`（项目 scope = 该工作区的
  `.pi/mcp.json`；`user` = 全局文件），按会话的操作（`reconnect`、
  `setSessionOverride`、`readOutput`）再加 `sessionId`。宿主没有“活跃工作区”这个概念。
- `mcp.list` 返回已配置的 `McpServerSummary` 集合（scope、定义文件、定义文件条目按渲染形式给出的
  `fingerprint`、掩码后的端点、已配置与生效的暴露方式、启用状态、
  项目覆盖、仓库批准状态、与 pi 等价的配置错误——每个具名条目一条，不是对象的条目
  也包含在内）。`fingerprint` 是该行在任一 scope 下被重写或删除时的身份；
  `approval.fingerprint` 是被跟踪批准状态的仓库内容——在项目行上是同一个值，
  在用户行上则是折叠后的 `.pi/mcp.json` 覆盖的值——也正是 `mcp.approve` 接受的参数。附加式的、
  可选的 `effective` 标志标识出宿主加载器实际接纳的定义，与所显示的覆盖诊断
  无关；登录/登出/测试操作只属于那一行。较旧的宿主可能
  省略它，此时客户端绝不能为有歧义的同名行推断权威性。连同
  已配置集合，响应还携带每个会话实时的
  `McpStatusSnapshot`；快照携带按会话单调的 `generation`，因此过期的推送
  永不覆盖较新的一个。一个活跃聊天从打开那一刻起就有快照：在 pi 回答之前，
  以及每次重新加载之后，它所启动的服务器读作 `starting`。`configErrors`（`McpConfigFileError`：
  该文件的路径与 pi 等价的消息，已掩码）列出整个文件层面的问题——无法解析的
  JSON、`mcpServers` 不是对象、拼错的顶层键——那些没有服务器行能承载；较旧的宿主
  会省略它。`handledElsewhere` 标记一个宿主，
  在该宿主上某个用户安装的扩展或 `-builtin:mcp` 拥有 MCP，且管理是只读的；即使没有聊天打开，
  pi 设置也会被读取（`by: "pi settings (-builtin:mcp)"`——Settings 识别那个确切的值
  来说明要移除哪个条目，因此它保持稳定），一个替代性扩展则通过一个活跃的
  聊天被看到（`by` = 它的路径）。
- 变更（`add`、`update`、`remove`、`setProjectOverride`、`approve`、`shareWithRepo`）在与写入同一个
  同步步骤中重新检查那份所有权与当前项目策略，并在 `mcp.list` 会设置 `handledElsewhere` 的地方以
  `MCP_HANDLED_ELSEWHERE` 失败，因此过期的客户端在另一个管理器拥有 MCP 时无法写入；它们返回新鲜的
  列表而无需等待已打开的聊天重新加载；`mcp.status` 推送报告每次重新加载，因此返回的
  快照可能早于它。`setProjectOverride` 写项目记录，绝不写被跟踪的
  `.pi/mcp.json`；`shareWithRepo` 才是向它的显式写入。`setProjectOverride` 把它携带的字段
  原子地合并进最新存储的覆盖（客户端只发送变化的部分，因此并发的
  客户端不会互相覆盖设置）。启用状态必须是布尔值，暴露方式必须是
  `deferred`、`direct`、`hidden` 之一；畸形的运行时值以 `MCP_CONFIG_INVALID` 失败。`setSessionOverride`
  即聊天资源的“在本聊天中禁用”：它只适用于 `mcp.json` 服务器——一行带
  `registered: true` 的 `SessionResources.mcpServers` 是某个扩展注册的服务器（其 `transport` 就是
  那次注册的），禁用它以 `MCP_CONFIG_INVALID` 失败；在 MCP 由别处处理的地方它则以
  `MCP_HANDLED_ELSEWHERE` 失败。`mcp.reconnect` 在 pi 重连该服务器后 resolve，并以 pi 的失败（已掩码）
  reject——pi 为此发出的通知从不出现在聊天中——且在别处处理 MCP 时以 `MCP_HANDLED_ELSEWHERE`
  同样失败。
- 写入仓库（`approve`、`shareWithRepo`，以及项目 scope 的 `add` / `update` / `remove`）
  需要该项目的 pi 层面信任，没有则以 `MCP_CONFIG_INVALID` 失败，因为一个未受信任
  项目的仓库条目根本不会被列出；`setProjectOverride` 仅写记录，因此仍然可用。
- 一次写入绝不会批准用户尚未复查过的仓库内容。项目 scope 下对一个新名称的 `add`
  是用户自己的条目，按写入内容即被批准。项目 scope 的 `update` 只有在磁盘上的条目已在
  其当前指纹下获得批准时，才把批准转移到写入后的条目（否则该重写
  保持待定）。每次 `update` 或 `remove`，在用户与项目 scope 上一视同仁，都以
  `McpRenderedTarget` 指名其目标：客户端渲染该行所用的 `McpServerSummary.fingerprint` 是必需的
  （`expectedFingerprint`），而当该 scope 文件中的条目已不再具有它时，宿主会拒绝且文件不动
  ——因此一个过期的 Edit 或 Remove 永远不会重写或删除用户未见过内容，
  无论是一次检出改变了仓库条目，还是另一个客户端或编辑器在一个打开的对话框之下替换了用户条目。
  该字段在线上协议中是必需的而非可选的：MCP 界面整体随
  `MCP_PROTOCOL_VERSION` 一次性发布，因此没有较旧的宿主或客户端需要容忍。
  宿主自己校验 `scope`；除 `user` / `project` 以外的任何值都会在选择任何路径之前被拒绝。当项目文件
  已经定义了该名称，或持有未在其当前指纹下获得批准的覆盖时，`shareWithRepo` 拒绝。
- `mcp.login` / `mcp.testConnection` 像变更一样，在启动探测的同一个同步步骤中检查 MCP 所有权；
  它们返回一个 `loginId` 并复用 `provider.login` 帧族
  （`LoginPush.target` 标识该服务器）；这些推送只到达启动该操作的那个连接，
  来自另一个连接的回复或取消以 `LOGIN_NOT_OWNER` 失败。它们和
  `mcp.logout` 在 `handledElsewhere` 被设置的地方以 `MCP_HANDLED_ELSEWHERE` 失败，并在该服务器
  的登录正在任何地方运行时以“已在运行”错误失败——无论是另一个 Settings 操作，还是某个聊天的
  `/mcp login <name>`。超过 10 分钟仍打开的操作，或其客户端在重连窗口之后已被宿主回收的操作，
  以一个 `error` 帧结束（"Sign-in timed out." / "Sign-in cancelled."）。
  `mcp.testConnection` 判定的是实际被接纳配置的传输，而不是一行已批准但
  无效、被加载器跳过的项目行。如果工作区身份、cwd 或项目信任在异步所有权解析期间发生变化，
  变更与探测会 reject；没有任何过期的项目授权能接纳一个新操作。
- `McpToolDetails` 镜像 pi 对 `mcp__*` 以及三个 MCP 资源工具的结果 details；
  `McpResultSummary` 是宿主编写的、有界的、不含 base64 的呈现摘要，位于
  `details.thinkrail` 之下，使卡片在实时、重新加载之后以及在另一个客户端上渲染得完全一致。
  `mcp.readOutput` 只提供某个结果被记录的 `fullOutputPath`，并在该临时文件
  已消失时报告 `expired`。
- `mcp.readLog { workspaceId, name }` 返回 `McpServerLog`：来自 pi 共享的 `mcp.log` 及其轮转副本的
  该服务器最新几行（最多 200 行，最旧优先）——即服务器发给 pi 的 `notifications/message` 日志消息，
  以每个条目的 `[<server>]` 头部归属——像 `detail` 一样掩码；当该服务器在那里没有记录任何内容时，
  `text` 为空。它不需要会话：pi 每个 agent 目录保留一份日志。
- 状态（`McpServerState`）是宿主快照与客户端派生行共用的一套词表：
  `starting`、`connected`、`needs-sign-in`、`failed`、`disconnected`、`disabled`、`disabled-in-project`、
  `disabled-in-chat`、`pending-approval`、`invalid-config`、`pending-reload`、`not-running`、
  `handled-elsewhere`、`unknown`；宿主从不发送 `not-running` / `handled-elsewhere`。`detail` 是 pi
  对该服务器的状态文本，`configError` 是与 pi 等价的校验消息；pi 对二者都不做
  脱敏（一个连接错误或某个 stdio 服务器的 stderr 尾部会逐字到达），因此宿主在它们——以及 MCP 登录的
  `error` 帧——到达任何客户端之前，掩码其中看起来像凭证的值。
- 错误码：`MCP_CONFIG_INVALID`（与 pi 等价的校验失败，或上述某条写入前置条件
  不成立）、`MCP_PATH_UNSAFE`（符号链接或非普通文件的项目配置路径）、`MCP_HANDLED_ELSEWHERE`、
  `LOGIN_NOT_OWNER`。

## 规范化的会话状态

`SessionState` 携带彼此正交的宿主事实：`execution`（`idle | running`）加稳定的 `runId`、可空的
`needsInput`（稳定的 `interactionId`、`question | dialog`；一个待定对话框还携带其确切的可重放
请求）、可空的最新 `completion`（稳定的 id 和显式的
`succeeded | failed(error|length) | interrupted | cancelled` 结果）、Pi 的队列计数、实时的
`backgroundWork` 标志（该会话仍拥有正在运行的后台命令或子代理），以及
所有者全局的 `completionUnread` 回执投影（空闲会话仍有后台工作时它保持为 false）。
`isSessionWorking` 是那个唯一的*工作中*判定：`execution` 为 running 或 `backgroundWork` 为真；
较旧的宿主会省略该标志，读作 false。`SessionStateRecord` 增加会话/工作区/项目
归属；`SessionSummary.state` 携带所附会话的确切状态。

`session.stateList` 是每个顶层活跃或磁盘会话的权威全工作区快照，并且
失败而不是返回一次不完整的扫描。`session.state` 在导致它的 Pi
事件之后推送一条完整记录。`session.acknowledgeCompletion` 比较并设置一个确切的完成 id；needs-input
永远不可确认。`session.nudge` 对 needs-input 原子地无操作，在有工作运行时排队，并提示
一个空闲会话。这些协同方法自 `SESSION_STATE_PROTOCOL_VERSION` 起可用；较旧的宿主
就不提供任何跨工作区状态。

请求注册表还让 `session.activityList` 在一个兼容窗口内返回字面量 `[]`，
使一个已加载的旧客户端在重连之后清除已退役的标记。不再返回任何活动推送或类型。

## 必须做对的事

- **镜像不在注释里钉住版本。** 一个形状之所以在这里被重新声明，是因为它真正的家在
  仅 Node 的包里，它只携带自己镜像*什么*，绝不携带*它上次对照的是哪个 pi 版本*：那些
  标记在每次版本升级时都得跨多个文件手工编辑，而且没有任何东西验证它们。一个
  与 UI 相关的生命周期成员必须在这里显式列出（尤其是宿主增补的 `agent_settled`）；
  与 UI 无关的会话事件如 `entry_appended` 可以保持未建模并被忽略。当某次升级的变更日志
  触及某个镜像时再去重新审计它，而不是因为某条注释指名了某个版本。
- **仅类型，永远从包根导入**（仅类型导入会被 `verbatimModuleSyntax` 擦除，
  因此 web bundle 保持无提供商依赖；pi-ai 的提供商/API 子路径会静态导入 Node SDK
  ——绝不要触碰它们）。`/base` 条目只存在于 0.79.8–0.79.9。
- `Model` 是泛型的——以 `Model<any>` 暴露。
- `AssistantMessageEvent`（流式增量）嵌套在 `message_update.assistantMessageEvent` 之下，
  绝不是顶层的事件 `type`。
- 内部相对导入是**无扩展名的**（`./domain`），而不是 `./domain.ts`——`composite` 会输出
  声明文件，这与 `allowImportingTsExtensions` 不兼容。
- **打包门禁：** 对 web 应用执行 `bun build`，并确认**没有**出现 `@anthropic-ai/sdk` /
  `openai` / `node:fs`。

## 使用方

`web`（类型 + 上面列出的运行时导出）以及 `server`（同样的内容，+ 把 `session.*` 映射到
`AgentSession` 方法）。外壳面板需要 `domain` + `wsProtocol`；`pi` 类型 + `PiEvent` 是 agent 会话的
线上协议。
