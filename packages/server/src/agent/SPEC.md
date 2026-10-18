---
id: submodule-server-agent
type: submodule-design
status: active
title: agent — in-process pi sessions
parent: module-server
depends-on: [module-contracts, module-pi-delegation, module-pi-subagents, module-pi-background-commands]
references: [module-spec-graph, central-integration, submodule-server-extensions]
tags: [pi]
---

## 职责

进程内的 `pi` 引擎：面向会话前工作与未来聊天的当前共享模型/auth 运行时代次，`AgentSession` 的生命
周期（每个聊天标签页一个，扎根于某个工作区的工作树，并保留它们创建时所依据的运行时代次），Pi 资源/
技能加载（包括可移植的跨 agent 技能发现 + 会话前技能目录），把 pi 进程内 `uiContext` 对话框调用变成
WS 帧的**扩展 UI 桥**，宿主自有的 **`ask_user_question`** 工具 + 其答案注入路径，以及让重新打开的
对话记录保持提供商可用的**重启修复**。

## 边界

- **拥有：**
  - `piRuntime`（当前共享的 `ModelRuntime` 代次 —— pi 对目录、凭据、可用性、登录/登出与请求派发的规范
    模型/auth 门面）。兄弟使用方通过 `usePiRuntime()` 回调捕获当前代次，而不是接收一个可变单例；宿主
    启动在任何模型工作之前初始化它，而之后 Central 产物的变化会准备并原子地激活一个新代次。测试在初始化
    之前配置工厂。每个运行时都以**环境网络关闭**的方式创建 —— `allowModelNetwork: false` **加上构造
    前后限定范围的 `PI_OFFLINE`**（pi 0.81 在构造时从该环境推导运行时的环境网络默认值；该选项现在只约束
    创建时的刷新 —— 在 0.80.x 中它同时供两者使用；限定范围内的值立即恢复，用户自设的值不被触碰 ——
    由 `piRuntime.test.ts` 固定）：目录读取保持本地（内置项 + models.json + 持久化的 models-store），
    因为启用网络的 `refresh()`（pi 0.82 把旧的 `reloadConfig()` 并入其中）会等待远端 pi.dev 目录检查且
    没有超时 —— 在 `provider.status` 与宿主启动路径上，凡是出口慢或被封锁的地方都会因此卡住。对实时目录
    唯一有意的按需开启是单次飞行的 **`refreshCatalogs(runtime)`**（issue #98，镜像 pi 自己的 `/model`），
    它由两个触发者驱动：仅来自 `model.list` 的分离任务（`listAvailableModels` 触发它，然后提供当前快照
    —— 选择器的读取绝不等待网络；更广的触发器 —— `model.default`、新聊天默认解析、宿主启动 —— 经评估
    后被否决，因此那些路径通过 `listSettledModels` 读取快照），以及经由 `model.refresh` **被等待**
    （`refreshAvailableModels`，选择器的新鲜度手段：先等待刷新，然后提供刷新后的快照**并带上 `complete`**
    —— `refreshCatalogs` 解析出一个 `CatalogRefreshOutcome`，说明它所等待的那一轮是否已定妥，而该判定
    以 `RefreshedModels.complete` 传到客户端，因为有上限的等待只能承诺一份*当前*列表，而不是已定妥的
    列表，目录权威必须依据这一差异）。每次调用都传 `refresh({ allowNetwork: true, force })`，其中
    **`force` 是调用方的意图，不是常量**：*隐式*触发（`model.list`、打开选择器）不设它，由 pi 的
    **4 小时提供商新鲜度节流**决定是否抓取任何东西，而*用户发起*的刷新（选择器的 Refresh 行 →
    `model.refresh({force:true})`）绕过它 —— 在那个窗口内 pi 会在**发出任何请求之前**就提前返回
    （包括其 `If-None-Match` 重新验证），因此一次未强制的显式刷新将什么都抓不到。**按运行时实例单次
    飞行**（pi 的 `refresh()` 不会去重并发调用）**并与类型一起作键**：隐式调用方加入任何一轮，强制调用方
    绝不加入被节流的那一轮（它会继承那个空操作），而是排在它后面。**15 秒预算**（pi 模型选择器所用的
    那个）被应用**两次**，两者都使用 **unref 过**的定时器（不得拖住正在关闭的宿主或测试进程）：作为
    `models.refresh` 的**中止**信号（卡住的刷新必须自我到期，否则单次飞行会被卡死），*以及*作为
    **调用方所等待**的上限，因为该信号既不能约束 pi 之后无信号的 `forceRefreshAvailability()` 扇出，
    也不能约束排在受节流一轮之后的强制轮次 —— 没有它，一个慢提供商会让每个选择器的刷新行一直转圈。
    超时的调用方按注册表的现状提供（报告 `completed: false`），而单次飞行继续追踪那个无界的轮次（因此
    它不会启动第二次并发刷新）；失败只发出封闭的通用/计数 warn 日志（绝不带提供商 id 或错误）并被吞掉，
    绝不是选择器的问题；**`PI_OFFLINE`**（pi 的环境约定）会禁用它 —— 解析为一次*已完成*的轮次，因为
    没有任何可抓取的东西时，注册表现状就是定妥的答案；e2e webServer 的环境与管理器的单元测试套件为
    隔离性而设置它。这套运行时之上的**提供商凭据接口** —— `provider.status` + 应用内登录 —— 住在兄弟
    模块 `auth` 中（它消费共享的 `usePiRuntime` 回调），**不**在这里。

    候选准备只接受经审阅的不透明 Central 路径集合，构建一个新运行时，应用组合根的不变量代次初始化器
    （源码模式的 e2e 宿主用它来设置其受门禁的假提供商），为 `provider.status` 记录那份不透明前的
    提供商 id 允许清单连同每个 id 在那一刻的显示名，然后通过 PI 的公开无头加载器一次性应用不透明的
    扩展。该代次另经不透明注册身份比对（绝不使用配置值）记录由该加载器引入或替换的 id
    （`opaqueProviderIds`）。允许清单保持完整的不透明前集合：新的 Central id 从不在其中，因此绝不会变成
    一行，而被替换的内置项（`anthropic`、`openai`、…）保持可见，auth 通过求两个集合的交集把它归因到
    Central。（曾一度为分析归因而从允许清单中减去不透明集合，结果每个经 Central 路由的提供商都从
    Providers 区域消失了；这两个事实必须保持分离。）因此 auth 绝不检查或发出 Central 的提供商配置，而
    新增/删除/替换也绝不可能丢掉进程本地的提供商注册。初始化器必须在第一个代次之前配置，并对每个候选
    运行。该路径是本模块收到的唯一产物事实；它绝不读取、解析、哈希、快照、记录、复制或提供该文件。
    初始化器/扩展/加载器/提供商的失败会丢弃该候选并收敛为封闭的 `load-failed` 结果；原始诊断绝不抵达
    `pi.extensionUi`、线上协议、日志、分析、持久化或快照。auth 拥有文件监视、合并与陈旧候选的拒绝；
    agent 只准备并激活一个代次。

    `getSessionRuntimeGeneration` 暴露活跃会话所保留的代次，供同步的宿主元数据读取。激活会改变会话前
    读取与未来会话创建所用的当前指针；它绝不修改、排空或重建既有会话。活跃会话保留其原始运行时代次。
    激活之后挂接的磁盘会话，在该模型于当前运行时中可用时保留其保存的模型。若不可用，PI 会打开时选择
    当前默认值，而不改变所保存的模型。当用户发送消息时 PI 记录这次替换，因此之后的重新启动会恢复该
    模型。仅仅打开聊天会保留其原始模型，以备该提供商回归。没有任何可用模型时，对话记录仍可读，且不会
    把占位模型持久化为替换。

    每一次模型**读取**都经过 **`settledAvailableModels(runtime)`** —— pi 的 `getAvailableSnapshot()`，
    **绝不是 `getAvailable()`**：后者会等待 `refreshAvailability()`，而它返回待处理的按提供商 auth 扇出
    *或启动一次*，全都没有信号 —— 因此经由它读取会把 `model.list`（其契约是不碰网络就作答）、
    `model.default` 以及每个入站模型引用的检查交给一次无界的等待，并会在应用刷新截止时间后一行就逃出
    它。快照是 pi 最近一次*定妥*的轮次所得出的（在 `create()` 时、每次 `refresh()` 之后以及登录/登出时
    写入），再加上 pi 在某个带已存凭据或已配置 key 的提供商被注册的那一刻写入的临时条目 —— 配置注册与
    原生注册（`registerNativeProvider`）皆然，因此一个 Central 或委派镜像的提供商在其可用性轮次落地之前
    就可读。作为唯一的读取口，它使选择器、默认值与模型解析在同一代次内保持一致。
  - `modelContext` —— 一个窄设置适配器，作用于 pi 共享的 `getAgentDir()/models.json` 中的
    `contextWindow` 覆盖，而不是第二个模型注册表。它从 `settledAvailableModels` 中列出有效预算仍等于
    contracts 的 272K 编辑上限的 OpenAI Responses / Codex Responses 模型（本设置正是为了抬高该上限），
    外加任何已带覆盖的模型，以便它总能被回退；每个条目把 pi 的有效 `contextWindow` 与文件中的显式
    `override` 配对（`null` = pi 默认）。资格由 pi 的目录派生，绝不来自模型 id 列表，因此高于 1M 的目录
    默认值不会被批量保存触碰。保存会先校验 contracts 的 272K–1M 范围，为目标准确地补丁
    `providers.<p>.modelOverrides.<id>.contextWindow` —— 或者对 `available`，为 contracts 的
    `isSharedModelContextTarget` 所接纳的每个合格对打补丁，因此共享保存绝不会改写超出范围的覆盖（那种
    只有针对性保存才能触碰）—— 使用 `jsonc-parser`，使注释、BOM 与无关配置得以存活，修剪因此变空的
    覆盖对象（绝不修剪 `providers`），拒绝无效 JSON 或只读文件而不是去打补丁，然后在解析后的目标旁写
    一个临时文件，沿用原文件的权限（新文件为 `0o600`），再把它重命名到位 —— 对符号链接的 `models.json`
    跟随到其目标，并创建悬空链接的目标而不是替换该链接。保存在进程内串行化；文件一旦改变，会对当前代次
    执行一次禁用网络的 `runtime.refresh`，并发出宿主的 `provider.changed` 信号；空操作保存两者都不做。
    每次读取也会先在本地刷新，使外部 pi CLI 的编辑得以显现。活跃会话保留它们创建时所依据的模型；新聊天
    解析更新后的元数据。pi 拥有 schema 校验与生效值；错误消息是通用的，绝不携带文件内容。已接受的缺口：
    如果某次 Central 重建的运行时在保存之前加载了该文件、并在其刷新之后才激活，它会继续提供旧预算，直到
    下一次读取刷新它。
  - `agentSessionManager` —— 以 `session.sessionId` 为键的会话（每个 `Entry` 还追踪其 `workspaceId`），
    `createSession({ cwd, workspaceId, model?, thinkingLevel? })` → `createAgentSession(...)`，带一个
    按会话的 `SessionManager` **以及 `buildSessionSettings(cwd, projectTrusted)`**（用户的真实设置 +
    一个内存中的 `images.autoResize:false` 覆盖 —— 绝不持久化 —— 使 `read` 工具**原样**发送图像文件，
    绕过单文件二进制无法打包的 pi photon/WASM 缩放器；web UI 在附加时自行缩小用户附加的图像 ——
    `apps/web` 的 `chat/imageAttachment` 把长边限制在 1568px —— 下面的 `imageGuard` 扩展是上下文内的
    第二道防线）。该覆盖在**每次 `settings.reload()` 之后都会重新应用**：pi 的 `SettingsManager.reload()`
    从磁盘重建设置并丢弃 `applyOverrides`，而资源加载器在每次 `reload()` 时都会重载设置 —— 包括在
    `createAgentSession` 内部 —— 因此一次性的覆盖从未抵达提示词。自 pi 0.87 起，同一设置也管辖提示词
    附加的图像与工具结果图像，因此正是这个覆盖阻止 pi 用 `[Image omitted…]` 提示改写用户文本（那会破坏
    客户端的乐观回显去重）。被委派的子会话运行在同一批设置上：`delegation` 把 `buildSessionSettings`
    绑定为内核的 `buildChildSettings`，后者接收父上下文 `isProjectTrusted` 所回答的信任值
    （`liveParentContext`；pi-delegation 决策 #31，issue #604）。共享的 `registerSession` 为每个事件打上
    其 id 后发布 + `bindExtensions({ mode:'rpc', uiContext })`。事件投影保留最终 `agent_end` 助手报告的
    终结元数据，并把它附加到 `agent_settled`，因此即使这些事件之间发生了压缩/重试，线上协议也只有一个
    权威的自动工作终结点；它转发而非重新推导 pi 的结果。`compaction_end` 被单独投影为一个**新的、经允许
    清单筛选的事件**：其 `result` 只携带 `tokensBefore` 与可选的 `estimatedTokensAfter`，绝不携带 pi 的
    摘要、条目 id、用量或扩展细节。工具的 `tool_execution_end` / `tool_execution_update` 帧会从（部分）
    结果中丢弃 `structuredContent`：那是 pi 给编程调用方的值（bash 会在那里放最多 1 MiB 的原始输出），
    从不持久化、从不渲染，因此转发它只会让每个实时帧与浏览器 store 变大。活跃条目把该次结算保留在
    `SessionSummary.lastSettlement` 中，供 Pi 从其重建后的上下文中移除一次失败尝试之后的重连使用；新的
    `agent_start` 暴露显式的 `null`（当前无终结点），使更早的持久化失败无法在运行中重新出现，而磁盘
    会话仍以对话记录为权威。活跃摘要还携带 pi 的队列快照（`SessionQueueState`，仅在非空时）：
    `queue_update` 只在变化时触发，因此这是读取侧的种子，让运行中挂接的客户端能渲染其连接之前已排队的
    消息。每条队列通道也只在 Pi 报告对应文本条目待处理期间保留浏览器所排队消息的完整内容。那份瞬时镜像
    之所以存在，纯粹因为 Pi 的破坏性队列 API 返回文本却丢弃图像块；Pi 的队列事件仍是成员/顺序的权威。
    宿主只把一个保守的 `hasImages` 聚合投影进摘要/事件，因此图像字节不会搭乘常规读取流。

    **一处成员关系覆盖用来补偿 Pi 的一个缺陷：一条已投递的、仅含图像（文本为空）的排队消息永远不会被
    清除。** Pi 在投递时按所投递用户消息的文本（`contentText`）定位队列移除，因此一条带图像但无文本的
    消息会永远留在 Pi 的 `_steeringMessages` / `_followUpMessages` 中，其 "Steering"/"Follow-up" 标记
    永不消失。因此管理器按通道统计这类投递（`stuckEmptyDeliveries`）：当一条用户 `message_start` 的文本
    为空、其内容携带图像，且 Pi 仍报告某通道的空文本条目多于已计数数量时，它就增加该通道的计数，并
    **合成 Pi 扣下的那条清空 `queue_update`**。每一处为展示而读取通道的地方 —— 投影出的 `queue_update`、
    瞬时镜像同步，以及 `queueStateOf` —— 都先从 Pi 的列表里丢弃相应数量的空文本条目，因此之后一条真正的
    `queue_update` 也无法让这个幽灵复活。计数只属于活跃条目（Pi 的临时队列绝不挺过进程重启），并在
    `clearQueue()` 清空两个通道时重置。

    **在发布上游修复的那次 pi 升级中移除整段覆盖**（earendil-works/pi#8612，上次检查时仍未关闭）。一旦
    Pi 原生地清除空文本图像投递，就丢弃 `stuckEmptyDeliveries`、`displayedLane`、合成的 `queue_update`
    以及 `effectivePendingCount` 的调整。移除门禁是已安装的代码，而不是 PR 状态：每次 pi 升级都用 grep
    检查已安装的 `agent-session.js` 中 `this._steeringMessages.indexOf` 附近的 `if (messageText)` 守卫
    —— 只要该守卫还在，这个规避就仍然需要；当它消失时，修复已经发布。

  - **规范化的会话状态**是宿主基于互相正交的事实的单一投影，绝不是第二个 agent 运行时。实时推导读取 Pi
    的执行/队列状态、问题阶段注册表中确切的 expected/waiting id、扩展对话框注册表、最终结算以及显式的
    Stop 意图。在呈现上，需要输入优先于工作中，而底层执行可能仍在运行。只有 `agent_settled` 才创建正常
    的完成；一个终结分类器区分成功、错误、长度、中止与缺失的工作。显式 Stop 在中止之前把当前 run id
    记录为已取消，并保持安静；重启之后发现的未完成运行会转为已中断。

    **后台工作会保持未读。** 当空闲聊天仍拥有正在运行/正在停止的后台命令，或排队中/运行中的委派子会话时，
    其完成会被上报，但 `completionUnread` 保持 false，因此当 agent 的工作仍在飞行中时，既不会触发注意点
    也不会发出应用外通知；需要输入永远不会被保持。命令变更监听器与委派生命周期监听器会在合并后的
    `setImmediate` 上重新发布父级状态，且晚于同一 tick 内唤醒父级的完成投递（后者已把它翻转为运行中）——
    因此最后一个收尾的子会话绝不会在被唤醒的轮次之前闪现那个点。不唤醒父级的完成（用户停止）会释放在那次
    重新发布上的保持；被重载或回收站操作门禁的投递也先释放，其稍后的唤醒会再次清除未读。纯磁盘会话没有
    活跃工作，永不保持。同一事实被发布为 `backgroundWork`，因此客户端把空闲聊天显示为工作中（contracts 的
    `isSessionWorking`），而不是悄悄完成。

    状态 id 来自 Pi 的活跃会话条目链：运行/中断取自最近的用户条目，完成取自决定性的助手条目，
    问题/对话框取自它们的交互 id。磁盘状态由完整的活跃分支重建；文件读取/解析失败会让整个工作区的快照
    失败，而不是省略一行。回执初始化除非两个元数据文件都加载成功才会运行（首次安装，或某个文件持久化被
    标记为不可读并被记入日志）：它把既有完成 id 标记为已处理，但绝不抑制未解决的输入。由于它在开始服务
    之前运行，它是唯一尽力而为的读取者：不可读的对话记录或会话目录会被记入日志并留置为未建立基线，而不是
    阻塞宿主启动，而之后的快照会持续失败直到该文件被修复。回执写入是串行且原子的。
    会话在语义变化时发布完整状态记录。待决的扩展对话框保留其完整请求，使重连的客户端能渲染并回答那个确切
    的阻塞点，而不是看到一个不可用的需要输入标记。

    `listSessionStates` 返回每个顶层活跃/磁盘会话；`acknowledgeCompletion` 只对当前确切的那次未读完成做
    比较并设置；`nudgeSession` 原子地跳过需要输入、在运行中排队、或在空闲时提示。`SessionSummary.state`
    与 `session.state` 使用同一套推导，因此客户端按 id 证明所渲染的确切完成，而不是自己发明生命周期。

    New-session 与会话前的入口点会捕获当前代次；对活跃会话的操作使用该会话所保留的运行时。`abort` 仍作为
    取消控制路径可用。
    `prompt`/`steer`/`followUp`（带图像）/
    — **`promptSession` 与 `followUpSession` 都依据会话 LIVE 的 `isStreaming`（实时值）解析投递模式，
    绝不是依据调用方对它的判断**：`prompt()` 在轮次中途会抛错（因此回退到 `steer`），而 pi 的
    `followUp()` 只是*入队*到一个由已在飞行中的运行排空的队列（因此在空闲会话上它会回退到 `prompt`，
    否则消息会永远滞留 —— 就像 `review.sendBatch` 往一个重新挂接的评审聊天里发送，把评论标记为已发送给
    一个从未看到它们的 agent）/ **`clearQueueSession`**（Pi 的 `clearQueue()`：排空两个队列但只返回
    文本，而宿主先快照其已调和的瞬时镜像，并返回完整的逐条消息文本 + 图像。Pi 会发出清空后的
    `queue_update`）。其可选的纯文本前置条件在两条受追踪通道中任一有排队图像时，会在触碰 Pi 之前拒绝；
    手动压缩使用该守卫，而 **`abortSession(..., true)`** 在一次管理器操作中同步认领 Stop 并排空队列。
    若一个已被接受的问题结果仍在持久化中，Stop 会在向 Pi 发出中止信号之前给它一个有限的宽限期；这既防止
    异步的 post-tool 钩子死锁 Stop，又保留正常的快路径。它在中止之前再排空一次，并把那些迟到的消息追加回
    其原始通道；随后它等待空闲并返回完整且有序的队列，因此延迟的 Stop 不会与续接竞争，也不会丢失图像 /
    **`removeQueuedSession(sessionId, kind, index)`** —— 按条目的队列移除，Pi 的 API 缺此能力（队列
    就是裸字符串数组，`clearQueue` 是全有或全无）：经完整内容路径排空，丢弃 `lane[index]`（越界 →
    `removed: null`，所有内容重新入队），并按顺序把每个保留项连同其图像重新入队（每通道
    `steer()`/`followUp()` —— 每次重新入队都会发出自己的 `queue_update`，因此客户端仅凭事件即可收敛）。
    **不丢失保证：** 如果运行在该操作期间结算，被重新入队的保留项会永远滞留（Pi 的队列只在运行内部排
    空），因此空闲情形通过 `followUpSession` 所用的同一空闲投递回退来排空它们 —— 第一条变成 `prompt`，
    其余则 steer 进它所启动的运行；跨越那个竞态窗口时投递时机可能退化，内容绝不丢失（由空闲回退的单元
    测试固定）——
    `setModel` / `setThinkingLevel` / **按会话加门禁的手动 `compact`**（第二个重叠请求会在 Pi 能够覆盖
    其唯一的压缩控制器之前被拒绝；一个活跃的 Pi 压缩也会阻止进入）/ `getSessionStats`（+ contextUsage）/
    `getSessionCommands` / `listAvailableModels` / `listSettledModels`（同一份快照，但不启动刷新）/
    **`clampThinkingForModel`**（pi 的 `clampThinkingLevel`，作用于 `{model, level}` 对 ——
    `model.clampThinking`；宿主使用它，使默认值与活跃会话的 effort 变化跟随 Pi）。此前 #394 显示
    ThinkRail 的 `available[0]` 与 Pi 的选择不同并撞上了一次代理 400。ThinkRail 现在在宿主侧从
    `AppConfig` 解析默认值，回退到第一个可用模型；它总是显式传入所选模型，使 UI 与会话一致。已接受的
    风险：第一个可用模型可能不是该提供商的默认值；用户可以在 Settings → Models 中设置一个。计划评审对
    未设置的评审者覆盖使用同一个 `resolveNewChatModel({})`：AppConfig 的 `defaultModel`/`defaultEffort`，
    并以第一个可用模型与 `medium` effort 作为回退。

    **模型以 `WireModel` 跨线上协议传输（绝不是 pi 的原始 `Model`）：** `toWireModel` 把 `Model`
    投影到线上协议的**允许清单**上（见 `WireModel`）—— 因此 `baseUrl`、`headers`、扩展/提供商路由数据
    以及任何其他字段默认都被排除 —— 而入站侧通过 `resolveWireModel` 以 `{provider,id}` 对
    **`settledAvailableModels`** 重新解析该引用：`createSession` 使用当前代次，而 `setModel` 使用该
    活跃会话所保留的运行时。因此一个刚出现在全局选择器中的模型，对更老的活跃聊天可能不可用，并会以封闭
    的模型不可用错误失败，而不是跨代次。Pi 原样使用 `Model.baseUrl`，因此客户端提供的 baseUrl 绝不被
    信任（既阻止泄露，也阻止任意 URL 注入）。**水合读取侧** —— `listSessions(workspaceId, cwd)`
    （活跃会话**与 pi 持久化在 `cwd` 下的磁盘会话合并**，同 id 时活跃者胜出 → 标记为 `live` 的
    `SessionSummary[]`；在把**分离的**磁盘列表当作权威之前，它会严格扫描每个对话记录头部并验证 pi 返回
    了每个文件，因此不可读/格式错误/被跳过的文件会让该次读取被拒绝，而不是伪装成缺失并被重连调和打上
    墓碑。已注册活跃会话自己确切的 `SessionManager.getSessionFile()` 路径被排除在那次磁盘预检之外：它的
    内存条目已经是权威，且 pi 可能在宿主列举期间截断/改写该路径，因此把那种瞬时的物理状态当成一个分离的
    损坏聊天，会让每次重载时所有聊天都变空白）+ `getSessionMessages(sessionId, workspaceId, cwd)`
    （若该会话不在活跃状态，则把磁盘会话重新打开进管理器，先在活跃进程运行时中解析对话记录所命名的任何
    模型，并在其当前 id 下重试 pi 更名过的提供商；当该模型不可用时，PI 选择当前默认值而不在打开时持久化
    模型变更；用户发送消息时 PI 记录这次替换。没有持久化模型引用的遗留对话记录也使用 PI 的模型解析器 ——
    然后返回 `{ summary, messages }` —— `TranscriptMessage[]`：pi 规范子集**加上 `custom` 消息**（它们
    携带问卷卡片按工具调用 id 配对的 `ask-user-answers` 回复），**再加上 `compactionSummary`**（pi 为被
    压缩掉的消息所留的持久标记）—— 保留它恰恰因为 pi 解析后的对话记录是唯一存活下来的东西，丢掉它会让
    客户端拿到一个从对话中途开始的聊天，且没有任何东西解释这段缺口。那些角色究竟是什么**不在这里决
    定**：该过滤器是 contracts 的 `isTranscriptMessageRole`，与 `history` 的索引共用，使两者无法漂移并
    移动 `messageIndex`），外加 **`ensureSessionAttached(sessionId, workspaceId, cwd)`** —— 同样的单次
    飞行重开，但不读取对话记录，供只需要会话*可再次提示*的调用方使用（评审发送对既有聊天的追加）。它
    **只在该 id 于那个 cwd 下不指向任何对话记录时回答 `false`** —— 这是调用方唯一可以通过开一个新聊天
    来恢复的情形 —— 并在其他每次重开失败时**抛错**，因此仅仅不可读的会话绝不会被误认为缺失的会话并被
    悄悄分叉；磁盘那半边正是宿主**重启**后存活下来的东西 —— 并且重新挂接会在 **`createAgentSession`
    播种其上下文之前**运行 **`repairDanglingToolCalls`（`sessionRepair` 兄弟）**：宿主在工具执行中途
    死亡会留下最后一批可重放的助手工具调用未配对，每个提供商都会拒绝这样的叶子（聊天会变成砖），而在
    活跃会话后面追加会让其内存状态失步 —— 因此缺失的结果会在每个重启后会话都会经过的那一个收口点被
    配对。修复是**仅尾部且可重放感知的**：pi 在检查下一条助手消息之前按位置关闭一个待处理的工具批次，
    然后丢弃 `error` / `aborted` / `length` 尝试。Pi 绝不执行来自长度被截断的响应的工具调用，因为其
    参数可能不完整；因此那些调用会用普通错误结果来修复，绝不是可作答的 ask 回执。失败的尝试绝不贡献
    候选，但仍会关闭更早的那一个；任何更晚的用户、custom、compaction 或助手消息都会让那段缺口不再适合
    持久化的叶子追加。只有调用 id**与工具名**都匹配最终候选批次的唯一结果才可以跟在它后面，而已带有效
    结果的并行调用则原样不动。这防止一个迟到的结果在没有其被省略的调用的情况下存活，并永久毒化 OpenAI
    重放。一般的缺失调用得到 pi 的中止约定（`isError` "Operation aborted (host restarted…)"）；悬空的
    ask 得到规范的 ack（`details {kind:"ack"}`），因此其卡片在对话记录保持提供商有效的同时仍可回答；
    **`answerQuestion(sessionId, toolCallId, result)`** —— `ask_user_question` 的回复路径（见
    `askUserQuestion` 条目）；**`settleSessionsForShutdown(timeoutMs)`** —— 关闭中讲礼貌的那一半：同步
    关闭每个命令服务与子代理完成属主，并在中止任何仍在流式的父级之前启动每个隐藏子级级联。保留拥有可恢复
    活跃 ask 阶段（`expected`、`waiting` 或 `answer-accepted-uncommitted`）的父级；释放每个隐藏子级
    （包括那些父级已空闲的），把并发移除已挂起的级联一并纳入，并在同一个界内等待全部完成。关闭在快照阶段
    之前原子地关闭答案准入：expected/waiting 的 ask 保持悬空以便 ack 修复，而已被接受的答案会抵达其原生
    持久化结果，随后其续接被中止。在该快照之后竞态到达的回复会被拒绝，而不是被接受并在释放期间丢失。
    破坏性拆除会在中止/释放之前排空两个 Pi 输入队列，包括可恢复的聊天删除、工作区归档、礼貌关闭与紧急
    释放。Pi 的 `abort()` 只对当前内核运行发出信号并等待会话空闲；运行后的处理可能用一个全新的中止控制器
    继续处理排队输入，因此仅凭 abort 就可能重启工作并让释放搁浅。移除/归档/删除复用 Stop 的按条目排空与
    有界的已接受答案宽限期，在中止之前立即再次排空，以丢弃那段宽限期内排入的输入。公开命令保留其删除门禁；
    已捕获条目的拆除绕过它，因此归档仍能结算打了墓碑的父级。礼貌关闭则保留未回答的 ask 以供重启修复，在
    已接受结果的持久化边界处再次排空，并保留其既有的共享关闭预算。同步释放（包括准备失败）会在断开 Pi
    之前清空队列，且发生在宿主取消订阅之后，因此释放不会额外发布一个队列事件。
    显式用户 Stop 在向 Pi 发出信号之前同步认领未回答的 ask；当 Submit 已经胜出时，它给那个确切的结果边界
    一个有界宽限期，然后在持久化仍未完成时也发出中止信号。答案 RPC 只在 `turn_end` 包含被接受的原生结果
    时解析；被替换或缺失的结果会让它拒绝。每条释放路径都会在取消订阅之前放弃注册表，因此已接受答案的
    promise 不会搁浅。
    `abandon()` 是进程释放的管道，而不是语义取消：它只在同步会话释放之前立即解除该内存工具的阻塞，而
    真实 `SessionManager` 的重启覆盖测试固定了其返回结果不会在挂接时修复之前被持久化。
    `disposeAllSessions` 仍是同步的紧急停止，但会把它尽力而为的子级级联登记进同一份待决集合；
    `getSessionWorkspaceId(sessionId)`（宿主 `set_title` 处理器所依据的活跃会话→工作区查找）；
    `removeSession`/`disposeAllSessions`；**`removeWorkspaceSessions(workspaceId, cwd?)`**（**归档
    拆除**：在第一次 await 之前关闭该工作区的会话准入，捕获每个已注册父级，同步关闭其资源属主，并在并发
    排空已退役工作区代次中准备工作的同时启动父级中止/移除。此后才完成的准备会释放其未注册的属主/会话，
    而不是发布进已归档的工作区。在破坏性移除期间，未回答的问题不会为重启而保留。两道屏障都结算之后，
    **无条件地**释放该工作区的每个活跃会话 —— 绕过 `removeSession` 所执行的按聊天删除门禁，使一个可恢复
    删除正处于回收站操作中的聊天无法中止拆除循环并让其兄弟搁浅 —— 然后删除植根于工作树 `cwd` 的 pi 磁盘
    对话记录 —— pi 的 `SessionManager` 是仅追加的，因此清除 = `list(cwd)` 然后 `rm` 那些记录的 `cwd`
    与之匹配的文件，绝不是 `rm -rf` 那个编码后的目录，因为 pi 的 cwd→目录编码可能让不同的 cwd 别名到
    同一处；在双重归档时省略 `cwd` 只会跳过磁盘清除）；
    **`deleteSession(sessionId, workspaceId, cwd)`**（在任何 await 之前把它标记为已删除，使在飞行中的
    磁盘挂接无法在之后注册；那个墓碑还使被保留的活跃条目在**整段删除事务期间对每个会话命令、包括
    `session.dispose`，都不可寻址**，因此另一个客户端无法在待决的回收站移动背后追加一个轮次，也无法
    破坏回滚目标。**该事务按会话 id 单次飞行**：同一聊天的第二次并发回收站点击（另一个标签页/客户端）
    会加入正在运行的事务（或在外部工作区指名该 id 时以未知拒绝），而不是启动一个对手事务 —— 共享墓碑的
    两个属主会让失败方的失败在移动中途把它回滚，并短暂重新打开该聊天 —— 且**只有安装了该墓碑的事务才会
    在失败时清除它**，因此更早一次成功删除所留的永久墓碑能在之后一次虚假的重复删除中存活。如有需要就
    中止活跃轮次，但保留活跃条目；从该会话自己的 `SessionManager` 解析活跃对话记录（绝不是有损的目录
    列举），否则使用上面那套严格的磁盘查找；把 cwd 精确匹配的对话记录经 `trashFile` 移入系统回收站，然后
    释放活跃条目并发布 `SessionDeletedPayload` 供客户端收敛；一个新建的、保留的 JSONL 路径尚未落地的空
    活跃聊天没有任何可恢复内容可回收，会被直接释放。任何查找或回收站失败都会抛错，回滚它安装的墓碑，把
    命令访问权恢复到同一份对话记录/活跃条目，并且什么都不发布；在一个可恢复的 UI 动作背后，有意不设
    永久 unlink 的回退）；
    `setSessionPublisher` + `setSessionCreatedPublisher`（在 `createSession` 注册一个新的宿主自有会话
    之后广播初始 `SessionSummary` —— 不是当既有对话记录重新挂接时 —— 使同侪前端能发现它而不继承
    摆放）+ `setSessionDeletedPublisher` + `setSessionManagerFactory` 接缝。
  - `oneshot` —— **不用** `AgentSession` 的一次性 LLM 补全（无工具/扩展/磁盘）：
    `completeOnce(request)` 从共享运行时的已认证集合中挑一个模型，并派发单次
    `runtime.completeSimple()` —— pi 规范的、与提供商无关的请求路径，它自行解析该模型的 auth（包括
    OAuth 刷新），也服务那些只实现 `streamSimple` 的提供商（由扩展注册的）。`pickModel(tier)` = 模型
    选择：`cheap` 优先从一个精心挑选的小/快允许清单 ∩ 已认证集合中取，否则取按每 token 成本最便宜的；
    `default` = 第一个可用；没有任何已认证模型时为 `null`。这就是 `assist` 任务（计划摘要、PR 起草）所
    运行的原语 —— 也是会话之外唯一发生模型**派发**的地方。
  - `webUiContext` —— `createWebUiContext(sessionId)` 构建 pi 所调用的 `ExtensionUIContext`（对话框
    往返到浏览器，即发即忘的方法则推送）；`setExtUiPublisher`（服务端→客户端的推送接缝；可选的
    `ExtUiAudience` 把推送收窄到低于某个协议版本的客户端）、`resolveExtUi`（浏览器回复）、
    `cancelExtUiForSession`（在释放时）、`notifyExtUi`、`notifyExtensionError`（pi 的
    `ExtensionError` → 一条客户端可见的 `error` 通知，携带扩展 + 事件 + 原因 —— 原因封顶 500 字符，
    因为 `error.error` 是远端形状的，而当扩展的文件是匿名入口点（`SKILL.md`、`index.ts`）时用其**目录**
    来命名扩展，绝不是 "Extension SKILL.md failed"；一句光秃秃的 "An extension failed." 正是让 #277
    仅从 UI 无法读懂的原因）。管理器的 `bindExtensions({onError})` 把它包进
    `reportExtensionError`，后者做**两件**通知做不到的事：对活跃条目，它向轮转的宿主日志写一条 `warn`，
    携带**完整的** `extensionPath` 与该扩展自己的 `stack`（重新水合成一个 `Error`，使其落入结构化的
    `err` 字段 —— 聊天得到短名，日志得到无歧义的那个，且标签页关闭后崩溃仍可被找到），并且它把客户端
    推送**门禁在** `entry.registered` 上，那是 `registerSession` 在把条目放进映射表时设置的显式标志。
    事件路径的 `sessions.get(id) === entry` 无法复用：`bindExtensions` 在 `prepareSessionEntry` 内部、
    *注册之前*运行，因此更严格的形式会抑制 #277 所谈的那个 `session_start` 失败。映射表中的*缺失*也不能
    代替"尚未注册" —— `disposeSession` 删除时不留下墓碑，因此已释放的条目与未注册的条目无法区分，迟到
    的错误会被推给一个永远无法排空它的客户端。对活跃条目，日志永不被门禁，但宿主已**释放**的条目
    （`entry.disposed`，在每条拆除路径中于 `session.dispose()` 之前设置）会把该报告降级为一行
    `debug`，不带 stack 也不推送客户端：pi 0.87 的 `finishTurn` agent 循环钩子比
    `AgentSession.dispose()` 活得更久，仍会把 `turn_end`/`context` 边界派发进我们刚刚作废的运行器，
    因此它那些"stale ctx"与"could not resolve the persisted assistant entry ID"报告是我们自己拆除的回声，
    而不是扩展崩溃；pi 0.86 先与 agent 断开，所以它们从未浮现。对活跃条目，它**只在 pi 提供了 stack 时**
    才附加一个 `Error`：pi 自己的若干 `emitError` 站点省略了它（`runner.js` 的 message_end、
    `agent-session.js` 的 command/`<runtime>`），在那里合成一个会记录下*宿主*的 stack —— 把读者指向
    `prepareSessionEntry` 而不是扩展，而那与这一行存在的原因正好相反。
    **成员分三类，不是两类。** *不可翻译*的那些是无作用的空操作，且理应如此 —— 它们接收一个 web 宿主无法
    渲染的 TUI `Component` 工厂（`setFooter`、`setHeader`、`setEditorComponent`、`custom`、`setWidget`
    的工厂重载；字符串数组重载**确实**会被渲染）。*可翻译*的那些必须真正起作用：**`theme` 是一个真正的
    `Theme`**（`plainTextTheme`），其每个装饰器都原样返回其输入。*可翻译但未实现*是第三类，在此点名以免
    这一划分被读成穷尽的：`setEditorText` / `pasteToEditor` 由 pi 自己的 rpc 模式转发给宿主，一个 web
    输入框可以尊重它们；我们的实现保持无作用，直到有东西需要它们。把主题与那一类区分开的是无作用的代价
    —— 一个未实现的编辑器调用失去一个特性，一个未实现的主题会在第一行就杀死整个扩展。`getAllThemes: []` /
    `getTheme: undefined` 与 pi 自己的 rpc 模式一致；`setTheme` 的 `{success:true}` 是一个已知的谎言，
    另行跟进 —— 一个 web 宿主没有可切换的 TUI 主题，因此 pi 的 rpc 模式形式（`{success:false}`）才是
    诚实的答案。`plainTextTheme` 继承 pi 的 `Theme`，并覆盖
    `fg`/`bg`/`style`/`bold`/`italic`/`underline`/`inverse`/`strikethrough`/`getFgAnsi`/`getBgAnsi`；
    `getThinkingBorderColor` / `getBashModeBorderColor` 保持朴素，仅仅因为 pi 经由 `this.fg` 路由
    它们 —— 这是一个继承来的保证，因此 `webUiContext.test.ts` 显式地固定它们。**三个继承成员仍以数据而
    非转义序列的形式替终端作答：** `getColorMode`（`truecolor`，来自构造函数 —— pi 的 `ColorMode` 是
    `"truecolor" | "256color"`，没有"不渲染任何颜色"的值），以及 `colors` / `appearance` getter，它们
    把每个 `""` token 解析为 pi 猜测的终端默认值（例如 `colors.accent` 是一个 RGB 值），并报告 pi 检测
    到的亮/暗外观。它们中的任何一个都没有诚实的朴素答案。只要扩展是*经由*主题来着色的（每条这样的路径都
    返回纯文本），它们就毫无代价，只会咬到那种读取一个模式或颜色、然后自行发出 ANSI 的扩展，而那正是本
    模块之外追踪的未消毒桥缺口。它的颜色表存在**只是**为了满足构造函数签名：每个会把颜色变成转义序列的
    方法都被覆盖了，而仍替终端作答的成员读取的是构造函数的*模式*或 pi 的终端猜测，绝不是转义序列。一次
    改变调色板的 pi 升级会让构建失败，作为*主题接口已移动的提示*，而不是缺陷。
    **被否决的替代方案**（这是记录这些决定的唯一位置）：(1) `{} as ExtensionUIContext["theme"]` ——
    #277 缺陷本身。它假定 TUI 成员在 `rpc` 模式下不可达，但 `ctx.ui.theme` 是由**扩展**调用的，不是由
    pi 的渲染器调用的，而 pi 自己的 rpc 模式也发放一个活的主题。(2) 用对象字面量在结构上实现 `Theme` ——
    不做类型断言就不可能：`Theme` 带有私有字段。(3) 用空白颜色构建一个真正的 `Theme`、不加覆盖 —— pi 把
    `""` 映射为*默认颜色*转义序列（`\x1b[39m`），而不是映射为无，因此状态文本会以字面转义字节抵达浏览器。
    (4) 转发 pi 导出的 `theme` 单例 —— 它是一个 `Proxy`，在 `initTheme()` 运行之前会抛出
    `Theme not initialized`，而 `initTheme` 只从 pi 自己的 CLI 入口点调用，当 pi 经由
    `createAgentSession` 被嵌入时绝不会调用。每个把 pi 当作库来嵌入的宿主都会撞上这一点；上游的修复不会
    抵达我们，直到一次有意的 pi 升级。
  - `askUserQuestion` —— 宿主自有的 **`ask_user_question`** pi 自定义工具，按会话注册，并带一个绑定到
    会话的阶段注册表。新建与重新打开的父会话在 `createParentSession` 中创建一个
    `AskUserQuestionWaiters`，由资源加载器的工具与已注册的条目共享。一次合格的活跃调用是**串行且阻塞
    的**：校验之后其 `execute` 等待 `session.answerQuestion`，然后把人真实的
    `AskUserQuestionResult`/`buildQuestionnaireResponse` 作为原生工具结果返回。合格性是共享的：被
    `error`、`aborted` 或 `length` 停止的助手无法执行 ask。一个 `message_end` 归一化器让第一条 ask 成为
    该响应唯一的工具调用（非工具内容保留；兄弟调用被丢弃，让模型在答案之后再重新发出），从而避开 Pi 的
    串行中止漏洞 —— 那里未执行的兄弟调用收不到任何结果。问题数组**没有工具级上限**：一轮携带当前所有
    可回答的问题，而每个问题仍保留 2–4 个选项的界限。header/label/`recommendedReason` 的长度是
    **建议性的**（写在字段描述里，而不是 schema 的 `maxLength`）：pi 的 schema 校验会拒绝整个调用并回显
    每个参数，因此多几个字符会付出一次失败卡片加一次完整重试的代价，而卡片本来就会把长文本换行/滚动。
    依赖尚未得到的答案的问题会等待后续轮次；多轮访谈的规范本身住在工作流家族的
    `asking-user-questions` 概念技能中（[[submodule-workflow-skills]]）。

    该注册表通过 `turn_end` 追踪 `expected`（观察到合格调用）、`waiting`、
    `answer-accepted-uncommitted` 与 `stopped`。这包括 Pi 从 `tool_execution_start` 经 pre-tool 钩子
    到 `execute` 之间真实的异步间隙：优雅关闭会冻结新的答案准入并保留一个 expected 调用；在该冻结之前
    被接受的答案仍是权威，并会在关闭/Stop 中止其续接之前被持久化。Stop 优先会同步把 expected/waiting
    的调用标记为已停止，因此更晚的答案无法翻转胜者。语义校验仍为执行加门禁：在 pre-execute 窗口内被
    接受的答案，只有真实的 ask 已返回且 `turn_end` 包含其结果时才会被确认；校验错误或缺失结果会让答案
    RPC 被拒绝，而不是挂起或声称成功。Pi 未执行的每个 expected 调用都会在 `turn_end` 被清除。答案 RPC
    在匹配结果抵达已持久化的 `turn_end` 边界之后才解析该阶段并确认。显式 Stop 会排空队列并以稳定的
    stopped 错误中止未回答的阶段；在 Submit 胜出之后，Stop 推迟 Pi 的中止直到答案被持久化，然后只结束
    续接。任一顺序都留下一个终结的、提供商有效的结果。

    **用输入代替回答会取代活跃卡片，正如重启之后一样。** `steerSession` 与流式期间的 `promptSession`
    先把文本排入 Pi 的 steering 通道，并且只有当 `steer()` 报告 `queued` 处置（一个返回 `handled` 的
    扩展 `input` 处理器什么都不排队，因此 ack 之后不会跟来任何用户轮次）时，才对每个 expected/waiting
    调用执行 `supersede()`：该工具返回重启修复所写入的同一个规范 ack（`ASK_ACK_TEXT`、
    `details {kind:"ack"}`），Pi 把该 steering 消息作为下一个用户轮次排空，卡片则从对话记录中用它已经
    理解的唯一一种形状（ack + 更晚的用户消息）推导出 `superseded`。之后的答案 RPC 会以 `superseded`
    可回答性错误失败；已处于 `answer-accepted-uncommitted` 的调用绝不会被取代（答案胜出，steering 在它
    之后投递）。范围有意收窄：只有用户自己在输入框中的发送才取代 —— 追加消息通道（Cmd+Enter）、在卡片
    出现*之前*排队的 steering、`removeQueuedSession` 的内部重新入队，以及提醒（它们本来就停在
    `needsInput`），都让卡片保持打开。

    进程重启有意只改变续接机制：挂接时修复只在 `createAgentSession` 之前为合格的悬空 ask 写入规范 ack
    （`details {kind:"ack"}`），使卡片仍可回答但会话保持空闲。长度被截断的 ask 得到与任何其他不可执行的
    工具调用相同的错误修复。没有活跃阶段时，`answerQuestion` 通过 `sendCustomMessage({triggerTurn:true})`
    注入既有的 `ask-user-answers` 自定义消息。因此问题得以存活，而无需恢复一个 JavaScript promise 或调用
    底层的 `Agent.continue`；未提交的 Submit 只是会再次出现。队列条目按明确的约定仍归 Pi 所有且仅限活跃
    会话。卡片从对话记录中推导出两种形式（原生活跃结果，对比修复后的 ack + 自定义答案）。

    被否决的替代方案：对每次活跃调用立即 ack 会让 Pi 排空在卡片*之前*排队的输入，并在无人看见的情况下
    取代它；精确保恢复一个悬空的调用需要一套 pi 未暴露的生命周期安全恢复 API；当只有问题必须存活时，
    持久化的宿主队列/SQLite 发件箱是不必要的；客户端的"跳过再 steer"组合会与答案路径竞争，并在对话
    记录中留下一次拒绝，而恢复路径留下的是一个 ack。
  - `sessionRepair` —— `repairDanglingToolCalls(sessionManager)`：重启安全网（理据见上面的管理器条目）。
    对 pi 的 `SessionManager` 保持纯函数（经 `buildSessionContext` 感知压缩；幂等；只从活跃的尾部批次
    追加缺失的结果）—— 针对 `SessionManager.inMemory` 做单元测试，包括失败尝试与历史缺口的重放。
  - `imageGuard` —— 超大图像守卫：一个内联扩展（`oversizedImageGuard`，是 `buildResourceLoader` 的
    共享工厂之一，也属于整个被委派子级的基础集合），挂在 pi 的 **`context` 事件**上（在每次 LLM 调用
    之前触发，活跃会话也在内）。**仅限 Anthropic 家族**：这些上限是 Anthropic 模型级规则，因此处理器以
    上下文中的活跃模型加门禁（`isAnthropicFamilyModel` —— 原生的 `anthropic`/`anthropic-messages`，或
    经 Bedrock/Vertex/聚合器进来的 Claude 模型 id；未知模型 ⇒ 空操作），其他每个提供商的图像上下文都
    原样通过。它直接从 base64 头部字节嗅探每个图像块的像素尺寸（PNG/JPEG/GIF/WebP —— 无编解码器，绝不
    剥离它嗅探不出来的东西；**每轮工作量有界**：只会物化 256KiB 的解码前缀 —— 一个 SOF 位于其后的 JPEG
    会被嗅探为未知，而不是被剥离 —— 且每个块在每轮中只被嗅探一次），并把任何违反提供商规则的块替换为
    一条指明所违反规则并附重新附加提示的文本注记。五条规则，按顺序：**提供商接受的媒体类型**
    （`ACCEPTED_IMAGE_TYPES`，经 `contracts` 与输入框共享 —— pi 原样转发图像的媒体类型，因此一个遗留的
    `image/heic` 块会让整个请求 400；剥离它能治愈在输入框拒绝这类文件之前就被毒化的会话）；
    **4.5MB 的 base64 编码负载上限**（`IMAGE_MAX_BASE64_BYTES`，经 `contracts` 与输入框共享 —— 这是
    pi 在 Anthropic 5MB API 限制之下的余量，对照 `data.length` 比较，因为线上协议携带的是 base64，
    所以它即便对无法嗅探的格式也适用）；**每边 8000px 的硬上限**；当整个上下文携带超过 20 张图像时的
    **计数感知的 2000px 上限** —— 剥离会改变选择该上限的那个计数本身，因此违反 2000px 的块**只按从大到小
    的顺序被剥离，直到幸存者重新落回阈值之下**（18 张小图 + 3 张 2500px ⇒ 剥离一张，另两张在 8000px
    之下仍然合法）；以及**请求级的 `REQUEST_IMAGE_BASE64_BUDGET`**（24MB base64，Anthropic 每请求
    32MB 上限之下的余量 —— 若干单张合法的块仍可能溢出整个请求），其执行方式是**按从大到小剥离幸存者，
    直到总量合规**。正是它把一个被超大图像毒化的会话救回来（历史每轮都会重发，因此一张坏图会永远
    400）：会话是仅追加的，宿主也没有图像编解码器（上面的 autoResize 权衡），因此该守卫只改造**出站
    上下文** —— 会话文件与对话记录保持不动，卡住的聊天会在其下一条消息时恢复。一旦会话越过 21 张图像，
    计数感知的上限还会把一张原始 >2000px 的 `read` 工具图像降级为一条注记，而不是变成砖。纯核心
    （`guardOversizedImages`、`imageDimensions`）用手工构造的头部字节做单元测试。
  - `delegation` —— ThinkRail 对可移植 **`pi-delegation`** 内核 + **`pi-subagents`** 层的嵌入
    （[[module-pi-delegation]]、[[module-pi-subagents]]）：绑定只有宿主知道的东西 —— 数据目录下的委派
    根（`<dataDir>/delegation`）、`scope = workspaceId`，以及管理器的 `liveParentContext` 投影
    （`ParentContext`，内核决策 #23），包括该父会话所保留的那个确切的 `ModelRuntime`。因此既有的父级与
    其子级能跨越一次 Central 变更而留在自己的运行时代次上，而之后创建的父级则投射新的代次。宿主范围的
    `getPiRuntime` 解析器作为内核的动态回退传入，而不是在创建服务时捕获。每个工作区缓存一个
    `DelegationService`（`delegationServiceFor`，同步 —— 绑定时刻没有任何东西被等待）。宿主注入的
    `setSubagentConcurrencyResolver` 在创建时提供每个服务的按聊天上限，而
    `refreshSubagentConcurrency(workspaceId?)` 在全局或工作区上限变更之后重新解析并实时调整已缓存服务的
    规模（内核 `setMaxConcurrentPerParent`）；`subagentsFor(workspaceId, isEnabled, canDeliverCompletion)`
    为每个父级创建一个被保留的可移植 `Subagents` 属主；其扩展在每次资源加载时被注入。宿主注入的
    `setSubagentsEnabledResolver` 把那个工作区 id 映射到其当前生效的策略，而不创建 `agent` → settings/
    workspaces 边。该谓词抵达扩展的启动时守卫以及初始/重载激活。对于实时策略变更，
    `refreshSubagentTools(workspaceId?)` 通过 pi 的活跃工具 API 移除/添加 `Agent` +
    `get_subagent_result`：空闲会话同步更新，流式会话只保留一次待决的重新求值并在 `agent_settled` 应用，
    而反复变更在那一刻解析出最新策略。会话注册在异步扩展绑定之后、创建被发布之前重新解析一次，因此一次
    策略变更不会落入"先绑定后注册"的缺口。策略变更绝不替换被保留的属主，因此已在运行的分离子级会完成并
    保留完成投递；被禁用的启动仍会被实时谓词立即拒绝，哪怕一个流式父级的工具集尚未被刷新。计划评审的
    `request_review` 工具遵循同样的实时开关形态：它始终被注册，但由 `setAgentReviewEnabledResolver`
    （宿主注入、全局 —— 无 `agent` → settings 边）决定它是否留在会话的活跃集合中，而
    `refreshAgentReviewTool(workspaceId?)` 把变更按空闲同步 / 流式延迟到 `agent_settled` 应用，与子代理
    工具完全一样。因为 `setActiveToolsByName` 会依据活跃工具的指南重建系统提示词，丢掉该工具也就丢掉其
    指南。只有工具被加门禁 —— `startPlanReview` 的按钮路径是另一条宿主接缝。见
    `submodule-server-host-plan-review`。**Registry 扩展**遵循同样的形态，只是以扩展名而非工作区为键。
    宿主注入的 `setDisabledExtensionsResolver(() => ReadonlySet<string>)`（全局 —— 无 `agent` →
    settings 边；一个抛错的解析器意味着没有任何东西被禁用）会在**每次加载器重载**时被
    `buildResourceLoader` 读取（与项目信任一起快照），因此受门禁的 registry 工厂会跳过一个被禁用的扩展，
    且 `extensionsOverride` 省略其 `<inline:…>` 条目 —— 新父级永不加载它 —— 并且在某个隐藏子级的加载器
    运行时由 `childExtensionFactories()` 读取。`refreshExtensionTools()` 更新活跃会话：其
    `sourceInfo.path` 属于某个被禁用 registry 扩展的工具离开活跃集合（按条目记住，以便重新启用时恰好恢复
    被扣留的那些工具，绝不是那些默认本就不活跃的）空闲同步 / 流式延迟到 `agent_settled`，最新策略胜出，
    而 `setActiveToolsByName` 随工具一起丢掉它们的指南。被禁用扩展的钩子会继续在一个已打开的会话中运行，
    直到其下一次资源重载 —— pi 无法卸载一个扩展，而每次禁用都重载会击穿提示词缓存。反向则是一次重载：
    会话从未加载过的已启用扩展（在它关闭期间创建的）且未加载失败的，会触发一次受门禁的
    `requestSessionReload`。注册会应用同一套调和，而一次完成的重载会重新应用它而不请求另一次重载，因此
    落在重载中途的一次开关切换会收敛。
    **`set_title`** 工具（`titleTool.ts`）就是聊天与工作区获得命名的途径：主 agent 用
    `chat_title?` / `workspace_name?` / `branch?`（英文 kebab slug）调用它。它始终被注册且活跃，并通过
    `promptSnippet` 列出；在命名之后把它关掉会在会话中途重建系统提示词并击穿提示词缓存。它的
    `promptGuidelines` 承载命名规则：每段对话一次，作为第一个带有具体任务的轮次的**第一个动作**，即使是
    一句话的回答（或在读取一个被链接的 PR/issue/工单之后立即执行）。名字使用用户的语言，而 PR/issue/工单
    使用 `<Verb> #<n> <title verbatim>`。仅有指南被证明太弱（实时 e2e，Claude Opus：3 个真实任务轮次中
    命名了 1 次；当提示词要求一句话回答时 0/3）。因此当聊天（pi 会话名）或其工作区仍未命名时，一个
    `before_agent_start` 钩子会添加一个按状态定制的 **`pending-naming`** 系统提示词小节（"this chat
    has no title yet … call set_title with chat_title before your other tool calls … otherwise ignore
    this note"）；有了它，同样的真实任务轮次命名了 3/3。该小节与指南都会点名仍然缺失的字段（工作区未
    命名时的 `workspace_name` 与 `branch`），因为仅写"一次"会让调用只命名聊天。它的措辞有意保持低压力：
    早先那句"first action … even when the answer is one sentence"让模型在无关的纯工具轮次上添加旁白式
    开场。一旦两者都命名完成，该小节就消失，代价是每个聊天在早期发生一次提示词缓存未命中。写入策略与该
    状态的工作区那一半不在这里：宿主通过 `setTitleToolHost({ apply, workspaceNeedsName })` 注入两者，
    因为命名要组合 `agent` + `workspaces`。
    级联：`removeSession`/`disposeAllSessions` 触发 `disposeSessionChildren` —— `removeSession` 返回
    该级联，**删除事务在 `publishDeleted`/解析之前等待它**（安全：级联自带吞掉逻辑，因此一个失败的子级
    中止绝不可能让一次对话记录已被移入回收站的删除失败），而工作区归档会**按会话等待它** —— 外加**为该
    工作区注册的每个待决级联**（`disposeSession` 在级联*开始*时就把条目从 `sessions` 中移除，因此并发
    的归档否则会看不到要等待的父级，即使某次删除或移除的子级级联仍在运行；每个 `disposeSession` 级联都
    登记在一个按工作区的注册表中，归档会排空它 —— PR #303 评审发现 + 同一次排查中发现的并发那一半，两者
    都通过一个测试门禁的子级轮次固定，两个方向都是确定性的：红色，因为修复前的归档在其同步前缀中
    `rm -rf`，而门禁可证明是关闭的；绿色，因为归档的完成是 await 链在级联之后的。有意选择**级联，而不是
    删除事务**：归档必须不被一次卡在回收站操作中途的删除阻塞 —— 回收站那一步有无限延迟且从不触碰
    store；这种独立性本身就是一项被固定的行为）—— 而后才 `removeWorkspaceDelegation`（丢弃该服务 +
    删除 `delegation/<workspaceId>`），因此 store 绝不会在一个活跃子级之下被删除 —— 隐藏子级绝不比其
    工作区活得更久。
    `readChildTranscript` 按 `(workspaceId, parentSessionId, childSessionId)` 从 store 服务
    `subagent.getTranscript` —— 这些 id 是会变成路径段的线上字符串，因此它拒绝形似路径的值（分隔符、
    `..`；处理器还像每个兄弟读取那样校验工作区）—— 并在返回消息的同时返回该次运行当前的注册表
    `status`；消息由原始条目经 pi 的规范投影构建（`buildSessionContext` —— 活跃 `session.messages` 所走
    的同一条条目→消息路径），并像 `getSessionMessages` 一样经 contracts 共享的
    `isTranscriptMessageRole` 过滤（这里曾经有一个私有的消息条目循环发生了漂移：压缩是一种条目*类型*，
    而不是消息角色，因此一个被压缩子级的对话记录丢失了它的 `compactionSummary` 标记 —— PR #303 评审
    发现，有测试固定；重启/释放之后不存在；线上语义见 [[module-contracts]]）。
    Pi 惰性写入第一个对话记录文件。因此一个属于所请求父级的已注册子级，在该文件存在之前返回空消息列表
    以及其权威状态；排队中/运行中保持可轮询，包括在首个提供商回复之前。这不是从任务文本做的重建。没有
    那个自有句柄的文件缺失会抛出 `CodedError("SUBAGENT_TRANSCRIPT_NOT_FOUND")` —— 那是 web 对话框会
    停止轮询的**永久**未命中，在线上协议上具名，而不是从消息上模式匹配（[[module-contracts]] 拥有该
    码集合；此处使用 agent 模块那条窄的 `@thinkrail/shared/codedError` 边，与 Chat Resources 共享，
    并镜像 `git` 的用法）。
    选择启用扩展的子级（其定义中 `extensions: true`）会得到**经过精选的子级集合**
    （`extensions` 中的 `childExtensionFactories`，pi 的 `InlineExtension`）：无头搜索策略 +
    `pi-web-access` + `pi-spec-graph` + 每个 registry 扩展的 `childExtensions`（具名内联，来自
    [[submodule-server-extensions]]；目前没有）—— 有意不是父级的完整集合（理据 + 所列子级的例外：内核
    决策 #25）。**每个**子级，无论是否选择加入，也会加载内核的基础集合（`childBaseExtensionFactories`，
    同一决策）：只是 `oversizedImageGuard`，因为子级的 `read` 在共享设置下返回原始图像（见
    `buildSessionSettings` 条目）。Web 访问通过一个**具名的打包接缝字段**
    （`BundledExtensions.webAccessFactory`）在二进制中、以及 dev 中一次 Bun `require` 抵达子级集合 ——
    其原始第三方 `.ts` 必须留在严格的 tsc 图之外。
  - `extensions` —— Pi 资源接线。候选生成通过一个无头的 `DefaultResourceLoader` 一次性加载经审阅的外部
    Central 路径以应用提供商注册，而不检查它。随后
    `buildResourceLoader(cwd, settingsManager, getAdmission, excludedPaths, extraFactories?)` 解析 Pi 常规
    的设置/包 + `.pi` / `.agents` 扩展集合，**在加载之前**移除那个确切的不透明身份，并显式加载剩余的
    路径：会话使用其保留代次已经拥有的提供商对象，因此任意的 Central 工厂/错误/UI 都无法抵达
    `pi.extensionUi`。Central 身份始终被排除在会话发现之外 —— 即使全局产物发生变化 —— 因此会话无法改变
    其代次。那份显式路径集合**不在构造时冻结**：加载器的公开 `reload()` 被包装，使每次重载都先通过宿主
    自己的 `DefaultPackageManager` 重新解析该集合（当前设置与信任，`builtin:*` 条目按其名字处理，从而
    `-builtin:*` 得以生效）并就地修改 pi 所读取的宿主自有数组，然后在加载之后重新标记已发现路径的出处
    —— 不使用 pi 的 `extensionsOverride`，因为它在工厂已经执行之后才运行。所有其他用户扩展保留正常
    发现。随后加载器添加自动的**可移植跨 agent 技能别名**，然后加载四个打包的 pi 包 ——
    **`pi-web-access`**（`web_search` + `fetch_content`）、**`pi-spec-graph`**（`spec_*` 工具 + 其
    `before_agent_start` 规则）、**`pi-thinkrail-workflow`**（工作流路由规则 + 工作流技能）以及
    **`pi-todos`**（`todo_*` 工具 + 其技能）—— 还有**来自服务端 registry 的 ThinkRail 扩展**
    （[[submodule-server-extensions]]；目前是 `visualize`，其服务端那一半注入严格的 mermaid 校验器），
    作为具名的内联扩展。既有的个人别名是 Claude（`${CLAUDE_CONFIG_DIR:-~/.claude}/skills`）、Codex
    （`${CODEX_HOME:-~/.codex}/skills`）、Copilot（`~/.copilot/skills`）与 Gemini
    （`${GEMINI_CLI_HOME:-~}/.gemini/skills`），**外加每个已安装 Claude 插件的 `skills/` 目录**
    （从 `~/.claude/plugins/installed_plugins.json` 读取 —— 解析后的 `installPath`，绝不是缓存扫描，
    因此陈旧版本与传递的 `node_modules/**/skills` 都被排除）；项目根别名是 `.claude/skills`、
    `.github/skills` 与 `.gemini/skills`。纯谓词 **`isProjectSkillPath(relativePath)`** 是工作树监视器
    （经 `host` 注入）所用的唯一定义在服务端的判定：它识别那些别名加上 Pi 原生的 `.pi/skills` 与
    `.agents/skills`，因此有上限的文件系统批次携带真实的技能变更证据，而不让 `watch` 依赖 `agent`。
    那些固定的项目/个人别名根被注册为候选技能路径，**无论它们是否已存在**，因此一次 `loader.reload()`
    能拾取一个由分支切换 / pull / clone 在会话中途创建的路径（插件目录是构造时已安装的集合 —— 之后新增
    的插件需要新会话）；分类仍只统计实际存在的目录。仍然绝不扫描任意的点目录、插件缓存、命令，也不做
    向下嵌套发现。Pi 仍是解析器：仅厂商的宏/钩子/模型/子代理/元数据不被模拟。先到名者胜的优先级是
    Pi 原生/已配置/共享 → ThinkRail 打包 → 个人别名 → 项目别名，因此一个仓库绝不可能遮蔽你自己的或
    ThinkRail 的技能；来源元数据保留真实的 `project` / `user` 范围。**准入门禁（`skillAdmission`）：**
    已提交的**项目范围**别名对一个 clone 而言是攻击者可控的，并且会被注入系统提示词，因此按技能它们
    从一个**准入上下文**解析为 `load` / `untrusted` / `pending-ack` / `disabled` —— 该项目的 `trusted` +
    `acknowledgedSkills`（授予信任只承认当下存在的技能，因此之后 pull/分支带来的技能在确认之前是
    `pending-ack`）+ `disabledSkills` / **`disabledGroups`** 基线（组键 = 插件名、来源层级
    `project`/`personal`/`bundled`/`pi`，或特殊的 `@plugins` —— 由 `skillGroup` 按技能分配，与
    `SkillCatalogEntry.group` 对应），并与工作区的按技能 `skillOverrides` 分层（信任门禁先于开关层检查，
    因此一个 "on" 覆盖绝不可能把不受信任的别名解禁，而按技能的 `on` 胜过组禁用）。`skillsGate` 在一次
    `skillsOverride` 中完成过滤 + 重标记；只有 `load` 的技能抵达系统提示词 / `/skill:` 列表。
    宿主通过 **`setSkillAdmissionResolver`** 接缝解析该上下文（以 `workspaceId` 为键，失败即关闭）；
    `buildResourceLoader` 把解析器当作 thunk 接收，而 `skillsGate` 在每次 `loader.reload()` 时重新解析
    **准入上下文**（`getCtx`）**以及**实时的兼容来源集合（新鲜发现），因此 `session.reloadResources`
    能拾取会话中途的信任授予、技能/组开关，**或一个新出现的别名目录** —— 而一个迟到的项目别名仍会被分类 +
    信任门禁，绝不会作为未分类的加载溜过去。个人与打包资源永不被信任门禁（只有启用/禁用层），而这个
    门禁只作用于兼容别名。pi 原生的项目资源（`.pi/` 的设置、扩展、技能、提示词与主题、`SYSTEM.md`、
    祖先 `.agents/skills`）改为遵循 pi 级信任：pi 依据 ThinkRail 从 `Project.piResourceTrust` 派生的
    项目信任标志对它们加门禁，并在每次加载之前重新应用（MCP servers › Trust）。
    `listSkillCommands(cwd, admission)` 通过一个短命的、仅技能的 `DefaultResourceLoader`（无模型/会话/
    对话记录，无扩展工厂）复用同一批受门禁的输入，用于工作区之前的自动补全，按 `(cwd, admission)` 短暂
    缓存；**`listSkillCatalog(cwd, admission)`** 是 Skills 管理器未过滤的变体（每个已发现的技能 + 其
    `group` + `decision`）—— 由一个工作区驱动（经 `skills.state`）或一个项目驱动（经 `project.skills`，
    当前检出，无覆盖）—— 而 **`listProjectAliasSkillNames`** 是该提示的现存别名计数。完整的会话加载器
    支持**两种模式**：
    - **从源码运行（默认）：** `additionalExtensionPaths` 指向 pi 包的原始 `.ts` 条目（pi 的加载器用
      jiti 加载它们 —— 不向我们的 typecheck 图做值导入），**在首次使用时惰性**解析（绝不在模块加载时：
      解析需要 `node_modules`，而编译后的二进制没有）。工作区包的 `pi.skills` 清单不会为文件路径条目
      自动发现 —— 它们的 `skills/` 目录（`pi-spec-graph`、`pi-thinkrail-workflow`、`pi-todos`）、宿主
      自己的技能（`packages/server/skills`：仅 ThinkRail 的指南，例如 `managing-mcp-servers`，它在原生
      pi 下会是错的，因此不能放进可移植包）加上 registry 扩展按属主解析的技能根，都经
      **`additionalSkillPaths`** 接入；`build-support` 的 `skillRoots` 为两个打包都列出同一个宿主根。
      Registry 扩展本身永不按路径加载：它们在两种模式下都是同样的具名内联工厂（一种组合模式；
      `{ name, factory }` 让 `<inline:visualize>` 保留在诊断中）。
    - **打包启动器（编译后的 CLI 二进制与打包的桌面运行时）：** 启动器在第一个会话之前等待
      **`registerBundledRuntime({ factories, skillsDir, trashHelpers, webAccessFactory })` 接缝** ——
      同样的四个 pi 包作为**以值导入的默认导出工厂**（pi 让 `extensionFactories` 与路径加载具有完整的
      API 对等性；损失的是 —— 文件相对的 `baseDir`、每次重载重新求值 —— 它们都没用到）外加一个暂存的
      磁盘技能目录（pi 通过普通 fs 读取 `SKILL.md`，因此技能必须住在真实文件系统上；打包运行时**只**使用
      这个暂存根 —— 它绝不从宿主的 `createRequire` 解析扩展自有的包）。Registry 扩展无需接缝字段：
      `@thinkrail/server` 对每个 `@thinkrail/ext-*/server` 的静态导入把它们带进二进制与桌面打包。该
      接缝还执行**打包产物的 pi 注册**：pi 把仅 Node 的提供商代码藏在打包器不可见的变量说明符动态导入
      之后（因此浏览器打包无法抵达 `node:http` 的 OAuth 服务器 / AWS SDK），而单文件二进制在运行时无法
      解析它们 —— 每次 OAuth 登录都死于 `Cannot find module './openai-codex.js'`。pi 正是为此提供了
      静态注册接缝，而我们镜像 pi 自己的二进制入口（`pi-coding-agent` 的 `dist/bun/cli.js`）：
      **`registerBunOAuthFlows()`**（`@earendil-works/pi-ai/bun-oauth`）+
      **`setBedrockProviderModule(bedrockProviderModule)`**（`…/compat` + `…/bedrock-provider`）。两者
      都通过**接缝内部的动态字面量导入**加载 —— 字面说明符会被 `bun build --compile` 与桌面服务端运行时
      构建同时静态打包，而 dev（从不调用该接缝）永不加载这些流程模块或 AWS SDK。注册会落在 pi 在登录时
      所咨询的同一个 `pi-ai` 实例上，因为目录在全仓固定了一个确切的 `pi-ai` 版本（一个 store 条目 → 一个
      打包模块实例）。聊天回收站有两条产物接缝位于同一次注册之后，都由 `trash` 模块拥有：它静态安装的
      procfs 解析器，以及启动器暂存、由 `registerBundledRuntime` 经 `setBundledTrashHelpers` 注入的
      `trashHelpers`（理据：[[submodule-server-trash]]）。没有任何平台降级为永久 unlink。
    桌面服务端/工厂打包用 pi 的 `PI_BUNDLED_NODE=true` 编译期 define 构建。那是 pi 自己为"已打包但未
    编译"发行物提供的开关：它选择内嵌模块的扩展加载器（jiti 的静态入口，内嵌 Babel，加上 pi 的虚拟
    模块）。没有它，pi 会把该打包当作普通 Node 运行时，并去取 jiti 惰性的 `../dist/babel.cjs`，相对于
    一个在单文件打包中不存在的文件，于是 Central 候选加载失败（pi 0.86.0 让加载器选择依赖运行时；
    0.84.x 始终使用静态入口）。候选加载器还强制 jiti 的转换（`JITI_TRY_NATIVE=false`，加上
    `JITI_REBUILD_FS_CACHE=1`，使陈旧的转换缓存绝不会在一次 pi 升级后存活）：若允许原生导入，Bun 会自行
    解析一个外部扩展裸导入的 `@earendil-works/pi-coding-agent` —— 自动安装第二份 pi 副本，因为
    `~/.pi/agent/extensions` 下没有任何 `node_modules` —— 而不是经由 pi 的虚拟模块映射到打包实例上。
    define 与强制的转换合起来就是被测的产物接缝（共享产物探针的合成扩展以值导入 pi，没有它们就会失败
    关闭）；`server-runtime.ts` 的文件名只是一个名字。
    在每种模式下，可选的 Central 产物仍是 PI 公开 Jiti 接缝所加载的外部文件系统路径；它绝不被打包、
    暂存或复制进 ThinkRail。两种模式都会追加 `extensionFactories`：一个**无头搜索策略**（一个
    `tool_call` 钩子，把 `web_search` 的 `workflow` 默认为 `"none"`，因为 pi-web-access 否则会打开一个
    我们的 `rpc` 宿主无法渲染的浏览器 curator）、`askUserQuestionExtension`（注册 `ask_user_question`
    工具）、`oversizedImageGuard`（上下文级的图像尺寸守卫，见 `imageGuard` 条目），**以及调用方的
    `extraFactories`** —— 按会话的宿主绑定（绑定到工作区的子代理扩展），以值导入，使 dev 与编译后的
    二进制走同一条路径。pi 自己的内置扩展（`llama.cpp`、`codemode`、`tool-search`、`mcp`）只由 pi 的
    CLI 加载；SDK 宿主按工厂选择加入。ThinkRail 用 pi 自己的描述符选择加入 **`mcp` 与 `tool-search`**
    （`{ name, factory, replaceable: true, builtin: true }`，因此用户安装的 `/mcp` 扩展会替换它们，
    而 pi 设置中的 `-builtin:mcp` 会禁用它们）—— 只在下面 MCP 一节中的保护落地之后才注册，因此没有任何
    构建在没有这些保护的情况下启动过服务器；除了 pi 自己的 `-builtin:mcp` 之外没有别的运行时开关。
    `codemode` 与 `llama.cpp` 不被加载（codemode 需要一个 QuickJS worker + wasm 接缝，而编译后的二进制
    与桌面打包都没有）。见 [MCP servers](#mcp-servers)。
    两条会话路径都把它作为 `resourceLoader` 传入。`buildResourceLoader` 保持内部；该接缝及其类型在
    barrel 上。
- **Public surface（公开接口，barrel）：** 管理器操作（含 `answerQuestion` +
  `settleSessionsForShutdown`）+ `CreateSessionInput`/`CreateSessionResult` + `SessionEventPayload`；
  运行时代次门面（`usePiRuntime`、候选准备/激活、当前代次 id，以及封闭的 `load-failed` 结果 —— 不含
  管理器内部）加上 `configurePiRuntime`/工厂测试接缝与引导前的
  `configurePiRuntimeGenerationInitializer` 组合接缝；`listModelContextSettings` /
  `setModelContextWindow` / `setModelContextPublisher`（`modelContext` 适配器及其 `provider.changed`
  接缝）；`piLoginOptions`（pi 登录选项，携带惰性创建的安装设备 id，供 `auth` 使用）；
  `completeOnce`/`pickModel` + `OneShotRequest`/`OneShotResult`/`ModelTier`；`webUiContext` 的各接缝；
  `askUserQuestion` 的纯辅助函数（`validateQuestionnaire`/`buildQuestionnaireResponse`/
  `assessAnswerability`/`buildAnswersMessage`/`awaitingQuestionToolCallId`）；规范化状态操作
  （`listSessionStates`/`acknowledgeCompletion`/`nudgeSession` + 发布者/项目接缝）；
  `repairDanglingToolCalls`；`liveParentContext` + `readChildTranscript`（委派嵌入）；技能目录辅助函数
  `listSkillCommands(cwd, admission)`（已过滤，会话前自动补全）/ `listSkillCatalog(cwd, admission)`
  （未过滤，管理器的 `skills.state`）/ `listProjectAliasSkillNames(cwd)`（现存别名计数）/
  `isProjectSkillPath(relativePath)`（watch 分类谓词）；`reloadSessionResources(sessionId)`
  （活跃聊天重载；重载门禁被阻塞时抛错）+ `requestSessionReload(sessionId)`（延迟变体：现在为
  `"reloaded"`，或延迟到门禁打开为止为 `"deferred"` —— 结算、被准入提示词的释放、压缩结束；请求会合并）；
  **`setSkillAdmissionResolver`** 接缝（宿主为 `workspaceId` → 准入上下文接线，由
  `admissionContextFor(project, overrides)` 一次性派生）；**`setMcpPolicyResolver`** 接缝（宿主为
  `workspaceId` → 该项目的 MCP 批准与覆盖接线，由 `mcpPolicyOf(project)` 派生）；MCP 管理接口 ——
  `listMcpServers`、`mcpOwnershipGuard`（解析 pi 设置，然后同步回答谁在管理 MCP 而不是 ThinkRail ——
  即 `listMcpServers` 报告为 `handledElsewhere` 的东西 —— 因此宿主在与每次管理变更相同的调用栈中检查
  它）、`refreshMcpStatus`、`setMcpStatusPublisher`、`mcpSessionView` / `liveSessionIdsOf`、
  `dispatchSessionMcpCommand`（带可选的 `notify`，接收该次派发的通知而不是发给聊天）、
  `reconnectMcpServer`、`readMcpServerLog`（单个服务器从 pi 共享的 `mcp.log` 中取出的脱敏行）、
  `setSessionMcpServerEnabled`（聊天本地禁用，经重载门禁应用）、配置的有效配置读取
  `effectiveMcpServerConfig` 以及配置写入器 `writeMcpServerEntry` / `removeMcpServerEntry` /
  `mcpEntryFingerprint` / `shareMcpOverrideWithRepo`（pi 规则校验，`MCP_CONFIG_INVALID` /
  `MCP_PATH_UNSAFE`）以及登录探测（`startMcpProbe`、`replyMcpProbe`、`cancelMcpProbe`、
  `cancelMcpProbesOwnedBy`、`cancelAllMcpProbes`、`setMcpLoginPublisher`、`isMcpLoginId`）；
  pi 级信任接口 —— `applyPiResourceTrust(workspaceIds)`（对每个信任已陈旧的活跃会话做受门禁的重载）、
  `piTrustsProjectPath(path)`（pi 是否已信任某个路径：其 `trust.json` 按最近祖先的判定，否则其全局
  `defaultProjectTrust` 为 `always`；不可读的 store 回答 `false` —— 宿主对新添加项目的种子）以及
  `projectTrustSummary(cwd)`（信任提示的事实：别名名字与现存 `ProjectResourceKind` —— pi 的
  `hasTrustRequiringProjectResources` 所门禁的 `.pi/` 条目、祖先 `.agents/skills`，以及来自
  `pi-subagents` 的 `discoverAgentDefinitions` 的项目定义；该条目列表镜像 pi 私有的那一份，但去掉
  `mcp.json`，其条目另行按 `mcpServers` 计数，因为每一个还需要独立的批准，因此一次门禁了新条目的 pi
  升级必须扩展它）；子代理策略接缝 **`setSubagentsEnabledResolver`** + **`refreshSubagentTools`**
  （宿主解析生效的全局默认值加工作区覆盖；管理器拥有活跃会话的激活时机）以及并发接缝
  **`setSubagentConcurrencyResolver`** + **`refreshSubagentConcurrency`**（同样的分工；`delegation`
  拥有把上限应用到其缓存服务上的动作）；扩展开/关接缝 **`setDisabledExtensionsResolver`** +
  **`refreshExtensionTools`**（宿主拥有该集合；本模块拥有组合期过滤与实时激活时机）；`set_title` 接缝
  （`setTitleToolHost` + `TitleToolHost`/`SET_TITLE_TOOL_NAME`/`SetTitleParams`）；打包产物接缝
  （`registerBundledRuntime` + `BundledExtensions`/`BundledExtensionFactory`）。
- **允许的依赖：** `@earendil-works/pi-coding-agent`（运行时）；`@earendil-works/pi-ai`（类型 + 测试
  夹具 + **从包根以值导入的纯目录辅助函数** —— 今天确切是 `getSupportedThinkingLevels` +
  `clampThinkingLevel`，对 `Model` 的纯数据投影；*派发*仍走共享的 `ModelRuntime`，绝不是 pi-ai 的
  stream/complete —— 外加 `/bun-oauth` + `/bedrock-provider` + `/compat` 子路径，**只**在
  `registerBundledRuntime` 的动态导入内部以值导入）；`pi-delegation` + `pi-subagents`（可移植的委派
  运行时与 Agent 工具组合，由宿主嵌入以值导入）；`pi-background-commands`（绑定到会话的命令能力，同样
  由其宿主嵌入以值导入）；`pi-web-access` + `pi-spec-graph` + `pi-thinkrail-workflow` + `pi-todos`
  （打包的 pi 包 —— 父会话通过资源加载器路径或启动器工厂加载该集合；被委派的子级以值导入
  `pi-spec-graph`，并通过打包运行时接缝接收具名的 `pi-web-access` 工厂；源码模式的等价物经由 `jiti`
  —— pi 用于扩展路径的那个加载器 —— 惰性加载它，因此父级从不为它付费，且 barrel 对工作流测试装置保持
  Node 可加载（[[module-workflow-tests]]））；兄弟 `extensions` registry 模块（ThinkRail 扩展的内联
  工厂与技能根 —— `agent` 绝不直接导入一个 `@thinkrail/ext-*` 包或其 pi 包）；`jiti`（上面源码模式的
  子级 `pi-web-access` 加载）；`typebox`（`ask_user_question` 的参数 schema）；`jsonc-parser`
  （`modelContext` 中针对性的 `models.json` 编辑）；`trash`（只经兄弟 **`trash` 模块**抵达 —— 见
  [[submodule-server-trash]]：单路径、禁用 glob、允许抛错、绝不降级为 `unlink`；启动器的暂存辅助程序
  与 procfs 解析器接缝也在那里，因为 `changes` 的整文件回退需要同一个原语）；`contracts`
  （`PiEvent`/`Model`/`ThinkingLevel`/`ImageContent`/`SessionStats`/`SessionSummary`/
  `Session*Payload`/`SlashCommandInfo`/`ExtUi*`/`AskUserQuestion*`/`ProviderStatus*`）；`log`（诊断 +
  会话生命周期调试追踪）；`persistence`（用于委派的 `dataDir` 加上那几处窄的会话回执存储）；`trash`
  （可恢复删除的原语）；Node。
- **绝不触碰：** `host`；除 `log`、`trash` 与那几处窄持久化接口之外的兄弟特性（会话的工作树 `cwd` 始终
  只是一个输入，绝不是工作区注册表查找）；Central 的进程/文件系统知识 —— 调用方只为一个候选提供期望的
  不透明扩展路径。

## 会话标题

`agentSessionManager` 是唯一持久化聊天标题的写入者。它的 `renameSession(sessionId, workspaceId, cwd,
title, { onlyIfUnnamed? })` 校验一个非空、单行且在 contracts 长度限制之内的标题，严格在给定的
workspace/cwd 内解析该会话，并在规范化后的标题已是当前值时避免一次追加。活跃会话经
`AgentSession.setSessionName` 写入；纯磁盘会话用 `SessionManager.open(...).appendSessionInfo(...)`
打开其确切的对话记录，而不挂接 agent 或解析模型。两条路径都发布同一个 `session_info_changed` Pi 事件，
而 `SessionSummary.title` 仍是水合投影。

带守卫的写入在异步竞态中仍然权威。`onlyIfUnnamed` 紧挨着追加执行检查，也就是 `set_title` 处理器所用的
比较并设置（它的 `false` 返回正是该处理器得知聊天已被命名的方式）；手动的线上变更则是无条件的。因此
agent 的标题绝不可能覆盖一个持久的名字，而第一个名字就是最终名字。这里不该有生成/手动的出处或标题
附属文件：pi 名字的有无已经足够。架构中已接受的"无跨进程协调"规则仍然适用。

## Chat Resources 集成

管理器为每个父聊天在其 Pi 会话旁边保留一个 [[module-pi-background-commands]] 服务，并经常规的资源
加载器路径注入其扩展。同一处绑定在源码宿主与打包宿主中都提供活跃会话上下文、生效的 shell 设置与
生命周期。第一版只把这一能力加载进父聊天，而不是精选的隐藏子级扩展集合；普通子级的 Bash 仍在其对话
记录中可见。

一个小的 agent-barrel 门面服务于 [[module-contracts]] 中定义的资源快照、命令输出/停止以及子代理
停止/全部停止操作。它投射命令服务加上 `DelegationService.childrenOf(parent)`；没有任何聚合注册表持有
它们生命周期的副本。子代理摘要包含直接的前台与后台子级，并省略尚无运行快照的句柄。按记录创建顺序保留
所有活跃子级与最近二十个终结子级，而不释放更旧的句柄或对话记录。任务摘要与角色摘要分别限长 2,000
和 200 字符。每个工作区服务一次生命周期订阅，加上每个命令服务的变更订阅，经宿主注入的发布者发布限定
范围的失效；不新增按 token/输出的广播。

每个操作在触碰句柄之前都会校验真实的工区/会话成员关系、子级血统与管理器的删除门禁。持久化的父级使用
既有的单次飞行挂接路径；未知的父级绝不会伪装成空目录。缺失/外部/被驱逐的资源共用
`RESOURCE_UNAVAILABLE` 路径（只有命令输出在父级校验之后返回 `available:false`）。资源控制绝不依赖
UI 是否见过某个工具事件，也不依赖启动/重启某个提供商轮次。自然完成与请求的取消仍然是来源侧的结果；
停止状态不是从一次被确认的 RPC 合成的。

用户的子代理控制提供 [[module-pi-delegation]] 定义的 `"user"` 取消原因；完成投递属于
[[module-pi-subagents]]，而不是某个宿主侧抑制集合。全部停止在返回其目标计数之前对所有已捕获的活跃
子级发出信号；单个与批量控制只确认意图，而不等待提供商/工具结算。它们分离的中止 promise 始终带有拒绝
处理器，生命周期失效仍是终结权威，两个控制也都不拿 `disposeChildrenOf` 当替代品。

命令服务的寿命长于视图摆放与父级轮次取消。实际的会话释放与工作区归档会关闭命令准入，并在既有宿主关闭
预算下等待拆除之前对命令/子级工作发出信号。按会话的拆除墓碑阻止一个持久化父级在上一次资源级联结算
之前重新挂接。工作区归档关闭一个代次，并在移除委派/对话记录存储之前等待在飞行中的父级准备工作，因此
陈旧的准备无法在拆除之后注册。资源关闭在任何父级中止被等待之前，对每个已捕获的工作区父级运行；单个
移除同样在等待主轮次之前对资源发出信号。流式破坏性移除复用管理器排空队列的 Stop 路径，丢弃已排空的
输入，同时在父级被释放之前保留同样的有界已接受答案持久化宽限。仅主轮次的 Stop 绝不开闭资源属主。
命令与分离子代理的完成投递尊重待决的会话删除及其回滚；任何通知都不得在一个正被移入回收站的对话记录
背后追加或唤醒父级。墓碑是临时的，也不释放任何一方属主。资源重载保留命令服务与可移植的 `Subagents`
属主，并重新绑定它们的完成发送者。管理器不存储任何完成队列。SessionManager 在 SDK 会话创建之前就
存在，赋予该服务以其不可变的身份。它的上下文在启动时读取当前会话的 cwd/模型/thinking/会话文件以及
生效的 SettingsManager shell 路径/前缀。完成要求那个确切的已注册属主、没有删除墓碑、没有资源关闭，
也没有可恢复的活跃问题。不唤醒的用户停止通知不得追加在一个未回答的工具调用背后并破坏仅尾部重启修复。
在投递于既有可移植属主中等待期间，资源检视与取消仍然可用。原生 `turn_end` 结果边界会清除问题阶段并
冲刷两个属主，注册、资源重载与删除回滚亦然。`closeSessionResources` 在子级取消或任何 await 之前同步
释放子代理属主，包括准备失败的情形。永久关闭会挺过关闭预算到期并抑制迟到的结果；Pi 的释放不发出扩展
的 shutdown，因此级联在同步属主释放之后自行发出 `session_shutdown`（见
[MCP servers](#mcp-servers)）。既有已缓存的资源级联仍是唯一的拆除属主。SDK 创建与条目准备失败都会关闭
属主。注册之后的失败也会经常规拆除路径移除那个确切的条目，而不是把一个已释放的会话当作活跃来宣告。
重启后的宿主没有任何控制句柄或保留的命令输出可供从历史重建。

`getSessionResources`、`readBackgroundCommandOutput`、`stopBackgroundCommand`、`stopSubagent`、
`stopAllSubagents` 与 `setSessionResourcesPublisher` 只通过本模块的 barrel 公开。它唯一新增的外部依赖
是 `pi-background-commands`；没有 `agent` → `terminal`、`subprocess`、settings 或 workspaces 边。
拥有它的父级图记录了这条包依赖。

## MCP servers

pi 内置的 MCP 是唯一的 MCP 引擎：连接、OAuth、exposure、资源、结果截断与 `/mcp` 命令都仍是 pi 的；
ThinkRail 拥有的是一个多会话 GUI 宿主围绕它所应承担的部分。

- **注册。** 上面那两个内置描述符，只按父会话创建，由该会话的 `createMcpSessionHost` 连同调用守卫和
  一个状态失效回调一起构建；宿主注入该工作区的项目策略（`setMcpPolicyResolver` →
  `Project.mcpApprovals` / `mcpOverrides`，失败即关闭为空）。子（子代理）会话两者都不加载 —— 精选的
  子级集合不携带引擎 —— 而 `Agent` 工具的描述说明子代理不能调用 MCP 工具。
  父聊天把 pi 的 `openUrl` 变成空操作（远端客户端绝不能让人在宿主机器上打开浏览器）；pi 的 rpc 模式
  `/mcp login` 仍显示 URL 与回填对话框。在排除 Central 的加载器模式下，两个内置实现都走 `extensions`
  条目下描述的按重载路径重新解析，因此 `-builtin:*` 在那里也生效。
- **配置**（[[submodule-server-agent-mcp]]）。pi 的 `mcp.json` 文件是事实来源（`~/.pi/agent/mcp.json`、
  受信任的 `.pi/mcp.json`）。ThinkRail 提供的加载器是 pi 的 `loadMcpConfig` + 校验的移植（对等性测试
  把同一批夹具过一遍 pi 已安装的加载器，每次 pi 升级都重新检查），因为 pi 不导出它们；它还应用项目记录
  的启用/exposure 覆盖，丢弃用户未批准的仓库定义条目，并在 codemode 缺席期间在内存中把 `codemode`
  exposure 规范化为 `deferred`。配置写入器是 ThinkRail 的（同步的临时文件重命名、保留未知键、只触碰
  定义文件、不使用符号链接的 `.pi/` 路径、每个 UI 都遮罩密钥字面量）。由第三方扩展注册的服务器绕过
  加载器；`mcp` 描述符的工厂把其自己的 `session_start` / `mcp_servers_change` 处理器注册在 pi 的
  处理器之前，因此只要 `pi.getMcpServers()` 非空，`tool_search` 就在 pi 检查可达性之前已经活跃
  （没有"两者都不活跃"的警告，而当另一个扩展替换了内置实现时也无需做任何事）。
- **信任。** 宿主为某个项目构建的每个 `SettingsManager` 都传入其真实的 pi 级信任
  （`Project.piResourceTrust`，[[submodule-server-projects]]），而不是强制的 `true`。
  - **位置。** 会话（`buildSessionSettings`）、会话前的加载器与子会话。仅列出别名的场景传 `false`：
    别名根是显式路径，因此从不需要项目设置。
  - **每次加载。** 会话加载器的 `reload()` 在每次加载之前应用准入上下文的当前信任
    （`setProjectTrusted`），因此任何重载 —— 一次授予、一次配置变更或一次手动重载 —— 都恰好加载记录
    所允许的东西。因此授予或撤销只是请求门禁去重载那些信任已陈旧的会话（`applyPiResourceTrust`：空闲者
    立即，忙碌者在结算时）。在信任变更时仍在打开的会话不在这轮扫描中，因此注册会在 `createSession`
    返回之前把其已加载的信任与记录重新比对并按需重载。
  - **子级。** 子级的信任来自其父上下文：`liveParentContext.isProjectTrusted` 回答的是父级的*已加载*
    信任**与**当前记录。因此子级绝不会持有超过其父级的信任（在忙碌父级上被延迟的一次授予，在父级重载
    之前不会抵达它的新子级），也不会超过记录的信任（撤销会立刻抵达新子级）。
  - **撤销。** 子级在创建时捕获其信任，而 `pi-subagents` 会跨父级重载保留子级，因此撤销还会停止一个
    陈旧父级的每个活跃子级（`stopSessionChildren`，原因 `"user"`：撤销是用户自己的动作，父级被告知但
    不被唤醒）。它会等到那些运行真正结束 —— 中止失败的子级会被释放 —— 之后才请求父级重载。**忙碌**的
    父级不会被打断：其当前轮次用它已经加载的资源跑完，并在结算时重载（`"deferred"`），Stop-trusting 的
    确认会披露这一点（"open chats reload when idle"）。因此当 `project.setTrust` 返回时，没有任何子级
    和空闲聊天运行在已撤销的信任下，而忙碌的聊天会在其轮次结束时停下。
  - **失败。** 失败的重载在返回的处置中报告为 `"failed"`，然后 `project.setTrust` 会在持久化并发布
    记录之后失败，并点名仍处于先前信任下的聊天。之后失败的延迟重载会以该聊天上的一条 `error` 通知抵达
    用户，要求关闭或重载它。授予不会打扰正在运行的子级，因为它们只是缺少该项目的资源。
  - **同意。** pi 级授予是它自己的同意，与别名信任分开：只有带 `resources: true` 的
    `project.setTrust`，且由一个点名它加载了什么的界面发出，才授予它
    （[[submodule-server-projects]]）。仓库定义的 MCP 条目还额外需要按条目的批准，键为整个原始条目对象
    的指纹（批准状态在项目记录中）。信任提示对别名技能、pi 自己那些需要信任的资源、项目子代理定义与
    项目 MCP 条目一视同仁地显示。
- **生命周期。** `AgentSession.dispose()` 从不发出 `session_shutdown`，因此资源级联
  （`closeSessionResources`）自己运行它 —— 同步地，在同步的属主释放之后，使处理器在同步拆除路径释放
  pi 会话之前已经启动。pi 的运行器按加载顺序逐个等待处理器，而文件扩展先于 `builtin:mcp` 加载，因此
  一个永不结算的处理器会让 pi 的 MCP 关闭永远无法开始（pi 的进程退出钩子只发送 SIGTERM）。因此该级联
  先直接运行 `mcp` 工厂自己的 `session_shutdown` 处理器（`McpSessionHost.shutdownEngine`，携带事件的
  以及 pi 会传入的运行器 `createContext()`），然后为每个扩展发出
  `session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" })`。被捕获的与运行器发出的
  MCP shutdown 共享同一个按加载的清理 promise，因此提前清空 pi 的服务器列表不会让第二次派发丢掉第一次
  派发的完成（[[submodule-server-agent-mcp]]）。受门禁的重载会以原因 `reload` 等待那次真正的 MCP 清理，
  然后才调用 pi 的 `session.reload()`；它们绝不使用有界的退出等待在旧资源仍活着时准入替代者。一个挂起
  的无关 shutdown 处理器可能延迟重载，但不可能在信任或资源变更中让 MCP 进程活着。关闭检查发生在重载
  之前、在公开的 `beforeSessionStart` 钩子中，以及派发之后；当条目已被释放或其资源正在关闭时即拒绝。
  光有这个钩子是不够的：一个更早的异步 `session_start` 处理器可能通过关闭暂停该次派发，因此引擎用该次
  加载同步设置的 closed 标志守卫它真正的启动/变更回调。关闭不会等待一个无界的资源加载器或启动派发。
  如果 pi 之后构建了一个替代运行器，重载属主会给那个运行器自己的有界 shutdown 并释放它。shutdown 按
  运行器单次飞行，包括紧急释放在重载中途跟随优雅关闭的情形；每个释放续接只能释放它所等待过其 shutdown
  的那个运行器。已关闭的重载绝不冲刷完成、重启 MCP 状态或安排另一次重载。
  每条拆除路径都经过这个级联：删除/移除、工作区归档/移除、退出（`settleSessionsForShutdown` +
  `disposeAllSessions`）以及在绑定之后失败的一次准备 —— 包括那种因工作区已关闭或宿主已开始退出而注册
  被拒绝的。它们每一个都把 `session.dispose()`（`disposePiSessionAfterShutdown`）推迟到两者都结算或
  预算（`SESSION_SHUTDOWN_BUDGET_MS`，3 秒 —— pi 在 2.5 秒内按 stdin-close → SIGTERM → SIGKILL 升级）
  到期为止，因为 `dispose()` 会使处理器仍在使用的扩展上下文失效；宿主关闭的结算预算正是同样的 3 秒。
  被保留的会话保留其服务器（无驱逐）；它们作为 `SessionResources` 的第三个列表出现（`mcpServers`：
  名字、状态、工具数、取自会话最新状态快照的 transport，对于由扩展注册的服务器则是 `registered: true`
  与注册的 transport；变化时发布 `session.resourcesChanged`），按聊天的"Disable in this chat"在下一次
  空闲重载时应用（延迟的那次会立刻把该服务器显示为 `pending-reload`）。该覆盖层只作用于 `mcp.json`
  服务器，因此 `setSessionMcpServerEnabled` 拒绝（`MCP_CONFIG_INVALID`）禁用聊天未从其文件加载的服务器
  —— 对已注册的那种，消息会说明它由扩展注册、无法按聊天禁用 —— 并在 `builtin:mcp` 不拥有 `/mcp` 时以
  `MCP_HANDLED_ELSEWHERE` 拒绝。属主关系与文件出处会在启用和禁用之前都校验，即便是空操作请求；一个
  被禁用条目若跨越了一次替换 `/mcp` 的重载仍被保留，就无法经宿主重新启用。失败的重载绝不回滚聊天本地
  的禁用意图；在其 MCP 重载失败仍存在期间重复同一个值会重试，而不是原样返回。如果那次失败清空了已加载
  的快照，一次重试会对照当前被准入的配置校验文件出处；未知或仅属于扩展的名字仍被拒绝，而一个替代的命令
  属主仍会让该控制变为只读。
  配置或信任变更只重载受影响的会话：会话的 `loadConfig` 记录了 pi 在其上次启动时所收到的按服务器生效
  配置（`McpSessionHost.loaded()`，在每次加载开始时清空），而 `reconcileMcpSessions` 把它与加载器现在
  会产出的东西（`pendingMcpReload`）作比较 —— 例如一个未获批准的仓库条目什么都不改变，也就什么都不
  重载。一个其 `/mcp` 由另一个扩展拥有、或无人拥有的会话没有可比对的东西（内置实现的加载器在那里从不
  运行），因此不会被调和，除非更早一次失败的 MCP 重载仍可重试。调和在每次宿主变更之后运行、在用户文件
  变化时运行（`watchUserMcpConfig`：pi 的 agent 目录上的一个目录监视器，300 ms 去抖；缺失的 agent 目录
  会先被创建 —— pi 反正会在首次使用时创建它 —— 因此用户之后添加的文件仍会被看到；改名或监视器错误会
  退役旧监视并以有上限的重试退避重新布防，包括在 agent 目录被重建之后；停止会取消重试）、在工作区变更
  提醒触及 `.pi` 时运行，以及在每个会话的 `agent_settled` 运行（因此 agent 自己做的编辑会在运行结束时
  生效）；延迟的重载会把变更过的服务器显示为 `pending-reload` 直到它运行。每一次影响 MCP 的受门禁重载
  （即时、延迟、手动、信任/设置，或聊天本地覆盖）都共享 `mcpSessions` 中的一个失败记录器：既有的被追踪
  状态对象保留重试标记，即使失败的加载已经替换或清空了其配置快照。门禁会在替换之前捕获内置引擎是否曾
  被加载；那份出处、一个新加载的引擎、或一个既有失败，都会使该重载成为影响 MCP 的。从未管理过 MCP 的
  宿主不会获得 MCP 失败标记。每次失败的尝试记录并以脱敏细节通知一次；延迟与调和调用方不会再次报告它。
  失败不会重启权威状态，也不会立即排空另一个待决重载；之后的一次调和或显式重试可以在没有任何配置差异
  的情况下恢复。只有成功的重载才清除标记并重启状态。正在关闭或已释放的条目既不报告失败也不重启。
  重载经 `session.reload()` 在按会话的重载门禁之后进行：重载运行期间，每个准入接缝（`promptSession`、
  `steerSession`、`followUpSession`、`nudgeSession`、队列重新入队、`answerQuestion`、
  `sendReviewFixToSession`、`compactSession`）都以 "reloading" 拒绝，而完成投递在其属主中经
  `canDeliverCompletion` 等待并随后冲刷；门禁只在以下条件都成立时打开：pi 处于 `isIdle`、没有已准入的
  提示词仍在预检中（宿主保留从准入到 `agent_start` 的窗口 —— pi ≤ 1.1 在整个窗口都报告空闲，pi 1.2
  直到 `before_agent_start` 仍如此，途经 `input` 处理器与展开；一个被当作斜杠命令处理的提示词永不启动
  运行）、没有队列消息移除正在把保留下来的消息放回去（`removeQueuedSession` 持有一个保留，
  `agent_start` 不会从它的排空释放到其最后一次重新入队，因此在这期间结算的运行无法启动一次会拒绝并
  丢掉其余部分的重载），以及没有手动或自动压缩在飞行中；一个待决重载会在 `agent_settled`、每次保留
  释放时以及压缩结束 / `compactSession` 的 `finally` 中重新考虑。
- **状态**（`mcpSessions.ts`）。只暴露，不重算：连接事实是 pi 无头 `/mcp` 的文本，通过派发会话自己的
  命令获得（`dispatchSessionMcpCommand` → `extensionRunner.getCommand("mcp").handler`）。捕获按出处而非
  按格式进行：那次派发得到的 `createCommandContext()` 的 `ui` getter 被重定义（`Object.defineProperty`，
  因此 pi 其他惰性 getter 保持不动）为一个 pi UI 的转发代理，其中只有 `notify` 会上报给捕获。因此它只
  接收自己那次派发的通知，它打印的任何东西都绝不抵达聊天，而用户自己的 `/mcp`（pi 的提示词路径、pi 的
  上下文）总是打印到那里，哪怕在捕获中途。重连（`reconnectMcpServer`：`mcp.reconnect` 与那些登录后的）
  以同样方式派发：成功是静默的，pi 的错误通知变成该调用的拒绝（经 `redactMcpText`），而一个
  `builtin:mcp` 不拥有 `/mcp` 的聊天会以 `MCP_HANDLED_ELSEWHERE` 被拒绝。pi 启动时的"MCP servers need
  attention"通知是未经请求的，因此只有它通过 `interceptExtUiNotify`（[`webUiContext`]）按其固定前缀被
  识别，该拦截器在 `bindExtensions` 之前安装：它变成一次部分状态更新加一次完整刷新，而不是一条 toast
  —— 除了低于 `MCP_PROTOCOL_VERSION` 的客户端，它们未订阅 `mcp.status`，仍以 toast 形式收到该通知
  （`notifyExtUi` 带一个 `ExtUiAudience`，按 socket 投递并在投递之前脱敏），因为 web 客户端与宿主是
  独立发布的。pi 的 `/mcp` 在回答之前会等待每个启动连接，因此注册与每次成功的受门禁重载都先用 pi 被
  告知的东西（`McpSessionHost.loaded()` 加上扩展注册的服务器）播种快照：每个已启用的读作 `starting`，
  已禁用的经同一套推导读作其禁用状态，而上一次加载的报告绝不在重载后存活。随后开始捕获；在那次
  （重新）启动之前开始的捕获会被丢弃（按会话的加载纪元），因此陈旧的报告绝不替换种子。刷新也会在
  `agent_settled` 以及某聊天自己的 MCP 登录/登出/重连结算之后运行，包括失败的情形；状态读取绝不使自身
  失效。捕获在一次读取调用方的等待预算之后继续，并发布其最终答案。每个会话至多一次捕获在飞行中，而
  调用方等待一个有界时间。每份快照把 pi 的报告与配置合并（`deriveMcpServerStatuses`：被此聊天 / 该项目
  禁用、待批准、配置无效；pi 未作答时保留上一次报告），携带按会话单调递增的代次，并发布到 `mcp.status`
  频道。pi 不脱敏其状态文本（连接错误、HTTP 错误正文、stdio 服务器的 stderr 尾部），因此每个 `detail`
  与 `configError` 在离开宿主之前都经过宿主的 `redactMcpText`（[[submodule-server-agent-mcp]]）。配置
  问题会被报告，绝不丢弃：每个具名条目保留其摘要（不是对象的那种读作
  `server "<name>" must be an object`），而 `listMcpServers` 把两个文件的文件级问题（无法解析的 JSON、
  `mcpServers` 不是对象、类型错误的键；`summarizeMcpConfigErrors`，已遮罩）作为 `configErrors` 加上
  —— pi 自己对它们的报告就是宿主所拦截的那条启动通知。只有其 `/mcp` 属于 `builtin:mcp` 的会话才会被
  查询；另一个属主会让 `listMcpServers` 报告 `handledElsewhere`（`by` = 该扩展的路径，或对没有 `/mcp`
  的活跃聊天为 `pi settings`），而交出 `/mcp` 的那次重载之后的刷新会一次性退役该会话的状态与资源行
  （一份空的 `mcp.status` 快照、一次 `session.resourcesChanged`）。关闭内置实现的 pi 设置在没有打开任何
  聊天时也是可知的：`listMcpServers` 以排除加载器的同一方式解析它们（`DefaultPackageManager` 配以
  内置实现的名字、其 `builtin:mcp` 资源的 `enabled`；缺失的包被跳过，绝不安装）并报告
  `by: "pi settings (-builtin:mcp)"`。一个已启用的非内置扩展是否注册 `/mcp`，在不加载它的情况下无从
  知道，因此替换只能通过某个活跃聊天的属主被看到。
- **调用。** 按会话的宿主扩展（[[submodule-server-agent-mcp]]）在任何没有 `readOnlyHint` 的 `mcp__*`
  调用之前询问（Deny · Allow once · Allow in this chat；仅会话内存；除两个肯定回答之外的任何情况都阻断，
  而一旦 pi 接受一次 steer，`steerEntry` 就取消待决的确认）。它的 `tool_result` 处理器把有界、不含
  base64 的 `McpResultSummary` 加到 `details.thinkrail` 下（`summarizeMcpResult`），而
  `readMcpToolOutput` 从一个结果所记录的完整输出（`mcp.readOutput`）中、恰好从其 `fullOutputPath`
  （pi 的仅属主临时文件；最多 1 MiB，超出则 `truncated`）提供 —— 未记录任何输出的结果为
  `unavailable`，文件一旦消失为 `expired`。Settings 的 *Show log* 读取 `readMcpServerLog`
  （[[submodule-server-agent-mcp]]）：pi 把服务器记录的东西（`notifications/message`）追加到每个 agent
  目录下为所有会话共用的一个 `mcp.log`，因此某个服务器的行按它们的条目头部挑出并遮罩。
- **登录**（`mcpSignIn.ts`；可取消的登录需要 pi ≥ 1.1.0，#10565）。`startMcpProbe({ action: login |
  test | logout })` 打开一个短命、未注册、内存中的 pi 会话，其加载器只携带 `builtin:mcp` 与那一个
  服务器（强制启用），其 UI 上下文是探测自己的，派发 pi 的 `/mcp login|logout <name>` 或无头 `/mcp`，
  然后发出 `session_shutdown`（这也会中止正在运行的登录）并释放它。帧搭乘 `provider.login` 家族，带
  `target: { kind: "mcp" }` 与 `loginId` `mcplogin_*`，只发给拥有它的连接
  （`setMcpLoginPublisher(push, ownerClientKey)`）；来自任何其他连接的回复与取消都以
  `LOGIN_NOT_OWNER` 失败。Pi 公开的 `openUrl` 回调直接提供 `authUrl` 帧，且仅对 `https:` 或回环
  `http:` 地址；其重定向提示变成回填的 `prompt` 帧，而结果由 pi 被捕获的通知（已登录 / 失败文本 /
  已取消）推导，绝不单凭命令的 promise。pi 对浏览器或回填的等待没有整体超时，因此每个探测都有一个截止
  时间（`PROBE_DEADLINE_MS`，10 分钟；`startMcpProbe` 可选的 `deadlineMs` 是测试接缝，宿主从不传入），
  到期后它就像一次取消那样结束 —— `error` 帧 "Sign-in timed out."、`session_shutdown`（关闭 pi 的回环
  监听器）、会话关闭后释放锁 —— 而宿主在回收某个客户端时取消该客户端拥有的探测
  （`cancelMcpProbesOwnedBy`），因此重载的页面或被丢弃的标签页绝不会一直占着一个服务器直到重启。登录
  成功之后，该工作区中把该服务器报告为*需要登录*的活跃聊天会得到 `/mcp reconnect <name>`，而不必等到
  它们的下一个轮次。测试连接仅限 HTTP（stdio 服务器在聊天启动它时得到验证）并报告 *connected · N tools*
  或原因；每个 `error` 帧的消息（pi 的原因或通知）都像状态细节一样被脱敏。活跃聊天自己的 `/mcp login`
  保留 pi 的 rpc 路径：登录地址作为对话记录通知抵达（绝不自动打开；`openUrl` 在宿主上是空操作），紧邻
  pi 的回填对话框。探测的加载器强制 `builtin:mcp`，因此宿主在 `listMcpServers` 报告
  `handledElsewhere` 的地方不启动探测（`MCP_HANDLED_ELSEWHERE`，[[submodule-server-host]]）。
- **每个服务器一次登录，无论由谁发起。** pi 在共享的 `mcp-auth.json` 中为每个服务器保留一份客户端注册
  与待决的 PKCE 状态，因此同一个服务器的两个并发流程会互相破坏。一个探测从其启动到其会话关闭期间持有
  该服务器的锁（`acquireMcpSignInLock`，[[submodule-server-agent-mcp]]），并以 "already running" 拒绝
  （当某个聊天持有时为 "… in a chat"）；活跃聊天的 `/mcp login|logout <name>` 在命令持续期间
  （引擎包装过的 `/mcp`）持有同一把锁，而当其他任何东西持有时，它会在聊天里说明，而不是启动 pi 的流程。
  裸露的 `/mcp login` / `/mcp logout` 不加锁 —— 这是已接受的缺口：pi 在其处理器内部挑选服务器（唯一
  的 OAuth 服务器、唯一需要登录的服务器，或对它自己选择器的回答），因此在其流程写入状态之前没有名字可
  锁；pi 的状态文本与提示总会点名该服务器（`run /mcp login <name>`）。

## 必须做对的事

- 会话正在流式时 `prompt()` 会抛错 → `promptSession` 回退到 `steer()`。
- 错误经事件流 + 抛出的方法抵达，而不是崩溃信号 —— 包住并转发。
- **重新打开的磁盘会话在被播种之前先被修复**（`repairDanglingToolCalls` 位于 `SessionManager.open` 与
  `createAgentSession` 之间）—— 绝不在一个活跃 `AgentSession` 背后向会话文件追加，它的内存上下文会
  失步。
- **活跃 ask 只在其绑定到会话的阶段注册表里阻塞；重启状态保持由对话记录推导。** 该注册表在释放时被遗忘
  且永不恢复。只有工具可执行的悬空 ask 会在挂接之前被修复为 ack；`length`/`error`/`aborted` 尝试是终结
  性的。`assessAnswerability` 仍是唯一的回复有效性权威；拒绝会让 WS 请求响亮地失败。
- 会话前读取与新会话共享一个**当前**的 `ModelRuntime`。每个会话作为 `createAgentSession` 的
  `modelRuntime` 收到并保留其代次；给每个会话自己的 `SessionManager`，并在移除时 `dispose()` 它。旧
  运行时只能通过旧的活跃会话抵达，并随它们一起变得可回收；`AgentSession.reload()` 仅重载资源，绝不
  改变代次。
- **`pi` 的 `Model` 绝不能原样跨线上协议** —— 提供商/扩展配置可能在 `baseUrl`、header、auth 或提供商
  闭包里携带密钥。每个携带模型的帧（`model.list`/`model.refresh`/`model.default`、`session.create` 的
  结果、`SessionSummary.model`）都经过 `toWireModel` —— 列表路径共用那一次 `readAvailableWireModels`
  读取，因此无法通过新增调用方绕过该投影；每个入站模型引用（`session.create` / `session.setModel`）都
  由宿主侧以 `{provider,id}` **重新解析**（`resolveWireModel`），绝不被信任。线上类型
  `WireModel = Pick<Model, id|name|provider|contextWindow|reasoning> + thinkingLevels +
  cost{input,output} + input + auth` 是一份**允许清单** —— 它失败即关闭，因此未来新增的 `Model` 字段
  默认无法泄露（一个单元测试固定确切的键集合）。`thinkingLevels` 是计算字段：pi-ai 的
  `getSupportedThinkingLevels(model)` 在同一个收口点映射，使 effort 选择器渲染 pi 的按模型支持真相，
  而无需客户端重新推导。`cost` 只保留两个列表价格（pi 的 `ModelCost` 分层与缓存费率留在宿主侧），
  `input` 保留模态列表。**`auth`** 是投影到每个模型上的按提供商连接种类（`providerAuth.ts` →
  `catalogProviderAuth`，来自 pi 同步的 `isUsingOAuth` / `getProviderAuthStatus` 加上该代次的不透明
  Central id），使选择器无需 `provider.status` 刷新就能说 *plan* / *API key* / *env* / *JetBrains AI*；
  `describeProviderAuth` 是那唯一一处种类/细节映射，而 `auth/providerStatus` 复用它，因此选择器与
  Settings → Providers 不可能不一致。`toWireModel(model, auth?)` 把该投影作为值接收：目录读取为每个
  提供商计算一次（`readAvailableWireModels`），会话结果、摘要与 `setSessionModel` 路径则从它们自己的
  代次派生它（`sessionWireModel`）。
- 活跃的斜杠命令列表由 **Pi 的 rpc 模式所用的同样三个来源**派生
  （`extensionRunner.getRegisteredCommands()` + `promptTemplates` + `resourceLoader.getSkills()`）。
  会话前目录只把 `resourceLoader.getSkills()` 经同一个技能→命令辅助函数映射，并应用**同样的项目信任
  门禁**，因此 New Workspace 预览与真实会话不可能不一致，除了已接受的基线分支/当前检出时机差异。
- 对话框 promise 尊重中止/超时，并在会话释放时结算（+ 在 UI 中关闭）—— 桥接的 `uiContext` 调用绝不能
  挂起。
- **提示词模板的 `/name` 展开** —— 提示词里像 `/name args` 这样逐字引用的内容，搭乘 agent 默认的
  `expandPromptTemplates: true`（不改 agent 代码）。它从会话的**创建时模板快照**展开 —— 会话中途保存的
  模板**不会**被已打开会话的逐字引用路径看到（pi 会原样透传未知的 `/name` 文本）。输入框的 `/` 菜单
  路径经 `template.list` 始终新鲜（见 `templates/SPEC.md` 的新鲜度规则）。
