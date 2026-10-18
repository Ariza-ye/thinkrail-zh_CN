---
id: submodule-web-shell
type: submodule-design
status: active
title: 外壳 —— 响应式帧
parent: module-web
tags: [ui]
references: [module-desktop, module-contracts]
---

## 职责

响应式的组合根：顶层应用 chrome、活跃项目/工作区路由、主题应用、全局快捷键、区域错误隔离，以及把与
布局无关的面板组合成一个前端本地的桌面工作台帧。未来的移动外壳可以以不同方式投射相同的面板；它不得
意外继承桌面停靠。

## 边界

- **拥有：** 作为唯一组合根的 `Shell`；顶栏与常驻位置上下文；活跃项目/工作区路由；单一的 Settings、
  analytics 同意、面谈邀请、注意通知权限前言与 Toaster 挂载，加上键盘打开的 Create workspace 对话框与
  `Mod+K` 会话切换器（以及来自 [[submodule-web-notifications]] 的、只挂载一次的注意通知观察者）；
  主题应用与全局快捷键；注入的 Layout 与可选的应用程序 Update 设置分区；以及工作台引擎与 store、
  持久化、面板、由传输层支撑的领域状态和错误边界的集成。
- **Public surface（公开接口）：** `Shell`。
- **允许的依赖：** 子布局模块；`updates`；`panels`；`chat` 应用集成的水合/渲染；`store`、`transport`、
  contracts（类型、线上协议常量，以及共享的 `createQuitConfirmation` 规则）、`@thinkrail/ui/*`、
  `components/ErrorBoundary`、`components/QuietScrollArea`、`constants`、`lib` 和 `themes`。
- **绝不触碰：** server/shared/pi 导入；被 panels/store/transport 导入；把摆放知识放进某个功能面板；
  或通过传输层发送当前帧/视图状态。

## 内部模块

每个子项都是一个目录模块，以 `index.ts` 作为其公开接口：

- `layout/`（[[submodule-web-shell-layout]]）是纯的帧/视图变更、投射与渲染引擎。它绝不导入功能面板、
  store/transport 运行时或持久化。
- `layoutState/`（[[submodule-web-shell-layout-state]]）拥有本地水合、校验、持久化、原始 Balanced
  初始化，以及纯布局结果的原子安装。
- `layoutIntents/`（[[submodule-web-shell-layout-intents]]）拥有一次性消费的摆放意图路由，接入纯布局
  迁移。
- `chatReconciliation/`（[[submodule-web-shell-chat-reconciliation]]）拥有宿主会话/本地放置/缓存/历史的
  收敛以及聊天深链编排。
- `terminalReconciliation/`（[[submodule-web-shell-terminal-reconciliation]]）拥有宿主终端目录/本地放置
  的收敛，但不拥有 PTY 生命周期。
- `legacySelection/`（[[submodule-web-shell-legacy-selection]]）是从工作台注意状态到迁移时代活跃编辑器/
  终端/预览镜像的唯一临时适配器。
- `locationBar/`（[[submodule-web-shell-location-bar]]）拥有顶栏带标题的位置分段及其项目 / 工作区 / 分支
  控件；它按文件到达 `panels` 以及 `store`/`transport`，绝不触及布局引擎。

同级依赖图是：`layoutState → layout`；`chatReconciliation → layout + layoutState`；
`terminalReconciliation → layout`；
`layoutIntents → layout + chatReconciliation + terminalReconciliation`；`legacySelection` 只到达
store 选择器/动作；而 `WorkspaceWorkbench` 把每个活跃编排 barrel 与 `layout`、面板和渲染回调组合起来。
聊天资源可用性被隔离在一个按会话的选择器组件背后；父工作台绝不订阅整个 `sessions` 记录，因此一个流式
运行时无法让每个标签页渲染器及其背后的侧边工具失效。同级只通过 barrel 导入。测试与拥有该行为的编排模块
同住，而不是让 store 测试导入外壳的运行时副作用。

## 组合

顶栏保留 ThinkRail 身份、连接状态、Settings 和紧凑的位置上下文，并在原生宿主移除自己的标题条时兼作
**窗口标题栏**（[[module-desktop]]，*原生窗口外壳*）。它是一个固定的 `h-topbar-row`
（`--topbar-row-height`，40px —— macOS 标题栏比例，因此原生红绿灯居中其中）并带 `px-16`，且它是
宿主无关的：唯一宿主形状的输入是 `<html>` 上的三个 CSS 自定义属性。`--window-chrome-inset-left` /
`--window-chrome-inset-right` 通过 `w-window-chrome-inset-*` 间距 token 被每侧一个 `aria-hidden`
边缘垫块消费（`window-chrome-inset-left|right`）；未设置时（任何浏览器）它们解析为 `0px`，头部
与之前看起来一样，而桌面在 macOS 上发布 `64px`，因此内容从 80px 开始，并在全屏时把它收缩到 `0px`。
`--window-chrome-drag-region` 驱动头部的 `window-drag` 工具类，除非宿主发布 `drag`，否则它解析为
`no-drag`，因此一个浏览器标签页或一个带原生装饰的窗口绝不会获得拖拽条带。内边距刻意没有用于 inset：
`spacingUsage` 门禁只让内边距工具类命名规范步长，而一个 CSS `padding-left: max(…)` 会需要一次门禁
豁免。头部是 `select-none`；它整个尾部动作簇（`topbar-actions`）是 `window-no-drag`，因此任何放在
其中的按钮 —— Update 可供性、配额 Retry、Settings —— 按构造就被排除在拖拽之外；`Shell.tsx` 自己
不在头部放任何其他按钮（`topbarChrome.test.ts` 门禁这一点）。
位置条（[[submodule-web-shell-location-bar]]）是唯一刻意的例外：它的胶囊与 chip 各自带
`window-no-drag`，而它们的标题与细线仍可拖拽，因此用户仍然可以在控件之间的条带上抓取。诸如连接标签这样
的纯文本保持可拖拽。唯一的另一个按钮组是 `NativeWindowControls`：当宿主安装可选的
`NativeWindowControlsBridge`（`__THINKRAIL_NATIVE_WINDOW_CONTROLS__`，[[module-contracts]]）时
—— 今天只有 Windows 桌面 —— Shell 挂载 `useNativeWindowControls`，它镜像 `updates` 的能力 hook
（全局只读一次，`getState`，订阅，浏览器里为 `null`；状态不携带修订号，因此一旦任何推送到达，初始
`getState` 快照就被丢掉），并渲染三个 props 驱动的 46×40 标题按钮（最小化、最大化或还原、关闭），
作为固定在头部右上、位于宿主通过右侧 inset 预留区域内的 `window-no-drag` 覆盖层；当状态说
`fullScreen` 时它们消失。这些控件不拥有任何窗口状态，也绝不进入 store；该 hook 用 `console.warn`
报告被拒绝的动作或快照读取，而不是抛出。Windows 标题按钮惯例（没有 tooltip、全高命中目标、经由
`feedback-error-subtle` 的红调关闭悬停）是刻意的；macOS 保留 AppKit 的红绿灯，并且从来看不到该桥。
`SettingsDialog` 从头部 portal 出去，不受影响。外壳中没有任何东西命名或导入桌面宿主。`Shell` 挂载可选
的 update hook，注入受版本门禁控制的空宿主动作，并把归一化状态传入 props 驱动的控件。它的紧凑状态可供性
打开注入的 Update 分区；没有该能力时，两者都不渲染。面板收到可选 React 内容，绝不是启动器或原生运行时
检查。顶栏身份是仅图标的 ThinkRail 标志——与 `public/favicon.svg` 所提供的是同一个矢量，以 32×32 内联，
并通过语义化的 `text-primary` 渲染——位置之前没有分隔符。有上下文项目时，标志后跟 `locationBar` 条：
带标题的分段 **Project · Workspace · Branch · from base · Remote · Pull request**，其值是控件（项目
切换器、工作区动作 + 兄弟切换器、分支卡片、远程/PR 状态 chip），放置顺序与语法由
[[submodule-web-shell-location-bar]] 拥有。Shell 把上下文项目、活跃工作区（或 Project Home 时的
`null`）、来自 `useOpenBranchReview` 的打开评审，以及打开外壳自有的 New workspace 对话框的回调传给它。
没有选中的项目时，logo 单独存在。

紧接在宿主连接状态之前，顶栏有条件地渲染 **JetBrains 循环配额读数**（协议 v59）：一个中性的 Coins
图标 + 按区域格式化的 `remaining / total credits`。它只在同步设置已启用且宿主报告 Central 健康时存在；
零没有警告策略。已加载/加载中是非按钮内容，带一个新鲜度 tooltip。首次失败是
`Quota unavailable · Retry`；后续失败把最后一个值作为过期值保留，并带一个小警告新鲜度标记与 Retry。
数值更新与轮询循环都不是 aria-live。窄宽度在图标或配额数字之前先隐藏 `credits` 与现有的连接标签。

`Shell` 拥有可见客户端轮询控制器：在激活/重连/提供商失效/可见恢复/配置变更时立即请求，然后在每个配置
的 `1–3600` 秒间隔之后发一次不重叠的请求（默认 30）。隐藏的文档与已禁用/宿主隐藏的结果会取消定时器；
Retry 会强制已完成缓存变老，但仍加入宿主端 single-flight。请求序列守卫阻止旧响应恢复一个已被取代的
状态。宿主拥有健康、缓存与去重；外壳绝不直接调用或解释 Central。

有活跃工作区时，`Shell` 直接挂载工作台；只有一个惰性的 Pierre 资源体才会挂载 worker 池提供商，因此普通
的工作区既不请求 Pierre 的 chunk，也不启动它的共享池。切换工作区会改变资源内容与注意状态，但绝不改变
帧拓扑、Projects/Specs/Files/Changes/Review 的放置、侧/底几何、折叠、可见性、对齐，或某个组显示哪个
单例工具（一个被选中的工作区资源，比如终端，保持在按工作区的作用域内）。这也是一条 React 不变量：
`WorkspaceWorkbench` 在切换期间保持挂载，并由其 `workspaceId` prop 重新定位，绝不以工作区作 key。帧
chrome——面板组、常驻边缘轨道、侧/底栈、中心条带与 Projects 树——保留其 DOM；资源体与按工作区的工具
内容互换。一个辅助头部可以根据工作区本地选中在其工具标题与终端会话条带之间切换，而不替换窗格外壳。资源体
既按资源 id 也按工作区作 key，因为某些布局 id 是确定性的（每个工作区的初始终端都是
`terminal:thinkrail-initial`）：同一个 id 绝不能把一个工作区的活 xterm 或窗格带进另一个工作区的提交。
因此一次切换不会为 chrome 绘制任何淡入、骨架或空帧，而工作台调用的每个 hook 都必须容忍变化的
`workspaceId`：属于某一个工作区的状态由该 id 限定，或住在一个按工作区作 key 的 store 切片里，而为上一个
工作区计算出的任何就绪标志，都不得在针对下一个工作区的一次 effect pass 中被读取。对一个尚未物化本地视图
的工作区的首次访问也不会重新挂载：一旦帧就绪，工作台会在 `layoutState` 安装同一视图之前的单次提交中渲染
该帧的空视图投射，因此帧的 key 永不改变。"Restoring workspace layout" 占位符只在本地帧水合之前存在。
进入或离开 Project Home 是切换 Shell 分支，而不是切换工作区。Shell 自有、包住 Projects、Files 与
Specs 的包装器使用 `components/QuietScrollArea`，Project Home 导航器也如此；Changes/Review 与 xterm
在 `panels` 中拥有各自的内部静默滚动表面。这些原语绝不接收或推断放置。一个改变形状的帧命令（折叠/展
开、侧或底可见性、对齐、组增删、预设应用/重置）绝不重新挂载工作台的 `ResizablePanelGroup`s 或其中的
资源体：面板就地增删，引擎以命令式方式强制执行已提交尺寸（[[submodule-web-shell-layout]]，*不重新挂载的形状变化*），因此一个聊天对话记录、编辑器、终端或
工具窗格在相邻窗格出现或消失时保留其 DOM 与状态。只有在外层列与对齐行之间移动的侧栈（一次对齐变更，或隐藏/显示一个拥有底角的侧边）才会
重新挂载，因为它改变了父级。没有活跃工作区时，Shell 挂载 `ProjectHome`：Welcome 挨着项目导航器，使用
单独的本地几何（`thinkrail-shell-welcome` 自动保存加一个记住的展开尺寸），绝不是工作台帧；它与帧的唯
一联系是原始默认值 —— 窗格按内置 Balanced 预设的左宽度打开，因此一个全新表面在 Home 与工作台里显示相
同的 Projects 边缘。它的 chrome 就是工作台的：同一条常驻 40 px 左工具轨道，只有一个 Projects 条目
（显示时用 Fill 图标与强调边缘，`aria-pressed`，`aria-controls` 该窗格），以及同一个带 Hide 控件的纯
窗格头部，由 `layout` 导出的原语（[[submodule-web-shell-layout]]）围绕一个外壳自有的
`useCollapsibleRegion` 组合而成。那里不渲染右或底轨道：Specs、Files、Changes、Review 与终端都是工作
区资源，因此一条空轨道会宣传无法动作的工具。轨道条目、Hide 与 `Mod+B` 是同一个开关：当焦点在窗格内任
何位置（含头部）或在其分隔符上时，隐藏会把焦点交还给轨道控件，否则保持不动；显示会聚焦最后聚焦的树控
件，否则活跃行，否则第一个控件 —— 头部的 Hide 按钮绝不是落点。在工作区内隐藏 Projects 不会在 Project
Home 上隐藏它：Home 是导航表面并保持自己的状态。Settings 对话框、analytics 同意窗口、被寻址的面谈邀
请、注意通知权限前言与 Toasts 各自在两个分支之上挂载一次；注意通知观察者
（`useAttentionNotifications`）同样只在这里运行一次。同意窗口是浏览器与桌面客户端共用的、与布局无关
的面板，由已水合的宿主配置与协议支持门禁；外壳只拥有它的放置。同意优先于自动面谈邀请，因此启动时绝不
会堆叠两个提示。
在 `main.tsx` 的同步首绘应用之后，Shell 是唯一挂载的主题副作用属主。当 `welcomeGeneration === 0` 时
它保留带版本的偏好提示；之后它把 store 的不透明固定 id + 固定/系统模式 + 可选对通过 `themes` 投射
出去，并写入调和后的提示。固定模式没有媒体监听器。系统模式恰好拥有一个 `prefers-color-scheme` 监听器，
在变化时重新应用本地解析出的槽位，并在偏好变化/卸载时清理它；那个本地事件绝不更改 store、绝不调用宿主、
也绝不改变另一个客户端。其他任何组件都不更改 `[data-theme]`。

## 工作台行为

持久的帧语法与纯操作属于 [[submodule-web-shell-layout]]。Zustand 携带一个 `WorkbenchFrame`、本地布局偏好，
以及按 key 的 `WorkspaceViewState` 值；已挂载的文档是派生的，绝不作为第二权威被持久化。帧加视图的迁移
通过 `layoutState` 原子提交。

辅助工具使用常驻边缘轨道，其簇镜像各窗格；终端组总是单独的窗格（工具与终端绝不共用一个），并在其窗格内
暴露具名会话标签页。中心资源保留它们现有的条带。轨道激活只通过布局引擎改变选择/可见性；New terminal
仍是唯一的创建动作，而布局拥有它的放置（放进一个终端窗格，或放进工具窗格下方的新窗格）—— 外壳不注入任何
侧边菜单动作。工作台显式接收工作区身份，以便在不重新挂载的前提下围住待定的拖拽/焦点工作。

资源打开会路由到该工作区最后聚焦、仍存活的中心组。重新打开一个规范资源会选中它的本地放置，而不是重复它。
资源关闭在一个帧组变空时不会移除该组。显式的拆分/添加/移除/合并命令拥有拓扑；组移除会在一次状态提交之前
确定性地把资源从每一个本地保留的工作区视图中重新安置。应用预设遵循同样的全视图规则。移动一个单例工具或
调整/折叠/显示一个区域会改变那唯一一个帧；在既有组之间移动一个文件/聊天/diff/文档/终端只会改变活跃
工作区视图。指针/调整尺寸草稿保持运行时本地，并在完成时发布一次本地迁移。

布局持久化的边界是 `layoutState`，而不是 store。浏览器按后端端点与前端表面身份限定状态；原生窗口使用注入
的稳定字符串适配器的配置档/窗口作用域，键固定，与宿主的动态端口无关。两条路径都持久化并解码同一份有界
文档。状态在加载时被 schema 校验，并在重载或受支持的窗口会话恢复时被恢复。同时存在的窗口不会观察到彼此的
存储写入。一个没有有效本地文档的表面从 Balanced 帧开始；旧的宿主快照与旧的浏览器注意键从不被读取。

项目/文件/变更/评审/聊天/终端视图只收到资源身份、可见性与容器边界。移动一个视图无法改变模块依赖，也无法
让它检视帧。终端体只在那个终端于一个可见、未折叠的组中被本地选中时才挂载；隐藏的终端标签页保持未挂载，而
它们的宿主 PTY 继续运行。

每一个异步的资源/会话/目录水合在安装数据或后续放置之前，都会检查连接世代、工作区生命周期，以及当前的本地
帧/视图身份。对端创建的聊天仍可通过宿主历史被发现，但不会打开本地标签页。宿主终端目录成员是共享的：调和会
移除已死的本地引用，并把一个新发现的目录标签页放进一个兼容的本地终端槽位，而不改变帧几何、也不抢走注意。
显式的终端关闭仍属于宿主领域生命周期，并在每个表面收敛移除。

默认终端的创建不再依赖一次宿主布局修订。工作区创建流程携带一个宿主自有的待定标记；宿主预留那个确定性的、
无进程的终端目录条目，并只在持久成功之后才清除该标记。然后每个前端把该目录标签页放到本地，通常放进它的
底部槽位；PTY 挂接仍然等待可见性门禁。

## 布局设置

内置预设仍由 Web 拥有。Layout 分区呈现内置预设加上宿主同步的自定义预设目录，而默认预设选择与独立的侧/底
限制是本前端表面的本地状态。被选中的默认值是显式的 Reset 帧目标；它不会在工作区切换时被重新应用，因为每个
工作区共享当前帧。捕获/重命名/删除只改变共享的自定义定义。哪个预设已应用从不被存储：当实时帧匹配该预设的
几何（`frameMatchesPreset`）时，一张卡片就读作已应用，因此一次手动调整尺寸会直接清除该标记。Apply 或
Reset（各自背后一次确认）会替换本窗口的帧，并重排所有保留的工作区视图，保留资源身份，然后在本地持久化；
另一个前端不受影响。

## 长时间操作反馈

启动一个 agent 会话要花数秒（watcher 就绪 + `session.create`），因此它绝不是静默的：每条聊天启动路径
—— New-chat 按钮（空的中心与标签栏）以及 Settings › MCP servers 的 *Open a chat*（它们共享
`panels/openChat` 的 `startChatInTab`）、`NewWorkspaceDialog` 的创建并启动流程，以及重新打开一个已关闭
的聊天（`openChatInTab`）—— 都用 store 的按工作区聊天启动计数器（`beginChatStart`/`endChatStart`，
用计数器是因为多次启动可以重叠）来括住它的请求；工作树创建按项目做同样的事
（`beginWorktreeCreation`/`endWorktreeCreation`），`ProjectTree` 把它渲染为该项目下方的一行待定行
—— 列表保持不动，新的工作树落在该行原来的位置。消费方把它们显示为结果将出现处的内联待定状态：空中心按钮
翻转为一个禁用的转圈（"Starting chat…"，也是双击守卫），而聊天历史触发器在重新打开的聊天水合时转动。
工作区移除会随其余按工作区状态一起丢弃该计数器。

## 错误韧性

每个独立挂载的工作台资源体 —— 包括文档、终端与单例工具 —— 都有自己的按 key 区域边界，因此一个坏的惰性
面板无法让工作台 chrome、兄弟组或外壳变空。切换工作区或资源会重置卡住的区域错误。失败的动态 chunk 会提供
页面重载，而不是重试同一个过期模块。`main.tsx` 保留围绕 `Shell` 的最后手段边界。

无效的本地布局状态会回退到 Balanced 安全帧，而不污染领域状态。一次本地持久化失败会让实时帧保持可用，
并报告一个可操作的错误。一次自定义预设设置失败会让已实例化的当前帧和目录都不变。

一个其会话还不在本地运行时缓存中的聊天标签页会渲染与其他正在恢复的资源相同的内容骨架 —— 绝不在一开始
就给一个手动的 "Retry" 可供性，因为 `chatReconciliation` 的放置/目录收敛在绝大多数情形下已经在一两
秒内自动水合它，而一个立刻出现的重试按钮会在本属正常加载时读作 "this failed"。`ChatResourceBody` 只在
水合停滞超过一个短暂的宽限窗口（`CHAT_RETRY_DELAY_MS`）之后，才把骨架换成显式重试消息，因此重试可供性
只为其存在所针对的真正卡住情形浮现。

## 聊天标题控件

一个聊天标签页既有的上下文菜单新增 **Rename chat**，而工作区 **Recently closed** 聊天菜单中的每一行都
新增一个可见的铅笔动作。与工作区重命名一样，每个动作就地用一个携带相同排版与几何的无 chrome 单行输入框
替换它自己的标签；该字段已预填、已聚焦并已选中。Enter 或失焦提交，Escape 取消，而空白、超过 80 字符以及
未改动的值绝不发出请求。键盘提交/取消会恢复被替换的标签页或历史行控件；指针失焦保留用户的新焦点目标。
具名的、受视口限定的交互式历史浮层在其行被编辑期间保持打开且可滚动。只有当 welcome 协议支持
`session.rename` 时，这些控件才渲染。

外壳把仅限聊天的变更回调注入到本属领域中立的 Workbench 标签页菜单，而不是去教纯布局引擎会话是如何持久化
的。一次提交没有乐观领域写入：内联编辑器会回到先前宿主自有的标签，直到既有的 `session_info_changed`
store 折叠在各处更新打开的标签页与已关闭历史；拒绝会保留该快照并抛出标准错误 toast。重命名一个已关闭的
聊天不会打开或选中它；重命名一个打开的聊天不会改变放置或焦点。自动标题到达使用同一个标签折叠，但不打开
编辑器、通知或焦点迁移。ChatView 的 `/name` 命令是通向同一个线上协议变更的独立键盘入口。

## 全局组合键

`useGlobalHotkeys` 仍是应用级组合键的唯一捕获阶段属主。它通过工作台命令表面路由命令，而不是命令式的功能
面板 ref：

- `Ctrl+R` 为本地选中的聊天打开聊天历史，否则回退到该工作区最近的聊天；
- `Mod+B` 切换左侧，恢复本地组/标签页注意或一个符合条件的单例工具；
- `Mod+J` 对右侧做同样的事；
- `Mod+Shift+J` 切换底部，恢复本地底部注意、一个面向底部的单例，或终端创建表面；
- `Mod+N` 及其别名 `Mod+Alt+N` 为上下文项目（活跃工作区所属的项目，否则选中的项目）打开
  `NewWorkspaceDialog`。外壳把这个唯一由键盘打开的实例作为本地状态拥有 —— 它不是 store 状态，也不是
  `ProjectTree`/`WelcomePanel` 的实例，那些保留各自的返回焦点与提示播种语义。`Mod+N` 是规范组合键，也是
  快捷键 chrome 首先宣传的那个；别名存在是因为浏览器把 Cmd/Ctrl+N 保留给新窗口、从不会送达页面，而桌面
  webview 会。这是唯一接受 Alt 的组合键。
- `Mod+K` 打开 `SessionSwitcher`，一个列出活会话的模态面板 —— 只有那些需要注意或正在运行的，按
  `ProjectTree` 顺序按项目分组，并在每组内按 needs-input > error > unread > running 排序。它由全局
  归一化的注意快照（`sessionStateByWorkspace`）驱动，因此会浮现本客户端尚未加载的工作区中的会话；它在
  打开时用 `workspace.list`/`session.list` 回填这些会话的工作区名与聊天标题，并通过
  `activateWorkspaceFromRoute` 跳转到选中项。它的打开状态住在 [[submodule-web-store]]
  （`sessionSwitcherOpen` + `openSessionSwitcher`/`closeSessionSwitcher`/`toggleSessionSwitcher`），
  因此来自 [[submodule-web-notifications]] 的聚合注意通知可以在点击时浮现该面板；外壳通过
  `toggleSessionSwitcher` 绑定该组合键。由于该面板本身就是一个模态，全局组合键在它打开时被抑制，因此
  它拥有自己的 `Mod+K` 关闭开关（与 `Esc`/背景同列）。它既不接受 Shift 也不接受 Alt。
- 行与头部图标复用 `ProjectTree` 词汇：一个前导的 `RiChat2Line`（运行时包在 `RunningIcon` 中）和一个
  尾随的 `AttentionDot`，用于需要注意的会话 —— 没有为每种结果定制的图标。

字母组合键匹配物理的 `KeyboardEvent.code`，绝不是依赖布局的 `key`。布局与创建组合键在 xterm 内仍属应用
所有、不重复，并在一个模态对话框打开时被抑制。没有活跃工作区时，右/底组合键既不动作也不吞掉浏览器组合键；
`Mod+B` 以上文的焦点规则切换 Project Home 的 Projects 窗格。没有上下文项目时，`Mod+N` 同样既不动作也
不吞掉。终端的 `Ctrl+R` 仍属于 xterm；`Ctrl+Shift+R`、macOS 的 `Cmd+R`、F5 与浏览器重载保持不动。其他
所有摆放操作由 [[submodule-web-shell-layout]] 中的布局命令/菜单系统暴露。

**原生快捷键。** Shell 总是挂载 `AppShortcuts` 叶子。`useAppShortcuts` 读取一次
`NativeShortcutsBridge`（`__THINKRAIL_NATIVE_SHORTCUTS__`，[[module-contracts]]；仅桌面宿主）。没有该桥
时，它不添加任何监听器，也不渲染任何东西。有该桥时，该叶子渲染提示，因此提示变化只会重渲染该叶子。每个
应用级的关闭/退出/设置快捷键都通过一张命令表 `shortcutCommands.ts` 派发：一个命令 id（`close-item`、
`quit`、`open-settings`）按快捷键平台映射到 Ctrl 组合键，每个组合键携带它的终端规则，而该 hook 提供
id → 处理器的映射。来自 `subscribeCommand` 的两个原生命令与 Web keydown 组合键运行同一个处理器。当桥
存在时，快捷键平台是 `platformFamily()`（`apple` / `windows` / `linux`），否则是 `browser`。

| 平台 | 退出 | 关闭项 | 打开 Settings |
| --- | --- | --- | --- |
| apple | 原生 Cmd+Q（宿主确认） | 原生 Cmd+W | 原生 Cmd+, |
| linux | Web Ctrl+Q（Web 确认） | Web Ctrl+W、Ctrl+F4 | Web Ctrl+, |
| windows | 无（Alt+F4 是操作系统窗口关闭） | Web Ctrl+W、Ctrl+F4 | Web Ctrl+, |
| browser | 无 | 无 | 无 |

Web 组合键只有 Ctrl（没有 Meta/Alt；除产生标点组合键字符的情形外没有 Shift），在窗口捕获阶段处理，且
每次物理按下只动作一次：重复的 keydown 被吞掉，但绝不运行。在 xterm 内，Ctrl+W 既不被处理也不被阻止，
因此外壳能拿到它；Ctrl+F4、Ctrl+Q 与 Ctrl+, 仍属应用所有。该表在 apple 上不绑定任何东西（原生拥有那些
组合键），在浏览器里也不绑定任何东西，因此该 hook 只在 `hasWebShortcuts` 为真处添加窗口按键监听器。字母
组合键匹配键入的拉丁字母（`key`），当布局在该处键入非拉丁字母时回退到 `code`；标点组合键（Ctrl+,）匹配
键入的 ASCII 字符，允许由它产生的 Shift（俄语 Windows 的 Shift+/），当布局在该处键入非 ASCII 字符时回退到
不带 Shift 的 `code` —— 因此 AZERTY 的 `Comma` 键（`;`）与 US 的 Shift+Comma（`<`）都不匹配；macOS 菜单
也按字符匹配。F4 匹配 `code`。这是上文物理 `code` 规则的刻意例外：关闭与退出是破坏性的，而在 AZERTY 或
Dvorak 上，W/Q 位置键入的是撤销或全选。修饰键与组合键先匹配；xterm 检查只对已匹配的组合键运行。Web 自有的
组合键在焦点位于沙箱化 HTML 预览 iframe 内时不触发：它的 keydown 绝不会到达父窗口。

`open-settings`（原生或 Web）只在没有模态层打开时，在其默认分区打开 Settings：已经打开的 Settings 保持
原样（分区与草稿保留），而另一个对话框保留键盘。该守卫住在这里，而不是 store 的 `openSettings` 里，因为
它的调用者会深链到各个分区。浏览器刻意不绑定任何 Settings 组合键：Mac 浏览器为它们自己的设置拥有 Cmd+,，
而桌面是主要表面。Settings 齿轮的 tooltip 只在绑定了该组合键的地方宣传它（`Settings (⌘,)` /
`Settings (Ctrl+,)`），依据同一次桥与平台读取（`readSettingsShortcutLabel`）。

退出确认在两处都运行共享的 contracts `createQuitConfirmation` 规则：macOS 上的宿主，Linux 上的 Web。
Web 适配器从 Ctrl+Q 的 keydown 起跟踪按住状态，直到同一个物理 `code` 或 Control 的 keyup，在 keyup 时
调用 `sync()`，并把窗口失焦或隐藏的文档当作 `cancel()`：一个已确认的手势（提示为 `release`）会退出，否则
隐藏。一次已确认的退出会调用一次 `bridge.quit()`；如果它 reject，适配器会重置规则，使药丸隐藏且 Ctrl+Q
重新可用。无论哪种情况，Web 都把提示渲染为 `QuitHintOverlay`，一个居中的、`pointer-events-none` 的
`role="status"` 药丸，在 `hidden` 时淡出并在淡出期间保留最后的文本；文本点名平台组合键（`⌘Q` /
`Ctrl+Q`）。

`close-item` 绝不是窗口关闭：如果有一个可关闭的层打开（任何位置的模态或打开的 Radix
dialog/alertdialog/menu；聊天历史浮层只在拥有 DOM 焦点的组内，或当没有任何组有焦点时在任何位置；选择器
以及与 `useGlobalHotkeys` 共用的 xterm 测试在 `shortcutLayers.ts` 中），该 hook 向获得焦点的元素派发
`Escape`，让每个层保留自己的 Escape 语义。该 Escape 是合成的（不可信），因此每个可关闭层必须在
document/window 级别或在焦点的某个祖先上捕获 Escape，且不得按 `isTrusted` 过滤；Radix 的
`DismissableLayer`（document 捕获）与 `HistoryOverlay`（window 捕获）都做到了，e2e 的
`close-quit-shortcuts` 守卫这一点。否则它在外壳自有的 `closeRequestChannel.ts` 上触发
`requestClose`（作为 `subscribeCloseRequest` 注入工作台，因此没有渲染级联），工作台通过与标签页 X 相同的
`onRequestClose` 路径关闭聚焦组的选中标签页，否则关闭最后聚焦的中心组（含终端确认）。单例工具、折叠的组
与整个区域绝不被关闭；没有任何可关闭的东西时是 no-op。没有活跃工作区时，只有层这一步适用。每个组合键只有
一个属主：命令表里的组合键绝不同时绑定在 `useGlobalHotkeys` 里，而宿主原生转发的组合键绝不会出现在该平台
的表里。
