---
id: submodule-web-notifications
type: submodule-design
status: active
title: notifications — 应用外注意通知
parent: module-web
depends-on: [submodule-web-store, module-contracts]
---

## 职责

当 ThinkRail 未获焦点而某个工作树需要用户时，发出应用外通知——agent 提问、完成或失败。本模块是会话状态迁移的
**派生使用方**：它不引入新的真相来源，只引入 store 无法知道的那些客户端侧部件——窗口焦点、收集窗口、浏览器
权限、格式，以及总开关。

触发条件是单一信号：**绿色注意点亮起**（`needsInput !== null || completionUnread` 从 false 升到 true，
正是 [[submodule-web-store]] 使用的同一个判定）。每个原因都被统一覆盖——`ask_user_question`、ext-UI
对话框，以及未读的完成（`succeeded` / `failed` / `interrupted`）。用户取消的运行绝不在宿主上设置
`completionUnread`，因此它绝不点亮那个点，也绝不通知。同理，空闲聊天仍在运行后台命令或子代理时，宿主保持
`completionUnread` 为 false，因此这条边只在那些工作结束后才触发（其间会话显示为运行中）。宿主已经把
`agent_end` 与 `agent_settled` 折叠成 `completion`，因此本模块绝不监听原始的 agent 事件。

## 流程

生产者 → 队列 → 使用方，因此是否通知的决定被推迟到真正重要的那一刻：

- **观察器**（`useAttentionNotifications`，由 [[submodule-web-shell]] 挂载一次）：订阅 store，把每个上升沿
  喂给引擎。store 在每次变更时都会通知，因此该 hook 在重建候选之前先用 `sessionStateClock` 把关——流式增量
  绝不触碰注意逻辑。上升沿判定本身是纯函数 `attentionObserver`（基于 `detectAttention`）：它在第一个被安装
  的快照上、以及每次重连（`connectionGeneration` 变化）时静默打底，因此全新的
  `installSessionStateSnapshot` 绝不引发风暴。
- **引擎**（`attentionNotificationEngine`）：一个无 DOM 的队列，带一个全局收集窗口（`ATTENTION_WINDOW_MS`，
  1s）。累积的边作为一批冲刷；每个会话最后的事件胜出。
- **使用方**（冲刷）：只有当每道门都通过时才发出——总开关打开、频道权限已授予、窗口**未**获焦点，且该会话
  的点**仍然亮着**（已经回答过的边被丢弃）。只有一个幸存会话时，打开它的聊天
  （`activateWorkspaceFromRoute`，落在最新消息处）；有多个时，打开跨工作区的 `SessionSwitcher` 面板
  （[[submodule-web-store]] 上的 `openSessionSwitcher`），让用户挑选要去处理的那一个，而不是落进一个可能
  显示错聊天的窗口。`formatNotification` 把标题保持为加粗的 **ThinkRail** 标记，工作树作为 `subtitle`，
  原因作为 `body`（多个时是 `N worktrees need your attention`）；按会话的 `tag` 让浏览器替换而不是堆叠
  通知。

## 频道

使用方通过一个 `NotificationChannel`（permission / requestPermission / show）发出，由
`selectNotificationChannel()` 按能力挑选——抑制、格式、队列与设置都在它之上保持频道无关：

- **Web**（`webNotifications`）：页面 Notifications API。它没有 subtitle 字段，因此把
  `subtitle · body` 折成一行，并使用浏览器权限流程。它还会设置仅符号的 ThinkRail 图标（`/favicon.svg`，
  即浏览器标签页/外壳标志的图稿），Chrome/Edge/Firefox 会尊重它；Safari 忽略页面通知的图标并显示自己的。
  在移动端，构造函数可能抛错（Android Chrome 需要 Service Worker；iOS Safari 需要已安装的 PWA），此时会被
  吞掉当作空操作。
- **桌面**（`desktopNotifications`）：经由冻结的 `__THINKRAIL_NATIVE_NOTIFICATIONS__` 桥
  （[[module-desktop]]）的原生 OS 频道，把 `subtitle` 用作独立字段。权限归 OS 所有，因此 `permission()`
  永远是 `granted`，应用内前言绝不出现。Electrobun 的点击回调尚未落地，因此原生通知不携带点击动作。

选择只做能力检测（桥是否存在），绝不是 `desktop` 分支。两个频道都没有 Service Worker：完全关闭的应用没有
活着的客户端，按设计什么也不会发出。

**依赖 OS（桌面）。** 原生渲染是精确锁定的 Electrobun 2.0.1 后端，它接收 `title` + `body` + `subtitle` +
`silent`，并按平台渲染：macOS 的 `UNUserNotificationCenter`（原生 title/subtitle/body，首次显示时由 OS
请求授权）；Windows 的 `Shell_NotifyIconW` 托盘**气泡**（title + body；按 SDK 的说法 `subtitle` 折成额外
一行——不是 Windows Toast，也没有 App User Model ID）；Linux 的 libnotify/D-Bus（取决于 DE，Wayland 有
注意事项，subtitle 同样被折叠）。macOS 的 bundle id 来自 `apps/desktop/electrobun.config.ts`
（`identifier: ai.thinkrail.app`，名称为 `ThinkRail`），图标由 OS 提供（原生调用没有图标字段）。**限制：**
桥没有暴露任何读取 OS 权限状态的方法，因此桌面频道无条件报告 `granted`；如果用户在 OS 层面拒绝了通知，
调用会被接受但静默不显示。查询/处理 OS 权限（以及点击回调）被推迟。

## 抑制

一条规则：**窗口获焦 ⇒ 绝不通知。** 如果窗口持有焦点，用户就在 ThinkRail 里，无论开着哪个工作区/聊天都能
看到那个点，因此不需要按聊天的可见性检查。

焦点信号是**频道感知的**：`NotificationChannel.isWindowFocused()` 让每个频道使用可得的最佳 API。桌面频道
从原生桥获取 OS 层面的窗口焦点（`__THINKRAIL_NATIVE_NOTIFICATIONS__.isWindowFocused()`），当 DevTools
或其他窗口内 chrome 持有渲染器焦点时它会正确报告 `true`——原生窗口在 OS 层面仍然是聚焦的。浏览器频道回退
到 `document.hasFocus()`，在那个场景里它返回 `false`；这是一个已知的浏览器 API 限制，不影响最终用户
（只影响开着 DevTools 的开发者）。

**平台注意事项（Windows）：** 在 Windows 上，DevTools 作为独立的原生窗口打开；聚焦它会向主
`BrowserWindow` 发出 `blur`，于是 `isWindowFocused()` 返回 `false`——与浏览器频道同样的限制。在 macOS 上，
DevTools 停靠在同一个原生窗口内部，主窗口的焦点得以保留。Electrobun 2.0.1 只暴露按窗口的 `focus`/`blur`
事件，没有应用级的激活信号，因此跨窗口的解法需要未来的 Electrobun API。

## 权限

权限在最清晰的用户手势处请求。首要的、可见的路径是 Settings 面板（`panels/NotificationsSettings`）：打开
开关，或在权限仍为 `default` 时点击 **Allow in browser**，会直接调用 `Notification.requestPermission()`
——这种用户在场时的获取不依赖一个失焦事件（该面板也会显示 blocked/granted/unsupported 状态）。对于已经
启用的客户端，应用内前言（`NotificationPermissionPrompt`）是离开路径上的回退——只在第一批真正会通知的
（已通过抑制与开关的）事件之前、在系统请求之前显示，从而降低硬拒绝的风险。“Enable”调用
`Notification.requestPermission()`；“Not now” 静默 7 天（`notificationPrompt`，浏览器本地存于
`localStorage`）；`denied` 状态绝不再自动提示，并给出手动重新启用的提示。权限是按浏览器的，因此静默是
客户端本地的，而总开关是宿主同步的应用配置且默认为开（通知仍然需要浏览器授权）。

## 边界

- **拥有：** 注意通知流程、`NotificationChannel` 接缝，以及两个频道实现（浏览器 Notifications API + 原生
  桌面桥包装）。
- **Public surface（公开接口，`index.ts` barrel）：** `useAttentionNotifications`、
  `NotificationPermissionPrompt`、`selectNotificationChannel`、`NotificationChannel`、
  `NotificationPermissionState`、`ATTENTION_WINDOW_MS`。
- **允许的依赖：** [[submodule-web-store]]（会话状态读取、提示词状态、`activateWorkspaceFromRoute` 与
  `openSessionSwitcher` 动作）、`ui`（前言对话框）、[[module-contracts]]（`SessionState` /
  `SessionCompletion` / `NativeNotificationBridge` 类型）、React、Remix Icon。
- **绝不触碰：** 注意逻辑的第二处真相来源；监听原始 agent 事件；任何宿主/`pi` 导入；按 `desktop` 分支
  （频道选择是对原生桥的能力检测）。

总开关（`notificationsEnabled`）住在应用配置里；它的 Settings 面板是 `panels/NotificationsSettings`，不是
本模块。多客户端是可以接受的：焦点是客户端本地的，因此一个 agent 事件可能在多个已连接的客户端里各自通知。
