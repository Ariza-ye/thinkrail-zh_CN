---
id: submodule-server-host
type: submodule-design
status: active
title: host —— 浏览器↔宿主线上协议
parent: module-server
depends-on: [module-contracts]
tags: [host, public-surface-checked]
---

## 职责

线上协议与组合根：`Bun.serve` 的 HTTP+WS、静态 SPA 服务、WS 方法→处理器注册表，
通道扇出，以及两个启动器共享的进程启动包装。

## 边界

- **拥有：** `server.ts`（异步的 `createServer` 先请求 auth 开始 Central 产物监视并发布初始的当前 PI
  运行时，需要时回退为带封闭 `load-failed` 状态的普通 PI，然后创建 `Bun.serve`，带 `/health`、
  `/ws` 升级、一个
  **`GET /files/<workspaceId>/<relpath>`** 路由（从 `Bun.file` 流出一个工作树文件的原始字节，
  且只先分类它有界的 8 KiB 头部（经 `fs` 的 `resolveWorktreeFile` —— 路径围栏内；坏的 id/逃逸/未命中
  → 404；`Cache-Control: no-store`，因为工作树会在该 URL 之下移动），好让 markdown 查看器的相对
  `<img>` 能解析）、兄弟的
  **`GET /blob/<workspaceId>/<oid>/<relpath>`** 路由（提供该路径**在一个提交或树处**的字节
  （`git.readBlobStreamAtAsync` 藏在一个 40/64 位十六进制 `oid` 之后 —— 即某个差异范围的
  `resolvedOriginalOid`，所以该 URL 命名的是不可变内容，并回答
  `Cache-Control: public, max-age=31536000, immutable`；该 Git 原语要求一个 blob，所以树/提交/
  gitlink 与坏的 id/oid/逃逸/缺失路径一样是 404）。在打开一个 blob 正文之前，该路由执行一次有界的
  `git cat-file -s`；超过 `BLOB_SIZE_LIMIT`（64 MiB —— 即一个评审界面一次性渲染的最大图片、PDF 或
  笔记本的大小，也是一个 `change.revert` 回执可以钉住的量之上界）的对象以 413 拒绝。被接受的 blob
  是**流式的**：只有它的 8 KiB 嗅探头部被 await 用于响应头，其余逐块转发 `git cat-file` 的 stdout，
  所以并发的图片或 PDF 差异付出的是管道缓冲、而不是宿主内存里的 blob；正文分块发出（流式正文不携带
  `Content-Length`），一个断开的消费者会杀掉它的 `git` —— 一旦开始流式就经正文的 cancel，而在嗅探
  头部仍被 await 时经请求的 `signal` —— 且中继自己的期限是五分钟，所以慢读者让 `git` 停在管道上
  等待，而不是与 55 s 的网络预算赛跑。两条路由都存在，因为 `fs.readFile` 与 `git.diffFile` 对它们
  不得解码的字节回答 `""`，所以一个纯字节资源改为经 HTTP 取回。两者都通过共享字节分类器加上文件名
  回退（回退到 `application/octet-stream`）推导 `Content-Type`，并发送
  `X-Content-Type-Options: nosniff`；活跃的同源类型（`text/html`、`application/xhtml+xml`、
  `image/svg+xml`）还额外收到 `Content-Security-Policy: sandbox; default-src 'none'`，所以直接导航
  无法执行仓库脚本，带 `index.html` 回退的静态服务、`server.welcome` 推送、在升级时从 socket URL
  读出的 **`?client=` 页面身份**（作为 `RequestContext` 穿到每个处理器；它寻址终端输出，但不再
  *拥有* PTY —— 见 [[submodule-server-terminal]]）加上 `clientKey → socket` 注册表与那个活得比重连
  更久的**重放命名空间保留定时器**（终端被有意地不受它影响）；按 `(clientKey, requestId)` 为键的
  **请求重放缓存**（第一帧拥有一个处理器 promise 及其序列化响应，一次重连重放 await/返回同一个结果，
  一个不匹配的重复被拒绝，而回收该客户端会清掉它的缓存 —— 但**只在没有任何东西在途时**：一个未
  resolve 的请求会比 socket 宽限窗口活得更久，因为页面会持有那一帧直到它*自己*的期限（文件夹选择器
  是 30 分钟）并在重连时重放它，所以 `clearClient` 会拒绝，而回收会重新布防，而不是让重放去启动一个
  尚未完成的处理器的第二次执行）。**那个缓存里的任何东西都绝不被淘汰**，因为一次成功的 `send` 只说
  字节已入队，没说页面读过它们，而一个握着回复死掉的 socket 与一个已冲刷它的 socket 无法区分 ——
  所以任何由宿主自行决定丢弃的结果，都可能是重放正要索取的那一个。一个结果只在客户端自己发话时才
  离开，经由两个在这里处理、且绝不路由到处理器的帧：`{ ack: [id] }` 命名它已**读过**的响应（稳态），
  而每次重连时的 `{ resume: [id] }` 命名它仍视为**未解决**的一切，释放其他所有已结算结果。`resume`
  正是让回执可以安全丢失的东西 —— 一个 ack 能像响应一样死在 socket 缓冲里，而没有任何东西会重发它，
  所以每次重连都重述整个真相，而不是去确认那些确认。代价改由**两个硬性限制**来界定，每个都在其大小
  变得可知的地方执行：*入*向的条目数 —— 一个满命名空间拒绝新 id（`RequestReplayOverflowError` → 一个
  正常的 `ok: false`），同时仍回答它持有的每个 id —— 以及处理器*出*向的保留字节数，因为一个响应的
  大小在准入时不可知（`fs.readFile` 返回整个文件）而在途工作不占重量，所以准入时的字节检查只会界定
  条目数、别的什么也不界定。一个会击破字节预算的结果不被保留：条目留作"这项工作跑过"的证明，所以
  它的重放会失败（`RequestReplayUnretainedError`）而不是重跑，而调用方已经收到的那个响应不受影响。
  两个限制都不会牺牲恰好一次 —— 一个拒绝尚未开始的工作，另一个保留已完成工作的记录、只丢掉它的答案，
  **`provider.login`** 通道发布（`auth` 模块无会话的登录帧桥，接线方式像 `pi.extensionUi`）、
  **`provider.changed`** 失效广播（在 auth 改变 Central 状态或当前运行时代次之后（客户端重读
  状态/模型）），以及 `provider.*` 处理器 —— 包括 `provider.jbcentralQuota`，其处理器把 `settings`
  的 启用/间隔 值与 `auth` 的封闭缓存读取组合起来，好让这些兄弟绝不互相导入 ——
  **`watch` 接线**（把 `workspace.fsChanged` 发布回调注入 `watch`，并注入 `agent` 的项目技能路径
  分类器，好让每个被封顶的批次携带独立的 `skillChange: none|detected|unknown` 证据；把
  **`workspace.watchReady`** 暴露为一个类型化预检，它 await 一个新监视器保守的启动推动，然后在一个
  web 技能加载流程捕获其基线之前返回，并报告该监视器是否早已被知晓为就绪（客户端那个重放安全的
  保守回退；它可选的 `prewarm` 标志被转发进 `watch` 有界的仅预热层，所以预选择预热绝不让监视器
  注册表无界增长）；再加上 **repo-metadata** 回调（`setRepoMetaPublisher`），对被监视工作树里的
  一次 git 元数据写入扇出到**三个**收敛点：`recordWorkspaceHead`（已结算生命期的提交代理 —— 只在
  sha 真的移动时才盖上活动章，见 [[submodule-server-workspaces]]）、`refreshUserOwnedWorkspace`
  （**重新同步一个用户所有工作区的 folder-truth 分支** —— 由宿主居间，因为 `watch` 没有指向
  `workspaces` 的边，并通过工作区生命期 tee 自发布）**以及**一个无路径、技能中立的 `fsChanged` 帧
  （`paths: []`、`truncated: false`、`skillChange: "none"`），好让客户端那些 `HEAD` 相对的读取
  （`git.status`、一个 `uncommitted` 范围的差异标签页）在终端的一次 `commit`/`reset` 移动某个 ref
  时重读；同一次发布还喂 **fsNudge 接缝**（`fsNudge.ts`：`setFsNudgePublisher` +
  `nudgeBaseRefWorkspaces`），即 `git.prefetch` 处理器在应用自己的后台取回**移动了**一个远端跟踪
  ref 时触发的宿主居间 —— 一次只有项目仓库共享的 `.git` 看得见的写入，对每个工作树监视器都不可见
  —— 把那个无路径帧扇出到该项目里差异基线正是那个被移动 ref 的每个工作区（它们分支范围的
  merge-base 可能已经移动 —— 没移动时这次重读是幂等的；其他所有人都继续睡）
  而不触碰一个工作树文件；从工作区读取类处理器（`fs.*`、`git.status`/`git.diffFile`、
  `spec.graph`）调用 `ensureWatch(workspaceId)` —— 一次读取就是"有客户端在看"的信号；
  `workspace.remove` 的快速路径里在 `evictSpecIndex` 旁边 `stopWatch`；在 `stop()` 里
  `stopAllWatches()`），在 socket 关闭之前于 `stop()` 里调 `stopJbcentralRuntime()` 与
  `cancelAllLogins()`，
  一个可选的启动期 `openProject(projectPath)`（尽力而为 —— 一项启动器便利），
  **analytics 接线**（启动时从启动器来源、目标，以及逐运行附加数据抑制来 `initializeAnalytics`；
  启动只在 `analyticsEnabled && analyticsConsentConfirmed` 时授予附加档。启动之后，settings 发布器
  仍广播每一份合并后的配置，但只有在其成功应用的更新显式携带 `analyticsEnabled` 时才改变 analytics
  授予，所以无关的写入保留当前授予，而对话框的偏好预热可以启用它。`analyticsConsentConfirmed` 控制
  web 提示的生命期。它在未确认时的预热可以启用普通的附加捕获，但浏览器归因只从 已确认且开启 的
  状态开始：直接在一次最终应用的对话框更新之后（UI 已就绪），或者对一个已保存的选择，只能经由
  启动器在正常 UI 就绪之后发出的显式 `RunningServer.startAttributionClaim()` 就绪信号。撤销会取消
  该认领代次。基础事件在人类运行中保持开启。同意变更会清除附加事件相关性，所以重新启用无法重建
  同意之前的工作；仅活动型富化在关闭时停用，在开启时从其严格的服务器记录恢复，而不重试一个已消耗
  的认领。`shutdownAnalytics()` 仍是 `stop()` 里的尽力而为排空，并被优雅关闭 await；每一个捕获点
  都在这里，包括既有的基础事件：`session.create` 里的 `chat_started`（宿主的新聊天解析对一个用
  不可用模型创建的聊天决定为 `none`，而不是 pi 的占位符；否则报告所创建会话的实际模型）、
  在一次**被接受的** `session.prompt`/`session.steer`/`session.followUp` 之后的 `message_sent`
  （经本地的 `trackSend(mode, text)`）（`prompt`/`steer`/`follow_up`；contracts 的
  `isControlMessage(text)` 为真时跳过 —— 客户端的 TODO 唤醒推动搭乘同样的方法，且不是用户消息；
  `session.answerQuestion` 是一次工具回复，也不是消息）、
  来自登录发布器 tee 的终态 `success` 帧的 `provider_login`，其方法（`oauth`/`api-key`）从
  `loginAnalytics.ts` 查得 —— 即 `provider.loginStart` 处理器记录的 loginId→方法 映射（而
  `provider.loginCancel` 清除它；一个未知 loginId 不追踪任何东西，失败即封闭）—— 加上一次成功的
  `provider.jbcentralConnect`→`applied`（失败的动作从不计数）—— 按
  `submodule-server-analytics`，特性模块从不追踪）。基础登录/聊天/发送事件从它们自己的会话/登录
  代次添加封闭的 auth 类别，绝不从更晚的全局运行时添加；发送在派发之前对 提供商/认证 做快照。
  不透明加载器的提供商成员资格识别 Central，而不打开它的认证/配置面。附加的 设置/运行/任务/评审/PR
  观察使用 [[submodule-server-analytics]] 里的封闭触发，带瞬态的按同意范围限定的相关性与任务产物
  协调。只有宿主居间处理这些事件；analytics 初始化发出打包安装的生命期事件，而不存在任何提供商
  变更的捕获。
  设置观察既有的读取结果，绝不触发提供商工作；只有显式的设置变更才计数
  （`dialog.selectDirectory` 是其中之一：路径为 null 的 `directory_pick` 记为 `cancelled`；
  `project.open` 把 projects 模块的 `NOT_GIT` / `ALREADY_OPEN` 编码错误映射到封闭原因，其他一切
  `unknown`）。运行计时从规范的 `agent_start` 开始，本地发送意图在调用 pi 之前记录（不是
  `ackSend` 之后）；未经证明的来源保持未知，重试保持一个周期，直到 `agent_settled`。
  被接受的已排队来源会活过发送解析，直到规范周期观察；被拒绝的发送不贡献。清除同意会保留授予前的
  周期标记，而结算、队列清空、会话删除与完整宿主重置会释放它们相应的瞬态意图状态。
  任务观察在完成类变更之前，通过既有的无 pi 依赖的 `TodoStore` / `groupStatus` 边界同步读取精简的
  分组状态，然后在协调之后读取产物；线上编辑会等既有产物工作，而不是为遥测制造新的 Git 写入。
  完成证据与去重会等该工作区既有的协调队列收敛（包括计划漂移后的替换趟），并保留该次变更原始的
  同意授予。空的/刚水合的分组以及通过删除完成的都不计入。这些仅内存的观察在异步工作之前保留一份
  授予捕获，且绝不跨撤销重放。
  `stop()` → 立即清理 agent 会话，然后在 `closeAllTerminals()` **之前**调用
  `persistTerminalSessions()`，然后处置监视器/socket；`shutdown()` 记忆化一条异步的优雅路径：
  先是有界的 `settleSessionsForShutdown()` + 被 await 的 `shutdownAnalytics()`，然后是为那些结算
  所启动回执的 `turnTracker.drain()`，然后 `stop()`）。有界结算即使在其父级空闲时也包含隐藏的委派
  子项，加上一次并发移除已经启动的子级级联，所以优雅退出不会让一个后台子项丢掉它的终态中止/
  工具结果；`crashLog.ts`（`installCrashLog` —— 把 `uncaughtException`/`unhandledRejection` 报告
  追加到 `<dataDir>/logs/crash.log` 并回显到 stderr，然后 `exit(1)`：进程内 pi 意味着这样一次故障
  就是整个宿主的故障，而一个在没有终端的条件下启动的启动器否则会丢掉它唯一的线索。绝不是一次
  恢复，也绝不在 `NODE_ENV=test` 下安装 —— 一个单元测试进程会报告它自己的故障。它通过 `log` 模块
  的 `describeError` 渲染那个抛出，所以崩溃报告与日志行一致，但它保有自己的同步追加 —— 死亡路径
  绝不能依赖日志器的状态）；
  `boot.ts`（`bootHost` → await `initLogging` —— 启动器传了 `verbose` 时用 debug 级别 —— 然后
  安装崩溃报告、在启动器传了 `resolveShellEnv: true` 时解析登录 shell 环境、在选择服务端口之前
  预热同一套 Central 监视器/运行时初始化、await `createServer`（它为底层嵌入方幂等地强制运行时
  引导），并写出 `listening on` 信息行（见 `submodule-server-log`）。它的 SIGINT/SIGTERM 处理器
  在进程退出之前 await 同一个 shutdown。结算会中止流式会话并做有界等待，好让 pi 持久化它们的
  "Operation aborted" 工具结果、让对话记录成对落地，除了一个阻塞在 `ask_user_question` 上的
  会话：关停有意让该调用悬着，而下一次挂载把它修复成一个可作答的 ack；显式的用户 Stop 仍是终态
  中止路径）；`handlers.ts`（WS 方法→处理器注册表，类型为
  `WsHandlers = { [M in WsMethodName]: WsHandler<M> }`，所以缺失、多余或类型错配的处理器会失败
  typecheck；`handleRequest` 在派发时一次性把线上协议的 `unknown` 参数收窄，而参数在运行时不做
  形状校验。注册表包含 `workspace.rename`，作为进入 `renameWorkspace(id, name)` 的直接手动之门
  （没有 `branch` 选项）—— workspaces 模块只改展示标签、持久化并发布它，所以该处理器绝不改动 Git、
  也不单独向某个客户端 emit 或打补丁。宿主的 `resolveNewChatModel` 把 AppConfig 设置与 agent 已
  结算的可用模型列表以及 Pi 的思考夹取组合起来；`model.default`、`session.create` 以及新建的评审
  聊天共享那个解析器，而创建会显式传入它的模型与力度。一个**点名**了模型的 `session.create` 以及
  每一次 `session.setModel` 还会通过 `settings` 的 `noteRecentModel` 把解析出的模型记为最近使用
  —— 一次默认解析出来的创建是宿主的选择，不是用户的选择，因此不记录。
  `model.contextSettings` 与 `model.setContextWindow` 委托给 agent 的 `modelContext` 适配器，并
  返回它的 `ModelContextSetting[]`；该变更点名一个 提供商/模型 目标或所有合格对，绝不是任意模型
  元数据，而成功保存复用 `provider.changed` 来
  在客户端之间使目录失效。已有的评审聊天与计划评审子代理保留它们自己的策略 —— 以及
  **Skills 管理器那一组**：`skill.list` / `skills.state` / `project.skills` 从 `projects` 构建
  准入上下文（工作区作用域时再加上该工作区的 `skillOverrides`），并把它传进 agent 的
  `listSkillCommands`/`listSkillCatalog`；**MCP 那一组**（`mcp.*`、`host/mcp.ts`）把 `agent` 的
  MCP 服务与 `projects`（批准、override、pi 级信任）组合起来，并发布 `mcp.status` 快照（该主题只
  被处于 `MCP_PROTOCOL_VERSION` 或更晚的客户端订阅）加上 `session.resourcesChanged` 失效。每个
  请求都会解析它的工作区以及该工作区的项目。管理类变更与探测在异步归属解析之后重读两者，随后在
  同一个同步调用栈里检查归属并准入工作。一个变化的项目身份、cwd 或 pi 级信任会拒绝该请求让客户端
  重试；批准与 override 来自最新记录，而不是 await 之前的快照。项目 override 补丁原子地合并到最新
  存储的 override 之上。线上启用开关必须是布尔值，而记录的暴露必须是 `deferred`、`direct` 或
  `hidden`；非法值在记录或按聊天的禁用集变更之前就被拒绝。没有任何写入会批准用户未审阅过的仓库
  内容：一个项目文件里的 `mcp.add`（该文件尚未定义的名字）是用户自己的条目，所以它的指纹在同一次
  请求里就被批准；`mcp.update` 与 `mcp.remove` 在与写入同一个同步步骤里，从该作用域自己的文件里
  （user 作用域是全局 `mcp.json`，project 作用域是工作树的 `.pi/mcp.json`）读取磁盘条目的
  指纹，并在请求的 `expectedFingerprint` 与之不同时拒绝、文件不动（任一作用域下缺失指纹都被拒绝）；
  `mcp.update` 只有当记录批准过那个磁盘指纹时，才把批准带到写入后的指纹上 —— 对一个 pending 或已
  变更条目的重写仍保持 pending（一个从检出里的新条目重建出来的开关绝不能批准它）；一个从仓库来的
  编辑仍保持 pending；`mcp.approve` 拒绝一个不再是磁盘上那个的指纹；`mcp.shareWithRepo` 在该项目
  文件已定义该名字、或持有一个未在其当前指纹上获批的 override 时拒绝，否则把记录里的 override 写为
  pi 的 override 条目、批准它并清掉记录里的副本。在一次变更之后，受影响的活会话（user 文件是全部，
  项目文件与记录变更是该项目的）被协调 —— 只有那些生效配置变了的重载，且要过门禁。协调是启动的，
  不被 await（失败会被记日志）：agent 一个接一个地重载空闲聊天，所以请求立刻用新鲜的列表作答，而
  `mcp.status` 推送会报告每一次重载。`createServer` 启动 agent 的 `watchUserMcpConfig`（随服务器
  一起停止），并在一个工作区的变更推动触及 `.pi` 或被打断时协调它的活聊天。按聊天的调用
  （`setSessionOverride`、`reconnect`）要求该会话属于被点名的工作区；`mcp.reconnect` 运行 agent 的
  `reconnectMcpServer`（pi 的通知不进聊天；pi 的失败被遮蔽后是该请求的错误）并无论如何都刷新那个
  聊天的状态；`mcp.readOutput` 只对那个工作区的一个会话读取 agent 的 `readMcpToolOutput`；
  `mcp.readLog` 解析工作区、按 pi 的字符集检查名字，并返回 agent 的 `readMcpServerLog`（pi 每个
  agent 目录保留一份 `mcp.log`，所以它不需要会话）；
  `mcp.login` / `mcp.testConnection` 用调用方的 `clientKey` 作为所有者启动 agent 的探测，并返回
  它的 `loginId`（`mcp.logout` await 该探测）。探测准入从 agent 的宿主配置加载器解析出在当前信任与
  策略下有效生效的服务器；缺失或非法目标被拒绝，而 Test connection 要求那份已准入配置是 HTTP。
  一个已批准但非法的项目条目，绝不因为它的摘要看起来已批准就遮蔽一个有效的用户目标。三者都在
  `mcp.list` 会报告 `handledElsewhere` 的地方以 `MCP_HANDLED_ELSEWHERE` 拒绝（探测的加载器强制
  `builtin:mcp`）；`provider.loginReply` / `provider.loginCancel` 把 `mcplogin_*` id 连同调用方的
  `clientKey` 路由到该探测，而 `createServer` 只把探测帧发到所有者的 socket，在一个客户端的保留
  定时器最终回收它时取消它的探测（`cancelMcpProbesOwnedBy`，在 `releaseInterview` 旁边；绝不在一
  次单纯的 socket 关闭时 —— 窗口内的一次重连会保住该 key 及其登录）并在停止时取消每一个探测 ——
  `mcp.login` / `mcp.testConnection` 的推送只发往发起的那条连接（`ws.send`，不是广播主题），而外来
  回复以 `LOGIN_NOT_OWNER` 失败；`session.list` 用每个会话的 `openTodos: countOpenTodos(…)` 装饰
  agent 的 `listSessions` 摘要（一个仅宿主的 `agent` + `todos` 组合 —— `agent` 保持无 todos 依赖；
  一次计数失败会省略该字段，绝不失败整个列表）；**`todo.requestFix`** 是同一类组合（`todos` 记录，
  再加上渲染修复包，`agent` 交付）：该包被**分离**触发进该事项自己的聊天，作为一条**结构化的
  `todo-review-fix` 自定义消息** —— `sendReviewFixToSession`（`fireTodoFixPrompt`），它调用
  `AgentSession.sendCustomMessage`，把渲染好的包文本作为 `content`（agent 读到的内容）、把
  `ReviewFixDetails`（`buildReviewFixDetails`：事项 id/标题、反馈备注，以及精简的、路径/行号已解析
  的发现项）作为 `details`（聊天卡片渲染的内容），`deliverAs: "followUp"` + `triggerTurn` ——
  **而不是**一个合成的用户轮次（#363）。像旧的 `followUpSession` 路径一样包在 `ackSend` 里，所以
  一次轮次前拒绝会回滚评审记录（`rollbackTodoFix`）并作为扩展 UI 通知浮现，于是一个未交付的修复
  请求绝不会搁成 `changes_requested`。
  手动修复包**携带该事项未解决的 agent 发现项**，与自动周期完全一样
  （`itemFixFindings` —— 该事项按 `origin` 限定的、非陈旧的 agent 撰写草稿，`markCommentsSent` +
  在 `withReviewLock` 下的 `buildSendPackage`）：在自动修复关闭时，裁决路径什么都不发，所以没有
  这一手，工作者永远看不到评审者的发现项，它们会在之后一次 approve 之下搁成草稿。包渲染发生在这些
  发现项被标记为已发送之前；每一次准备失败都会做身份核对，并恰好回滚本请求写下的那条
  `changes_requested` 记录，加上任何标记，所以它既不搁浅一个失败的请求，也不覆盖一个更新的决定。
  同样的身份安全补偿在分离的轮次前拒绝上运行；
  一次手动或自动修复在其第一个 await 之前认领一个内存中的按事项闩锁（`claimItemFix`），并在包准备
  与修复发送的接受/失败整个过程中持有它，所以重叠的手动发送会被拒绝。
  `isItemUnderActiveReview(sessionId, id)` 把那把闩锁与 `planReviewQueue` 的活跃集一起呈现给任何
  需要知道某个事项是否有评审在途的调用方。
  **`todo.startReview` / `todo.reviewAll` + `host/requestReview.ts`** 组合出 agent 评审者。一个计划
  步骤由计划会话的一个**隐藏、短暂存在的委派子项**评审（`agent` 的 `runReviewSubagent`），携带
  我们的评审者角色 —— `host/reviewerRole.ts` 拥有系统提示词、只读工具集与围栏 JSON 输出契约；
  `todos` 渲染的评审包只是一份改动集**引用**，且绝不点名工具。子项返回最终文本，宿主解析结构化
  裁决（`parseVerdict`，对发现项宽松、对裁决词严格）并拥有每一次状态迁移。没有评审者聊天，没有
  评审者撰写的工具（`review_verdict` / `add_review_comment` / `reflect_finding` 随之消失），因此
  没有评审者会话来监视、注册或解卡 —— 那些所需的一整套崩溃恢复面坍缩成那个被 await 的 promise：
  一个出错、被中止或返回不可解析文本的子项会 reject，而 `catch` 当场清除该事项的 `reviewing`
  标记（`cancelTodoReview`）。
  **两个入口，一条记录路径。** 工作者自己的 `request_review` 工具（`handleRequestReview`）await
  裁决并把它作为工具结果返回 —— 工作者读 `composeText` 并就地修复。Start review / Review All 按钮
  （`startPlanReview`）**同步**把该事项标记为 `reviewing`（所以面板在客户端重读计划的那一刻就显示
  脉动）并通过记录 + Review 标签页交付结果。**两者**都在计划的串行链上运行评审主体
  （`planReviewQueue.onPlanChain` —— 按钮路径即发即忘，工具路径被 await），所以一个工具请求绝不会
  与同一计划上另一步骤的按钮评审重叠。两者都汇入 `recordVerdict`：`approve` 结算该事项
  （`approveTodoReview(…, "agent")`）；`request_changes` 把每条发现项提交进 Review 标签页
  （`fileFinding` —— 当 `reviews.anchorProblem` 接受该位置时是一条内联评论，否则是评审级评论；
  锚点解析是尽力而为的，所以一个坏锚点会回退成评审级评论，但一次存储写入失败会传播出去并取消这次
  评审，而不是静默丢掉发现项却仍然花掉那个周期），然后花掉修复预算。
  **一周期上限在两条路径上是同一个。** `canAutoFix = reviewAutoFix !== false && spent < 1`
  （`todoReviewAutoCycles`），而记录写成 `autoCycles: canAutoFix ? 1 : 2` —— `1` 意味着"工作者
  确实被要求去修复，这个事项正处在周期中"，`2` 是终态（"现在由人来定"）。在没让任何人去修复的
  情况下记录 `1` 会让该事项搁浅：`maybeAutoReReview` 的触发读的正是那个值，而没有任何东西会产出
  它等待的那份新增量。**只有工作者接受了修复，一个周期才算被花掉。** 在按钮路径上
  `deliverFixToWorker` 拥有整个临界区 —— 提交发现项、记录乐观的周期 `1`、挑选并把它们标记为
  `sent`、然后发送 —— 提交到标记这一段在一次 `withReviewLock` 持有中，所以没有交错的 Review 发送
  能在预留之前抢走刚提交的草稿。失败按提交是否完成来分叉：一次*提交*失败会在任何记录之前抛出，
  所以评审取消（`fileFindings` 已补偿它的部分持久化），而任何*提交之后*的失败 —— 一次发送拒绝
  （工作者已分离、忙、轮次前拒绝）**或任何准备失败**（快照/包/标记）—— 会在乐观的 `1` 之上把该
  事项终态重记（`autoCycles: 2`），并与把任何已标记的发现项退回 `draft` 的 `rollbackSend` 一起。
  一次作为抛出逃逸的提交后失败会把事项搁在 `autoCycles: 1` —— 那正是这个统一 catch 的全部意义。
  把 `1` 留在那里会永远搁浅该步骤：没有任何东西要求工作者改变任何事，所以没有新增量能到达
  `maybeAutoReReview`，而之后的一次手动评审会把该周期读作已用掉并拒绝发送。一次被修复闩锁拒绝的
  认领（一次手动的 Ask-to-fix 已在进行中）以同样的方式结算。在按钮路径上，一个还活着的预算还会
  **把修复交付给工作者聊天**（`deliverFixToWorker`）：该事项的按来源限定的草稿发现项
  （`itemFixFindings` —— 这个事项、这个工作者会话、非陈旧；一次未限定范围的清扫会把其他步骤的
  发现项带进这个工作者，并把它们搁成假已发送）用 `renderFixPackage` + `buildSendPackage` 渲染，
  并作为结构化的 `todo-review-fix` 消息在 `ackSend` 之下发送，而 `rollbackSend` 在一次轮次前拒绝
  时把它们退回 `draft`。工具路径从不发送 —— 工作者已经在其工具结果里拿到了裁决，再以消息发一份
  副本等于把指令翻倍。在预算已花掉或自动修复关闭时，两条路径都把发现项留在 Review 标签页里给用户，
  并这么说明（`composeText`）。
  **每个计划同时只有一次评审**（`host/planReviewQueue.ts`）：`onPlanChain` 把每次运行串到该计划的
  promise 上 —— `enqueuePlanReview` 为分离的按钮路径用它，`handleRequestReview` 为工具路径 await
  它 —— 所以 Review All 启动 N 个步骤但串行运行它们，而一个工具请求会排在一个在途的、针对另一步骤
  的按钮评审之后。N 条并发提供商流正是这条链存在要防止的。同一个模块持有两个入口都会检查的按事项
  认领，所以一个已在评审中的步骤会被拒绝，而不是被评审两次、两份裁决争着落到同一条记录上。
  `todo.reviewAll` 报告 `{ total }` —— 它实际启动的数量 —— 以及 `alreadyRunning`，仅当它什么都没
  启动而该计划的链仍然忙时。该模块是纯机械，配一个注入的运行器（没有 agent 依赖），`planReview.test.ts`
  也正是这样在没有提供商的情况下驱动整条 裁决 → 记录 → 交付 路径。
  **自动重评审**（`maybeAutoReReview`，从 `isTodoToolEnd` 上的协调钩子分流出来）：在一次修复落地、
  工作者把该步骤重新标记为完成之后，恰好那些仍在它们那一个自动周期内的事项（`autoCycles === 1`、
  不在 `reviewing`、`status: "done"`）会被重评审。触发条件接受 `changes_requested` 记录上的一份
  新提交增量，**或者**一份被重置为 `unreviewed` 的记录 —— 后者是路径列表回退
  （`todos/artifacts.ts` 在重做无法被提交时丢掉记录），那里一个幸存下来的已用尽周期本身就是
  "一次修复落地了"的信号，因为没有 sha 可作为水位线。一个合格事项**即使在另一次评审已在运行时
  也会被入队到该计划的串行链上**（一次修复落地的同时 Review All 正在评审另一步骤），而按事项的
  认领负责去重 —— 它绝不能在链忙时被丢掉，否则一个在评审中途被修好的步骤会永远停在
  `autoCycles: 1` 的 `changes_requested` 上，因为链一旦排空就没有东西会重试。
  **一次 `approve` 绝不结算一个仍有未解决发现项的事项。** 一次修复周期的两轮是彼此独立的运行，
  所以没有任何结构性的东西把第 2 轮的 approve 与第 1 轮的发现项连起来：这道门是显式的，
  `itemOpenFindings` 在 `approveTodoReview` 之前被检查。它的集合刻意比修复候选**更宽** ——
  `itemFixFindings` 只含 `draft`（一条 `sent` 的发现项绝不能搭乘第二次修复请求），而评审模型把
  **`draft` 与 `sent` 都**算作未解决，因为一个修好了代码却没调用 `resolve_comment` 的工作者留下了
  未解决的发现项。没有这道门，计划会读作可以发布，Open PR 会为一条 Review 面板仍显示为阻塞的评论
  亮起来。**反面同样成立，一个 `changes_requested` 裁决不得比它的发现项活得更久：** 两条关闭一条
  发现项的人工路径都经 `clearChangesRequestedIfResolved` 协调 —— `review.commentDelete`（删除）
  与 `review.commentUpdate`（解决/忽略）。当被关闭的发现项是该事项**最后一条**未解决的
  （`itemOpenFindings` 为空）且该事项仍是 `changes_requested` 时，它的裁决记录被丢回 `unreviewed`
  （`dropTodoReviewVerdict`）—— 只丢记录：一次在途评审的 pending 标记（它的起始 SHA 水位线）与
  自动周期计数都留着，所以评审/修复中途关闭最后一条发现项既不会把评审者从未见过的提交设为水位线，
  也不会重置那个一周期上限；只要任何发现项仍未解决，这道检查就是空操作，所以一个从来没有内联
  发现项的整个改动集裁决永远不会被动到。agent 的 `resolve_comment` 路径（`applyAgentResolution`）
  有意**不**在这里协调 —— 它落在一个修复周期之内，而随后的重评审会重新推导出裁决，且记录在两种
  情况下都是惰性的（Open-PR 门禁数的是未解决发现项，不是记录）。计划的评审装饰是从那条记录由
  宿主派生的，而 `apps/web` 的 `useChatTodos` 在任何评审快照变化时重读计划。一次被挡住的 approve
  会清除 `reviewing` 标记、不动记录、告诉工作者去 `resolve_comment` 它处理过的东西
  （`composeText` 的第三种形状），并作为 `PlanReviewResult.blockedByOpenFindings` 搭线上协议，
  好让卡片无法声称该步骤已完成。`resolve_comment`
  仍是**工作者**的工具 —— `reviews.applyAgentResolution` 只解决一条 `sent` 评论，且仅当
  调用会话等于 `markCommentsSent` 记录它被交付到的那个聊天；
  `project.trustSummary` 从 agent 的 `projectTrustSummary(project.path)` 回答信任提示；
  `project.setTrust` 在授予别名信任时确认当时在场的别名（agent 的
  `listProjectAliasSkillNames`；对一个已别名受信的项目上的授予 —— 即 pi 级授予 —— 保留已确认集，
  所以此后才到达的别名仍待审阅），设置别名授予，仅当请求携带 `resources: true` 时授予 pi 级信任
  （撤销会同时清掉两者；一个更旧客户端的授予仅限别名），并把该项目的各工作区交给 agent 的
  `applyPiResourceTrust`，好让活聊天重载进新的信任（空闲的现在就重载，忙的在其结算时）；
  `createServer` 在准入解析器旁边接线 `setMcpPolicyResolver`（工作区 → 它项目的 `mcpApprovals` /
  `mcpOverrides`，失败时封闭为无），并注入 agent 的 `piTrustsProjectPath` 作为 projects 的信任种子
  （`setPiTrustSeed`），所以一个新加入的项目从 pi 自己的决定出发；
  `project.acknowledgeSkills` / `project.setSkillEnabled` /
  `project.setGroupEnabled` / `project.aliasSkills` / `workspace.setSkillOverride` 变更/读取持久化的
  开关；`session.reloadResources` 重扫一个运行中的会话 —— 组合留在这里；`agent` 绝不导入它的兄弟。
  `createServer` 还接线 **`setSkillAdmissionResolver`**，把一个会话的 `workspaceId` 映射到它项目的
  信任/已确认/已禁用加上该工作区的 override（失败时封闭），这样 `agent` 能在不导入
  `projects`/`workspaces` 的情况下门禁技能）。兄弟的子代理策略也以同样方式在这里组合：
  `createServer` 接线 `setSubagentsEnabledResolver`，存在显式的 `Workspace.subagentsOverride` 时
  映射它，否则使用 `AppConfig.subagentsEnabled`（未知工作区失败时封闭），settings 发布器在一次携带
  `subagentsEnabled` 的全局更新之后请求 `refreshSubagentTools()` 重新评估所有活会话（同理
  `refreshAgentReviewTool()` 对应 `agentReviewEnabled`，`refreshSubagentConcurrency()` 对应
  `subagentMaxConcurrent`，`refreshExtensionTools()` 对应 `disabledExtensions`）—— 不是每次发布
  之后，因为 `recentModels` 现在每次切换模型都会发布，而每个空闲会话都重建一次工具集纯属空转 ——
  而 `workspace.setSubagentsOverride` 经 `workspaces` 持久化，然后只刷新那个工作区。按聊天的子代理
  上限也以同样的方式组合：`setSubagentConcurrencyResolver` 映射一个有效的
  `Workspace.subagentMaxConcurrentOverride`，否则一个有效的 `AppConfig.subagentMaxConcurrent`，
  否则 contracts 的默认值（`resolveSubagentMaxConcurrent`；未知工作区用全局值 —— 一个上限没有
  失败封闭的含义），而 `workspace.setSubagentMaxConcurrent` 持久化后只调整那个工作区的服务。
  扩展的开关是纯全局的：`setDisabledExtensionsResolver` 把 `AppConfig.disabledExtensions` 作为
  一个集合返回（未知名字是惰性的），而 `extension.list` 用 `extensions` 目录与同一设置做 join 来
  作答 —— 开关本身经 `settings.update` 写入，所以没有扩展写入方法。
  两个权威发布器仍是客户端的收敛路径；宿主到 agent 的刷新改变的是运行时能力，不是前端状态；
  **评审标记是内存加磁盘，且只有磁盘那一半能在重启后存活。** 串行链与按事项的闩锁都在内存里；
  `pending` 标记是一个磁盘 sidecar。`createServer` 在服务器接受连接之前调用一次
  **`reconcilePendingReviewsOnBoot`**：它遍历每个项目的每个工作区，并调用 `todos` 的
  `clearAllPendingReviews(worktreePath)`，后者清扫每个会话的 sidecar 并无条件丢掉每个 `pending`
  条目 —— 安全，因为这个崭新进程里还没有任何东西入队，所以找到的每个标记必然早于它。没有这一手，
  上次关停时仍在途的一次评审会永远转着 `Reviewing…`，而 Review All 会永远跳过该事项（它自己的
  `reviewing !== true` 过滤）；
  `ackSend.ts`（发送-ack 策略 —— 见"必须做对的事"）；`titleTool.ts`（**`set_title` 宿主**，通过
  agent 的 `setTitleToolHost` 安装 —— 只有宿主能做的 `agent` + `workspaces` 组合）。主 agent 给
  东西命名；宿主只强制执行写入策略（旧的那些宿主驱动过程 —— 首词、随后在第一个已结算轮次上用廉价
  模型精修、再后来发送时的廉价模型聊天标题 —— 一直在产出用户想改的名字）：
  - 调用的会话必须是一个活着的受管会话（`getSessionWorkspaceId`）；其他任何东西 —— 例如一个子代理
    子代理子项 —— 得到一个错误结果。
  - `chat_title` → `renameSession(…, { onlyIfUnnamed: true })`。`workspace_name` → 仅当该工作区是
    受管的（不是 `default`/`external`）且未被 `renamed` 时，经 `renameWorkspace(id, name, { branch })`
    （锁住它，把分支移动一次）。没有分支形状的门禁，所以一个更早宿主临时过程留下的未锁定记录仍
    可被命名。
  - 结果文本按目标说明它是被应用了，还是因为已经有名字而保留，这样 agent 会停下。一个带 `branch`
    但没有可用 `workspace_name` 的调用在任何写入之前就被拒绝（否则 slug 会被静默丢掉，而 agent
    还以为自己完成了）。一个没有可用 `workspace_name`、而工作区仍可命名的调用同样被拒绝：一个
    要求 agent"再调一次"的成功结果在实机上被忽略了（Opus 给聊天命名后就继续往下走了），而一次
    调用就让聊天名与工作区名保持一致。第一个名字就是最终名，而手动重命名始终胜出。
  - `workspaceNeedsName(sessionId)` 使用同样的资格规则（受管、未 `renamed`），所以 agent 轮次起点的
    `pending-naming` 提醒与写入策略不会互相矛盾。
  - agent 从未命名的目标保持无名；没有回退。
  - **工作区归档拆除** —— 只有宿主能做的另一种 `agent` + `terminal` + `workspaces` 组合。
    `workspace.remove` **在任何副作用之前就大声拒绝一个 `kind: "default"` 工作区**（该记录的
    `worktreePath` 就是项目文件夹 —— 回收的 `rm -rf` 回退绝不能看到它；UI 把 Remove 藏起来，这道
    守卫是给有 bug/胡作非为的客户端用的）。否则它会收割扎根于该工作树的*一切*（对一个用户所有的
    `kind: "external"` 工作区，是除检出本身之外的一切），但它是**非阻塞的**：它同步做快的部分 ——
    `forgetWorkspace`（丢掉记录 → 立刻从 `workspace.list` 消失）→ `evictSpecIndex`（丢掉规范缓存）
    → `closeWorkspaceTerminals`（杀掉它的 PTY）—— 然后 **ack**，再在**后台**跑慢的回收
    （`archiveTeardown`，即发即忘）：`removeWorkspaceSessions`（中止一个流式轮次、释放活会话，
    **并**清除 pi 为该 cwd 存的磁盘对话记录）→ `reclaimWorktree`（`git worktree remove`；对外部
    工作区是硬空操作）。所以用户从不为 git 子进程 + 会话中止而等待。**次序是守得住的：** 终端
    （同步）与会话（后台，在回收之前）都在目录被删除之前下线，因为它们把它作为 cwd 持有，而该工作区
    的 todo 变更队列在两者之间被结算（`settleChangeArtifacts`）—— 一次在途协调的计划/基线写入落在
    清扫它们的回收之前，绝不落在它之后、进入一个被复活的目录。按契约是尽力而为 —— 一次失败的后台
    拆除会被 warn 记录，绝不扔进虚空（没有东西 await 它）。**归档保留分支但不保留聊天：** git 分支
    留着（代码可恢复），而聊天历史随工作树一起清除 —— 这是一个有意的范围选择，不是泄漏。
- **变更操作按工作区串行化，走在它们自己的链上**（`reviewLock.ts` 的 `createKeyedLock` 造出这两条
  链）：`change.revert`/`change.undo` 在 **`withChangeLock(workspaceId)`** 下运行，所以两次回退不能
  交错它们 加载→校验→写入 的过程，而评审与变更 —— 两种独立的资源 —— 绝不互相排队。agent 被有意
  **不**暂停：`changes` 模块的比较后交换让这场竞态安全，而 fs 监视器的 `fsChanged` 心跳会在一次
  写入之后重读打开的标签页，就与它在一次 agent 编辑之后所做的一样（所以两个处理器都先
  `ensureWatch`）。这些具名失败作为 `WsResponse.errorCode`
  （`STALE_VIEW`/`SCOPE_IMMUTABLE`/`RANGE_INVALID`/`RECEIPT_UNKNOWN`/`UNSUPPORTED_CHANGE`）经由
  `UNKNOWN_COMMIT` 使用的同一个 `CodedError` 映射出去 —— 派发层自己不命名任何码，所以在 `contracts`
  里新增、并由某个特性抛出的码，无需更新任何宿主侧允许清单就能到达客户端。
- **评审状态由宿主组合、并按工作区串行化**（`reviewLock.ts`）：`review.send*` 是 `reviews`（草稿 +
  包）加 `agent`（会话）再加一次 `reviews`（标记已发送 + 关联）—— 一次跨在一个
  `await createSession(…)` 之上的 检查-后-标记，是评审层唯一的非原子缺口。
  **`withReviewLock` 覆盖线上协议暴露的每一次评审变更，不只是发送**，因为有两种不同的东西会落进
  那个缺口：第二次*发送*读到同样的"有草稿、还没有会话"并分叉这次评审，而一次*变更*会让已经建好的
  包失效 —— 一次 `review.close` Clear 落在那里会把包搁浅：标记看到一份新的空评审并把聊天关联到
  *那*，留下 agent 永远无法 `resolve_comment` 的评论 id。每工作区一个队列，所以一次在发送中途发出的
  变更就发生在它之后。
  包的提示词在标记之后**分离**触发，所以锁只持有会话创建，而一次失败的操作会释放它，而不是毒化
  队列。计划评审的裁决路径加入同一把锁：被接受的 guide 持久化以及 `deliverFixToWorker` 的
  提交→记录→挑选→渲染→标记 过程都留在它下面，所以一次 Clear 无法把 guide 与它的发现项分开，一次
  交错的发送也无法在这些阶段之间抢走候选 id。批准在同一把锁下检查未解决发现项并记录；被挡住或
  失败的裁决不替换 guide。有意不加锁的：`review.get`（它的 加载 → 重新锚定 → 持久化 是一次同步
  过程，而水合绝不能排在一次发送之后）—— 加上两个仍完全同步的变更，
  `reviews.resolveCommentFromAgent`（工作者工具接缝）与 `reanchorWorkspace`（fs 监视接缝）：两者
  在写入之前都从磁盘重读快照，且都不删除评论、也不关闭评审，所以落进一次发送的缺口也无法让包里
  的 id 失效。
- **一次评审发送落在屏幕上已有的对话里，否则落在该 key 的聊天。** 两个发送处理器都经由
  `sendToFileChat`：评论按 `reviews.reviewSessionKey` 分组（锚点的路径，或无锚点备注所用的评审级
  桶 —— 像文件一样被钉住，好让第二条整体备注延续同一段讨论），每一组都按优先顺序落进客户端
  **最后打开的聊天**（发送携带的可选 `sessionId` —— 用户已经在其中的那段对话），否则该 key 已钉住
  的聊天（`reviews.fileReviewSession`），否则一个**新**聊天；无论谁收到了这个包，就成为该 key 的
  钉子（`markCommentsSent`），所以侧边栏的"打开讨论"始终跟着评论走。**`review.sendBatch` 以它触及
  的每一个会话作答**，按分组顺序：一个跨两个文件的批量会开两个聊天，而只命名第一个会让另一个在
  无人看见的情况下运行着、而它的评论却已经读作已发送（客户端把它们全部打开，聚焦第一个）。一个
  只是**分离**的已链接聊天被视为存在：它被从持久化对话记录 `agent.ensureSessionAttached` 并往里
  追加。评审状态与 pi 会话都能在宿主重启后存活，所以仅凭活跃性（`hasSession`）把门会让任何没有
  客户端重新打开过的评审聊天拿到*第二个*聊天，并被覆盖链接。只有在该文件从来没有过会话时才创建
  新会话 —— 或者，作为一次显式记录的恢复，当对话记录真的从磁盘上消失时（没有 UI 能关掉一次评审
  并重来，所以把它卡死会更糟）；其他每一次重新打开失败都会抛出，而不是静默分叉那段对话。
- **Scratch 目录播种在聊天启动时：** `session.create` 处理器在创建会话之前调用 `workspaces` 的
  `ensureWorkspaceScratchDir` —— Default 工作区被 gitignore 的 `.thinkrail/context/` 只在一次聊天
  真的在那里启动时才落到用户的仓库里（而一个工作树被删除的 scratch 目录会自愈）。宿主组合 ——
  没有新的模块边。
- **项目生命期扇出：** `createServer` 安装 `projects` 模块的发布器，并把每一份权威的
  打开/重开/关闭快照映射到 **`project.updated`**。WS 的 `open` 处理器订阅该通道，并在
  `server.welcome` 里水合两个视图：`projects`（仅打开的记录）与 `recentProjects`（所有已知记录）。
  这唯一的全快照通道是幂等的，避免了分开的 已打开/已关闭 流乱序重放。每个客户端从它收敛自己的
  侧栏 + 最近列表；只有发起的那次打开流程会选中 Project Home，而关闭的回退仍是逐客户端的视图状态。
- **工作区生命期扇出：** `createServer` 安装 `workspaces` 模块的发布器
  （`setWorkspacePublisher`），把每个领域事件的 `kind` 映射到它的 `WS_CHANNELS.workspace*` 通道
  （`created`/`updated` → 完整记录；`removed` → `{ projectId, id }`）并 `server.publish` 它。这是
  工作区成员关系变更到达线上协议的**唯一**地方 —— 创建/重命名/归档全都流经它，所以每个客户端
  （包括发起方）都靠响应来收敛，绝不靠逐客户端的乐观。这两个新通道在 WS 的 `open` 处理器里与
  `workspace.updated` 一起被 `ws.subscribe`。
- **会话删除扇出：** `createServer` 安装 agent 模块的删除发布器，并把每个工作区作用域的
  `SessionDeletedPayload` 在 `session.deleted` 上广播；WS 的 `open` 处理器为每个客户端订阅，所以
  永久的领域删除会在发起页面之外收敛。它仍是一个低延迟事件，而不是一个持久队列：一个重连客户端
  对其活跃工作区的 `session.list` 才是它在 socket 掉线期间错过的事件在读取侧的权威修复。
- **聊天资源：** 作用域资源读取、命令输出/停止与直接子级停止/全部停止这些处理器，在解析工作区
  成员关系并把 id 加上注册表拥有的 cwd 传给 agent barrel 之前，强制每个请求的确切键集。父/子 id
  遵循 Pi 的规范会话语法（含内部点号）；工作区与命令 id 保留各自所有者专属的语法与权威。缺失的
  父级/资源使用 `RESOURCE_UNAVAILABLE`；输出对缺失命令的结果为 `available:false`，且仅在校验过
  其父级之后。不接受任何客户端提供的路径/PID 字段。agent 的资源发布器映射到
  `session.resourcesChanged`，在 WS 的 open 处理器里订阅；这是一次目录失效，绝不是一次输出广播。
  资源的所有权与拆除留在 agent。
- **会话状态组合：** 在开始服务之前，宿主为每个工作区提供 `{id,cwd}`，初始化生命期/回执元数据，
  并安装 工作区→项目 解析器。`session.stateList` 返回完整的全工作区快照；`session.state` 广播
  完整记录；完成确认与推动处理器通过同一个注册表校验工作区/会话身份。WS 的 open 处理器在 welcome
  之后为每个客户端订阅。`session.activityList` 在一个窗口期内仍是一个惰性的 `[]` 兼容方法，且没有
  推送通道。
- **CLI 更新生命期：** 启动器可以提供可选的一个异步通知生产者、固定间隔，以及一个无参的更新运行器。
  `createServer` 在监听之后启动检查且不 await 它们，并且绝不重叠检查。一个更新的版本会在之后的
  welcome 里成为被保留的 `available` 快照。v70 的 `host.update` 请求在启动一次分离的、服务端
  single-flight 的运行之后即 ack；running、succeeded 与 failed 都是对每个客户端的
  `host.updateAvailable` 的完整替换。成功会闩住直到宿主重启，且不关闭、也不重启那个无人监督的
  进程；失败允许重试，且不暴露任何子进程输出或任意诊断。发现失败会保留已知状态，关停会让迟到的
  结果变成惰性的，而宿主从不知道 feed、安装器、命令、路径、通道或版本的选择。
- **面谈邀请投递：** 三个用户发送处理器共享一条 `ackSend` 之后的路径，它一次性过滤控制流量、追踪
  匿名 `message_sent`，并记录本地反馈计数。feedback 模块注入的发布器把一个合格认领映射为该请求
  不透明客户端键的、被寻址的 `feedback.interview` 投递，且仅当该 socket 宣告的协议版本支持该通道
  时；投递失败或重连宽限期后的客户端最终回收会释放该认领，而一次瞬态重连会保留它并在
  `server.welcome` 之后重新投递。宿主重启没有认领可重新投递，而 welcome 会清除前端那份陈旧的弹窗
  投影。弹窗的 `feedback.respond` 动作是普通的、重放安全的请求，绝不改动 Settings 链接。
- **聊天标题：** `session.rename` 把 `workspaceId` 解析成它的 cwd，并把标题校验加上无条件的持久化
  写入委托给 `agent`；它绝不直接去补丁某一个客户端。自动标题只来自 agent 的 `set_title`（上面）；
  发送不携带任何命名工作。手动与自动写入都通过既有的 `pi.event`/`session_info_changed` 通道与
  `session.list` 修复让每个客户端收敛；不存在新的推送通道。

`RunningServer.startAttributionClaim()` 是显式的启动器就绪信号，并在进入分析归因之前重新检查已
保存的 启用/已确认 选择。

- **Public surface（公开接口，barrel）：** `createServer`, `CreateServerOptions`, `RunningServer`, `bootHost`,
  `BootHostOptions`, `BootedHost`, `BuildKind`.
- **允许的依赖：** `contracts`（`PROTOCOL_VERSION`、各特性引入版本、`WS_CHANNELS`）；`shared`
  （`freePort`、`shellEnv` —— 供 `boot.ts` 用；`codedError`）；`persistence`（`dataDir` ——
  `crashLog.ts` 写入处）；`pi-todos/core`（精简的同步任务快照，分组状态仍归 core 所有）；它所组合的
  各特性模块（按父依赖图，含 `fs` 的 `resolveWorktreeFile`/`resourceMeta` 以及 `git` 的
  `readBlobStreamAtAsync`，供 `/files` 与 `/blob` 路由用）；Bun/Node。
- **绝不触碰：** 被任何特性模块导入；导入 `web`/`cli`/`desktop`。

- **归属生命期接线（`settledLifecycle.ts`）。** 宿主是三个活动来源与 `workspaces` 写入者相遇的地方：规范化的
  会话状态发布器在一条记录报告 `execution: "running"` 时盖上
  `recordWorkspaceActivity(record.workspaceId)`（一次用户提示词会翻转它，所以用户轮次与 agent 轮次都
  算 —— 而写入者每分钟一次的合并让一个流式 agent 很便宜），一次被接受的 `terminal.write` 盖上所属
  工作区（一次被顶替/空操作的写入不会），而 repo-metadata 回调调用 `recordWorkspaceHead`，并把
  `watch` 的监视启动推动接到 `seedWorkspaceHead`，于是首次接纳做播种、监视器重建能发现一次在无人
  监视时发生的 HEAD 移动。读取一个结果、选择一个工作区，或打开文件绝不盖章 ——"看不是干活"是用户
  可见的规则。`workspace.settle` / `workspace.unsettle` 是模块之上的薄处理器；结算绝不碰磁盘，而
  `workspace.remove` 仍是唯一的拆除入口。启动 `pr.open` 本身在其第一个 await 之前就盖上活动章
  （打开一个 PR 就是干活，所以它重新激活一行被搁置的记录），并把任何返回的 PR 持久化在 `openPr`
  报告的那个确切的脏读后分支上（然后从线上协议上剥掉那个仅宿主的上下文），所以在这次变更期间发生的
  一次外部检出切换既不会丢掉、也不会挂错创建出来的 PR；接受一次按钮/自动计划评审也会同步盖上活动章。
  **评审刷新：** 在一次 `workspace.list` 回复之后以及每五分钟的定时器上，宿主刷新那些其 PR 状态仍
  可能改变分区的行的 `review` 快照 —— 活行在每一趟都刷，**空闲已结算的行最多每 30 分钟**刷一次
  （一个从 ThinkRail 之外为休眠分支打开的 PR 仍必须把它带回来，但休眠分支是长尾、必须保持廉价），
  而被用户搁置的行（override 无论如何都胜出）或一个终态时间有效的已合并/已关闭快照则从不刷新
  （一个不完整的已结算答案保持为活且可刷新；一次重新打开的完整评审会在激活时被捕获）—— 有界到少量
  并发提供商调用，并搭乘该模块的 60 s 缓存。空闲刷新的节奏是分支感知的，所以切换分支绝不会继承旧
  分支的 30 分钟延迟；为活跃工作区做一次新的 `workspace.openReview` 也会写入该快照，所以活跃行始终
  是当前的。两个写入者都传入那次查找所针对的分支，而 `workspaces` 会丢弃一个其分支已在其脚下移动的
  答案。**协议偏斜：** `RequestContext.protocolVersion` 是该 socket 宣告的协议（对进程内调用方缺失，
  他们说的是当前协议）；`workspace.openReview` 对早于 `WORKSPACE_SETTLE_PROTOCOL_VERSION` 的客户端
  为一个已合并或已关闭的评审回答 `null`，因为这样的客户端把任何评审都读成打开的 PR，它的计划面板就
  会提供一个会创建新 PR 的*推送更新* —— 宿主快照本身仍记录真实状态。**回填：** 同一趟列表之后的
  处理会给没有 `lastActiveAt` 的记录一个来自最新聊天的 `updatedAt` 的章（`listSessions`），否则取该
  工作树的 `.git` gitfile mtime（受管与外部工作树都一样 —— 只有 Default 行，其 `.git` 就是仓库
  本身，跳过到当前时刻），经由 `backfillWorkspaceActivity` —— 每条记录一次，因为此后该章就存在了。
  逐行的回填/评审失败会被记日志，而分离的列表/定时器过程总会捕获它们自己的终态 rejection；生命期
  维护可以降级，但绝不能变成一个未处理的宿主致命 promise。

## 必须做对的事

- 每个已注册的 WS 命令都**只按方法名**做调试追踪（`ws <method>` / `ws <method>
  failed`）；一个不在封闭处理器注册表里的名字，则被追踪为固定的 `ws unknown method`。
  绝不追踪原始的未注册方法名、参数或处理器错误文本，它们可能反映凭据与用户提供的值；见
  `submodule-server-log` 的隐私规则。
- WS 命令直接返回值；只有事件 + 扩展 UI + **`project.updated`**（从 `projects` 模块注入的发布器
  发布）+ 工作区生命期三件套（`workspace.created`/`updated`/`removed`，从 `workspaces` 模块注入的
  发布器发布）+ **`session.deleted`**（从 agent 模块注入的发布器发布）+ **`provider.changed`**
  （从 auth 的 Central/运行时失效接缝发布）+ **`host.updateAvailable`**（在每个保留的 CLI 更新生命
  期替换时发布）使用推送通道。每一个客户端应当听到的**广播**推送通道都必须在 WS 的 `open` 处理器
  里被 `ws.subscribe` —— 在一个未被订阅的主题上发布，会静默地无人收到。有四个通道被有意**不**订阅、
  也不广播：`feedback.interview`、`terminal.data`、`terminal.exit` 与 `terminal.detached`，它们用
  `ws.send` 发给唯一一个被寻址的客户端。新增一个被寻址的通道意味着接线一个发布器，而不是一个订阅。
- **终端背压绝不单靠 `drain` 事件。** 一次被背压的 `ws.send` 会把该客户端闩进
  `terminalBackpressured` 并阻塞它的批处理器，而批处理器有意只在 `resume()` 时重试 —— 所以闩锁的
  解除必须是有保证的。Bun 的 `drain` 是快路径，但一次在一次系统睡眠中丢失的 drain（在 macOS 休眠
  之后被观察到）会让闩锁永远置位：标签页冻住、pty 还活着、录制器仍是当前的。一个 1s 的调和器去问
  socket 自己：在标志置位的情况下，`getBufferedAmount() === 0` 就意味着那次 OS 从未送达的 drain
  （`terminalSend.ts` 里的 `drainedClientKeys`），于是宿主解除闩锁并恢复该客户端的终端。一个还有
  缓冲字节的 socket 保持闩住，而一个 socket 已消失的闩锁交给 `close`/`open` 处理。重载客户端总是能
  恢复（open 清除标志并恢复），这正是它藏了这么久的原因。
- 宿主是各特性被接线到一起的唯一地方 —— 特性绝不反过来伸手进它。
- **登录 shell 环境的导入在启动时是可选加入的**（`resolveShellEnv: true`，由 dev、CLI 与桌面启动器
  传入）。事后复盘：默认打开它时，`boot.test.ts` 把开发者的登录环境 —— 包括提供商 API key —— 复制
  进了共享的 `bun test` 进程（`bun test` 会丢掉 `TERM=dumb`，所以终端守卫从未触发）。之后假模型套件
  于是解析出一个真实提供商，超时，并在真实花钱的同时把服务端套件挂死。任何不传该标志的嵌入方或
  测试都保留它被给到的环境。
- 独立的宿主进程之间不协调可变状态或事件。它们可以共用同一个数据目录，但各自拥有独立的内存会话、
  终端、监视器与已连接客户端；持久化冲突被接受，而不是由宿主串行化。
- `shutdown()` 在并发的 signal/原生退出调用下是安全的：调用方拿到同一个 promise，生命周期工作只跑
  一次，而资源释放仍排在会话结算与轮次回执排空之后。
- **一次发送（prompt/steer/followUp/answerQuestion）在被接受时就 ack，而不是在轮次结束时**
  （`ackSend`）：pi 的发送方法只在轮次结束时 resolve，而一个轮次可能比客户端的请求超时活得更久
  （长工具轮次与数分钟的推理轮次都是常态）—— await 完成会在一个健康的轮次上报出一个幻影的
  "request timed out"。ack 窗口内的拒绝仍会让请求失败（坏模型 / 缺失 key；对 `answerQuestion`
  还有未知/已回答/已被取代的调用 —— `assessAnswerability` 那些大声的裁决）；之后的故障经由事件流
  到达客户端。

### 漂移与覆盖

一条发现项锚定到 `side:"worktree"`（那个活文件 —— 它随代码内联）。当某个*更晚*的计划步骤覆盖
了被评审的行，`reanchor` 把它降级为 `outdated`（`reviews.ts` reanchor），但 `maybeAutoReReview` 的
触发条件是 SHA 水位线的增长，或者（路径列表回退的等价物，没有 sha 可作为水位线）记录读作
`unreviewed` 而一个已用尽的自动周期仍留在记录上 —— 见 `todos/SPEC.md` 的自动周期持久性。
**派生出的 `stale`** 条件守着这一点 —— `anchorState === "outdated"` 且该发现项的 origin sha 在其
步骤上已被取代（`todos.reviewedShaSuperseded`）。每条 agent 发现项都携带 `origin`（步骤 + 会话 +
被评审的 sha，由 `fileFinding` 从裁决所属的那次评审盖印）；`isFindingStale` 把陈旧的发现项从自动
修复集中剔除。客户端徽标搭乘一个**服务端派生、非持久化的 `stale` 标志**：`markClientStale` 富化
每一个跨到客户端的快照（`review.get` + `review.changed` 广播）—— 宿主是唯一能这么做的环，因为
陈旧性把一条发现项的 `origin`（reviews）与它步骤的提交（todos）连接起来。`stale` 从不是持久化
字段。

保留*原始*被评审的代码曾被考虑并否决：事后从 `reviewedSha` 重建它并不可靠（该发现项的 textQuote
来自添加时的工作树，而那并不保证等于那个 blob），而在添加时做快照则是真实的存储成本换低价值
（一条代码已被覆盖的发现项通常已经没有意义；它的文字正文无论如何都会存活）。若真的需要，唯一
可靠的路线是添加时快照，绝不是漂移时冻结。

### 持久化增量（整个阶段）

一个可选的持久化 `ReviewComment` 字段承载发现项来源：`origin?: { todoId, reviewedSha,
sessionId }` —— **已落地**。线上协议的 `stale?: boolean` 由宿主按客户端快照派生，从不存储。
没有新的工具参数，没有新的 `status`/`anchorState` 枚举值。
