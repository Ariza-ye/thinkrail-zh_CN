---
id: submodule-web-transport
type: submodule-design
status: active
title: transport — 通往宿主的 WS 客户端
parent: module-web
depends-on: [module-contracts]
---

## 职责

通往宿主的唯一 WebSocket 客户端、它的应用级单例，以及有序的投递边界——它批处理高频率 Pi 事件，同时不允许后续
的线上协议消息超越它们。

## 边界

- **拥有：** `transport.ts`（`WsTransport`：按 id 关联的 `request`——回复在 60s 后超时，除非调用方提高
  `timeoutMs`，而一个宿主*只有等人来了才*回答的请求必须这么做（一个打开文件夹对话框：一次已触发的超时也会
  丢掉随后到达的那条回复）——，它附加到套接字 URL 上的 **`?client=` 页面身份**与 **`?protocol=` 当前线上
  协议版本**（身份是惰性铸造的，且*不*经由仅安全上下文可用的 `crypto.randomUUID`，这样纯 http 的远程源仍能
  启动；它跨越重连但不跨越重新加载，既用于关联重放的请求，也用于终端流路由，而宿主拥有的 PTY 标签页/shell
  得以存活、重新加载的页面凭持久 `tabKey` 接管它们；该版本让较新的宿主能够避免为独立交付、无法渲染某个定向
  特性的旧客户端认领该特性），**重连安全的未解析请求**——一个在其套接字死亡时仍在途的帧会回到队列并以同一
  个请求 id 重放，而宿主对 `(clientKey, requestId)` 去重，因此一个已被接受的改动不会变成假失败或被
  执行两次——，以及这场交易中本方那一半的两个帧——**`{ ack: [id] }` 回执**（每次响应读取都被确认，在
  microtask 上批处理；在一条回执到达之前，宿主必须假定该回复随套接字一起死亡并保持它可重放）和每次（重）
  连接时在重放*之前*发送的 **`{ resume: [ids] }` 调和**（完整的仍未解析集合，这样宿主会释放其他一切）。
  回执刻意是尽力而为且绝不重传——它可能像响应一样死在套接字缓冲区里，而它所命名的请求早已离开 `pending`，
  因此没有任何东西会重放或重确认它；`resume` 通过重述事实而非确认那些确认，一次性修复全部——，通道
  `subscribe` 对快照带最后值重放；仅追加的终端数据、一次性的终端退出/脱离 + 会话创建/删除 +
  `provider.changed` 失效 + 定向 `feedback.interview` 通道，以及带作用域的
  `session.resourcesChanged` 失效与按会话的 `mcp.status` 快照，从不被缓存，也不向迟到的订阅者重放。资源
  元数据水合属于已挂载的聊天集成，而不是重放的失效载荷。重连/退避；`inferUrl` 默认为同源；
  **`httpBase()`** 从 WS 的 `url` 推导宿主的 HTTP 源——用于构建宿主 HTTP URL，例如 markdown 查看器把相对
  `<img>` 指向的 `/files/<workspaceId>/<path>` 工作树文件端点，目标正是传输层所拨号的同一个宿主）；
  `piEventBatcher.ts`（浏览器侧针对连续 `pi.event` 帧的有界队列：精确的到达顺序、不丢事件、约 30 Hz 的
  一次原子投递、128 事件的强制冲刷上限，以及 `flush`/`dispose` 生命周期）；
  `wireTransport.ts`（`initTransport`/`getTransport` 单例；把 `server.welcome`、
  **`host.updateAvailable`**、**`project.updated`**、`pi.event`、`pi.extensionUi`、**`session.created`**、
  **`session.deleted`**、**`provider.changed`**、定向 **`feedback.interview`**、
  **`workspace.created`/`updated`/`removed` 生命周期三件套，以及 `workspace.fsChanged`** 路由进
  store——并把每次连接迁移都经由 `setStatus` 折叠，其连接世代为活动工作区水合在每次重连时给出一个不同的
  触发器；完整的 welcome（协议 + 打开/最近的项目视图 + 可选配置）经由原子的 `installWelcomeSnapshot`，
  其独立的 `welcomeGeneration` 就是冷导航的就绪边沿；每次 welcome 之后，它用 `includeDiffStats: false`
  重新读取本表面已经持有工作区列表的每个项目，对结果施加世代栅栏，并只通过 `updateWorkspace` 折叠已知的
  行，这样一个断连期间错过的推送式完整工作区快照（包括一次重命名）不会保持陈旧，同时又不把这次元数据修复
  误报为成员关系调和；完整的主机更新生命周期快照经由 `applyHostUpdate`、项目快照经由
  `applyProjectUpdated`、连续 `pi.event` 帧经由批处理器进入一次 `handlePiEvents(payloads)` store 提交、
  `pi.extensionUi` 经由 `applyExtUi(request)`、`workspace.created` 经由 `addWorkspace(workspace)`、
  `workspace.updated` 经由 `updateWorkspace(workspace)`、`workspace.removed` 经由
  `applyWorkspaceRemoved(projectId, id)`、`session.created` 经由 `noteClosedChats`（同伴创建的领域状态
  只进入历史，绝不进入本地放置）、`session.deleted` 经由幂等的
  `deleteChat(workspaceId, sessionId)` 墓碑折叠（一条在线快路径；因为这个事件通道刻意不重放，工作台水合
  会从下一次权威 `session.list` 修复断连期间错过的任何删除）、`provider.changed` 经由原子 store 失效
  `noteProviderChanged()` 外加一次 `model.list` 重读——它经 store 的单调提供商版本守卫安装（模型目录
  hook 在每次列表/刷新时使用同一种受守卫写入，因此较旧的回复无法恢复已移除世代的模型；提供商设置观察同一个
  版本并重读 `provider.status`）——每次有效的 `server.welcome` 先清除宿主重启遗留的任何弹窗投影，然后
  `feedback.interview` 经由幂等的 `showInterviewPrompt()`（仍然存活的宿主认领会直接在 welcome 之后重新
  投递该定向事件）、`workspace.fsChanged` 经由 `noteFsChanged(payload)`、**`mcp.status`** 经由受世代
  守卫的 `applyMcpStatus(snapshot)`，以及 **`settings.changed`** 经由 `applyConfig(config)`——即启动
  之后由服务端同步的应用配置广播；welcome 的配置落在上述原子安装里。

  **会话状态在每次受支持的 welcome 上水合。** `session.stateList` 按连接世代打上 token，并在完整快照
  返回之前缓冲 `session.state` 推送，按到达顺序把这些整记录替换折叠到它们的快照行之上，然后一次性安装产生
  的权威映射。当前世代的失败保留前一个映射，并以封顶的退避重试；有界推送缓冲区溢出时会重新开始完整读取，而
  不是无限制增长，而过期世代的结果会丢弃自己的缓冲区。待定的对话框记录会重放它们确切的请求，而添加/打开一个
  工作区会重新开始受世代守卫的完整读取，以便把既有的磁盘会话包含进来。不支持的宿主会清空该映射。本客户端绝
  不请求旧的 `session.activityList` 墓碑。在 `WsTransport` 派发一次状态推送之前，任何排队的 Pi 事件都会
  同步冲刷，因此运行时对话记录/渲染状态先于引用它的宿主状态；连接状态迁移保持同一道屏障。这道派发屏障保住了
  跨消息的顺序与 store 的对话记录修订栅栏，同时仍然合并连续的流式帧。所有订阅都在 init 时发生一次，绝不在
  组件 effect 里）；
`errorText.ts`（**`errorText(err, fallback?)`**——把一个被拒绝的 `request`（宿主的错误字符串 / 一次超时 /
  一个抛出的非 Error）归一化成一行简短、可展示的文字，用于一个错误轮次/提示；宿主提供的文本保持逐字，而客户端
  编写的回退与超时消息会被本地化）；`requestError.ts`（**`RequestError`** + **`wsErrorCode(err)`**——一个携带
  了宿主命名的 `WsResponse.errorCode` 的拒绝。带 code 的响应会以 `RequestError` 拒绝，其他一切（超时或一个
  未命名的宿主错误）都以普通的 `Error` 拒绝，因此*拥有*一个 code 正是调用方区分「这个特定失败」与「读取失败」
  的方式）；`skillLoad.ts`（session 资源加载的唯一应用集成协调器：按工作区单飞的
  `workspace.watchReady`；除非观察器早已已知就绪，否则先在本地折叠保守的 `skillChange: "unknown"` 通配
  作为可重放安全的回退；之后才捕获 store tick。它那个窄入口 `prewarmWorkspaceSkillLoad` 让工作区导航器在选中
  之前就启动同一份准备，而不重复就绪/回退策略；失败仍可由最终那次加载重试。预热准备在线上协议上有标记
  （`prewarm: true`——宿主把仅预热的观察器放在一个有界、可逐出的池里），且**绝不成为真实加载的基线**：真实加载
  总是运行它自己带真实标记的准备——在观察器仍然温暖时立即得到回答，而在它已被逐出时重建/晋升它（包括一次新的
  保守推送）——因此一个被逐出的预热绝不可能把会话留在一个陈旧的新鲜度基线上，而预热可以自由搭乘任何在途的
  准备，一个已安定的预热会重新签发（在项目重选时重新温暖一个已被逐出的观察器依然很便宜）。随后这些包装发出
  `session.create` / `session.getMessages` / `session.reloadResources`，因此没有任何调用点能意外颠倒就绪与
  基线的次序。`session.getMessages` 包装还会在返回的摘要没有同时精确匹配所请求的工作区与会话时拒绝，从而把
  那个不可信响应的身份检查变成一道共享的安装边界，而不是调用方惯例）。
- **`mcp.ts`** 是 Settings 与聊天 Resources 视图共享的唯一 MCP 读取路径：
  **`requestMcpList(method, params)`** 按工作区与连接世代串行化 `mcp.list` 以及每个返回列表的改动，包括在
  派发下一个请求之前通过 `installMcpList` 安装。这防止较旧的列表或改动回复覆盖较新的配置或活聊天成员关系。
  只有队列尾部的纯读取会被共享：在一个已排队的改动之后请求的读取必须等待该改动并发起一次新的读取，绝不重用
  改动之前的读取。改动从不共享。store 的 `selectMcpRead` 安装令牌在实际派发时捕获，而不是入队时，从而在
  保留请求期间到达的推送的同时保留权威的会话省略。排队请求在派发之前重新检查 MCP 可用性、工作区移除以及它们
  捕获的连接世代；过期的排队工作会拒绝而不发送，而已派发的回复保留 store 的连接与删除栅栏。新连接独立于较旧
  世代的尾部启动，工作区之间不互相阻塞，失败的请求会拒绝其调用方而不污染队列，也不妨碍重试。这个队列是临时的
  传输层协调，不是第二个状态所有者。**`watchMcpWorkspace(workspaceId, onRead?)`** 读取一次，然后以有界
  退避（1 → 13 s，每条连续尝试链六次）重读，仅当该工作区的一个活聊天仍然报告服务端 `starting` 时。宿主的
  `mcpSessions.capture` 在它的调用方超时之后继续，并最终发布安定后的状态，包括一条已连接的边沿；浏览器侧的
  有界轮询仍是刷新助手，而不是唯一的完成路径。当没有任何会话处于 `starting` 时，连续尝试预算重置；dispose
  会取消计时器并抑制迟到的观察器回调。独立的观察器仅在上面的尾部规则下共享读取。
Workspace 移除在退下本地 modal 之后，通过 `provider.loginCancel` 取消它活动的 MCP 登录。针对已墓碑化工作区
的迟到登录帧会被取消而不是被安装；如果移除发生在确认之前，MCP 启动响应路径也如此。取消是在既有重连安全请求
传输之上的尽力而为；宿主的有限探测寿命仍是最终的清理。
- **Public surface（公开接口，barrel）：** `initTransport`、`getTransport`、`prewarmWorkspaceSkillLoad`、
  三个 skill-load 安全的会话请求包装、`errorText`、`RequestError`、`wsErrorCode`、`requestMcpList`、
  `watchMcpWorkspace`、`ConnectionStatus`、`TransportOptions`、`runHostUpdate`、`supportsHostUpdateRun`、
  `supportsPlanReview`、`supportsPlanSummaryGeneration`、`supportsChangeMutations`、`supportsRichAnchors`、
  `supportsTurnChanges`。`runHostUpdate` 是类型化的空宿主动作，`supportsHostUpdateRun` 让 `Shell` 仅在协议
  v70+ 时注入它；`supportsPlanReview` 被导出，是因为一个同级面板（`PlanPane`）用它来门控计划评审 UI——较旧
  的宿主不提供 `todo.startReview`/`reviewAll`，因此客户端不得提供它们；`supportsPlanSummaryGeneration`
  （v69）被导出，是因为 `chat/useChatTodos` 用它门控自动摘要的 `todo.generateSummary` 请求——较旧的宿主没有
  这个方法；`supportsChangeMutations` 被导出，是因为 `DiffPane` 必须在那个协议落地之前扣下每个 `change.*`
  提示；`supportsRichAnchors`（`REVIEW_RICH_ANCHORS_PROTOCOL_VERSION`）被导出，是因为
  `panels/useReviewCommenting` 拒绍向一个早于它们的宿主发送 `region`/`structural` 草稿——这样的宿主会把
  选择器不加校验地存下来并像对待文本一样重新锚定，于是评论会存活下来但含义已变；拒绝发生在草稿变成
  `review.commentAdd` 请求的那唯一一处，是一个普通的错误 toast，行/整文件草稿不受影响；
  `supportsTurnChanges`（`TURN_CHANGES_PROTOCOL_VERSION`，v80）被导出，是因为 `panels/useWorkspaceTurns`
  不得向一个没有该方法的宿主发出 `workspace.turns`——没有它，Changes 作用域菜单就只是不显示任何 agent 轮次。
  传输层还订阅 `turn.changed`，并通过 `applyTurnChanged` 把每次记录的运行折叠进 `store.turnsByWorkspace`。
  纯字节的资源形状不需要门控：早于 `RESOURCE_META_PROTOCOL_VERSION` 的宿主回答 `fs.readFile` 与
  `git.diffFile` 时不带 `meta`，各面板把它读作「text」——正是那个宿主自己的客户端所展示的表面——而 `/blob`
  只会为宿主自己报告为纯字节的一侧被寻址。
- **允许的依赖：** `contracts`（方法映射、`WS_CHANNELS`、用于 welcome + `project.updated` 的 `Project`、
  用于 `pi.event` 的 `SessionEventPayload`、用于 `pi.extensionUi` 的 `ExtUiRequest`、用于
  `workspace.created`/`updated` 的 `Workspace`、用于 `workspace.removed` 的 `WorkspaceRemoved`、用于
  `session.created` 的 `SessionCreatedPayload`、用于 `session.deleted` 的 `SessionDeletedPayload`、
  `HOST_UPDATE_RUN_PROTOCOL_VERSION` + `Ack` + 用于 CLI 宿主更新动作的类型化 `host.update` 方法、用于
  `supportsPlanReview` 门控的 `PLAN_REVIEW_SUBAGENT_PROTOCOL_VERSION`、用于 diff 改动门控的
  `CHANGE_MUTATIONS_PROTOCOL_VERSION`、用于富锚点编写门控的 `REVIEW_RICH_ANCHORS_PROTOCOL_VERSION`、
  `provider.changed`、空的定向 `feedback.interview` 邀请、用于 `server.welcome` + `host.updateAvailable`
  的 `HostUpdateNotice`、用于 `workspace.fsChanged` 的 `WorkspaceFsChangedPayload`，以及用于
  `server.welcome` 的配置 + `settings.changed` 的 `AppConfig`）；`store`（welcome + 事件路由——一条由父图
  拥有的运行时边）；`lib`（纯 HTTP 安全的随机页面身份）；浏览器的 `WebSocket`。
- **绝不触碰：** `server`/`shared`/任何 `pi` 包；导入 `panels`/`shell`；或请求、订阅、折叠当前布局状态。浏览器
  布局持久化仅把 `httpBase()` 用作其前端本地存储身份的一部分；原生稳定持久化没有传输层边。

## 必须做对的事

- **`DEFAULT_TIMEOUT_MS` 是宿主侧预算必须装得下的上限，而且没有任何东西强制它。** 服务端把网络 `git` 限制
  在 55s，正是为了让它自己的错误——说出 ref、带上 git 的 stderr——胜过本方在 60s 抛出的、没有原因的
  `request "…" timed out`（issue #209；`packages/server/src/git/SPEC.md`）。把这个数字降到那个预算之下，
  每一次卡住的抓取都会静默地退回通用超时，而没有任何测试或类型失败来告知此事。这两个常量住在独立交付的产物
  里，靠约定保持正确；从彼此推导它们应当放进 `contracts`。提高单次请求的 `timeoutMs` 是安全的，降低默认值则
  不是。

