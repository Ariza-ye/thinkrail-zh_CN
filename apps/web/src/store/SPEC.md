---
id: submodule-web-store
type: submodule-design
status: active
title: store — Zustand app state
parent: module-web
depends-on: [module-contracts]
---

## 职责

那个唯一的 Zustand store：连接状态、项目/工作区、一个前端本地的 workbench frame 加上按工作区的视图/关注、
终端目录，以及为每个活着的 `AgentSession` 的一个**按会话的聊天运行时**（因此多个聊天可以并发流式）。

## 聊天资源

Resources 视图把宿主快照与 Pi 对话运行时分开保存，按聊天身份与当前连接权威键控。安装/失效/清除一份资源快照
是一次原子的 store 动作。一个单调的失效修订与连接代次为每一次读取安装与失败设栅栏；墓碑与被清除的条目拒绝
迟到的回复。连接状态变化会把保留的快照标记为过期，而不受支持的 welcome 会清除它们。`selectors.ts` 是
Resources 选择器与谓词的规范拥有者，包括活跃计数与活跃/已完成分组；宿主已经限定了最近记录的范围。组件不
各自独立推导这些。`chatResources.ts` 是 store 的私有实现文件，承载资源投影/状态/作用域/读取类型与
`staleChatResources` 状态变换。一个父级落定不会清除它仍在运行的资源，也不会改变 Projects 侧边栏既有的活动
契约。可选的 `mcpServers` 列表是同一份资源快照的一部分；`selectChatResourceGroups(snapshot, includeMcp)`
给它排序（关注优先），并把它的活跃（connected/starting）与关注（需要登录、失败、待批准）服务器与工作计数
分开计数，且对更旧的协议返回 `null`。

资源快照不在浏览器中持久化。重连或一个不支持的宿主会移除控制权威，直到一次新的读取成功；失败的读取保留
视觉上明显过期的数据，绝不捏造一个空目录。聊天删除/工作区移除会清除对应的投影。Popover 与选中日志状态
属于聊天集成，而不是领域持久化。呈现见 [[submodule-web-chat-resources]]，线上协议见 [[module-contracts]]。

## MCP servers

`mcp.ts` 是 MCP 服务器状态的私有切片实现：**`mcpByWorkspace`** 按工作区持有最后一次 `mcp.list` 的答案
—— `servers`、文件级的 `configErrors`（来自更旧宿主时为空）与 `handledElsewhere` —— 以及持有的按会话状态
快照，旁边是一个单调的 **`mcpRevision`**。两个原子动作写入它。
**`applyMcpStatus(snapshot)`**（`mcp.status` 通道）只在已连接且协议支持 MCP 时、对一个活作用域（已移除的
工作区与已删除的聊天会被拒绝）安装，且只通过 **代次守卫**：当快照的代次更新、或它在更新的连接上到达时，
它替换已持有的那份——重启的宿主会重启它的计数器，因此纯数字比较会把视图冻住。
**`installMcpList(read, result)`**（每次 `mcp.list` 与返回列表的改动）被请求之前捕获的 `selectMcpRead` 令牌
围栏：一个列表是截至那次读取的权威活聊天集，因此它省略的已持有会话会被丢弃，除非一次推送在读取开始之后
落地；更新的已持有代次存活，而已删除的聊天绝不重装。每个持有的快照还携带一个服务器在该连接上首次被看到
`starting` 的时间。不受支持的 welcome 会清除该切片，工作区移除丢弃它的条目，聊天删除丢弃它的快照。
**`deriveMcpServerRows(projection, now)`** 是唯一的聚合：每个配置条目一行；没有活聊天时状态来自配置
（invalid、pending approval、disabled / disabled in this project，否则 not running）；否则任何聊天里的问题
按固定优先级胜出，`connected` 统计报告它的聊天数（"connected in 2 of 3"），`sessions.reporting` 列出报告
该行状态的活聊天（就是 Settings 按聊天的 Reconnect 与 Reload 现在的目标），未被报告的服务器读作 unknown，
而超过一分钟的 `starting` 读作 unknown（stalled）。宿主可选的 `summary.effective` 标出那个接收会话状态的
已准入条目，并可提供仅名字的 login/logout/test 动作；被替换的用户条目读作 `replaced`。对更旧的宿主，状态
投影保留有效的已批准项目/用户回退，但会对含糊的同名行扣下运行时动作。一个被折叠的无效项目 override 不会
撤销一个有效用户行显式报告的权威。一个待定的 repo override 会把它的用户行标记为需要关注。关注行排在前面，
禁用/被替换的行排在最后。`selectMcpWorkspaceStarting` 在一个服务器启动期间驱动有界的重读。状态词汇与
关注/活跃谓词住在 `lib`（`mcpState`），因为仅 props 的聊天资源模块共享它们。

## 边界

- **拥有：** `appStore.ts` —— 连接/项目/工作区状态 + setter。连接状态有两条含义不同的单调边：
  `setStatus("connected")` 为重连水合推进 **`connectionGeneration`**，而 **`welcomeGeneration`** 只在
  一份完整的 `server.welcome` 快照落地时推进。每一次连接状态转变都会清除 `protocolVersion`，因此在 socket
  之间、以及在当前 socket 的 welcome 安装之前，UI 能力保持不可用。
  **`installWelcomeSnapshot(protocolVersion, projects, recentProjects, config?, hostPlatform?, hostUpdate?)`**
  在一次 Zustand 写入中安装协议 + 两个已排序的项目视图 + 可选配置、宿主平台、可选的宿主更新生命周期快照 +
  导航修复，然后推进那条就绪边；路由校验与能力读取绝不观察到半个 welcome。`installProjectSnapshot` 仍是给
  聚焦调用方用的仅项目原语。**`projects`** 是打开的侧边栏，而 **`recentProjects`** 是每个已知打开 + 关闭项目的
  按最后打开排序集合。**`applyProjectUpdated(project)`** 是用于 `project.updated` 推送与权威项目改动响应的
  那唯一一个全快照更新器：它 upsert/排序 Recents，并要么 upsert/排序侧边栏，要么在 `closed === true` 时移除
  该行。两个动作也调和过期的导航：只有当本客户端选中的项目或活跃工作区属于一个不再打开的记录时，它们才清除
  活跃工作区并选中第一个剩余项目的 Home（没有剩余时 `null`），同时刻意保留每一份本地工作区视图/关注/资源
  渲染/终端/会话映射，以便无损重开。其他客户端的打开绝不抢夺导航，一次后台关闭也绝不移动它。所有项目响应
  调用点使用同一个更新器，因此打开与最近的两份副本无法漂移。显式的本地转变是 **`selectMain()`**、
  **`selectProject(projectId, opts?)`** 与 **`activateWorkspace(workspace)`**；每个都以原子方式更新它耦合的
  作用域 id，且不存在能拆开该不变量的通用活跃工作区 setter。**`workspaceSelectionHistory: string[]`** 是本
  页面最近优先的工作区关注：每一次普通、路由驱动的、以及历史搜索的激活都会把它的去向移到最前，而项目/主视图
  选择保持该新旧次序不变。它不是宿主状态、URL 历史或重新加载持久化。
  **`expandedProjectIds: Record<string, true>`** 是 Projects 侧边栏的按浏览器展开——store 持有（它必须在侧边栏
  的重新挂载中存活，并可被非侧边栏手势写入），配以 **`toggleProjectExpanded(projectId)`**（那个尖角箭头）、
  **`expandProject(projectId)`**（幂等显现：工作区创建 / 工作树附着 / 活跃工作区可见性规则），以及
  `selectProject` 的 **`{ reveal: true }`** 选项——进入一个项目的 home 并在一次写入中展开其行的用户手势
  变体（侧边栏行点击、Welcome 界面的打开采纳）；导航恢复与工作区移除回退则裸调用它，保持展开中立。项目快照
  安装会把展开集合修剪到打开的侧边栏（已关闭项目的条目被丢弃；未变时身份稳定）。
  **`hydrateExpandedProjects(projectIds)`** 在启动时从 `panels/projectExpansion` 持久化模块给该集合播种
  —— store 自己仍然不触碰任何存储：那个模块拥有 localStorage 镜像（宿主限定的键、尽力而为的写入、不可信的
  读取）并订阅变化。
  **落定搁板。** `selectors.ts` 拥有 **`selectWorkspacePartition(state, projectId, now)`** —— 把一个项目的行
  推导成 `live` 与 `settled` 的那唯一一处推导（每个落定的行携带它的原因：
  `override`、`review merged|closed`，或 `idle since`），被侧边栏、顶栏的 *Switch to*
  菜单以及搁板共同消费，好让这三者绝不会不一致；**`selectAutoSettledCounts(state, now)`**
  复用它逐行的规则，按已加载项目计数，只数那些搁板自己接手的行（绝不是一个
  `override`），这正是侧边栏一次性首次移动提示所宣布的。在
  `WORKSPACE_SETTLE_PROTOCOL_VERSION` 之下，它把宿主的原始列表作为 `live` 返回，不排序，甚至忽略
  过期的持久化落定字段；激活使用同一个门禁，保留旧版宿主的顺序与
  行为。`workspaceSettlingSupported` 记录最后一次完成的 welcome 的裁决，而不是在
  临时断连期间清掉它，所以重连不能让侧边栏重新挂载并丢弃一次就地重命名；一个
  更晚的旧版 welcome 会权威地关掉它。在有能力的宿主上，规则依次是：带有一个
  在工作或需要关注的 agent 的行，或 Default 工作区，是 live；`settledOverride: "settled"` 使其落定，
  `"active"` 保持 live（用户的话胜过下面的闩锁 —— 让你所在的行走上搁板必须移动
  它）；**`activeWorkspaceLiveLatch`** 成立期间的活跃工作区是 live；`review.state` 为
  `merged`/`closed` 且带有效 `changedAt`、又没有更晚的 `lastActiveAt` 则落定（一个不完整的落定
  快照保持 live 且可刷新）；一个开放的评审保持 live；
  否则空闲长于 **`settleIdleDays`**（从 `AppConfig` 镜像，`null` = 从不）则落定。调用方挑选 **`order`**（`WorkspaceOrder`）：`"created"`（默认）反转宿主的
  列表 —— 它的登记表插入顺序，最早创建的在最前 —— 所以两个列表都按最新创建在最前排列：
  侧边栏的顺序，新工作区落在最上面，而工作时行绝不会跳动；`"recent"` 把
  最新的 `lastActiveAt` 排在最前（最新创建的打破平局），用于顶栏的切换器；Default 行两种方式下都
  钉在最前。一个用户可选的排序被尝试过并放弃了：自动重排侧边栏会把
  行移到指针下面，而切换器想要的是新旧度，不是挑选器。那个
  闩锁是“选择绝不移动一行”规则的具象化：`workspaceActivationPatch` 把它设为目的地
  在那一刻是否 live（所以你打开的一个已落定工作区留在搁板上，被强制
  揭示），并且**当目的地已经是活跃工作区时原样带过它**（一次
  重击、*Open in → terminal*，或 Back/Forward 回到同一行，都不是一次新选择，绝不能
  重新裁决一个窗口在你待在它里面时已经过去的行），而一次推进活跃行
  `lastActiveAt` 的 `workspace.updated` 推送会重新武装它（打开的工作区里真实的工作让它保持 live）。**`settledShelfExpanded`** / **`settledShelfShown`**（按
  项目，仅此浏览器，不持久化 —— 每次加载时折叠的搁板都是默认）持有
  搁板的展开与分页。分区把 `now` 作为参数，所以调用方决定 tick，
  选择器保持纯粹。经过校验的路由恢复使用
  **`activateWorkspaceFromRoute(workspace, sessionId?)`**：它应用同样的作用域 id，推进
  兼容工作区导航 tick 加上当前目的地分组的时钟，并要么安装一个
  盖上两个时钟戳的瞬态 **`routeChatTarget`**，要么清掉一个更旧的精确目标。一个仅工作区的
  路由不携带中间区标签页意图，所以它保留既有的浏览器本地关注；普通位置
  推导之后可能把它规范化为一个已选中的聊天。**`routeChatTargetGeneration`** 只在
  目标安装时推进（包括同工作区深链），所以消费不能重复
  shell 的协调趟。`selectCurrentRouteChatTarget` 是目标的工作区与
  导航戳记仍然成立的唯一一处检查。shell 的聊天协调模块在普通本地放置聊天水合之前
  校验/水合那个精确目标；成功的权威缺失消费它，而失败
  为重连保留它。
  store 不拥有任何 URL/历史/存储访问 —— `navigation` 拥有序列化与驱动。它还拥有
  每个客户端在 `workspace.created`/`updated`/`removed` 推送上一模一样地运行的
  **工作区生命周期反应**（没有按客户端的乐观更新 —— 后端
  是权威）：**`addWorkspace(ws)`** 按 `id` upsert 一个
  `workspace.created` 快照（如果项目还没被列出则空操作 —— 在它下一次
  `workspace.list` 时协调，而不是播种一个部分的一行列表；否则缺失则添加 / 存在则合并，
  与创建客户端自己创建后重列幂等）；**`updateWorkspace(ws)`** 折叠一个
  `workspace.updated` 快照进来：按 `id` 在 `workspaces[ws.projectId]` 中**替换**该记录，只带过
  由列表计算的 `diffStats` 聚合（快照是持久化记录，它没有这个）。
  推送是权威的，所以是*替换* —— 绝不是合并：合并清不掉一个**宿主丢弃的可选字段**
  （`diffBase` 重新指回创建基线，最后一条 `skillOverrides` 条目被移除，
  或 `subagentsOverride` 回到继承），
  从而让客户端从一个宿主已不再持有的值上取标签与键；一个从未被获取的项目，或一个不在其列表里的 id，是**空操作** —— 下一次
  `workspace.list` 会协调；**`applyWorkspaceRemoved(projectId, id)`** 是**整个**移除
  反应（`removeWorkspace` 丢弃该行 + `clearWorkspaceState` 丢弃它的
  本地视图/关注/终端映射与聊天运行时 + 新旧度丢弃那个死 id，
  并且**如果它曾是本客户端的活跃工作区** → 激活最近选中的、其项目仍然打开的
  已加载工作区，甚至跨项目；当没有剩下时，`selectProject(projectId)` 回退
  到被移除工作区的 Project Home；两个活跃回退都得到同一条中性的 toast，它读起来对
  发起者与观察者都合适）。一次后台移除绝不移动焦点。因为生命周期事件
  是共享的，而选择历史是浏览器本地的，每个观察客户端恢复自己的先前上下文。那个
  原语 **`removeWorkspace(projectId, id)`** 只是丢弃该行（未知项目/id 是空操作）；
  **前端本地的 workbench 状态** —— 一个 `workbenchFrame` 携带无资源的拓扑、几何、
  单例工具，以及这个前端界面的恢复目标；`workspaceViewsByWorkspace` 携带每个
  工作区的资源放置、顺序与预览身份；`layoutAttentionByWorkspace` 携带它的
  选择、最后焦点与导航时钟；而本地预设/上限偏好坐在 frame 旁边。
  这些是来自 `shell/layout` 的 web 本地类型，不是线上快照。`layoutDocumentsByWorkspace` 是一个
  同一性稳定的**派生投影缓存**，只为既有的选择器/副作用从 frame + 视图重建；
  它既不持久化，也不能作为权威被写入。不存在 accepted/projected 对、修订、变更
  id、待处理写入、回滚队列，或冲突状态。

  `applyLocalLayoutTransition(result)` 是纯布局结果的唯一原子安装边界。一个
  仅资源的结果更新一个工作区视图与关注。一个 frame 结果替换那个单数的 frame，
  连同每一份保留的工作区视图重映射一起，所以一次显式分组移除或预设应用
  绝不能留下一个隐藏工作区引用一个死分组。组件绝不拼接分组/标签页数组。空
  分组是合法的 frame 状态，关闭最后一个资源不会删除它们。`layoutProjectionEpoch`
  只在一次本地转变使一个未受控的指针/缩放草稿失效时推进。

  store 拥有值与动作，绝不拥有持久化。`shell/layoutState` 校验并水合一份
  由浏览器端点/界面或原生 profile/窗口限定的本地文档，订阅相关的状态
  边，并持久化归一化后的 frame/视图/关注/偏好。`hydrateLocalLayoutState` 安装
  那份文档一次；一份缺失或非法的文档由没有工作区视图的 Balanced frame 表示。`clearWorkspaceTabs` 在工作区消失时
  移除工作区视图、关注以及相关本地状态。一个页面生命期的
  `removedWorkspaceIds` 墓碑拒绝过期的目录/会话/缓存/工作区到达，好让一次飞行中的读取
  不能重建它。

  **浏览器本地的资源渲染状态**按工作区 + 规范资源 id 键控，绝不嵌入
  frame。已加载的文件/diff 内容与元数据、渲染器选择、不透明渲染器视图状态、diff 布局、
  存活聊天运行时，以及解析出的文档 markdown 都保持为各自领域来源之上的缓存。放置 id 在一个工作区视图内是稳定的；一个
  已被另一份语义缓存拥有的 id 会得到一个防冲突的缓存 id。一个虚拟文档只在
  它的本地资源引用指名一个已注册解析器加上持久来源身份时才是合法的；`todo-plan`
  按会话解析到活的 `PlanPane`。任意行内 markdown 不能进入持久化布局状态。
  空的水合前缓存绝不是缺失：一次领域读取必须对当前连接代次
  权威，协调才可以修剪一个本地引用。

  **工作区本地的关注**是按稳定 frame 分组选中的标签页、最后关注的中间分组、
  最后关注的辅助分组、分组导航时钟，以及每个辅助分组可选的最后终端召回。召回是同一 owner 内经过校验的历史，而不是另一个活跃选择，且绝不跨工作区拷贝。选择/聚焦绝不变更 frame。
  一个分组的*工具*选择却是共享的：单例工具是 frame 放置，所以一个
  显示某工具的分组在窗口的每个工作区里都显示同一个工具。选中一个工具（点击、揭示，
  或一次工具移动的焦点）会被写入每一份保留的关注，只要它在那个分组里的选择是
  工具或缺失，而一个新实体化的视图继承最近活跃工作区的工具选择。
  一个被选中的工作区*资源*（混合辅助分组里的一个终端）保持本地，且
  绝不被覆写。`shell/layoutState` 在与本地写入同一个事务里拥有这次扇出。
  frame 替换会把每个工作区的关注协调到一个幸存的分组/标签页。导航时钟在
  请求时推进，用于本地改变焦点的打开与显式重新选择；戳记随意图一起走，
  所以接纳不会算两次。当更新的导航抢占它时，一个慢完成被丢弃。
  预览身份按中间分组是工作区本地的：`preview` 替换该分组的槽位，而 `keep`
  单向提升。一次合并的 preview→keep 手势在它唯一的最终意图上携带 `claimPreview`，所以没有
  中间状态留存。排列无关的打开进入 store，但只有 shell 布局集成
  会把它们按该工作区最后关注的解析，并提交本地放置。重开一个已存在的
  规范资源只改变关注，除非非身份元数据变了。一次迟到的聊天标题事件可以
  修复缓存/历史标签，或一次仍在排队的打开，但不能重建一个本地已关闭的放置，或偷走
  焦点。**耐久标题折叠**把
  `session_info_changed` 路由到扩展 UI 的 `setTitle` 已经在用的那同一个单点聊天标签变更：
  把缺失的名字归一化为 `Chat` 回退；更新缓存的 `ChatTab`、它已存在的本地
  放置、任何排队的打开，或它的 `closedChatsByWorkspace` 行；并且不改变任何新旧度、运行时、放置、
  导航时钟或关注。那个耐久的 Pi 事件可以取代扩展仅呈现性的标题。
  一个针对这个界面从未列出过的会话的事件仍然是空操作——`session.list`/`session.getMessages`
  提供重连与后续水合的真相，所以不存在标题专属的事件缓冲。
  `syncLegacySelection` 把选中的资源镜像到临时的编辑器/终端兼容
  状态，而不成为放置权威；它的选择器包含匹配的缓存/目录键，好让身份
  修复能重新触发镜像。

  **`terminalsByWorkspace` 保持为终端领域状态的镜像，绝不是放置权威。** 宿主
  以 `(workspaceId, tabKey)` 为键拥有终端的存在；一个工作区视图在本地引用那个键。
  `setWorkspaceTerminals` 采纳 `terminal.list` / `terminal.tabs`，只在预留仍在进行中时保留一个被省略的
  本地标签页，移除死掉的引用，并把未被表示的目录标签页交给本地放置
  协调，而不改变 frame 几何或关注。`addTerminal` 铸造一个持久键并发出一个
  本地放置意图；被捕获的分组目的地保留情境化的创建，而一个未捕获的请求
  解析为底部。默认终端预留是一个宿主拥有的工作区创建握手，各界面
  收到由此产生的目录条目。已确认的关闭移除领域成员资格与每一个本地引用；
  拒绝则保留放置。不存在工作区全局的 `activeTerminal`：工作区关注决定
  哪些主体挂载，而宿主的独占附加/接管决定哪个客户端控制一个 PTY。那个
  **按会话的聊天状态** —— `sessions: Record<sessionId, SessionRuntime>`，其中 `SessionRuntime` 持有
  一个聊天的 `turns`（pi 规范的）/ `toolResults` / `askAnswers`（`ask-user-answers` 的回复，按
  工具调用 id 键控 —— 由 reducer 与水合索引，绝不变成气泡；同族的
  `subagent-completion` 自定义消息则**被追加为一个 `subagentCompletion` 轮次** —— 一个
  被分离的子代理的终态报告是对话记录定位的，由 `chat` 的完成卡片渲染 ——
  两者都由共享的 contracts 守卫窄化）/
  `currentAssistantId` / `attemptAssistantId`（把溢出移除限定到实际观察到的尝试）/
  `isStreaming` / **`settlementTick`**（浏览器本地，对每个
  `agent_settled` 单调自增，所以批量的启动+落定仍然把完成边暴露给聊天布局）/ `model` /
  `thinkingLevel` / **`eventRevision`**（浏览器本地，对每个
  已接收的 Pi 事件自增；一次权威对话记录读取的比较并安装栅栏）/
  **`syncedConnectionGeneration`**（运行时的对话记录最后是从哪个已连接的宿主代次读取的）/
  `stats` / **`statsRefreshTick`**（对已挂载聊天的权威
  统计读取的浏览器本地失效）/ `commands` / `draft` 及其 **extension-UI 状态**（`pendingExtUi`（由
  `chat` 的 `ExtUiDialogRequest` 定型）+ `extUiQueue`（重叠对话框 FIFO，好让没有一个孤立它对应的服务端
  promise）+ `extUiStatus` / `extUiWidget`）。`openChatSession` 创建一个运行时；`closeChatRuntime` /
  `clearWorkspaceState` 丢弃它；按会话的变更器（`appendUserMessage` / **`appendErrorTurn`** / `setStats` / `setCommands` /
  `setCurrentModel` / `setThinkingLevel` / `setChatDraft` / `clearPendingExtUi`）接收一个 `sessionId`。
  **`appendErrorTurn(sessionId, text)`** 为一次**被拒绝**的驱动轮次的线上调用
  （`session.prompt`/`steer`/`followUp`/`create`）追加一个 `error` 轮次 —— 例如 `prompt()` 抛出 "no API key" / 模型不对 ——
  好让一次失败的发送落进聊天，而不是被吞掉；它不携带任何恢复动作，因为 Pi
  从未接受那个缺失的轮次。它不清 `isStreaming` 或活跃助手 id：一次被拒绝的
  steer/follow-up 不能让宿主仍在跑的工作落定。一次*流式*故障则改在
  `agent_settled` 通过 **`reduceSessionEvent`** 结束这次运行，使用宿主投影的最终终态元数据：
  `stopReason: "error"` 携带 Pi 的 `errorMessage`，而 `stopReason: "length"` 变成一个可操作的
  截断错误 —— 两者都不得变成 "✓ Done"。只有那次由落定创建的错误轮次携带
  web 本地的 `recovery: "try-again"` 标记；水合只把它给合成的当前
  最终失败。`appendUserMessage` 在加入后续用户轮次的那一次乐观写入里消费掉每一个先前的标记，
  而 `agent_start` 为另一个客户端或一条自定义消息开始的工作消费它。
  于是渲染器可以提供一次普通的 `Try again.` 发送，而无需解析错误，也不留下一个可操作的
  历史失败。`agent_end` 是尝试级的，绝不清理 `isStreaming`；只有落定才完成
  重试、压缩与排队中的后续。同一个 `agent_settled` 折叠自增 `settlementTick`，
  独立于最终的 `isStreaming` 值，从而在 Pi 事件批处理器只给
  React 该批次的 false→false 端点时保住那次转变。那个
  **压缩（compaction）生命周期是一个一等轮次**：`compaction_start` 追加一个 `compaction` 轮次
  （`running`），`compaction_end` 就地落定拖尾的那一个运行中轮次（成功 → `done` +
  来自类型化 `CompactionEndResult` 的 tokens-before/after，带守卫 —— 线上数据不可信；`aborted`
  → `cancelled`；`errorMessage` → 携带该消息的 `failed`，例如 pi 一次性的溢出恢复
  上限 —— 一次失败的压缩必须可见，绝不吞掉），或在没有运行中轮次时追加
  已落定的轮次（压缩中途重连）。一次成功且带 `willRetry: true` 的 `compaction_end`
  还会把该轮次标记为 `resuming`（pi 继续同一次运行；落定会清掉该标志 ——
  一份已落定的对话记录绝不宣称正在进行的工作），并且仍然移除被取代的助手尝试。一次
  没有持久 `summary` 的成功存活轮次也是聊天集成去读取 Pi
  规范压缩后对话记录的信号；reducer 自己绝不猜测切分边界。那个
  reducer 依赖 pi 的保证：每一个发出的 `compaction_start` 都与一个
  `compaction_end` 配对（成功与失败路径都会发出它），与其他每一对事件得到的信任相同。
  手动命令的传输层拒绝使用一次原子 store 变更：给定请求之前观察到的压缩轮次 id，
  只有当当前 id 中没有一个新的时候，才追加一个失败的压缩轮次。因此一次已由 `compaction_end`
  表示的 Pi 失败绝不重复，而生命周期开始之前的拒绝
  仍然在同一个压缩界面上可见。
  **`auto_retry_start` 镜像 pi 的活上下文手术**：pi 的 `_prepareRetry` 在重跑该轮次之前
  从活上下文中裁掉失败尝试的助手消息（重试把它作为新消息重新流式）
  而*把它保留在会话文件里*，所以 reducer 丢弃被取代的失败
  助手轮次（`removeSupersededAssistant`，与溢出压缩路径相同的规则）——
  否则客户端会把回复渲染两次（冻结的失败残片 + 重试的副本）。水合把
  同样的呈现规则应用到持久化副本上（`chat/hydrate.ts` 隐藏被重试的尝试 —— 一个
  出错的助手消息后面跟着另一条助手消息），所以存活客户端与重新加载的客户端一致。
  - **归一化的会话状态**（`sessionStateByWorkspace`）是每个
    工作区/会话由宿主撰写的完整状态记录。快照水合只会在一次完整的当前代次读取上替换该映射；
    有序推送折叠一条记录，删除则移除它。共享选择器派生需要输入、运行中
    （contracts 的 `isSessionWorking`，所以一个只挂在后台命令或子代理上的聊天仍然读作
    运行中）、
    未读已完成，以及项目/工作区汇总——没有存储的优先级，也没有第二个运行中切片。
    `SessionRuntime.hostState` 随对话记录水合一起安装，也由 Pi 事件之后投递的状态推送安装。
    一个结果是**在看到它时被读取**，而不是靠一个手势：`selectReadyCompletionAck` 只在连接是当前代次、
    运行时已同步到这一代次、它的 `hostState` 指名同一个完成、那条确切的结果行已渲染，并且
    `selectChatAttended` 成立时，才返回确切的未读完成 id —— 该聊天是活跃工作区里最后关注的
    中间分组中选中的标签页，且没有历史浮层遮挡它、或为它请求了浮层（一个待处理的
    `historyOpenRequest` 不能让聚焦跳转在浮层挂载之前就确认）。`ChatTranscript` 加上 store 无法知道的事实
    （窗口有焦点且可见；没有 Resources 检查器或模态层盖住对话记录；它跟随最新的边）并在全部成立时确认一次。
    这个条件是连续的，所以它不需要记录过的激活、待处理的冷连接手势或
    tick 排序：用户跟随时到达的结果立即清除，滚回最新的
    边则稍后清除它，而未聚焦的窗口让它保持点亮（并持续通知）直到用户回来。宿主
    比较并设置确切的 id，所以一个过期的视图绝不能清掉更新的结果。
  已关闭的聊天可重开：workbench 的关闭命令原子地移除本地放置并调用
  **`closeChatToHistory`**，它**让运行时 + 宿主会话保持活着**，把它记录到
  **`closedChatsByWorkspace`**（`ClosedChat[]`，按工作区，最近在前），并清掉待处理的
  跳转/历史打开请求——但绝不清掉更新的 `routeChatTarget`，它的生命周期属于导航
  抢占与协调。文件、diff 与已注册文档的渲染缓存遵循同样的本地
  转变；排队打开落定之后，shell 只回收本地放置与排队意图中都不存在的缓存。
  没有对等方能远程恢复放置。**`reopenChat(workspaceId, …)`** 在它捕获的工作区里恢复运行时/历史
  成员资格，即使另一个工作区已成为活跃；shell 通过那唯一一条转变路径把放置加到
  该工作区本地选中的中间分组。**`noteClosedChats`** 也把纯磁盘会话（来自 `session.list`）
  与对等方创建的会话（来自 `session.created` 摘要）记录在那里——幂等地，
  跳过存活/已打开的会话，同时从更新的摘要刷新一条已存在的历史行——所以一个挺过了宿主重启
  或在另一个前端创建的聊天可重开，而不必
  获得本地放置。**`deleteChat(workspaceId, sessionId)`** 是对已确认的本地 `session.delete`
  与 `session.deleted` 广播二者都适用的幂等折叠：它原子地丢弃
  该聊天拥有的每个标签页 —— 它的对话记录、活的 plan 页，以及任何依赖的遗留文档缓存 ——
  加上它的历史行/运行时 + 技能基线，记录一个页面生命期的墓碑，移除该聊天
  或其依赖文档的排队打开，并排队一个资源移除意图。shell 布局集成
  通过它的纯变更路径移除每一个匹配的聊天放置与会话支撑的 plan 引用，
  然后在同一个转变里协调本地关注。在那之前墓碑不渲染任何主体，所以
  一个过期的本地引用不能重建或水合该会话。**`noteClosedChats`** 与
  **`hydrateSession`** 拒绝已立墓碑的会话 id，所以
  已经在飞行中的过期 `session.list` / `session.getMessages` 结果不能重建一个被删除的聊天；
  墓碑能挺过工作区拆解，因为更旧的读取仍可能在那之后落定。那个
  活跃工作区水合趟在每次 `session.list` 之前快照 **`selectWorkspaceSessionIds`**；当
  那次权威读取落定时，**`reconcileWorkspaceSessions`** 把同样的墓碑折叠应用到每一个
  宿主结果中缺失的基线 id 上，修复断连期间漏掉的删除事件，而不
  删除一次在该读取开始之后创建的会话，也不推进用户导航时钟。否则
  **`hydrateSession`** 在连接时从宿主的 `SessionSummary` + 转换后的对话记录重建浏览器本地的
  运行时/渲染状态；放置只来自这个界面的本地工作区视图、一次本地创建意图，或一次显式重开
  ——对等方创建/存活的会话仍然可在历史中发现，而不打开一个标签页——当存在时，
  存活摘要的 `lastSettlement` 是权威的；否则只有持久化对话记录最后一条对话消息上的
  失败才是当前的（历史上的 `length` 尝试之后又有更晚的工作，绝不能变成过期警告）。
  如果运行时已存在，水合就是空操作，所以一个存活/超前的聊天绝不会被覆盖。**`reconcileSession(summary, hydrated, expectedEventRevision,
  connectionGeneration)`** 是成功压缩或重连之后、针对已存在运行时的独立权威路径。
  它只在预期的 Pi 事件修订上比较并安装，拒绝被移除的工作区/会话或跨工作区身份，
  替换轮次/工具结果/ask 回答/队列/模型/思考
  + 流式状态，并保留 draft/stats/statsRefreshTick/commands/扩展 UI/放置/历史/焦点。它标记
  已连接的代次并推进修订，好让两次读取不能互相回退。当最新的
  存活压缩与持久记录相符时，它的 id + 估算后计数得以留存，而 `resuming` 只在
  返回的摘要仍在流式时留存。那个
  纯的 **`reduceSessionEvent`** 把一个 `PiEvent` 折叠进一个运行时。每一个 `message_end`、
  `compaction_end` 和 `agent_settled` 也推进 `statsRefreshTick`，即使那个事件不改变任何渲染出的轮次，
  好让一次定论的 Pi 用量/上下文边界不会丢失在呈现过滤或批量的
  `isStreaming` false→false 端点之后。**`handlePiEvents` 在一次原子 store 写入里折叠一个有序批次，
  同时为每个受影响运行时的修订按事件各自增一次，即使该事件被 UI 忽略**，因为
  被忽略仍然意味着它越过了快照排序边界。单事件的
  **`handlePiEvent`** 委托给同一条路径，好让测试与非线上调用方不会漂移。
  传输层在投递任何更晚的响应或非 Pi 推送之前先冲刷待处理批次，保住
  修订栅栏的已接收消息顺序。**只有空闲发送才乐观地进入对话记录**
  （`ChatView.onSubmit` → `appendUserMessage`）；下面的最后一轮回显去重
  之所以足够，正因为回显之前没有任何东西介入。一次**流式发送（`steer`/`followUp`）
  绝不追加轮次**：它的文本活在 `queue` 里（从宿主投影的 `queue_update` 逐字折叠，
  水合时从摘要播种），旁边是那个可选的保守 `hasImages` 聚合，
  它守卫破坏性的纯文本队列恢复；该轮次只通过 pi 的规范
  用户 `message_start` 落定 ——
  在它真实的位置上，与已水合的收敛。（镜像 pi 自己的交互模式；取代
  万物乐观追加模型，那个模型的最后一轮去重每当助手内容落在
  追加与回显之间就会漏掉 —— 在线上重现为一个重复、位置错误的排队气泡。）
  对于空闲回显：一个相等的 Pi `message_start` 回显被忽略，而 Pi 规范展开后的 `<skill>`
  回显**就地替换**紧邻其前、匹配的原始 `/skill:<name> …` 轮次（同一轮次 id），
  所以存活与已水合的对话记录都包含一次规范的技能调用；一个畸形或不匹配的
  块则正常追加。**`handlePiEvent(event,
  sessionId)`** 与 **`applyExtUi(request)`** 通过 `withRuntime` 辅助函数按 id 路由（对未知会话是
  空操作）。`error` 级别的 `notify` 变成一个 **`error`** 轮次（与
  会话错误得到的同一条横幅 —— 扩展崩溃绝不能读起来像闲聊）；其他每个级别都留作
  `system` 轮次。级别是*唯一*的输入，所以宿主自己的错误通知走同一条路：`host/handlers`
  在一次被回滚的发送之后发布的 `Review send failed: …` 也渲染成那条横幅。
  这是刻意的 —— 一次悄悄回滚的发送恰恰是用户绝不能滚过去的东西。一个**即发即忘**的 ext-UI 帧
  （`notify`/`setStatus`/`setWidget`/`setTitle`），如果**没有运行时可落**，就存放在 **`extUiOrphans`** 里
  （有界，最新 64 个）而不是被丢弃，且**两个**安装运行时的动作 —— `openChatSession` *与*
  `hydrateSession` —— 在该会话的运行时出现的那一刻，通过共享的 `replayExtUiOrphans` 排空该会话的帧。接纳
  测试是**“没有运行时”**，而不是“未知会话”：除 `setTitle` 之外的每一种都由
  `withRuntime` 归约，所以一个仅有一个标签页、或有一条 `closedChats` 条目的会话会通过“我们知道它吗”
  这个测试，然后被 `withRuntime` 丢弃 —— 既未应用也未缓冲。**今天没有任何路径构建那种状态**
  —— `closeChatToHistory` 保留运行时，`closeChatRuntime` 没有生产调用方，而两个
  放置聊天标签页的 `openTab` 站点都由其运行时已存在作为守卫 —— 所以这条规则是一个
  守卫，而不是一处实时修复，它通过直接给 store 播种来钉住，而不是通过一段用户
  无法执行的动作序列。一旦有任何东西在对话记录水合之前放置聊天标签页，它就开始
  发挥作用。`setTitle` 是
  那一个例外，它自己作决定：`renameChat` 重命名标签页或 `closedChats` 条目，
  并报告它**究竟**有没有找到该会话，所以只有两个映射里都没有的会话的标题才被
  缓冲。接纳是从重命名里自然得出的，而不是在旁边另算一遍 —— 一次遍历
  `tabsByWorkspace`/`closedChatsByWorkspace`，而不是把同样的两个谓词跑两次。**对话框**（`select`/`confirm`/
  `input`/`editor`）绝不缓冲：它是一次往返的一半，而另一半可能已经
  被另一个客户端应答，或随宿主重启丢失了，所以重放一个对话框会把聊天卡在
  一个没人在等的问题上。为什么要缓冲：宿主在 `session_start` 里发布扩展做了什么，
  *早于*它应答那个安装运行时的 RPC，所以未缓冲的客户端会悄悄
  丢掉扩展在启动时设置的每一条状态、标题、widget 和通知。这**不只是
  创建路径** —— 每当宿主从磁盘附加一个会话，pi 都会重新发出 `session_start`（`reason: "resume"`/`"startup"`），
  也就是在宿主重启之后打开的每一个聊天上，而那些路径通过 `hydrateSession` 安装
  运行时，而不是 `openChatSession`。**已知缺口：** 64 槽环是一个全局
  列表，而宿主把 ext-UI 帧广播给每个客户端，所以一次同时附加的会话突发
  可能驱逐一个客户端仍然需要的帧；而且没有任何东西为被删除的会话、或其
  工作区被移除的会话清除帧。按会话分桶加上在这两个事件上清除，就是在其中任一
  成真时的修复方案。应用级的 **`models`** 列表保持全局（不是按会话），加上
  **`modelsRefreshing`** —— 等待中的 `model.refresh` 进行中标志 —— 以及 **`modelsFresh`**，那份列表的
  *来源性*：只有当它持有一次已等待的强制刷新的已安装结果时才为真，
  `NewWorkspaceDialog` 在它可以把目录缺少的模型替换进来之前需要它。它住在这里，
  就在列表旁边，恰恰**因为 `models` 是应用级的**：`setModelsForProviderVersion`（一个守卫的
  `model.list` 快照，它的处理器从它启动的分离刷新之前作答）在同一次写入里**丢掉**它，因此权威
  随任何消费方替换过的列表一起落下 —— 若作为某个消费方的本地标志持有，它会比它的
  主体活得更久，并确认一个随后被 `create()` 拒绝的已移除模型。`beginModelsRefresh` 捕获并
  返回当前提供商版本；`finishModelsRefresh(version, RefreshedModels|null)` 只落定一个
  匹配的回复（列表 + 来源性 + 清掉的进行中标志在一次写入里；`null` = 刷新失败 —— 保留
  当前列表*以及*它的
  来源性，因为什么都没被安装）。来源性来自**宿主的** `complete`，绝不来自
  “来了一个回复”：宿主限制它为 pi 等多久，所以一个回复可能携带当时的登记表，
  而本该定论它的那一趟仍在跑 —— 这样一份列表会被安装（它*确实*是当前的）但
  丢掉权威，因为据此断定某个模型已经消失恰恰就是那个错误。**`dropModelsFreshness`** 是第三个写入者：权威
  被放弃而*不*替换列表，这正是激活中的消费方**同步地**必须做的事 ——
  否则更早一个消费方设置的标志会跨越那次激活，让一份继承来的列表冒充
  这次打开的自身真相，直到它自己的 `model.list` 回复落定。**`providerVersion`** 是从宿主观察到的、
  单调的、无数据的 `provider.changed` 代次；**`noteProviderChanged()`** 原子地
  自增它，并清掉 `models`、新鲜度，以及任何旧的刷新转圈。`model.list` 与
  `model.refresh` 的回复都经版本守卫的 store 动作安装，所以没有任何挑选器或更旧的异步回复
  能提供已被移除的运行时代次。传输层拥有那次守卫的重新读取；Providers 设置窗格观察
  该版本并重新读取状态，而 shell 的配额控制器把它当作一次立即的已关闭快照
  失效。其他目录传输工作住在 `chat/useModelCatalog`，不在这里（
  store→transport 边保持仅类型）。**应用内登录**状态
  **`activeLogin: LoginState | null`**（类型来自 `auth`）是**扁平的 + 无会话的**（登录在任何会话存在之前
  就跑在 Welcome 界面上 —— 把它路由经会话运行时会丢掉它的帧）：
  纯的 **`foldLoginFrame`** reducer 住在这里（正如 `reduceExtUi`/`reduceSessionEvent` 那样 —— `auth` 保持
  纯呈现）。**`reserveLogin()`** 只在既没有 `loginStarting` 也没有对话框被持有时同步认领全局启动槽位；
  **`finishLoginStart()`** 在完成或失败时释放它。
  Providers 与 MCP 共享那个槽位；只有拥有它的请求的完成才释放它，而不是一个迟到的
  `beginLogin` 响应。**`beginLogin(loginId, providerId, target?)`** 打开登录，保留一个
  匹配的、由帧创建的对话框（帧可以抢在响应之前），并拒绝覆写另一个
  活跃登录。工作区移除退役它定向的 MCP 对话框；针对已立墓碑工作区的迟到启动响应与帧
  不能重建它，也不能把全局登录槽位搁置。
  **`applyLoginFrame(push)`** 折叠一个入站的 `provider.login` 帧（如果帧先到就创建 `activeLogin`；
  忽略针对另一个存活登录的帧）；两者都保留一次 MCP
  推送的 `target`，Providers 与 MCP 设置正是靠它各自只打开自己的登录，
  **`clearLoginInput()`** 在回复发出的瞬间丢弃活输入（没有重复提交），
  而 **`clearLogin()`** 关掉它。**设置界面**状态 —— **`settingsOpen`** +
  **`settingsSection`**（一个 const-object 枚举：`Providers`/`Models`/`Mcp`/`Github`/`Appearance`/`Chat`/`Layout`/`Updates`/`Terminal`/`Workspaces`/`Templates`/`Notifications`/`Privacy`/`Feedback`/`Extensions`；
  `LineWidth` 与 `Review` 键被保留，好让旧的深链仍然通过类型检查，但它们不是导航
  小节 —— `panels/settingsNav` 把它们解析到一个可用小节，它们的控件如今住在
  Chat/Appearance 与 Models 里）加上 **`openSettings(section?)`**（深链到某个小节，默认为 Providers）/
  **`closeSettings()`** / **`setSettingsSection()`** —— 住在这里，好让顶栏齿轮、Welcome 的提供商
  警告，以及更新就绪的 shell 提示都能深链，而无需逐层穿传 props。可选的 Update 键只用于导航。原生
  更新器的快照/动作留在 `updates` 的 shell 本地 hook 状态里；可选的 **`hostUpdate`** 生命周期
  快照是宿主领域状态，从 `server.welcome` 原子地安装，或被那条唯一的
  `host.updateAvailable` 推送替换。它穿越临时断连仍然可见；更晚的 welcome 替换它或
  清除它。那个
  瞬态的 **`notificationPromptOpen`** 加上 **`openNotificationPrompt()`** / **`closeNotificationPrompt()`**
  是关注通知权限前置说明的客户端本地渲染标志（节奏/稍后提醒以及
  触发条件住在 [[submodule-web-notifications]]，绝不在 store）。瞬态的
  **`interviewPromptOpen`** 加上
  **`showInterviewPrompt()`** / **`hideInterviewPrompt()`** 是宿主定向邀请的渲染
  投影；传输层幂等地打开它，在每次有效 welcome 可能发生重复投递之前清掉它，好让
  宿主重启不能留下过期的投影，而该面板在 `feedback.respond` 被确认之后隐藏它。
  计数、推迟、关闭，以及客户端声明绝不活在 store 里。**主题**
  偏好状态 —— **`theme: ThemeId`**（保留的不透明固定选择）、**`themeMode: ThemeMode`**，
  以及可选的 **`systemThemePair: SystemThemePair`** —— 通过 **`applyConfig(config)`** 从
  `server.welcome` / `settings.changed` 广播到达。来自特性之前宿主的 welcome（或任何畸形的
  运行时模式/配对）在这个读取侧被归一化为固定模式，保留它有效的不透明 `theme` 与
  一个完整的字符串对。这些只是纯宿主值：生效的本地
  外观/id 与媒体监听器绝不进入 Zustand；shell 通过 `themes` 驱动那些。
  默认值仍然是固定的 `DEFAULT_CONFIG.theme` 且无配对，但当既有的 `welcomeGeneration === 0` 时，
  shell 保留 React 之前的偏好提示，而不把那些占位值应用在其上。复用那个
  就绪边避免了第二个派生的配置水合标志；在第一次 welcome 之后，断连/重连
  保持最后一份权威配置，而更晚的 welcome 可以替换它。**`terminalReplayKb: number`**、
  **`terminalWindowsShell: TerminalWindowsShell`**、**`composerGrowthLimit: ComposerGrowthLimit`**、
  **`chatLineWidth` / `fileLineWidth`**、它们各自独立的 **`chatLineWidthBounded` /
  `fileLineWidthBounded`** 开关、**`customLayoutPresets: LayoutPreset[]`**、
  新聊天的可选 **`defaultModel: WireModel` / `defaultEffort: ThinkingLevel`**、挑选器的
  **`favoriteModels` / `recentModels: WireModel[]`**（默认 `[]`，因此 v77 之前的宿主读作“无”）、
  **`analyticsEnabled: boolean`**、**`analyticsConsentConfirmed: boolean`**、
  **`notificationsEnabled: boolean`**（关注通知的总开关）、
  **`subagentsEnabled: boolean`**、**`subagentMaxConcurrent: number`**、**`disabledExtensions: string[]`**
  （默认 `[]`，因此 v82 之前的宿主读作“全部开启”）、**`jbcentralQuotaEnabled: boolean`**，
  以及 **`jbcentralQuotaRefreshSeconds: number`** 搭乘同一个 `applyConfig` 折叠（宿主拥有，逐字段
  从 contracts 的辅助函数默认化/校验，因此一份更旧或畸形的宿主快照不能毒化
  该 store）。`terminalWindowsShell` 通过 `isTerminalWindowsShell` 窄化，否则使用
  `DEFAULT_CONFIG.terminalWindowsShell`；`TerminalSettings` 消费这两个终端字段，而终端的
  生成仍然由服务端拥有 —— Terminal、Line width、Chat、共享 Layout 目录、Privacy、提供商
  控件，以及 shell 配额这些读取侧。分析偏好与确认各自独立地默认为 false；
  store 绝不把偏好升级为确认。一个选择器组合宿主能力、已水合的
  配置，以及缺失的确认，来驱动那唯一一次首次启动提示。持久化偏好的预热
  与最终选择的更新都通过 `applyConfig` 收敛；对话框的视觉草稿仍是组件本地的。
  **`chatMessageOrder: ChatMessageOrder`** 与 **`streamingResponseMovement:
  StreamingResponseMovement`** 则是客户端本地的呈现偏好，由聊天偏好接缝从宿主限定的浏览器 localStorage
  或原生外壳注入的后端 profile/窗口作用域适配器一起水合。消息顺序默认最旧在前；移动默认
  `{ settle: 75, trigger: 100 }`。`setChatMessageOrder` / `setStreamingResponseMovement` 无需服务端往返
  即可改动它们，而 `applyConfig` 绝不能覆写其中任何一个。`ChatView` 按顺序投影每个
  运行时，而不重写规范轮次，并把移动窗口传入它唯一的滚动
  控制器。**`hiddenModels: ModelRef[]`**（`{ provider, id }` 对）是一个客户端本地的模型可见性
  偏好，带纯函数 **`hydrateHiddenModels(list)`** / **`setModelVisibility(model, visible)`** /
  **`toggleModelVisibility(model)`** 动作；store 不触碰任何存储 —— `chat/modelVisibility`
  水合并持久化它，而 `applyConfig` 绝不能覆写它。**`selectPickerModels(models,
  hidden, keep)`** 是每个模型挑选器的调用方都会应用的那一个过滤器：它保持目录顺序并返回
  可见模型加上任何 `keep` 条目（当前选择），因此隐藏绝不会让挑选器丢掉
  它正在显示的模型。完整目录仍然在 `ModelsSettings` 的可见性配置里可用。实例化的
  workbench frame、当前/默认预设 id，以及分组上限是由
  `shell/layoutState` 水合的独立本地值；`applyConfig` 绝不能覆写它们。那个
  **toast 队列** —— **`toasts: Toast[]`**（最旧在前）加上 **`pushToast(toast) → id`** / **`dismissToast(id)`**
  以及顺手的 **`toast.error/success/warning/info(message, title?)`** 辅助函数（包装 `pushToast`，好让非 React
  调用点 —— 一次即发即忘线上调用里的 `.catch` —— 也能发一个）—— 住在这里，好让任何界面都能升起
  一个瞬态通知。一个 toast 还可以携带 `durationMs` 和一个 `{ label, onClick }` 动作；
  `panels/Toaster` 通过 Radix `ToastAction` 渲染那个动作，其余的超时/滑动关闭由它拥有
  （错误会一直保留直到被关闭）。`pushToast` **会合并一个完全相同的、无动作的存活 toast**（相同的
  变体/标题/消息/时长 —— 一次重试的失败返回已存在的 id，而不堆叠一个孪生），
  绝不合并回调指向不同反操作的可操作回执，并且**只通过驱逐最旧的无动作通知来应用 5 个 toast 的上限**。
  可操作回执会一直留到它们自己有限的时长关闭它们，或用户关闭它们；
  如果动作已经超过五个，新的无动作 toast 是上限的驱逐候选，而不是某个 Undo 回执。
  它是**没有更好去处可落的被拒线上调用**的归宿（没有聊天标签页可以承载错误轮次），
  补充 `appendErrorTurn`（它处理聊天内的情况）。
  应用级的 **`templatesVersion: number`** 计数器 + **`bumpTemplatesVersion()`**（自增）是一个裸的
  失效信号，与下面 `fsChangesByWorkspace` 的 `tick` 形状相同 —— **`panels/TemplatesSettings.tsx`**
  与 **`chat/TemplateEditorDialog.tsx`** 在 `template.save`/`delete` 之后调用它，而 Templates
  设置面板自己的列表据它重新获取（它的 `useTemplateList` 获取代次）。它故意
  不是输入框 `/` 菜单的新鲜度来源 —— 那次获取在每次菜单打开时都无缓存地运行，
  因为文件也会在应用之外变化，那里没有任何应用内计数器看得见（见 `chat/SPEC.md` 的 Template
  slots 小节）；store 只持有计数器，绝不获取。**实时刷新信号** ——
  **`fsChangesByWorkspace: Record<workspaceId, { tick, paths, truncated }>`** 加上
  **`noteFsChanged(payload)`**（折叠一次 `workspace.fsChanged` 推送：`tick` 每帧自增；
  `paths`/`truncated` 是最后一批）—— 面板选中自己工作区的条目，并在 `tick`
  变化时重新获取（store 只持有信号，绝不获取；`applyWorkspaceRemoved` 丢弃被移除
  工作区的条目）。**评审切片** —— **`reviewsByWorkspace: Record<workspaceId,
ReviewSnapshot>`** 加上 **`setWorkspaceReview`**（一次 `review.get` 读取落定）与
**`applyReviewChanged`**（折叠一次 `review.changed` 推送 —— 完整快照，幂等；每个客户端，
包括某次变更的发起者，都在这里收敛 —— 没有乐观更新）；`applyWorkspaceRemoved` 丢弃
该条目；待处理草稿计数是一个选择器（`selectReviewDraftCount`），绝不在
组件里重复。**技能重新加载徽章**搭乘同一个 tick，没有单独的信号：
  `noteFsChanged` 还折叠 **`skillChangeTickByWorkspace: Record<workspaceId, tick>`** —— 最近一批
  *技能相关*批次的 tick，来自宿主撰写的 `payload.skillChange` 语义（`detected` 表示
  具体的项目技能路径，`unknown` 表示真正无法定位路径的不确定，`none` 表示具体的
  非技能变动）。它独立于有上限的通用 `paths`/`truncated` 对，因此一次大构建不能
  冒充技能变更，路径上限之后的技能事件也不会丢失；它保持*累积*，这样
  之后的一批非技能批次绝不会清掉它。新监听器的合成启动提示仍然保守地是
  `unknown`。传输层集中式的技能加载准备会等待 `workspace.watchReady`，除非监听器已知已就绪
  （该事件推送可能在重连期间死掉），否则折叠一次重复的 unknown 回退，
  然后捕获本次加载的基线 tick。新加载的会话保持干净；就绪之后的真实技能
  帧仍然新于基线。每个聊天记录
  **`skillsSyncedTickBySession: Record<sessionId, tick>`** = 它加载技能时的 tick。
  它**只在资源真正针对当前磁盘被（重新）加载时**推进：一次全新的
  `openChatSession`、一次纯磁盘的 `hydrateSession` 附加，以及一次成功重新加载上的
  **`markSkillsSynced(sessionId, syncedTick)`**（`markSkillsSynced` 是**单调的** —— `Math.max`，所以一个乱序的
  重新加载完成不能把基线往回移 —— 且**对被处置的会话是空操作**，所以迟到的完成不能
  复活被 `closeChatRuntime`/`clearWorkspaceState` 丢弃的条目）。一次**活着**的 `hydrateSession` 恢复
  复用服务端会话已经加载的技能（`getMessages` 只返回对话记录，不重新加载），
  而客户端无法为它注明日期，因此它**什么都不推进** —— 如果观察到过技能
  变更，该聊天保持*保守地过期*，绝不虚假地清除。那个
  `syncedTick` 是在技能加载往返的**起点**捕获的工作区 tick，紧接在
  共享的 `workspace.watchReady` 准备之后（`selectWorkspaceTick`，由调用方在
  `session.create`/`reloadResources`/`getMessages` 之前快照），**而不是**在完成时 —— 因此一个技能变更如果其
  `fsChanged` 帧在加载进行中折叠（这次加载并没有看到它），就仍然超在基线之后，
  让徽章保持点亮，而不是被悄悄吸收。
  选择器
  **`selectSkillsStale(state, workspaceId, sessionId)`** = `skillChangeTick > syncedTick` —— store 推导的
  （挺过 `ChatView` 的标签页切换重挂载）且按会话的（加载了当前技能的兄弟/更新聊天
  不会被标记；一次重新加载只清除自己的）。`updateFileTabContent` 把内容、`ResourceMeta`，
  以及捕获的 fs tick 一起写入。它的 diff 双胞胎 `updateDiffTabContent` 还会写入两侧的
  元数据、解析出的原始 oid，以及 `loadedTarget`；一个 `DiffTab` 在 fs-tick 或评审目标
  任一维度上是过期的，而两个身份都不能比它们所描述的内容活得更久。那个瞬态的
  一个 **`reveal-tool` `LayoutIntent`** 是揭示/聚焦某个单例
  侧工具的排列无关请求；shell 布局集成消费它，并解析该工具当前保存的位置。
  **`changesRequest`** 与 **`specRequest`** 给那次揭示加上可选的路径/条目目标，并携带一个
  浏览器本地的请求时中间区目的地，而不把布局关切暴露给特性视图。异步
  解析携带点击时刻捕获的本地目标分组的导航时钟戳：如果之后的关注抢占了它，工具仍可高亮该条目，
  但过期的完成不能抢走焦点。两个意图在处理之后都被消费，因此重新挂载/重新读取不能重放一次结构性打开。
  两个字段仍然必要，因为一个 gitignored 的规范属于规范图，而不是 git 派生的 Changes 视图。
  **`specsByWorkspace`** +
  **`setWorkspaceSpecs`** 持有每个工作区的 `spec.graph` 快照（由 `panels` 的
  `useWorkspaceSpecs` 获取，随工作区 fs tick 保持新鲜），以便
  聊天的轮次分隔线能就 Specs 面板渲染的同一份快照把一条写出的路径归类为规范
  —— “这个文件是规范”的唯一定义，经由 **`specPathMatcher(nodes)`** 选择器；随工作区在
  `applyWorkspaceRemoved` 中丢弃。`setWorkspaceSpecs` **在重新读取没有发现变化时保持先前的数组同一性**
  —— 大多数 fs tick 都不触碰任何规范，而一个新同一性会让
  `ChatView` 的匹配器 memo 失效，并大约每秒重新推导每个已打开聊天的整份对话记录。
  **`openDoc(tab)`** 缓存并放置一个解析后的 **`DocTab`** 或一个 **`PlanTab`**（`kind: "plan"`，
  id 为 `${workspaceId}:plan:${sessionId}` —— 每个聊天一页，重新打开会聚焦）。本地放置持久化
  只保留解析器种类 + 持久的会话身份，绝不保留缓存内容。`PlanPane` 实时读取宿主拥有的
  plan，所以该页没有会变旧的快照。**`DiffTab`** 是一个渲染器分派的变更文件，跨越**一个 diff 范围**
  （id 为 `${workspaceId}:diff:${scopeKey}:${path}` —— 每个*(文件, 范围)*一个标签页：**范围是标签页身份的一部分**，
  因为标签页的内容绝不能仅因为 Changes 工具的范围在它下面翻转就改变含义；
  标签页携带自己的 `scope`，那也正是 `DiffPane` 重新读取时用的对象，绝不是面板当前的那个）。
**一个标签页的身份所固定的是它显示*哪个范围* —— 种类，加上 commit 范围的 sha。** 一个
分支范围标签页的意思是“这个文件 vs 工作区的**当前**评审目标”，而该目标的移动 ——
因为提交落到了分支上，或因为用户重新指向它 —— 与工作树在标签页下面变化是同一份实时刷新契约，
而不是含义的变化；因此目标 ref **不**属于标签页 id（分支名不固定任何东西 —— 只有 commit sha 不可变，而它已经在
id 里了）。它*确实*要求的是：目标移动时标签页重新读取 —— `selectDiffTabTargetRef` 就是那
第二个活跃维度（见 `panels/SPEC.md` 的实时刷新契约）—— 以及标签页**记录它的内容实际上是
对哪个目标读取的**（`DiffTab.loadedTarget`，必需，每次内容写入都写它）。
只有当资源在本地被选中时面板才挂载，所以没有那条记录的话，一个在后台期间目标移动了的 diff
会带着已经到手的新目标挂载，判定什么都没变，然后在
新目标的标签下显示*旧*目标的 diff；缓存值正是挂载时用来比较的对象。`FileTab`
与 `DiffTab` 共享 `rendererId` 加不透明的 `viewState`，由工作区显式的 `setTabRenderer`
与 `setTabViewState` 写入，好让工作区切换之后才落定的卸载回调仍然更新它所属的标签页。
注册表拥有视图状态的解释权；更换渲染器或手机/桌面实现会丢弃
先前的不透明状态，而每个实现都拒绝它无法解释的状态。仅 diff 的呈现通过
`setDiffTabView` 把
`view` 保持为 split|inline（默认 split），并通过 `setDiffTabIgnoreWhitespace` 保持 `ignoreWhitespace`。文件文档上遗留持久化的
`view` 与 diff 文档上的 `rendered` 都在被接受的缓存形状之外，
读取时被忽略；不存在迁移状态。由 `ChangesPanel` 以 `keep` 意图打开（双击 /
*Open as tab*）；单击则改为打开 **`ChangesTab`**。**`ChangesTab`**（`kind: "changes"`，id 是
由 `changesTabId` 计算出的 `tupleKey("changes", workspaceId, scopeKey)` —— 每个*(工作区, 范围)*一个）是覆盖一个范围
**每一个**变更文件的评审界面。与 `DiffTab` 一样，它的范围是它身份的一部分，而目标 ref
不是；与 `DiffTab` 不同的是，它**不携带内容** —— 面板读取 `git.status`，每个节读取自己的
`git.diffFile`，所以持久化的布局标签页只是 kind + id + name + scope，重新加载时的水合无需请求即可重建
该标签页。标签页*真正*拥有的是评审进度：`viewed` 路径、`activePath`（视口
顶部的那个节，或在单文件模式下显示的文件；`ChangesPanel` 由它来高亮）、逐路径的
折叠覆盖盖过规模默认值、一次性的 `reveal`（`{ path, tick, commentId? }`，由
`openChangesTab` 写入，由面板在一次 `consumeChangesTabReveal` 写入中消费，那次写入同时落定
`activePath`、该节的展开以及一条发现的 `reviewFocusRequest`）、所有节的 `view` split|inline +
`ignoreWhitespace`，以及逐路径的 `rendererId` / 不透明 `viewState`，经由
工作区显式的 `setChangesTabSection*` 动作写入（完全相同的视图状态不算一次写入）。每个节还持有不透明的 `reviewDrafts`，由工作区/标签页/路径/键显式的
函数式动作更新。它们能挺过渲染器/视图状态变化，但挺不过标签页关闭或重新加载；写入不能
重建已关闭的标签页。第一次草稿写入保留预览而不导航，而且没有任何草稿写入
是宿主评审变更。渲染器拥有草稿形状与过期选择策略。
堆叠 vs 单文件模式**不**在标签页上：`changesLayout`（`"stacked"` 默认 |
`"single"`）像 `changesView` 一样是应用级的，是一种阅读偏好，而不是某次评审的属性。
该标签页像 `FileTab` 和 `DiffTab` 一样可作预览 —— 直到它持有进度为止：第一次 `viewed` 或
`kept` 写入（`recordChangesTabProgress`）同时在同一个 `set` 里保留它的规范布局放置，
因此恢复的预览和分组预览不能仅因为遗留预览
镜像是空的或指向另一个组就驱逐读者的标记。保留最后一个 hunk 原子地记录文件与 hunk 进度；
批量 viewed 更新是一次写入，而不是每个文件一次 store 通知加数组拷贝。进度是**会话作用域**的：
`viewed`/`kept` 只活在标签页对象上，重新加载会把标签页重建为空，且一个 viewed 文件在 agent 重写它时
不会失效（kept hunk 会，通过它们的内容键）—— 把 viewed 按文件
哈希跨重新加载持久化是已知的后续工作，而不是意外。
**`turnsByWorkspace`** 持有每个工作区由宿主记录的 agent 运行（`TurnChangeSet[]`，按 `startedAt`
最旧在前，按 id 去重并像宿主一样上限 30）。`applyTurnChanged` 既为未加载的
工作区播种，也替换已有的回执。`setWorkspaceTurns` 接收 `workspace.turns`
应答、那次读取之前捕获的不可变列表，以及它的连接代次。它用快照替换
基线，然后叠加对象同一性不在基线中的当前回执：初次/重连水合期间的
推送胜出，包括对同一 id 的替换，而被宿主省略的未变基线条目会被修剪。两条写入路径应用相同的排序、
去重与上限。不需要单独的推送缓冲或修订映射；唯一的加载器只保留
有界的基线，与有界的 store 列表并置。断连/旧代次的响应是空操作；
工作区移除丢弃该列表，它的墓碑拒绝之后的快照与推送。该列表由聊天的轮次分隔线（这一轮的回执）
以及 Changes 范围菜单（*Last turn*）读取。shell
是唯一的加载器（`useLoadWorkspaceTurns`，在每个连接代次重新读取 `workspace.turns`，
好让 socket 断着期间落定的运行仍然到达）；其他每个消费方只通过
`useWorkspaceTurns` 读取。
**`requestChangesView(workspaceId, path | null, scope?)`** 为聊天的
*Review turn* 动作增加了两个可选维度：`scope` 与揭示意图原子地落到 `diffScopeByWorkspace` 上，而
`null` 路径意味着“打开该范围的评审标签页”，而不是“揭示这个文件”。
**`diffScopeByWorkspace`** + **`setDiffScope(workspaceId, scope)`** 持有每个工作区 Changes
面板正在对*什么*做 diff（通过 **`selectDiffScope`** 读取，它默认到共享的、引用稳定的
`BRANCH_SCOPE`）；按**工作区**键控，而不像 `changesView` 那样是应用级的，因为一个范围属于那条
分支的评审 —— commit sha 在另一个工作树里毫无意义 —— 并随工作区在
`applyWorkspaceRemoved` 中一起丢弃。瞬态 **`chatLocationRequest`** —— 历史搜索跳转
  深链；请求方激活目标项目+工作区，workbench shell 集成
  打开/水合目标
  聊天，`ChatView` 消费并清除 —— 类型是 **`ChatLocationRequest { workspaceId, projectId, sessionId,
  messageIndex, anchorText, navigation? }`**，由 **`requestChatLocation(req)`** 设置（它在切换工作区
  *之前*捕获并推进一个已水合目标分组的本地时钟，并**原子地**设置 `selectedProjectId` +
  `activeWorkspaceId`，与 `activateWorkspace` 维持同一条不变量，因为目标聊天
  可能住在与搜索发起处不同的项目/工作区 —— 调用方
  `useHistorySearch.openMessage` 在目标项目的 workspaces 缺失时先加载它们），并由
  **`clearChatLocation()`** 清除；目标的锚点针对运行时的 `turnIdByMessageIndex` 解析
  （见 `chat/SPEC.md` 的水合条目），缺失时回退到最新的 `anchorText` 匹配。
  同族的瞬态 **`historyOpenRequest { id, sessionId }`** —— 由 **`requestHistoryOpen(target)`** 设置，
  由 **`clearHistoryOpen()`** 清除 —— 把 shell 应用级的 `Ctrl+R` 带到一个聊天上，由该聊天打开（或者，
  当它已经打开时，重新界定范围）自己的历史浮层；它走 store 恰恰因为这个快捷键
  完全在聊天子树之外触发（见 `shell/SPEC.md` 的“全局快捷键”）。目标来自
  **`selectHistoryTarget`**（本地选中的聊天，否则是该工作区最新的聊天），该动作
  把 workbench 选择与请求原子地排队；请求 id 关联被抢占的清理，
  而意图携带聊天资源，因此缓存/放置的 id 别名（包括由
  仅放置铸造解决的 id 冲突）仍然在语义上选中正确对象。那次选择故意不聚焦标签页，
  因为已挂载的历史查询拥有焦点。shell 更新该分组的本地关注，好让目标
  主体挂载并消费该请求，而不发布结构性快照。`EditorTab`（`FileTab`
  | `ChatTab` | `DocTab` | `DiffTab` | `ChangesTab` | `PlanTab`）+ `TerminalTab` + `ClosedChat` + `SessionRuntime` 类型。
  （Chat 的*渲染*类型 + 渲染器住在 `chat` 模块里。）`selectors.ts` 里的纯上下文
  选择器从这些规范 id 与集合解析活跃 `Workspace`、拥有它的项目 id，以及 shell 的上下文
  项目；派生的活跃项目状态从不单独存储。
- **Public surface（公开接口，barrel）：** `useAppStore`；`selectActiveWorkspace`、`selectWorkspaceById`（“这个
  id 的工作区”那唯一的一次查找 —— `selectActiveWorkspace` 就是它作用于活跃 id，而
  `openFileInTab`/`ChatView` 通过它读取工作树根），
  `selectCanRenameChat`（ChatView 与 shell 控件共享的那一处协议能力推导）、
  `selectWorkspaceTerminals`（宿主拥有的终端目录；布局可见性门禁从它提供的文档 + 本地关注推导要挂载的
  标识，而宿主附加仍按终端独占）、
  `selectActiveWorkspaceProjectId`、`selectHistoryTarget` + `HistoryTarget`（shell 的 `Ctrl+R` 路由
  目标：本地选中的聊天资源，否则是该工作区最新的聊天）、
  `selectContextProject`、布局放置选择器（递归的中间区加上左/右/下辅助
  分组）、`selectAttentionCenterTab`（本地最后关注的中间区里选中的资源）、
  `selectCurrentRouteChatTarget`（仅当其工作区与盖章的导航仍然有效时才是精确聊天
  意图）、`selectSkillsStale`、**`selectDiffScope` + `BRANCH_SCOPE`**（一个工作区的
  Changes 面板正在对什么做 diff，默认为共享的分支范围常量）、**`selectDiffBaseRef`**（它据以度量的
  ref —— 宿主那一处解析的客户端镜像）、**`selectDiffTabTargetRef`**
  （那个 ref *作为已打开 diff 标签页的活跃维度*：分支范围标签页的目标，对两侧无法移动的
  commit/未提交标签页则是 `""` —— 在此处推导，绝不在面板里重新拼装）、
  `selectWorkspaceTick`（同步基线快照）、`selectWorkspaceSessionIds`（去重后的本地聊天
  放置 + 历史成员资格，用作重连协调的基线）、归一化的会话状态
  选择器/动作（精确会话 + 工作区/项目级的需要输入/运行中/未读已完成汇总、直接
  激活、已就绪的精确完成确认）、`matchesWorktreePath`（把一个 agent 报告的路径 —— 相对或绝对 —— 对齐到
  一个工作树相对路径上；由 Changes 深链与规范分类器共享。后缀规则**只适用于绝对
  报告**，且锚定在分隔符上：不锚定的话，`/wt/src/a-foo.ts` 会匹配 `src/foo.ts`；用在
  相对报告上时，`module-b/SPEC.md` 会匹配*根* `SPEC.md`）+ `specPathMatcher`（一个写出的
  路径是不是规范图节点？）；
  `selectCatalogModel`（把模型 ref 解析到**当前**的 `models` 列表上 —— 会话自己的 `model`
  是它创建时的快照，所以它上面的宿主计算事实，如今是 `thinkingLevels`，要通过
  这个来读；当 ref 已离开目录时，调用方回退到该快照）；
  `selectPickerModels` + `ModelRef`（上面的隐藏模型挑选器过滤器）；
  MCP 推导 `deriveMcpServerRows` + `McpServerRow` / `McpRowState`、`MCP_STARTING_BOUND_MS`、
  `selectMcpRead` + `McpRead`、`selectMcpWorkspaceStarting`、`McpWorkspaceProjection`、`selectSupportsMcp`，
  以及资源辅助函数 `orderMcpResources`；`selectSupportsProjectTrust`（信任摘要与 pi 级资源授权所用的
  `PROJECT_TRUST_PROTOCOL_VERSION` 门禁）；
  `toast`（随处可触发的辅助函数）、
  `Toast`（类型）、web 本地的 frame/工作区视图/关注选择器与原子动作、资源渲染状态类型
  （file/diff/虚拟文档/plan/chat）、`TerminalTab`、`ClosedChat`、`SessionRuntime` +
  `EMPTY_RUNTIME`（ChatView 的创建前回退）、`ChatLocationRequest`（类型）、`reduceSessionEvent`。
- **允许的依赖：** `contracts`（`Project`/`Workspace`/`Model`/`ThinkingLevel`/`SessionStats`/
  `SlashCommandInfo`/`ExtUiRequest`/`LoginPush`/`WorkspaceFsChangedPayload`/`LayoutPreset`/`AppConfig`/`ThemeId`；
  `DEFAULT_CONFIG` 用于 welcome 之前的默认值；`PiEvent`/`LoginFrame`，**仅类型**）；`lib`（共享的
  路径 + 数组 + 规范消息原语 —— `normalizePath`/`isAbsolutePath` 供
  `matchesWorktreePath` 使用，`shallowEqualArrays` 用于快照同一性守卫，`userText` 加上技能调用
  解析器/匹配器用于用户消息回显协调，以及 MCP 的关注/活跃谓词；它是一片叶子，因此该边不增加环）；`chat`
  （`ChatTurn`/`ToolResultState`，**仅类型**）；`auth`（`LoginState`，**仅类型**）；`transport`
  （`ConnectionStatus`，**仅类型**）；`zustand`。
- **绝不触碰：** `server`/`shared`/`pi`；导入 `panels`、shell 运行时（web 本地布局状态边是仅类型的），或 transport 运行时。
