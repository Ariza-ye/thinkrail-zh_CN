---
id: submodule-web-navigation
type: submodule-design
status: active
title: navigation — 客户端本地路由与恢复
parent: module-web
depends-on: [module-contracts]
tags: [ui, navigation, multi-client]
references: [architecture, module-desktop]
---

## 职责

客户端本地的位置层：为 main/Project Home/工作区/聊天提供一个后端相对、可序列化的路由，加上浏览器 fragment
驱动，以及在改变被渲染的 store 之前用宿主拥有的状态校验来路路由的恢复协调器。

本模块让位置可移植，却不把它变成共享状态。浏览器标签页拥有各自独立的 fragment；Electrobun 外壳按后端
profile/窗口持久化观察到的 fragment，而后来的移动外壳按 profile/设备持久化它。跨客户端的续接是一个显式的
链接/书签动作，绝不是后端自动拥有的活跃位置。

## 边界

- **拥有：** `NavigationLocation`；带版本的 fragment 编解码器；`NavigationDriver` 接缝
  （`read`/`replace`/`push`/来路位置订阅）；浏览器 fragment 驱动；启动/直链恢复与规范回退；push 与
  replace 的历史决策；序列化意图与已校验 store 状态之间的循环/幂等守卫。
- **Public surface（公开接口，barrel）：** 路由类型 + 编解码器，以及 `initNavigation(driver?)`；浏览器驱动
  是默认。原生适配器可以消费/产出同样的后端相对路由，而无需改动 store 或传输层。
- **外部依赖：** `contracts`（project/workspace/session 的 DTO 类型，仅类型）；浏览器 History/Location API。
- **绝不触碰：** server/shared/pi；拥有 project/workspace/session 快照；持久化凭据或原始后端机密；导入
  panels/chat/shell；写入后端拥有的“活跃位置”。

兄弟依赖边只存在于 `module-web` 里。`main.tsx` 初始化该集成，而 `shell/chatReconciliation` 通过它现有的
水合集成消费 store 的精确聊天目标。

## 路由契约

带版本的浏览器 fragment 恰好表示下列之一：

- `#/v1` —— main/Welcome；
- `#/v1/projects/<projectId>` —— Project Home；
- `#/v1/projects/<projectId>/workspaces/<workspaceId>` —— 工作区；
- `#/v1/projects/<projectId>/workspaces/<workspaceId>/chats/<sessionId>` —— 精确聊天。

每个 id 是一个编码后的路径段。空 id、多余段、畸形编码和未知版本都是无效的，并规范化到 main。该路由是后端
相对的：同源的 web 从它的 origin 得到后端身份；独立托管/原生客户端把它与选中的后端 profile 配对。任何凭据
都不属于它。

store 驱动的导航通过下面的历史契约写入 fragment：用户意图的位置变化推入一条浏览器历史条目，被动的位置变化
就地替换。直接打开的 fragment 以及之后来路的 fragment 变化仍然要过校验。驱动在写入之前比较推导出的位置，
因此与导航无关的 store 变动——尤其是流式的 Pi 事件——不会引起任何 History API 调用。

## 历史契约（浏览器后退/前进，issue #152）

后退/前进必须在用户的应用内导航中逐步回退。条目是**位置，而不是标签页状态**：每个条目都是恢复契约能够校验
并重新进入的路由，因此后退/前进只是一次来路 fragment——push 只改哈希，而仅哈希的遍历会触发 `hashchange`，
驱动已经把它报告为一条来路路由。新机制只决定*一次导航何时创建条目*。

**Push 还是 replace。** 协调器按每条 store 边（`subscribe(state, previous)`）决定：

- 某条边上的**用户意图** = 项目/工作区作用域移动、活跃工作区的 `navTickByWorkspace` 前进，或活跃工作区
  布局注意里任一分组导航时钟的前进（`navigationClockByGroup`）——除非协调器自己正在应用一条来路路由（见
  收养）。意图边会**武装一次 push**。协调器在它 store 订阅的**顶部**武装——早于那次过期的精确聊天目标清理
  （其嵌套重入会跑同步）——因此一次取消了未解析聊天目标的点击仍然把它自己的位置记录为 push（由精确聊天目标
  的单元测试钉住）。
- 推导出的位置常常在比那次点击*更晚*的边上才改变：`setActiveTab`/`openTab` 在点击时增加
  `navTickByWorkspace`，而 `deriveLocation` 读的是布局**注意**，布局意图处理器会在随后的本地迁移中更新它。
  注意边携带自己的意图信号——`selectTab(..., countNavigation)` 在用户选择/打开/关闭时推进目标分组的导航
  时钟，而对被动的本地水合或在请求时打戳的消费（`shouldAdvanceAcceptedNavigation` = false）则保持不变。
- 一次 fragment 写入会**消耗那次武装**：已武装 → `push`，否则 → `replace`。该武装**在位置未变的同步之间
  持续存在**，直到某次写入消耗它或某条来路 fragment 被收养。这是承重的，不是松懈：**延迟的打戳打开**（新建
  聊天按钮、历史重开、跨工作区跳转）在点击时通过 `beginCenterNavigation`/`requestChatLocation` 计入它们的
  导航，而位置变化要等一次异步往返之后才落地，刻意*不*重复计数（`shouldAdvanceAcceptedNavigation` =
  false）——更早清掉武装会把每一种这样的流程降格为 replace。已接受的取舍：一次位置中性的意图（重新选中当前
  标签页）之后跟着一次*被动*位置变化，会记录一条多余条目——罕见（多客户端竞态）且自愈。没有前置意图的被动
  位置变化（本地水合或规范回退）会替换——合并进当前条目：**一次用户点击 = 一条历史条目**，其 fragment 会
  自愈到最终位置。
- **收养：** 一条来路 fragment（启动、后退/前进、地址栏编辑）本来就*是*当前条目——接受它会清掉武装，
  规范化以及协调器在应用该路由时所做的每一次写入（`selectMain`/`selectProject`/`setWorkspaces`/
  `activateWorkspaceFromRoute`，它们自己也会推进 tick 与时钟）都会对意图测试遮蔽，并且是 replace，绝不
  push。协调器自己那些被遮蔽的边也绝不取消它待处理的路由——解析会显式清除它。解析之后的同步写入是 replace。
- **收养就是用户导航，对 store 可见且立即生效：** 接受一条 fragment 会在校验读取开始*之前*增加活跃工作区
  的 `navTickByWorkspace`（被遮蔽）。延迟的文件/聊天读取把它们请求时刻的 tick 与那个当前值比较，因此在飞的
  后退/前进会压过更旧的完成。
- 未变的 fragment → 不调用 History API（既有的 `lastWritten` 守卫）。

**从这些规则中自然得出的后退/前进语义：**

- 一个聊天的历史条目在它的标签页被关闭后仍然存在：后退通过正常的已校验恢复重新打开/重新聚焦它（用户决定；
  不做历史擦洗）。原子的本地关闭会移除注意选中的标签页并推进一次导航，因此关闭活跃聊天会推入邻居位置；后退
  回到那个已关闭的聊天。
- 后退到一个已被删除的聊天/工作区/项目时，会通过既有的权威缺失规则落到规范回退；瞬时失败不碰 URL。
- 已接受的粗糙度（路由契约不变）：文件/差异/文档标签页序列化为工作区路由，因此后退无法重新聚焦某个确切的
  文件标签页；从一个聊天条目后退到一个同工作区的工作区级条目，可能立刻又规范化回被选中的聊天（一次“空转”的
  后退，经由 replace 自愈）。跨工作区跳进一个布局注意尚未水合的工作区，可能创建两个条目（工作区，然后
  聊天）。一次*被动*的作用域重定位（远端项目关闭，或工作区移除恢复了本客户端最近剩下的工作区、并在一个都不剩
  时回退到 Project Home）会被读成一次作用域移动并记录一个条目——后退到那个已死位置会经由缺失规则规范化。
  精确文件路由与同工作区快路径（在兄弟聊天之间后退时跳过权威的 `workspace.list` 读取）在任务规范里被记为
  后续项。

驱动接缝携带 `push(fragment)`（浏览器驱动里是 `history.pushState`）；原生适配器把它映射到自己的历史模型上。

## 恢复契约

来路路由是意图，绝不是领域真相：

1. 等待 store 的 **`welcomeGeneration`**，它只由那次原子的完整 welcome 安装推进——连接状态、协议版本，以及
   空的项目列表都不是就绪信号；
2. 用那份打开项目的快照校验项目；
3. 在校验/激活某个工作区之前，抓取/安装该项目权威的 `workspace.list({ includeDiffStats: false })`——成员
   关系/顺序保持完整，同时按工作区同步扇出的差异统计不进入自动启动；
4. 读取之后重新检查路由世代与打开的项目，然后原子地激活一个有效工作区、推进它的中心导航 tick（使更旧的延迟
   读取被取代），并二选一：安装一个盖上结果 tick 的精确聊天目标，或为工作区级路由清除任何更旧的精确目标；
   工作区路由不携带标签页意图，因此既有的浏览器本地注意保留，普通的 store 同步可以把 fragment 规范化到已选中
   的聊天；
5. 让 `shell/chatReconciliation` 校验/水合那个确切的会话；精确目标的安装会推进一个专用世代，因此工作区本来
   就已活跃时这一趟也会跑，而目标的消费不会重复这一趟。普通的领域水合绝不自动打开另一个前端的聊天，且在精确
   目标未解析期间，后台工作不得激活不同的聊天或推进它的导航 tick；
6. 应用每一个已解析的层级，包括 main 自身，然后只在**成功的权威缺失**之后才规范化 id：已完成的会话列表缺少
   聊天 → 工作区，已完成的工作区列表缺少工作区 → Project Home，已完成的 welcome 缺少项目 → main。从缺失的
   聊天回退不会抹掉既有的本地放置或本窗口的注意；在精确目标被消费之后，推导出的位置如实反映仍然被选中的
   东西。超时、断开、不可读的响应或普通的服务器错误都不能说明存在性：导航不改变路由/目标，数据加载器执行它
   标准的重试/重连或错误 UI。

每条来路路由都会推进一个单调的恢复世代；每个异步续作都会检查它。任何项目/工作区作用域移动**或中心导航
tick** 都会取消仍在等待的权威读取，因此同工作区的文件/聊天点击也会压过它迟到的响应。精确聊天目标只有在它的
工作区与盖上的导航 tick 仍然当前时才能聚焦。来路的精确路由未解析期间，store→驱动的写入暂停，因此临时的
工作区/无标签页/错误状态无法抹掉聊天 fragment。重复的初始化/welcome 投递与 React Strict Mode 都是幂等的；
重连会重试未解析的意图，但不重放已完成的启动路由。

## 平台适配器

Electrobun 按 `{ backendProfileId, windowId }` 把一个有界的 fragment 持久化在 webview 存储之外，然后在启动
动态端口的本地宿主之后把它追加到真实 origin 上。它的 preload 在应用代码之前观察浏览器驱动的
`history.replaceState`/`pushState` 以及初始/哈希/pop 变化；web 编解码器仍然是权威，无效的恢复意图会经由
普通的恢复路径规范化。原生桥绝不暴露宿主/领域能力。共享的后端选择仍然被推迟。

移动端之后按后端 profile/设备持久化同一个路由，并把通用/自定义链接映射到它上面。那些平台适配器不会把路由
搬进后端拥有的状态。
