---
id: submodule-web-panels
type: submodule-design
status: active
title: panels — 功能视图
parent: module-web
depends-on: [module-contracts]
references: [central-integration]
tags: [ui]
---

## 职责

与布局无关、由 store 驱动的功能视图。面板填满自己的容器，从不知道自己的排布方式（因此移动端
外壳是一层增量，而不是一次重写）。

Changes 与 Review 把固定工具栏留在面板自有的 `components/QuietScrollArea` 之外；Projects、Files 与
Specs 则为 `shell/SPEC.md` 中描述的外壳自有滚动包装器暴露内容。`TerminalInstance` 用
`QuietScrollFrame` 包裹 xterm，后者为 xterm 后代的定制滚动控件套上皮肤，却不缩小它的命中区域；
顶部/底部状态来自 xterm 公开的 `buffer.active.viewportY/baseY` 以及 `onScroll`/`onWriteParsed`
API，而不是假装它那个非原生 viewport 拥有 DOM 滚动度量。这些边缘状态还权威地表明纵向回滚缓冲区
是否存在，从而让该 frame 能为本地意图与可访问性模式暴露 xterm 否则不可见的控件，而无需发明
第二个滚动模型。因此同一个中性的“意图显形”滑块 + 方向性帘幕会跟随终端出现在任何位置。功能视图
从不为实现该效果而接收或推导左/右/底部放置。

## 边界

- **拥有：** `ProjectTree`。每个顶层项目行都是共享 `--panel-row-height`（`web-spacing`）下的紧凑
  IDE 树行：**始终可见的 chevron** + 文件夹/名称 + 仅在折叠时出现的工作区纯计数 + **固定右边缘列里
  始终可见的 Create workspace `+`**。那个 `+` 与 **Projects 头部的 Add project `+` 是同一个控件** ——
  两者都是 `Button variant="ghost" size="icon"`，所以渲染完全一致，字形也排在同一个垂直轴上（两者
  都位于该行的 `pr-xs` 右边缘）。Create workspace `+` 通过 `lib` 的 `platformShortcutLabel` 携带
  tooltip 与可访问名称，指明外壳的 `Mod+N` 组合键及其 `Mod+Alt+N` 浏览器别名（见
  `submodule-web-shell` 的全局组合键）；上下文菜单项保持朴素。长名称在计数/操作之前截断；这里刻意
  **没有可见的 Close 或溢出图标**。
  悬停会高亮整行，且在该行的**项目上下文菜单**打开期间高亮保持。右键会在指针处打开那个 PR-#167
  风格的菜单，既不选中也不导航；被滚动取消的约 700ms 长按是它在触摸端的等价物。当项目名按钮获得
  焦点时，标准 Context Menu 键或 Shift+F10 会打开同一个菜单以支持纯键盘操作；方向键/激活键/Escape
  键正常工作。
  菜单是中性的：**Plus Create workspace**、**FolderOpen Open existing worktree…**、分隔线、
  **X Close project**。Create 就是直接的 `+` 流程。Open existing worktree 打开
  `ExistingWorktreeDialog` 选择器，其数据由 `workspace.listExisting` 提供（每行是分支 + 绝对路径；
  detached-HEAD 行仍可见但被禁用）；选中一个会调用 `workspace.openExisting`，随后展开
  该项目并激活附加的行，不启动聊天。**Close**
  会打开一个居中的中性 `ConfirmDialog`，标题为 **“Close {name}?”**，
  描述为 **“Removes this project from the open projects list. Its repository, workspaces, chats, and running
  activity are kept. Reopen it from Add project → Recents.”**，初始焦点在 Cancel，以及 **Close project**；Cancel、背景点击与
  Escape 都会关闭它。Confirm 会触发 `project.close`
  并等待完整的 `project.updated` 推送 —— 没有乐观移除；成功是该行消失且无 toast，而拒绝会保留该行
  并抛出错误 toast。菜单/对话框关闭
  会恢复来源项目名的焦点；成功关闭则聚焦回退的项目名或 Projects 视图的 Add project 控件。
  `ProjectTree` 还拥有每个项目的 `+` 所打开的 `NewWorkspaceDialog`，**以及**每个工作区行悬停显现的
  **kebab 菜单**（`MoreVertical`，受控的 `DropdownMenu`）—— 在行上任意位置右键都会在 kebab 处打开
  完全相同的菜单，且不选中/激活该工作区，而 kebab 仍是触摸与键盘焦点的路径。它的动作是一个
  `DropdownMenuSub` **"Open in"**
  （仅当至少检测到一个编辑器时才渲染）、**Copy path** 与 **Reveal in file manager**。受 ThinkRail
  管理的工作树在连接宿主协议至少为 `WORKSPACE_RENAME_PROTOCOL_VERSION` 时还会获得 **Rename**，以及
  **Remove workspace**；外部行只获得 **Remove from ThinkRail**，其确认承诺该检出及其分支保持原样。
  Default 既不可改名也不可删除。"Open in" 来自宿主范围的 `editor.list`；GUI 条目调用
  `workspace.openIn`，而终端类 Vim 会激活工作区并通过 `addTerminal` 的一次性 `initialCommand` 运行。
  Copy 写入 `worktreePath`；Reveal 调用 `workspace.reveal`。这些请求、`editor.list`、项目的工作区
  列表加载、删除确认（`RemoveWorkspaceDialog`）以及下面的内联改名控制器（`createRenameController` /
  `useWorkspaceRename`）都只存在于
  `workspaceActions.ts` 一处，因而外壳顶栏的工作区菜单（[[submodule-web-shell-location-bar]]）能
  提供相同的动作 —— 包括感知能力的待定改名 —— 而无需第二份实现。该控制器会派发到编辑开始时捕获的
  那个工作区，并在 hook 的工作区身份变化时重置，所以没有按工作区设键的使用方无法把待定名称指向
  别处。**Settle** / **Keep active**（`workspace.settle` / `workspace.unsettle`，由
  `WORKSPACE_SETTLE_PROTOCOL_VERSION` 门控）搭同一个文件。
  **Settled 搁架。** 仅当宿主声明 `WORKSPACE_SETTLE_PROTOCOL_VERSION` 时才渲染；较旧的宿主保留
  原始的扁平列表与顺序，即使回滚持久化带着更新的陈旧字段，也没有搁架或 settle 控件。在支持该能力
  的宿主上，展开的项目先按 `selectWorkspacePartition` 渲染其**活动**行，最新创建的在前（绝不按活动
  时间重排，因此 agent 工作时行也停在原地），随后是一个 **`Settled · N`** 展开标题（默认折叠，按
  浏览器由 store 持有），其正文**精简**列出已 settle 的行 —— 单行、只有名称、一个小**原因 chip**
  （`merged` / `closed` / `idle 2w` / `by you`，长形式在其 tooltip 中）、kebab 旁的悬停
  **↩ Keep active** —— 一次十个，另有一行 *Show 25 more*。活动行在 kebab 旁获得悬停 **✓ Settle**
  （菜单中与右键时也有）；当该行的 agent 正在工作或有结果未读时它被禁用，在 Default 上则不存在。
  该分区在共享的 30 秒 `useNow` 时钟上重新求值，因此空闲行无需点击就会跨过窗口，侧栏也与顶栏保持
  同步，并且
  选中一个已 settle 的行会展开搁架并翻页到足以显示它。**首次自动移动按浏览器只宣告一次**
  （`settledShelfNotice`，像同级持久化模块那样带宿主限定的 localStorage 标志）：当
  `selectAutoSettledCounts` 首次报告搁架自行接收的行 —— 一个已合并/已关闭的 PR 或空闲窗口，绝不是
  手动停放的行 —— 且计数已静止两秒（升级回填会以一波推送的形式落地，通知应统计整波而不是它的第一
  行）时，一个 info toast 显示 *Moved N quiet workspaces to Settled*，说明规则，
  并提供 **Show**，它会展开那些项目及其搁架。没有它，升级后的首次启动会一次清空长侧栏的大部分
  内容而毫无解释。settle 的任何环节都不触碰磁盘：搁架是一种列表状态，每行自己的 *Remove* 仍是唯一
  的拆除方式 —— 目前没有批量移除，因为安全地做需要一个非阻塞、崩溃安全的宿主拆除过程（#688）。
  为什么是这种形状（只记录一次）：仅显式归档的侧栏把整理工作留给了用户（作者机器上有 48 行），
  纯按最近使用折叠无法表达“完成”，而隐藏的 Archived 层让行消失却没有可见归宿 —— 搁架让每一次
  自动移动都只隔一次展开，
  并写明原因。原因是描边的 `tr-text-caption` 徽章：merged 用 info 色调，settled-by-you 用
  warning 色调，closed 与 idle 则是中性的 `border-default` / `text-subtle` 元数据。
  改名会就地用一个无装饰的单行输入框替换该行的名称 span，它拥有相同的字体、颜色与几何；它已
  预填、获得焦点并被选中。Enter 或 blur 提交，Escape 取消，空白或与编辑起始标签相同的文本不发请求
  就退出，因此传入的 peer 快照不会因为关闭一个未改动的编辑器而被回退。在当前 socket 能力未知时做出的
  已改变提交会保持待定，只有在 v55 或更新的 welcome 恢复 `canRename` 后才派发；较旧的宿主永远收不到
  该方法。提交不会在客户端留下乐观的领域状态：该行回到先前由宿主拥有的标签，直到每个界面都采纳
  完整快照 `workspace.updated` 推送；拒绝会保留该快照并抛出错误 toast。Git 分支与
  工作树文件夹永不改变。Remove 是破坏性样式，
  会打开一个居中的 `ConfirmDialog`；确认会触发 `workspace.remove`，并让每个客户端通过 store 的
  `applyWorkspaceRemoved` 响应宿主的 `workspace.removed` 推送；被拒绝的请求（不会有事件到来）会抛出
  错误 toast，该行留在原地。每个**工作区行**都是**两行**：显示 `name` 在上，git **分支在它下面的
  第二行**（弱化、等宽），仅当它与名称不同时才渲染（因此原始/遗留的 `workspace-N` 行仍是单行紧凑
  形式）—— 显示名称与 git 分支解耦（见 [[submodule-server-workspaces]]）。

  工作区/项目的会话呈现只来自规范化后的宿主状态。侧栏恰好有两种视觉处理：一个静态的绿/强调色
  **attention dot**，用于具体的 needs-input 阻塞项或全所有者范围内的未读结果；以及共享的
  `RunningIcon` 品牌徽章，在顶层会话确实在工作时**取代**工作区/项目的身份图标。注意状态是二元的：
  needs-input 与未读结果状态使用同一个点，可访问标签为 **“Needs attention”**，没有问号/对勾/结果
  字形、spinner、计数或状态专属 tooltip。Working 保持该行现有的活动/非活动颜色（徽章穿
  `text-primary` / `text-text-muted`，与它替换的字形完全一致），并以可访问方式暴露
  **“Agent working”**；它绝不添加第二个标记。排队、隐藏/后台、停止与安静的会话显示其身份字形；
  needs-input 会话在其正交的执行事实仍在运行时仍可显示该徽章，因此 attention dot 与 working 处理
  可以共存。减弱动态下徽章保持静态。折叠项目的汇总使用与工作区行相同的选择器，而展开的项目在工作区
  行上展示细节。这些组件始终基于规范化宿主状态选择器以 props 驱动。

  `ProjectTree` 基于规范化宿主状态选择器渲染共享的轻依赖 `AttentionDot`。它是静态强调色，不携带
  计数或状态专属的字形/tooltip，并占据身份按钮与悬停显现的 kebab 之间自己的一列 flex。工作区行与
  折叠项目行仅在为真时暴露 `data-attention`。另外，共享的 `RunningIcon` 会为规范化的 working 状态
  替换身份图标；工作区行与折叠项目行仅在为真时暴露 `data-running`。这些属性是测试钩子，不是第二套
  状态模型。

  **项目行仅在折叠时携带工作区计数**；展开后，工作区行直接提供细节。**Default 工作区**
  （`kind === "default"` —— 项目文件夹本身）渲染在**最前面且固定**（服务器在 `workspace.list` 中
  固定它；`addWorkspace` 在其后追加创建出的工作树行），用一个 **`House` 图标**取代 `GitBranch`
  字形，并且**没有 Rename 或 Remove 项**（不可改名/不可删除 —— 服务器同时强制这两点；菜单只是省略
  它们）—— 它仍和每个工作树一样有 "Open in" / Copy path / Reveal。它的分支行显示该文件夹真实的当前
  分支。当**所选项目的**权威工作区列表落地时，
  `ProjectTree` 会对至多前八行发起并忘记 transport 的 `prewarmWorkspaceSkillLoad`：常见可见集会在
  工作区点击之前先开启保守的 watcher 就绪窗口。每次选择的上限约束了请求扇出；*全局*上限在宿主侧 ——
  仅预热的 watcher 活在一个有上限、可淘汰的池中（server 的 `watch` SPEC），因此在一个宿主生命周期内
  点过许多项目只是复用该池，而不是累积 watcher。列表从不等待预热，失败保持静默并可由最终的聊天加载
  重试，而仅仅展开一个后台项目不会预热它（预热以*所选*项目为门控，因此下面惰性恢复展开的取数也保持
  这条不变量）。**侧栏展开是 store 持有的、按浏览器的视图状态**
  （`store.expandedProjectIds`），而不是组件状态：它跨过 Project-Home/工作区重挂载边界存活，并通过
  `projectExpansion` 持久化模块（宿主限定键下的 localStorage，在启动时由 `main.tsx` 注水，尽力写入、
  不信任读取）跨过页面重载存活 —— 重载后侧栏看起来一样（搁架的展开状态刻意不持久化 —— 折叠才是
  正确的默认）。持久化的展开存活得比本客户端已取回的列表更久的行（一次全新重载）会惰性取回其缺失的
  `workspace.list`；已取回的列表在显式展开手势时、以及在新 welcome/重连世代之后由 transport 刷新，
  绝不在循环中重复取回。活动工作区还必须
  保持可见：当 `ProjectTree` 带着活动工作区挂载，或活动工作区推导出的所属项目发生变化或首次变得
  可解析时，它会展开那个父项目 —— 这一揭示叠加在持久化基线*之上*（持久化的折叠绝不隐藏活动工作区）。
  在所属项目未变期间，手动折叠仍被尊重；普通的 `workspace.updated` 快照与同一项目内的工作区切换不会
  再次强制展开。导航恢复是中性的：重载会重新选中路由到的项目而不触碰展开状态（持久化状态*就是*视图）。
  工作区创建会显式展开其项目。选中或创建工作区也会选中它所属的项目，从而即使创建对话框的项目选择器
  指向另一个项目，project-home 与活动工作区上下文仍保持一致。
  **打开项目会落到该项目的 Welcome** —— 刻意**不自动进入**任何工作区：Welcome 就是分叉点，两种工作
  模式（隔离的工作树 vs 项目文件夹的 Default 工作区）在这里作为显式选择呈现（见 `WelcomePanel`），
  因此打开与 "project home" 手势汇聚到同一个界面。打开经由共享的 **`useOpenProject`** hook
  （`ProjectTree` **和** `WelcomePanel` 都复用它，因此 Projects 视图与 Welcome 屏幕中的流程完全
  一致）：`project.open` 以相同 id 重新激活一个已关闭的已知路径（或打开一个新的），随后发起客户端
  选中 Project Home，而每个客户端都收到 `project.updated`；失败时走 `project.inspect` → 当它是
  `initable` 时，提议把该文件夹引导成一个仓库 —— 一个模态 **`ConfirmDialog`**（确认 →
  `project.init`）—— 或者把错误呈现在 **`NoticeDialog`** 中 —— 因此非 git 文件夹绝不会变成静默的
  空操作。原生选择器仍是本地的快速路径并保留其加长的
  timeout，因为它等待一个人；若宿主无法呈现它，拒绝会改为打开一个 **Open project from host path**
  对话框，携带原因和一个自动聚焦的路径字段。该对话框说明该路径属于运行 ThinkRail 的那台电脑，接受
  宿主绝对路径或 `~` / `~/…`，并通过同一套 open/inspect/init 流程提交。**Enter host path…** 也始终
  出现在 `AddProjectMenu` 中 Open project 的旁边：远程客户端无法判断一次成功的原生选择器是否开在
  一个看不见的宿主显示器上，因此恢复路径不能只在失败时才给。每个打开手势都会启动一个客户端范围的
  last-intent 世代，两个已挂载的 `useOpenProject` 实例共享它。该流程在每个 picker、open、inspect、
  init 与采纳 await 之后都会复查该世代，因此来自任一界面的手动路径或最近选择都会取代任何更旧的流程，
  使它既不能选中项目，也无法抛出陈旧对话框。
  这些是 `@thinkrail/ui/dialog` 上的模态（init 提议没有屏幕锚点，不像 Remove popover）；
  `NoticeDialog` 仍是失败且该通知内没有恢复路径时的单按钮界面。该 hook 返回一个 `dialogs` 节点，由
  每个使用方
  渲染。**选中一个项目**（点击它的行 —— chevron 单独负责展开/折叠）**会取消任何活动工作区的选中**，
  于是外壳回到该项目的 Welcome —— 一次刻意的 "project home" 手势。两种选中项目的手势 —— 侧栏行点击
  与采纳一个刚打开的项目（`ProjectTree` *和* `WelcomePanel`）—— 也会**揭示该项目的工作区**
  （`selectProject(id, { reveal: true })`）：进入项目的手势承诺其工作区列表，因此从 Welcome 屏幕
  打开时绝不会落到一个折叠的侧栏行；
  工作区的前端本地视图会通过外壳布局持久化存活，因此重新选中它会恢复该窗口在未变 frame 内的资源标签
  页。这一往返会卸载工作区界面，但终端没有客户端侧生命周期可丢失：宿主拥有每个标签页与 PTY，卸载不会
  杀掉任何东西。多个不同的终端可以同时显示在不同的 workbench 分组中；外壳布局的可见性门禁为每个本地
  选中的终端身份挂载一个主体，且不为非活动身份挂载主体。`TerminalWorkbenchBody` 从外壳接收其
  New-terminal 回调，因此它保持与排布无关，而中央放置可以捕获它所属的分组。宿主附着仍按身份全局独占，
  因此在另一个客户端选中同一终端会触发既有的 takeover/detached/reclaim 流程。终端目录的
  注水按连接世代打戳，其完整快照推送订阅在 `terminal.list` 之前建立：读取开始后落地的推送获胜，而
  transport 同步重放的缓存推送被正确地当作读取基线。只有显式的 `terminal.close` 会杀掉 PTY，并带有
  既有的 busy-shell 确认；确认强制关闭会让该活动请求保持到它落定为止（对话框可以关闭，但第二个请求
  无法让它变成孤儿），失败会呈现给用户，而权威的目录移除会关闭一个已过期的确认框，而不是为一个已被
  另一个客户端关闭的终端留下模态。还有 `FileTree`、`SpecsPanel`、`ReviewPanel`、
  `ChangesPanel`（固定 **panel-header row** —— `h-panel-header-row`（`--panel-header-row-height`，
  目前 28px）—— 之下的变更文件，与 workbench Group Headers 及聊天头部共享结构几何，而不是在此钉死
  的数值 —— 它通过 **`ChangesScopeMenu`** scope pill + 共享的 **`BranchPicker`** 目标分支 pill 说明
  **在 diff 什么**，另有 **List | Tree** 开关（`store.changesView`，全应用）在扁平列表与文件夹
  **`ChangesTree`** 之间切换；在任一视图中单击文件会在该 scope 的 **Changes review tab** 中打开/揭示
  它（双击或 *Open as tab*：它自己的 diff 标签页 —— 下面的双呈现规则），并且每个文件行都携带共享的
  **`ChangeRowActions`** 菜单。行包装器绘制完整的悬停/选中色带，包括尾部的菜单槽；它内部的打开文件
  按钮保持透明，从而使该色带在菜单出现之前不会显得被裁切），
  `FilePane` 与 `DiffPane` 作为资源注册表分派器、`panels/resources` 下的内置惰性渲染器，以及惰性的
  `TerminalInstance`。Monaco 的桌面文件管线 —— editor worker、精选的 reader contributions、Shiki
  adapter/languages、本地加载器、唯一的 token 驱动 `EDITOR_THEME`，以及 `[data-theme]` 重新换肤
  观察器 —— 只存在于 `monacoSetup.ts` 一处；Pierre 的惰性 workbench provider 拥有其共享 worker 池与
  CSS 变量主题。
  细长的头部视图开关段（有序的资源候选、`Split|Inline`、`List|Tree`）是共享的 `ToggleSegment` —— 其
  活动段复用标签页语法的 `control-bg-selected`（见下文），绝不使用容器表面，因此在
  `container-elevated-bg` 塌陷到工具栏表面的高对比度主题下，选中填充依然成立。
  `ChangesPanel` 的次级工具栏**不绘制任何自己的表面**：与右侧面板的标签条一样，它显示面板的
  `container-sidebar-bg`，因此两行装饰读起来是一整块连续表面。**文件风格的树行**（chevron/占位前导、
  文件夹/文件图标、截断的标签、尾部槽；`min-w-0` 使一行在与尾部控件共享同一条 flex 线时能够收缩）是
  共享的 **`TreeRow`**，`FileTree` 与 `ChangesTree` 都用它，从而两棵树保持完全一致。两棵树都会**把
  单目录连续段压缩成一行斜杠连接的行**（`apps/web/src`）：仅当一个目录恰好只有一个子项且该子项也是
  目录时该连续段才继续，而这一压缩行会作为一个整体展开/折叠最深的目录。`ChangesTree` 针对变更文件树
  做这个求值；`FileTree` 只通过其现有的客户端目录读取来解析可见的压缩段，因此线上协议仍是普通的
  即时目录列表。**`+N −M` diff 计数徽章**是共享的 **`DiffStatBadge`**，只在 Changes 内使用：扁平
  列表的文件行、树的文件行，以及树中文件夹的聚合值（仅在其折叠时
  而展开的文件夹其子项已显示这些计数）。`ChangesTree` 的树构建 + `+/−` 聚合 + 共享状态字形存在于纯的
  **`changesModel.ts`** 中（有单元测试；不含 store/transport —— `ChangesTree` 是呈现式的，由
  `ChangesPanel` 喂入 `changes` + `onOpen`/`isActive`），同时还有 **diff 标签页身份 + scope 词汇表**：
  `scopeKey` / `diffTabId(workspaceId, scope, path)` / `diffTabName` / `scopeLabel`，以及扁平列表的
  路径行与 diff 头部的路径 chip 共用的 `splitPath`。**分支 combobox** 是共享的 **`BranchPicker`**
  （可搜索、分组为 Remote/Local、当前选择带对勾、每次打开都刷新，另有显式的 Refresh 控件）—— 一个
  组件同时用于 New-Workspace 对话框的 *base* 分支
  与 Changes 头部的 *target* 分支。**Remote 是两层**：一个 `Remote` 父节点下每个宿主识别的 remote
  （`origin`、`upstream`）各一个子组，其行显示分支名而不重复 remote 名。完整 ref 仍是每行的选择身份、
  搜索值与 `data-branch`；浏览器绝不拆分 `remote/branch`，因为 Git 允许 remote 名中包含 `/`。未配置的
  tracking ref 位于 `Other` 之下并保留其完整 ref 作为行标签。`BranchList.remoteGroups` 是增量的：
  面对省略它的较旧宿主，picker 回退为一个包含完整 ref 的扁平 Remote 组。分组路径使用嵌套的 cmdk 组；
  强制挂载的父节点仅在 cmdk 隐藏了每个子组时才隐藏。一个 fork
  会用到两个 remote，因此只显示 `origin` 的列表会隐藏它分叉所自的那个 ref。它*周围*的整个状态 ——
  列表、`refreshing`、`refresh()` —— 是共享的 **`useBranchList(projectId, onLoaded?)`**
  （`branches.ts`，基于离线降级的 `listBranchesOrEmpty`），因此两个 picker **在构造上**就是一致的：
  列表**以项目为键**（项目变更时清空，且两次读取都按世代打戳，因此切换绝不会提供或落地上一个项目的
  分支），**只有初次读取会降级**（*refresh* 保留上一份好列表，而不会因一次瞬时失败就清空 picker），
  且 `refreshing` 始终驱动 spinner。初次加载的预取总是把非空的默认值提供给宿主，因为宿主才是它是否
  命名了一个已配置 remote 的权威；这使陈旧或缺失的默认 tracking ref 不落在 create 的关键路径上，
  同时又不读取尚未渲染的分支状态。手动选择只为来自
  已加载 remote 列表的行做预取。`null` 的 projectId 不读取任何东西 —— 这就是已关闭对话框的暂停方式。
  它降级后的默认值是 `defaultBranch: ""`，**绝不是字面量 `HEAD`**：一个命名了 ref 的哨兵会被当真 ——
  对话框会预选它并把它持久化为工作区的 `baseBranch`，而那个工作树将永远与自己的 head 做 diff。空表示
  "unknown"，因此 `create` 省略 `baseRef`，由宿主解析真实分支。
  **`WelcomePanel`** 是外壳挂载的首触界面（居中，左侧导航在其旁），只要没有
  活动工作区。**一个 hero 标题**（`welcome-title`，顶栏的品牌样式 —— 强调字体、`text-primary` —— 放大）：
  **所示项目的名称**，或在没有项目显示时为 `PRODUCT_NAME` —— 字标是空状态的身份，一旦打开项目，该
  项目自己的名字就是身份（因此没有单独的项目眉标）。**任何状态下都没有推销文案** —— 营销段落因无人
  阅读而被移除；屏幕是标题 → 横幅 → **一到三张卡片**（图标在左上，标签 + 说明在左下；主卡片是填充
  主色的卡片，携带稳定的 `welcome-cta` 钩子，其他是安静的 `welcome-action`）。Welcome 是**模式分叉
  点**：有项目显示时它总是成对给出
  **"Start building"**（隔离工作树）与 **"Work in project folder"**（Default 工作区），使两种工作模式
  成为可见的选择，而不是隐藏的默认。按状态划分的卡片：**无项目** → **"Open project"**（一张卡片）；
  **项目 + `hasSpecs`** → **"Start building"**（主）+ "Work in project folder"；**项目 + 无 specs** →
  spec 优先的 **"Set up project"**（主）+ "Start building" + "Work in project folder"。
  **"Open project" 只出现在无项目状态** —— 那是唯一可能的动作；一旦有项目显示，打开另一个就归项目侧栏
  的 **"+"**（同一个
  下拉），因此 Welcome 保持为*在本项目内工作*的界面。那张卡片把共享的 **`AddProjectMenu`** 下拉挂在
  它上面（与项目侧栏的 "+" 同一菜单：Open project / Enter host path… / Open GitHub (soon) /
  Recents）。Recents 是 store 的 `recentProjects`：一份最近打开的路径列表，包含打开与关闭的记录，
  没有状态徽章；选中任一条都会运行共享的打开流程并落到 Project Home，关闭的记录保留其 id 与工作区
  状态。`Card` 是一个 `forwardRef`，可作为 Radix `asChild` 触发件使用。**"Work in project folder"**
  （`House` 图标，与侧栏的 Default 行一致）**直接进入** Default 工作区 —— 没有对话框：共享的
  `enterDefaultWorkspace` 辅助函数列出项目的工作区、存入 store，并激活 `kind === "default"` 的行；
  没有 Default 行的较旧宿主降级为错误 toast。**"Start building"** 是"创建并启动"流程的意图优先表述 ——
  它打开 `NewWorkspaceDialog` 并预选 **Isolated workspace** 目标；*workspace* 是机制，而非标签。
  **"Set up project"** 打开同一个对话框，带一个 `initialPrompt` 种子**和一个 `promptNote`** —— 该说明是
  卡片自己的文案（对话框保持对技能不感知），说明该种子命令做什么：agent 在开始构建之前，从项目的目标
  出发起草其规范 —— 刻意**不是**一份产物枚举，因为分派器的路线不同（starting-a-new-project 停在
  goal-and-requirements；只有 importing-a-codebase 才起草架构 + 模块 SPEC），而卡片无法预先知道路线。
  种子是 `/skill:setting-up-a-project` 命令**带一个尾随空格** —— 与斜杠命令补全写入的插入格式相同
  （`chat` 的 `selectedSlashCommandValue`），因此种子后的 hero 读起来是一条*已完成*的命令，补全菜单
  在其上保持关闭（pi 的解析器把参数尾部视为可选）。该命令**强制**加载 setting-up-a-project 分派器
  技能（pi 的技能命令语法；在 `session.prompt` 路径上展开），而不是指望模型自动匹配它；分派器随后
  检测新项目还是既有项目，并据此起草规范（见 [[module-thinkrail-workflow]]）。**每个 Welcome 入口都
  预选 Isolated
  工作区目标** —— 包括 setup，因此起草规范可以像任何其他工作一样在它自己的分支上被审阅，模式叙事也
  保持统一；Project 文件夹这个备选在对话框中始终只隔一次点击。（统一化让“由打开者选择目标”变成了死
  API —— 对话框拥有自己的目标状态，且总是开在工作树一侧；没有 `initialTarget` prop。）哪个项目驱动
  has-specs 状态 = `selectedProjectId ?? projects[0]`，以响应式方式读取（因此可见
  导航的选中会更新它）。它的 `hasSpecs` 通过 `project.hasSpecs` 针对那一个项目**惰性取回**（一次全
  树遍历，被挡在连接握手之外）—— 在解析完成前保持 pending，因此卡片会等它。打开项目的编排位于共享
  的 **`useOpenProject`** hook（见上文），所以 Welcome 的 "Open project" 卡片获得与侧栏相同的非 git
  init/notice 处理。
  在卡片上方，`WelcomePanel` 组合 **`ProviderWarningBanner`** —— 一条细长的金色横幅，**仅在没有提供商
  连接时**显示（"No model provider connected — the agent can't run"），带一个 **Connect a provider**
  CTA 打开 Settings → Providers（`store.openSettings("providers")`）。它在挂载时读取
  `provider.status`（只要有任一 `configured`，提供商就算 "connected"），并在设置对话框每次切换时重新
  检查，因此用户一连接它就消失；transport 错误降级为*不*唠叨（离线 ≠ "没有提供商"）。所有提供商
  **管理**都在 Settings 里，而不在这里（常驻条已经移除）。

  在它下面，**`ProjectTrustNotice`** 是工作区之前的信任界面（因此在还没有工作区时也能触达信任）：
  **按存在性门控** —— 除非所选项目带有信任授予会加载的东西，否则不渲染任何内容。存在性来自
  `chat/useProjectTrustSummary`（在处于 `PROJECT_TRUST_PROTOCOL_VERSION` 的宿主上是
  `project.trustSummary`，由 store 的 `selectSupportsProjectTrust` 门控：别名技能名、pi 自身需要信任
  的资源种类与项目子代理定义，以及 `.pi/mcp.json` 条目数；较旧的宿主只回答 `project.aliasSkills`，
  解读为 "aliases only"），以及
  纯 `chat/projectTrust` 推导 —— 与 `chat/SkillsDialog` 的信任横幅和 New Workspace 共享，因此这三个
  界面不会就“一次授予会加载什么”产生分歧 —— `deriveProjectTrustNotice` **分别**求值别名授予
  （`Project.trusted`）与 pi 级信任（`Project.piResourceTrust`），因此通知只点出仍然关闭的部分：
  "ships N skills and its own Pi resources → *Trust project*"，另外 —— 当 pi 级资源被门控时 —— 精确
  列出授予会加载的种类（摘要的 `piResources`：skills、prompts、themes、system prompt、subagent
  definitions），并且仅当其中包含 `extensions` 或 `settings` 时，说明它们会在这台机器上运行代码，以及
  它的 N 个 MCP 服务器仍需要逐个批准（一个唯一被门控内容就是 `.pi/mcp.json` 的仓库仍然会显示该
  通知，其授予会要求 pi 级信任）。*Trust project* 发送由 `trustGrantParams` 构建的 `project.setTrust`：
  仅当通知列出了 pi 级资源时才 `resources: true`（因而也说明它们会加载并运行什么）；只涉及别名的通知
  只授予别名信任。信任之后，它会对后来出现的技能显示 "N new → *Review & enable*" 状态
  （`project.acknowledgeSkills`），否则显示一行安静的 "trusted"。*Stop trusting*（藏在一个破坏性的
  `ConfirmDialog` 之后）在任一授予被持有的每个状态下都会显示（`canStopTrusting`），而不只是完全受信
  的状态 —— 一个在加入时 pi 就已信任的项目，或只被部分信任的项目，都保留撤销路径 —— 它发送
  `project.setTrust({ trusted: false })`，撤销两项授予；其确认（`stopTrustingText`）说明 pi 资源将
  停止加载、运行中的子代理会停止且打开的聊天会重新加载 —— 仅当 `piResourceTrust` 为 `granted` 且
  宿主支持项目信任时；否则说明该项目技能在新聊天中停止加载。它在信任之前绝不渲染技能的（攻击者可控
  的）名称。完整的管理器（**project 模式**下的 `chat/SkillsDialog`
  —— 信任 + 分组/技能开关，还没有会话）从 **New Workspace** 进入，其打开器是共享的
  `chat/SkillsButton` 原语（因此它不会与聊天头部的 Skills 触发件漂移）。这是用户技能设置的会话之前的
  那一半；聊天头部以 workspace 模式打开同一个对话框（带 Reload）。

**`NewWorkspaceDialog`** 是开始工作的界面：一个**目标控件**（一个两选段 —— 原生 radio 组，
`fieldset` + 视觉隐藏 radio 输入之上的 sr-only `legend`，因此辅助技术只会听到一个互斥的选择 —— 两者
始终可见：一眼看清双模式模型）选择工作**在哪里**运行，而头部是**模式感知的**，因此它总是如实命名操作：
**Isolated workspace** → 标题 **“Create workspace”**，描述 **“A separate checkout on its own new
branch. Files, chats, changes, and terminals stay scoped to it.”**；**Project folder** → 标题
**“Work in project folder”**，描述 **“Runs directly in your project folder — no isolation. Changes
land on the current branch.”** 在文件夹
  模式下，base 分支 picker 与命名提示都被隐藏（什么也没创建 —— 提交会通过共享的
  **`enterDefaultWorkspace`** 辅助函数**进入**项目的 Default 工作区（`defaultWorkspace.ts`：
  `workspace.list` → 折叠进 store → 激活 `kind === "default"` 行，一次原子进入 —— 侧栏的自动展开
  跟随激活；较旧宿主没有该行时则错误 toast + `null` —— 与 Welcome 分叉卡片背后是同一个辅助函数，因此
  进入 + 降级的路径只存在一份；**`onCreated` 不会触发** —— 什么都没创建，且辅助函数的列表已经是新的））
  且提交按钮显示 **Start** 而不是 **Create**；分支列表取数 + 后台 base 预取仍然运行（发起并忘记，使
  切回工作树保持即时）；聊天启动尾巴在两种模式下完全相同。一个可选的 **`promptNote`** 渲染为提示词
  上方的一条小 info 条（被 "Set up project" 用来说明种子技能命令做什么）。工作树模式下 base 分支
  触发件显示 **“From {base}”**，而不是一个无从解释的 ref。一个可选的 **`initialPrompt`** 为提示词
  hero 提供种子（仍可编辑；默认为空）；当提示词非空时（工作树模式），一条次级提示说 ThinkRail 将
  根据请求命名工作区
  与分支。其余部分保持紧凑：base 分支 combobox（`git.listBranches`，离线时降级为本地分支；Refresh 会
  重新列出；`origin/HEAD` 被过滤，因此不会有多余的 `origin`）、项目 picker、提示词 hero，以及复用的
  **pre-session** 模式下的 `chat/ModelEffortPicker`。它**跟随宿主默认值**打开：pill 从宿主的
  `model.default` 结果读取 `Default · ‹model› · ‹level›`（有保存的默认值就用它，否则用第一个可用
  模型），并且 popover 的 Default 行被勾选。任何显式选择（模型、级别或两者）都会把对话框翻到**显式
  对**；Default 行 —— 以及下面的不可用模型调和 —— 会**同步地**把它退回跟随状态，因此在选择 Default
  后立刻点 Create 已经会省略该对；随后 `model.default` 的读取只刷新所显示的对。每个这样的在途读取
  都会被一次显式选择取消，因此在用户选择之后落地的回复绝不覆盖该选择（它仍会刷新 Default 行所显示的
  内容）。Create 仅在显式对时发送 `{model, thinkingLevel}`，**跟随期间两者都省略**，
  因此由宿主解析器在创建时决定，显示也绝不会快照一个期间被 Settings 改掉的默认值。当没有可用模型时，
  宿主返回 `model: null`，pill 只显示一个光秃秃的 Default。对话框不会选择一个竞争的默认值：它的显示
  与新建会话共享宿主解析器（见 `submodule-server-agent`）。收藏/最近项经由
  `chat/useModelPreferences` 到达，与输入框使用的是同一个接缝。
  picker 的 popover 会 portal 进对话框节点（因此它的列表在 Dialog 滚动锁之下滚动）。它们的目录是共享
  的那一个 —— `chat/useModelCatalog`，因此对话框与聊天输入框不会漂移 —— 这意味着它是**实时的**：
  picker 的 Refresh 行可以在一个已持有的
  选择之下替换列表。对话框因此会在每次变化时通过纯的 **`reconcileModel`** 把它所持有的模型与之调和
  （只针对模型 —— 力度由宿主的 clamp 决定，见下文）：重新指向相同的 `{provider,id}`（即刷新后的对象，
  其 `thinkingLevels` 可能不同）。当目录没有这样的模型时它怎么做，取决于 **`catalogFresh`** —— store
  的 `modelsFresh`，只有当宿主报告 **`complete`** 的一次已等待强制刷新的落地结果为真（有上限的等待
  可能返回一个当前但未落定的列表，那不是做判定的依据），并且会被任何使用方下一次 `model.list` 落地
  丢弃（其处理器的回答来自它启动的分离刷新之前）*且*会被任何正在激活的使用方提前丢弃。在新鲜的目录
  上它返回 **`"unavailable"`** —— 一个判定，而非替代品：对话框随后会像预选时那样，通过**一个**
  `applyHostDefault` 请求 **`model.default`**（宿主保存的默认值或首个可用回退值，外加它一致的力度）——
  因此这里不存在宿主默认策略的客户端副本。每次打开至多询问一次，因此仍然缺失的模型不能让该 effect
  空转。力度是另一件事：一个 effect 通过向宿主询问 pi 的 clamp（**`model.clampThinking`**）来保持
  所持有的级别
  可被所持有的模型运行，而不是本地决定，因此一次显式切换与一次缩小了模型集合的刷新会以与 pi 相同的
  方式解析。`model.default` 不需要调整：宿主已经返回一对自洽的值。
  在打开与项目 picker 变化时，对话框读取 **`skill.list({projectId})`**；每当一个前导斜杠 token 变得
  活动时，它还会读取 **`template.list({projectId})`**。它把两者都喂给共享的 `prompt` 模块，因此
  Create Workspace 与实时聊天使用相同的过滤、菜单、键盘导航、竞态安全的模板挑选，以及 Tab 穿行占位符
  状态机。技能来自所选项目的**当前检出**加上个人/内置来源；模板合并全局 + 当前检出项目范围，项目优先。
  选择技能会插入 `/skill:<name> `；选择模板会读取 `template.get({projectId, name})`，用其正文替换整个
  草稿，并激活其占位符。Up/Down 导航，Enter/Tab 选择，Escape 关闭菜单；在没有打开的菜单时
  Tab/Shift+Tab 循环活动模板槽，Escape 结束该会话。提交会镜像被编辑过的重复槽，并在最终文本成为首个
  提示词之前移除未触碰的标记。所选模板正文加载期间，提交被扣住但提示词仍可编辑；编辑会取消延迟的
  应用。切换项目还会让在途的挑选失效，因此来自上一个检出的响应无法填充下一个项目的提示词。首个
  提示词在异步工作区创建开始之前被打快照。
  列表/获取失败会保留草稿，并降级到仍然可用的那个来源。扩展命令与 `/compact` 保持缺席，因为不存在
  实时会话。提示词下方的一行说明把目录标记为**来自当前检出**（若所选 base 分支不同，则以创建工作树
  的会话为准）。当所选项目带有任何仍然**未受信任**的东西时（与 Welcome 通知相同的
  `useProjectTrustSummary` + `deriveProjectTrustNotice` 组合 —— 只有计数与种类，绝不给名字），一条
  **信任通知**会显示一个 *Trust project* 按钮 —— 仓库的技能与 pi 资源在授予之前保持扣留（
  `project.setTrust`，来自同一个 `trustGrantParams`，因此仅当通知列出了 pi 级资源时 `resources: true`
  才同行；它会把更新后的项目折回 store 并重新预览）；个人 + 内置技能无论如何都会显示。当菜单关闭时，
  **Enter 提交**（与提交按钮的
  `↵` 提示一致），而
  **Shift+Enter** 插入换行。工作树模式提交 = `workspace.create({ projectId, baseRef })` → 设为活动，
  并且由对话框自己展开项目并刷新其权威 `workspace.list`（发起并忘记；不依赖 `workspace.created`
  推送，因为未加载的项目列表会丢掉它）—— 没有 `onCreated` 回调，因此每个挂载点（`ProjectTree`、
  `WelcomePanel`、外壳键盘打开的实例）都得到相同的创建后折叠 → **总是打开一个新聊天**
  （`session.create({ workspaceId, model?, thinkingLevel? })` —— 即使没有提示词，所持有的模型 + 力度
  也会生效，并一起传递；没有所持有的模型时宿主仍会应用保存的/回退默认值，只要有可用模型就显式传入
  解析出的对）→ 输入的
  提示词**以及任何附带的图片**还会作为第一条消息发送（发起并忘记的 `prompt`，在 `text` 之外转发
  `images`，并带一个携带相同附件的乐观用户轮次）。提示词 hero 通过共享的 `usePromptImages` 控制器
  接受**图片粘贴/拖放**（与聊天 `Composer` 相同的 `imageAttachment` 解码/缩放 + chip 表面）；当任何
  图片仍在解码时提交被**扣住**，而**只有图片没有文本**的启动也是合法的启动。**空提示词且无图片会让
  刚打开的输入框保持就绪** —— 提交开始工作界面总是把用户落在一个聊天里，绝不落在一个光秃秃的回执上
  （文件夹模式：进入 Default 之后是同一条尾巴）。被**拒绝**的启动 `prompt`（坏模型 / 缺少 API key ——
  例如选了一个不存在的模型）会作为刚打开聊天中的一个 `error` 轮次通过 `store.appendErrorTurn`（带
  `transport` 的 `errorText`）呈现，而不是消失。那两种**没有聊天可承载轮次**的拒绝改为抛出
  `store.toast.error`：失败的 **`workspace.create`**（保持对话框打开以重试）与失败的
  **`session.create`**（对话框已关闭，工作区已存在 —— toast 是报告这次被丢弃的启动的唯一去处）。
  （`gh` 状态位于 `SettingsDialog`，而不是
  创建对话框。）**`SettingsDialog`** 是外壳顶栏齿轮打开的应用设置界面 —— 一个 **store 驱动的双栏外壳**：
  一个只渲染一次的导航列表，旁边是可滚动的内容栏。在 `md`+ 上该列表是一条分组的侧栏 —— **Agent**（Models、
  Providers、MCP servers、Prompt templates）·
  **Interface**（Chat、Appearance、Layout、Terminal）·
  **System**（Workspaces、Integrations、
  Extensions、Notifications、Privacy、Updates）。
  Integrations 保留 section id `github`：目前它是 GitHub CLI 页面，也是更多集成将来的归宿。低于 `md`
  时同一个列表是没有分组标签的水平滚动条。
  **Feedback 卡片**（`settings-nav-feedback`，“Get 100 credits for a user interview”）在任何宽度下都
  属于该列表，在 `md`+ 时固定在侧栏底部。纯导航数据 —— 分组、协议与注入内容门控，以及把请求的 section
  解析为一个可用的 section（一个被门控或已退役的 id，例如旧的 `review` / `line-width` 深链，回退到
  Appearance）—— 位于 `panels/settingsNav.ts`，因此对话框只负责渲染它。`settingsOpen`/
  `settingsSection` 存在 store 中，因此齿轮**和** Welcome 横幅都能以深链到某个 section 的方式打开它。
  Escape 会关闭对话框，除非焦点在一个携带 `data-settings-draft-input` 的输入框内，此时 Escape 改为
  回退该草稿。
  **共享的 Settings 原语**让每个页面保持同一种形状（外壳注入的 Layout section 复用它们）：
  `SettingsPageContainer` 以间距堆叠页面的分组，并只在真正渲染的子项之间画分隔线（每个子项保留其元素
  key，因此一个条件分组绝不会重挂载它的兄弟）；`SettingsGroup` 是 `SettingsRow` 的带标题区块 —— 标签、
  可选描述、一个控件，在窄宽度下把控件换行到标签下方；`SegmentedControl` 是带 `value: T | null` 的原生
  radio 组（`null` 不选中任何项，用于没有任何选项能命名的宿主值）并支持逐项 disabled；
  `SettingsNotice` 是唯一的内联中性/info/success/warning/error 通知。自由文本设置共享同一种**自动保存
  输入模式**：Enter 或 blur 会把一个合法且已改变的值保存一次（没有 Save/Apply 按钮）；非法草稿保持可见
  并带 `aria-invalid` 与可见的范围提示且永不发送；Escape 回退到权威值；输入框携带
  `data-settings-draft-input`；被拒绝的保存会 toast，权威值继续作数。**`McpSettings`** 是
  **MCP servers** section
  （低于 `MCP_PROTOCOL_VERSION` 时隐藏）。它描述活动工作区所属的项目（没有活动工作区 → "Open a
  workspace to manage its MCP servers"），并通过 `transport` 的 `watchMcpWorkspace` 读取 `mcp.list` ——
  在挂载时、每次 welcome、项目信任变化时，以及在一个实时聊天仍报告某服务器 `starting` 期间以有界退避
  重复读取，因为宿主不会推送 connected 边缘。行来自 store 的 `deriveMcpServerRows`。其行的 `effective`
  标志门控仅有名称的 Sign in、Sign out 与 Test connection 动作，状态动作区与溢出菜单中都是如此：即使
  一个合法用户服务器携带着非法的折叠仓库覆盖诊断，宿主的可选 `summary.effective` 也是权威。只有那份被
  接纳的定义才取实时会话状态。对较旧的宿主，状态保留 scope/批准启发式，但仅有名称的动作只允许用于
  唯一的合法用户定义或已批准的项目定义，绝不用于有歧义的同名行。Review、Edit 与 Remove 仍按 scope
  区分。当项目未受信任时，project scope 的行会立即在客户端被丢弃，因此撤销不会让缓存的仓库行在刷新
  落地之前仍然可操作（宿主反正也会省略它们，横幅也如此说明）；撤销还会关闭已打开的 Edit、Review &
  approve 或 project scope Remove 对话框，丢弃仍在途的 Edit / Review 读取，而已打开的 Add 对话框会
  回退到 User scope —— 包括它已为 Project scope 走到的审查步骤（无论怎样，宿主都拒绝对未受信任项目
  的仓库写入）。用户服务器的启用/暴露变更只发送改变的那个字段（`mcp.setProjectOverride` 会合并），而
  Remove（任一 scope）与 Edit 会携带渲染时的 `summary.fingerprint`（`mcpRenderedTarget`，由对话框
  打开时的那一行构建，绝不复读），因此陈旧的行会拒绝，而不是改写或删除已改变的内容 —— 一个被检出改动的
  仓库条目，或一个在 Remove 对话框打开期间被另一个客户端或编辑器替换的用户条目；两者在失败时都会刷新
  列表，因此用户看到当前条目并能从它重试。行显示一个状态点 + 标签 + 一行原因、名称、
  User/Project 与 HTTP/stdio chip（stdio："Runs on host — inherits the host environment"）、一个暴露
  菜单（`deferred | direct | hidden`；已配置的 codemode 读作 "treated as deferred (codemode not
  available yet)"）、启用开关、至多一个主动作与一个次动作 —— 状态表 `mcpRowView` 编码：Sign in
  （需要登录）· Review & approve（待批准，或有待定的仓库覆盖）· Edit（非法的仓库条目）·
  **Reconnect**（失败，旁边有 **Show log**；已断开）· **Reload now**（待重载）· **Open a chat**
  （未运行，HTTP 时旁边有 Test connection）—— 以及一个溢出菜单（OAuth 服务器的 Sign in / Sign out、
  HTTP 的 Test connection、Edit 或 Review & approve、当用户服务器有项目设置时的 Share with repo、
  Details、
  处于确认之后的 Remove）。Reconnect 与 Reload now 按聊天行动：它们为报告该行状态的实时聊天逐个运行
  （`McpServerRow.sessions.reporting`）—— `mcp.reconnect`，以及通过技能基线执行的
  `session.reloadResources`（因此该聊天的技能徽章也会清除）。失败以宿主的文本留在行上（pi 的重连失败
  被宿主遮蔽；忙碌聊天的 "Can't reload while the chat is busy"，它会保持待定并在空闲后自行重载），当
  目标是多个聊天时每个聊天一行、以它的标签页标题命名，仅在该行保持该状态期间显示 —— 绝不用 toast。
  Open a chat 会关闭 Settings 并通过 `openChat` 的 `startChatInTab` 在该工作区里启动一个聊天，与
  workbench 的 New chat 是同一条路径。Show log 打开 `McpLogDialog`：pi 对该服务器的最后报告
  （`detail`，带 stdio 服务器的 stderr 尾部）以及它来自 pi `mcp.log` 的行（`mcp.readLog`，被宿主
  遮蔽）。Details 不列工具：目前没有载荷携带工具名（pi 的 `/mcp` 文本与 `SessionResources` 只报告
  一个计数）。需要注意的
  行排在最前，被禁用的行留在最后；`handledElsewhere` 让该 section 变为只读并显示一条通知
  （`mcpHandledElsewhereText`）：对替换型扩展是 "MCP is handled by <path> in this workspace;
  ThinkRail's MCP management is read-only."，对宿主的 `by: "pi settings (-builtin:mcp)"` 则是 "MCP is turned off in pi settings (-builtin:mcp); remove that entry to manage servers here."。
  整个 `mcp.json` 的问题（`McpListResult.configErrors`：无法解析的 JSON、`mcpServers` 不是对象、
  拼错的键）会按文件渲染成一条错误通知
  （`McpConfigFileErrors`），命出它的路径、pi 的消息以及 "Edit the file directly to fix it"，无论上方是
  列表还是空状态都一样 —— 因此 pi 无法读取的文件绝不会被当成 "no servers"。状态详情（pi 的报告）到达
  时已由宿主脱敏。
  **启用与暴露遵循一条路由规则（`mcpSettingWrite`）：** 用户级服务器只针对本项目变化，经由
  `mcp.setProjectOverride`（宿主原子地合并字段，因此只有改变的字段出行），全局 `mcp.json` 永不写入；
  仓库定义的服务器则在 `.pi/mcp.json` 中通过 `mcp.update` 重写，其整条目替换从写入时的条目出发，经
  `fs.readFile` 读取。每个 `mcp.update`（开关、暴露、Edit）都由 `mcpEntryUpdate` 构建，并携带该行
  渲染时的指纹作为 `expectedFingerprint`（`summary.fingerprint`，与 Remove 在任一 scope 发送的身份
  相同），因此宿主会拒绝从磁盘上已改变的条目重建的写入；宿主只会从按磁盘现状批准的条目结转批准。被拒绝
  的更新或共享会在行上（或 Edit 对话框中）显示宿主的错误
  并重新读取 `mcp.list`。待批准、非法与被替换的行会锁住两个控件，因此开关绝不可能从后门批准一个仓库
  条目。读取原始条目只用于更新与指纹：任何对话框都不展示其中明文的环境变量、header 或 OAuth
  client-secret 值（`<literal value hidden>` 占位；`${VAR}` / `!command` 引用会显示，因为它们才是真正
  运行的东西）。**Review & approve** 列出将要运行什么 —— 宿主遮蔽后的命令行或 URL
  （`summary.endpoint`，看起来像凭据的参数读作 `***`）、工作目录、每个 `!command`，以及
  带有其引用或隐藏标记的 env/header 名称 —— 然后用摘要的指纹批准（宿主会拒绝自那以后已改变的文件）。
  被拒绝的批准也会刷新 `mcp.list`；已打开的审查保留其原始指纹，绝不自动重试已改变的内容。关闭再重新
  打开审查会读取刷新后的摘要，并在新的确认之前重新读取该条目。**Edit** 用于仓库条目：原始条目以 JSON
  呈现，明文值被隐藏；留在原位的标记会保留文件在该名称下的值（`mcpEditedEntry`），而新值必须是引用。
  用户级服务器的 Edit 是一个被禁用的菜单项，命名其源文件（`McpServerSummary.source`）：`mcp.update`
  替换整个条目且宿主不返回原始用户条目，因此 Settings 只能有损地重建它 —— 用户直接编辑
  `~/.pi/agent/mcp.json`，而开关与暴露菜单仍写本项目的记录
  覆盖。**Add** 有三个层级：来自 `mcpPresets.ts` 的预设 —— 五个，已验证并钉住版本（不用
  `@latest`）：Context7 与 DeepWiki（`direct`，无需认证）、经由厂商只读端点（`/mcp/readonly`）的
  Linear 与 Sentry（两者都是 OAuth —— 添加后登录），以及 Playwright
  （`npx -y @playwright/mcp@<pinned>`），它作为被禁用的用户条目加上本项目的记录覆盖
  （`optInPerProject`）添加，因此只在用户选择加入的地方运行，且绝不触碰仓库；`modifiesData`
  （Sentry、Playwright）会加上 "this server can modify data in <service>" 确认，而名称已配置的预设读作
  **Added**。GitHub 保持为 recipe 而非预设（`gh auth token` 的 scope 未经验证）：在预设下方，
  *Use recipe* 用 `GITHUB_MCP_RECIPE_JSON` 填充 Paste JSON 层 —— GitHub 的只读端点
  （`/mcp/readonly`）以及来自 `!t=$(gh auth token) && echo "Bearer $t"` 的 `Authorization` header，
  它在 gh 已登出时会失败而不是发送空 token（`managing-mcp-servers` 技能携带同一份条目）；一个简表
  （pi 的名称字符集、逐文件重复与 `-`/`_` 双胞胎、每行一个参数的 stdio 命令或 http(s) URL、env/header
  行、暴露、描述，以及 Project 需要受信任项目的 scope）；以及粘贴的 `mcpServers`
  JSON（包装形式或裸映射，逐服务器预览；合法条目被添加，SSE 与畸形条目被标记）。**Settings 只存储
  引用**（`mcpSecretIssues`：来自表单的秘密值绝不被存储）：表单的每个 env/header 值都必须是
  `${VAR}` / `$VAR` 模板或 `!command`
  （pi 的语法，`isConfigReference`：`$$` / `$!` 转义下一个字符，一个完整但畸形的 `${...}` 会被当作
  字面量消费且不再重扫其中的美元符号，其后的引用仍计数）—— 其他任何内容（包括空）都是带重写提示的
  校验错误，而一个被添加后完全留空的行会被报告为未命名行而不是被丢弃 —— 并且其 URL 不得携带用户信息或
  以凭据命名的查询值（pi 按原样发送 URL，因此建议是改用 header）；一个携带明文 env、header 或 OAuth
  client-secret 值或此类 URL 的粘贴条目会以相同的提示被标记且不予添加。没有纯文本确认。任何会运行
  某些东西的保存都会先显示一个列出每条命令与 `!` 值的审查步骤；当其中包含 `!command` 时，它和
  Review & approve 会补上一行："!commands run on the host each time a chat connects;
  keep them fast (e.g. read a cached token)."（pi 在每次连接时同步解析它们）。`mcp.add` 逐个服务器运行；
  添加失败留在对话框中，粘贴只保留失败的添加。一次成功的添加独立于该预设随后的项目选择加入而提交：只有
  成功的添加才调用 `onEnableInProject`，其 `Promise<void>` 契约把启用失败的呈现留给 Settings。Add 会
  等待该回调落定（即使在拒绝时也不跳过），绝不把已提交的添加转成添加失败，也绝不重试那次添加。如果
  选择加入无法确认，Add 会关闭（除非还有其他添加失败），而 Settings 已有的 `user:<name>` 行错误说
  "Added, couldn't confirm enabling for this project; use its switch to retry." 它不断言
  在含糊的响应之后该服务器处于禁用状态。重试行开关只发送 `mcp.setProjectOverride`；不引入新的流程或
  状态所有者。每次变更之后都有一行状态说明改动生效的位置：没有聊天打开时是 "when a chat starts in
  this workspace"，否则是 "to open chats as they reload; a busy chat waits until it is idle" —— 宿主
  在重载它们之前就回答，因此返回的快照无法说明谁已经完成；行上的实时状态才能。Sign in / Test
  connection 启动
  `mcp.login` / `mcp.testConnection`，并像 Providers 那样复用 `auth/LoginDialog`：登录状态保留推送的
  `target`，因此只有针对本工作区的 MCP 登录才会打开该 section 的对话框（Providers 忽略它，为另一个
  工作区显示的 section 也忽略它），而登录页只能从对话框的按钮打开。一条横幅写着 "ThinkRail asks before
  MCP calls that may change data (per chat); no saved rules yet"；空状态提供预设、表单、JSON 导入与
  一条宿主通知。实时 section：**`ProvidersSettings`**（应用内的提供商认证界面 —— 一行头部带一个页内
  **Refresh**（`providers-refresh`，状态读取在途时禁用），其下是分组 **Connected**（每行带一个
  **仅当
  `canLogout` 时才有的 Sign-out** —— env / models.json 认证改为显示一个 "Managed" 标签，因为宿主
  无法取消它；`kind: "central"` 的行标记为 "JetBrains AI"，其 Managed 标签指向拥有该连接的 JetBrains
  AI 卡片）、**JetBrains AI** 卡片、**Subscriptions**（未配置的 `canOAuth` 提供商）与
  **Available (N)**（仅 `canApiKey` 的其余部分，用 "Show N more" 展开器封顶）。每个未配置的提供商都是
  一行，在 `canOAuth` 时提供 **Sign in**、在 `canApiKey` 时提供 **API key** —— **两条路由都启动
  `provider.loginStart`**（`type` 为 `"oauth"` / `"api_key"`，issue #97）进入同一个 store 驱动的
  `auth/LoginDialog`（打开 URL / 粘贴代码 / 回答提供商自己的 key 提示，`provider.loginReply` —— 没有
  内联 key 字段）；对两个标志都没有的行显示一条 "configured outside the app" 说明；以及
  **`JetBrainsAiCard`** —— 在保留 ThinkRail 内嵌 PI 的同时，把 Central 支持的模型路由到用户的 JetBrains
  订阅 —— 一个基于类型化 `JbcentralStatus` + `provider.jbcentral*` 的状态机：absent（官方宿主 OS 安装
  指引 + Recheck）、outdated（低于宿主支持的最低 Central，引导 Update）、invalid/unverifiable 版本
  （安全的指引，没有原生动作；*高于*最低要求的版本就是 ready，绝不被门控）、**signed out** —— 卡片
  **陈述这一点并只提供 Sign in**：主操作*取代* Connect 而不是与它并排，而在 `supported` 上，登出行取代
  "Central is ready" 的说法，而不是给它做注解。规则是卡片绝不为不可能成功的动作做宣传 —— 没有凭据的
  连接会失败 —— 因此前置条件成为所提供的操作，而一旦宿主报告凭据，Connect 就回归。
  **登出只渲染为一个状态，无论底下是什么配置：** 正文只说 Central 已登出 —— 绝不与一行会与之矛盾的
  "Connected" 并置 —— 且 **Sign in 是唯一的动作**，Disconnect 与 Connect 一起被扣留。一旦完成认证，
  一个其代理被正面观测为已停止的已配置状态同样会用 “Central's proxy is not running” 取代成功说法，并
  只提供 **Start proxy**；它启动之后，Connected + Disconnect 回归。因此前置顺序是 Sign in →
  Start proxy → 普通的已连接控件，绝不是相互竞争的动作。未知的代理健康状况不会凭空制造一个要求。一个
  破损的会话只要求解决其当前前置条件的那一件事，而不是把一个修复与一个无关的选择或成功消息并列。
  **登录是一个按钮，绝不是菜单：** ThinkRail 在宿主上启动 Central 的流程，而 `central login` 命令
  *只*在那个启动失败的地方出现 —— 把它印在一个可用按钮旁边会让用户在通往同一地点的两条路之间做选择。
  因为该流程在**宿主**的浏览器中打开，启动后的确认会说明这一点并把 Refresh 作为下一步，因为此时
  Connect 还不在屏幕上。*反应式*指引为探针看不到的情形保留：凭据存在但动作仍被拒绝 ——、需要登录
  （启动 Central 登录 + Retry）、ready（Connect）、configuring（一个 Central 动作或受监视候选的重建
  在途）、connected（新工作所用的当前运行时已应用 Central；Disconnect）、load-failed（上一个运行时或
  启动时的普通回退仍可用；Retry 或 Disconnect），以及通用动作错误（Retry/Recheck）。
  没有重启提示、受影响的聊天列表、阻塞状态或恢复模式。现有的实时聊天可能保留较旧的运行时 —— 包括
  Disconnect 之后的 Central —— 而卡片说明它的状态适用于新聊天。更新/连接/断开状态以宿主为权威并在
  各客户端共享；每次变更都重新读取 `provider.status`，而来自受监视外部变化的 `provider.changed` 失效
  会触发同样的重读外加模型列表失效。状态读取按请求排序，因此较旧的响应无法取代较新的受监视/动作结果。
  文案绝不承诺只支持 Claude/GPT，绝不要求独立的 PI，绝不渲染子进程输出/诊断/产物内容/路径/代理数据/
  机密/原始模型，并只把封闭的原因码映射为 ThinkRail 撰写的文本。在协议 v59+ 上，同一张卡片始终显示
  同步的 **Show quota in top bar** 开关与 **Refresh every _ seconds** 字段，在每种 Central
  生命周期状态中。该标志默认为开；间隔默认 30 并接受 `1–3600` 的整数。关闭会禁用（但保留）该间隔。
  该字段在本地编辑，在 blur/Enter 时提交，内联报告非法范围，并等待 `settings.changed` 而不是安装乐观
  权威。较旧的宿主两个控件都得不到。**`GithubSettings`**（Integrations section 的 "Local GitHub"
  分组 ——
  `github.authStatus()` 显示为 `settings-gh-status[data-connected]`：Connected + 登录名，或一条点名
  `gh auth login` 的 Not connected 通知；两种状态都提供 Refresh（`github.refresh`））；
  **`AppearanceSettings`**（一个客户端本地的 **Language** 分组通过应用 `i18n` 偏好接缝提供
  **System / English / 简体中文**；System 是默认值，改动立即生效，且不写入任何宿主设置。一个客户端本地
  的 **Font** 分组使用同一个接缝（`fonts` barrel，[[submodule-web-fonts]]）：一行 **Interface font**
  命名当前字体族（在选择之前是 **Default**）、一个带搜索字段的展开区、**Default**、已安装的字体族 ——
  每个都用它自己的字形渲染 —— 以及一个供无法枚举的宿主使用的字体族名称字段。选择立即应用到文档根槽位
  且不写入任何宿主设置；一个会破坏 CSS 值的名称会被拒绝并显示内联的 `interface-font-error` 通知，而
  不是被持久化。设置导航与页面文案使用响应式翻译，而协议 id 与 React
  key 保持稳定。目录驱动的主题设置紧随其后：一个 **Theme mode** 分段控件，**System / Light / Dark**，
  其中 System 仅从 `THEME_SYSTEM_PROTOCOL_VERSION` 起提供（较旧的宿主保持仅固定主题的行为），以及一个
  **Contrast level** 控件，**Default / High**。Light/Dark 写入一个固定主题：从 System 出发时它们采用
  该对中对应那种外观的那一半 —— 即控件所显示的内容 —— 绝不采用陈旧的保留固定主题；在固定模式下它们
  移到当前主题家族的对侧。Contrast 切换到同一家族的另一对比度主题（在 System 模式下同时切换该对的两
  半），因此无论哪种切换家族都得以保留；目录中没有目标项的选项会被禁用，而不是映射到一个无关主题。
  具体主题藏在折叠的展开区之后 —— 固定模式下是 manifest 列表，System 模式下是按外观过滤的
  `Light theme` / `Dark theme` 选择器，每个槽位各自独立为普通或高对比度 —— 因为模式与对比度回答的是
  常见问题。模式与 manifest 列表保持分离：把 System 做成又一个主题行会把配置嵌套进一个类 radio 的选项
  里。System 模式增加一行 `Current on this device`（`system-theme-current`），读作
  `<device icon> <Light|Dark> → <palette icon> <resolved label>` —— 图标承载哪一半是设备外观、哪一半
  是主题，因为两半常常是同一个词；模式与对跟随用户，而每台设备读取自己的系统设置。首次启用 System 会
  原子地发送模式 + 从主题推导出的同对比度对；之后的槽位编辑替换完整的一对，而回到
  固定模式只改变模式，两项选择都保留。本面板至多允许一个主题变更在途；它的控件在请求落定之前使用真实的
  禁用状态，防止快速的完整对写入用陈旧的兄弟槽互相覆盖。每个动作都触发 `settings.update` 并
  **收敛于 `settings.changed` 广播**，没有乐观应用；拒绝会让控件/主题保持不变并抛出 toast。一个不可用
  或外观不匹配的已配置 id 会由模式控件下方的一条警告通知披露 —— 位于展开区之外，因此始终可见 —— 并
  点出有效的同外观回退值，且绝不会被静默写回。该面板从不拥有
  主题列表、媒体查询逻辑、对推导或回退 —— 全都来自 `themes`；它只推导两个控件所移动到的家族/对比度
  对侧。一个 **Editor** 分组承载文件的 `LineWidthControl`）；**`LineWidthControl({kind})`**
  （`LineWidthSettings.tsx`，没有自己的页面 —— `chat` 那个控件在 Chat 中，`file` 那个在 Appearance →
  Editor —— 一个按自动保存输入模式的 40–240 整数 **Line width** 字段，外加一个独立的宿主同步
  **Fit to pane** 开关（`${kind}-line-width-bounded`）；默认为 120/开。来自 `settings.changed` 的
  已改变权威宽度会替换陈旧草稿；变更只在该广播上收敛，被拒绝的调用会 toast 且不改变几何）；
  **`ChatSettings`**（一个 **Appearance and behavior** 行分组 —— **Message order** 在
  `store.chatMessageOrder` 上分段（Oldest first，兼容性默认 / Newest first，需选择加入）、
  **Composer size** 在输入框增长上限上分段（Compact / Roomy / Half chat）、聊天用的
  `LineWidthControl`，以及 **Streaming response movement** 行，一个基于
  `store.streamingResponseMovement` 的双手柄范围。该移动行的文案是 “When the chat moves while an
  answer grows, and where its newest edge lands”；一个轴是 Top → Message box，Settle 为 25–90，
  Trigger 为 35–100，两者步长 5 且最小间隔 10 点，显示的默认为 75%→100%。它不暴露任何跑道/尾部/
  生命周期控件。消息顺序与
  移动都立即生效，并只通过聊天偏好接缝持久化在本客户端：浏览器使用当前宿主限定的键，而原生外壳可以注入
  它稳定的后端配置/窗口适配器。另一个浏览器、原生窗口或宿主不受影响。输入框增长仍是顶层 `AppConfig`
  字段并收敛于 `settings.changed`，被拒绝时抛 toast。解释性文案说 “message box”，而不是内部
  “composer” 这个名字，来指代用户打字的地方。最后一个 **Subagents** 分组（`SubagentSettings.tsx`）是
  行而不是表格：全局 **Allow subagents**，以及从 `SUBAGENT_CONCURRENCY_PROTOCOL_VERSION` 起的
  **Per chat at once**；然后，在有活动工作区时，一个 **This workspace** 子标题命名该工作区并覆盖同样
  的两行。整个分组需要
  `SUBAGENT_SETTINGS_PROTOCOL_VERSION`，因此一个独立发布的客户端绝不会对较旧的宿主提供不受支持的变更。
  工作区行用 Global/Custom 标签显示*有效*值：切换写入 `on`/`off`，输入的限制写入覆盖，空限制字段
  （占位符 = global）或 Custom 标签（一个重置按钮）发送 `null`，因此后续的全局变化仍会流通。限制字段
  遵循自动保存输入模式，由 `isSubagentMaxConcurrent` 校验（非法草稿保持可见并显示其范围错误，不予保存），
  且绝不 clamp。当某个工作区的子代理实际处于关闭状态时，该工作区的限制被禁用；
  即使全局关闭，全局限制仍可编辑，因为被强制打开的工作区仍会继承它。全局变更通过 `settings.changed`
  收敛，工作区变更通过 `workspace.updated` 收敛；没有一个是乐观的）；
  而
  **外壳自有、注入的 Layout
  section**（Balanced/Focus/Review
  加上命名的自定义预设卡片。其预设与实时 frame 匹配的卡片读作已应用 —— 这是通过比较几何推导的，因为
  没有发布当前布局 —— 且它的 Apply 被禁用。有效的默认值
  携带一个 **Default** 徽章（当存储的默认值不再存在时是 **Fallback**），其 tooltip 说明 Reset 会使用它，
  且它按窗口记忆。一张 **Add new layout** 卡片打开一个 popover（名称 + Save preset）来捕获实时 frame。
  自定义的捕获/重命名/删除会更新宿主同步的目录并通过 `settings.changed` 收敛；默认选择与独立的侧/底
  分组限制是前端本地的，这些限制自动保存在折叠的 **Advanced** 展开区内。有活动工作区时，每张卡片的
  **Apply now…** 与 **Reset to default** 行（`layout-reset-default`）都经过一次确认，然后请求外壳替换
  本窗口的 frame，并原子地在每个保留的工作区视图中保留/重排打开的资源身份）；可选的
  **外壳自有、注入的 Update section**
  （Settings 外壳仅在提供了内容时才包含它的行；`panels` 既不发现原生也不发现宿主更新能力。若之后的
  一次 welcome 移除了注入内容而 Updates 处于选中状态，则渲染并高亮 Appearance，而不是留下没有任何活动
  行）；
  **`WorkspacesSettings`**（**Workspaces** section，仅在
  `protocolVersion >= WORKSPACE_SETTLE_PROTOCOL_VERSION` 时列出）—— 一个 `SettingsRadioCards` 分组，
  **Settle idle
  workspaces after**：1 / 3 / 7（默认）/ 14 天 / Never，写作 `settings.update { settleIdleDays }`
  （Never 时为 `null`）并通过 `settings.changed` 收敛；一个合法的宿主配置的非预设值会让预设卡片保持
  未选中，而不是错误地显示默认值。默认值是一周，而不是一个长周末：已合并/已关闭的 PR 已经立即 settle，
  所以空闲规则只捕获休眠的工作，并倾向于让暂停的工作区保持活动（周四的工作到周一被放进搁架读起来像
  损失，而不是整理）。文案点出
  三种算作活动的事与三种永不 settle 的事，因为该设置只有与那些规则一起才可读；
  **`TerminalSettings`** —— 一个 **Scrollback** 分段控件（`store.terminalReplayKb`，从 Off 到 1 MB
  的五个预设；一个合法的非预设宿主值不选中任何项，而不是选错预设；
  `settings.update { terminalReplayKb }`，对从此刻起打开的终端生效）以及，在
  `protocolVersion >= WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION` 的 Windows 宿主上，一个 **Windows shell**
  picker（Auto / PowerShell 7 (pwsh) /
  Windows PowerShell / Command Prompt，
  `settings.update { terminalWindowsShell }` —— 每种选择会启动什么见 `submodule-server-terminal` 的
  shell 选择决策）。协议门禁阻止一个更新的独立发布客户端呈现一个较旧宿主会保留但不执行的设置。
  Windows shell 那一半被拆成一个 **props 驱动**的 `WindowsShellSettings` 组件，而不是像 replay picker
  那样内联读取 store：zustand 的 React 绑定把其冻结的 `getInitialState()` 快照
  （`useSyncExternalStore` 的 `getServerSnapshot` 参数）喂给 `renderToStaticMarkup`，绝不是测试的
  `setState`，因此任何必须在那种渲染路径下保持可断言的 settings section 都改为从 props 取值 —— 与
  `ChatSettings` 已经为 `SubagentSettings` 使用的形状相同；以及
  **`TemplatesSettings`** —— 两个分组，先是 **Project templates**，然后是 **Global templates**，每个分组
  都是一个标题加一个低调的 **New** 按钮，以及它自己的行（没有活动工作区时，项目分组只显示一条提示去打开
  一个项目，且没有 New），通过**两次独立的 `template.list` 调用**取数（每当 store 的
  `templatesVersion` 变动时两者都会重新取数，各自带自己的失败标志，因此一个的成功绝不可能盖掉另一个
  仍然真实的失败）：**Global** 用无 scope 的调用（`{}`），项目分组用 `{ workspaceId }` 并过滤到
  `scope === "project"`。无 scope 的那次调用特别重要，因为服务器的 `template.list { workspaceId }`
  响应是**被影子合并过的**（`templates.ts` 的 `listTemplates`：同名时项目模板胜出）—— 这对输入框的
  `/` 菜单是对的，但如果 Settings 的 Global 分组也用同一个按工作区限定 scope 的调用，一个被影子覆盖的
  全局模板就会完全从视野中消失，没有任何办法找到、编辑或删除它（`data-testid="template-row"`：
  名称 + 描述，并且 —— 仅项目行 —— 一个 **Open as file** 动作，通过与文件树完全相同的 `openTabs.ts`
  的 `openFileInTab` 打开 `.pi/prompts/<name>.md` —— 采用 **`keep`** 意图，因为一次刻意的
  "open in editor" 绝不能落进一个后续点击会静默替换掉的预览槽 —— 然后关闭 Settings，以及一个
  **Edit** 动作；全局模板没有工作树可供打开文件标签页，因此全局行只停留在对话框里）。**New**/**Edit**
  打开共享的 `chat/TemplateEditorDialog`（见 `chat/SPEC.md` 的 Save-as-template 条目 —— 它住在
  `chat/` 里是因为 `HistoryOverlay` 的 save-as-template 动作需要完全相同的表单，而 `chat/` 无法
  import `panels/`）。**Delete** 是一个锚定在该行自己的 Delete 按钮上的 `ConfirmPopover`，直接调用
  `template.delete` —— 对话框本身从不参与删除。**R4 —— 起始模板提议：** 当 **Global** 分组的取数
  已落地、零行且无错误时，它的空状态是一条通知，带一个 **Add starter templates** 按钮
  （`data-testid="template-starters"`）—— 点击它会把五个逐字（verbatim）的起始模板依次
  `template.save`（scope `"global"`，正文在客户端通过共享 `prompt` 模块的 `assembleTemplate` 组装，
  即 `TemplateEditorDialog` 用的同一个辅助函数），随后把 `templatesVersion` 提升一次 —— 与行列表
  已经在其上重新取数的同一个失效机制 —— 一旦列表非空，该提议就会在它自己的下一次渲染时消失，
  没有需要跟踪的关闭状态。那五个（review/explain/tests/commit/rename）**正是本仓库签入自己
  `.pi/prompts/` 的同一组**：那些以*项目* scope 发布，因此只有 ThinkRail 的检出才会看到它们，而
  "the templates ThinkRail ships" 必须只意味着一件事而不是两件 —— 改一个，就改另一个。输入框的
  `/` 菜单承载可发现性的那一半（`chat/SPEC.md`：当任何地方都不存在模板时，一个
  `slash-templates-empty` 页脚提示会深链到这里），因为这个提议否则就埋在对话框里两次点击之深。
  项目分组的空状态是一条朴素的、无图标的通知，点出该项目的 `.pi/prompts/` —— 该提议仅限 Global，
  因为它只会播种全局文件。服务器没有任何改动。
  **`NotificationsSettings`** 是应用外注意力通知的唯一总开关（默认开），通过 `settings.update`
  持久化 `{ notificationsEnabled }`。启用期间它还会通过 [[submodule-web-notifications]] 的 barrel
  呈现实时的浏览器权限：权限仍为 `default` 时是一条 **Allow in browser** 通知（点击就是那次调用该
  通道 `requestPermission` 的用户手势；从 `default` 打开总开关同样会询问），`denied` 时是一条带可
  折叠 **How to enable** 步骤的警告，浏览器没有 Notification API 时是一条不带步骤的警告，而在已授予
  或使用 OS 通道之后什么都没有 —— 这是一条可见的、应用内的获取路径，不依赖一个失焦事件。通知管线、
  抑制，以及离开路径的权限前言位于 [[submodule-web-notifications]]。
  **`PrivacySettings`** 把额外数据偏好与确认放在一起管理；事件契约属于
  [[submodule-server-analytics]]。
  **`AnalyticsConsentDialog`** 在一个具备该能力的宿主未确认的配置注水之后，经外壳挂载一次。它把草稿
  开关初始化为开，并立即持久化 `{ analyticsEnabled: true }`；持久化与广播会在对话框保持打开期间激活
  宿主门禁。**Done**、Close、Escape 与背景点击会用 `analyticsConsentConfirmed: true` 持久化当前
  草稿，因此普通结果就是开。关掉会立即持久化 off/confirmed，随之而来的配置广播会关闭该对话框。已确认
  的开/关配置永不挂载或预置。持久化失败会让草稿与错误保持可见以便重试。已保存的决定跨重启存活，之后
  通过 Settings 更改。对话框只保留简短的产品使用文案与共享开关；Settings 则补充可选的结果、报告维度
  与被排除的内容。较旧的宿主保留其遗留的隐私控件，没有新的同意对话框。
  **`FeedbackSettings`** 是 Privacy 之后最后一个实时 section：与自动提示相同的访谈文案，说明完成一次
  关于参与者 ThinkRail 体验的用户访谈会在 Central（JetBrains AI）中获得 100 个奖励积分 —— 积分，
  绝不是货币金额 —— 外加一个指向固定 Google Calendar 预约页的真实外部锚点，在新标签页中以
  `noopener noreferrer` 打开。ThinkRail 只传达该激励；出席核实、资格与积分兑现都在应用之外。这个
  主动的 Settings 链接始终可用，并刻意不调用 `feedback.respond`、不改变自动弹窗状态，也不声称仅凭
  预约就能获得积分。
  **`ModelsSettings`** 是 **Models** section，仅在协议 v72 或更新时可见。它会在打开时、每当实时目录
  变化（包括变为空）时，以及每次保存之后重新读取 `model.default` —— 宿主会针对其已落定的目录解析
  所保存的模型及其力度级别，因此一个消失或已改变的模型绝不会提供陈旧的级别；只有最新的读取生效，
  而一次失败的读取会把控件替换为一个重试 —— 并通过 `settings.update` 写入 `defaultModel` /
  `defaultEffort`，持久化失败时抛错误 toast。宿主的 `model.default` 结果就是所显示的有效选择，其中
  包括保存的模型缺失时的首个可用回退值；受支持的力度级别与所显示的力度都来自那个同一份已解析、
  经 Pi clamp 的模型。在保存或重新读取在途期间，两个触发件都被禁用，且已经打开的 picker 中的选择
  会被忽略。在 v76 上，**`ModelContextSettings`** 针对宿主以 `ModelContextSetting[]` 返回的每个
  合格 GPT 模型增加一个 Default / 1M / Custom 选择器；一个折叠的 **By each model** 展开区为每个
  提供商/模型对显示一个选择器，因此同一个模型在不同提供商上仍可独立编辑。选择以显式的 `override`
  为键（Default = `null`，即 pi 报告的目录值）。该共享控件只汇总契约的 `isSharedModelContextTarget`
  接纳的那些行 —— 当它们的覆盖值不同时它显示 "Customized by model"，计入它不去触碰的外部行，并在
  它将不治理任何行时被省略 —— 而选择一个共享预设会在一次 `model.setContextWindow` 调用中替换那些
  行的覆盖值。Custom 会显示一个受契约的 272K–1M 范围约束的整数输入框，在 Enter 或 blur 时保存 ——
  除了 blur 落到同一控件的兄弟预设上的情况，因此选择 Default/1M 绝不会先提交一个只打了一半的值；
  文案把它标为一条应用策略，而不是提供商已验证的限制，而超出该范围的外部值仍然可见但不能被重新应用。
  草稿是 UI 本地的，并会在其权威覆盖值变化时被丢弃；输入框不会被重挂载，而在一次被禁用的保存之后，
  焦点只回到发起它的那个控件。Pi 的共享配置是权威的 —— 不存在乐观值，也没有 AppConfig 字段；读取
  跟随目录/提供商失效、围栏陈旧回复、在待定期间禁用控件，并在失败时把控件替换为 Retry。props 驱动的
  `ModelContextControls` 拥有呈现；较旧的宿主既得不到该区块，也得不到它的请求。
  `ModelsSettings` 把它的控件组织成三个视觉分组：

  **DEFAULT MODEL** —— 一个 **Chat model** 行（`defaultModel`、`defaultEffort`）以及 **Visible models**
  展开区。**REVIEW**（`models-review-group`）—— 把所有配置 review 的东西放在一处，因为用户就是按
  这个词去找它：**Review model** 行（`review-model-row`；`reviewModel`、`reviewEffort`），独立于
  Chat model 行的加载状态，然后是下面的两个自动化开关。两个模型行都在 `useModelCatalog` 之上使用
  `ModelSelector`/`ThinkingSelector`；review 选择器携带一个**显式的默认模型行**
  （`model-option-default`，用宿主的 `model.default` 结果标注），它写入
  `{ reviewModel: null, reviewEffort: null }` —— null 清除的线上协议形式，见
  `submodule-server-settings` —— 因此一个选定的审阅模型可以被恢复为宿主的 new-chat 默认值，而无需
  手工编辑宿主状态；在未设置期间，力度控件运行在默认模型受支持的级别上（从 `model.default` 取一次），
  而不是一个空列表。**`VisibleModelsSettings`** 是一个折叠的展开区（其摘要统计被隐藏的模型），列出
  每个目录提供商/模型对，带一个搜索字段和一个开关；被隐藏的模型通过 `store` 的 `selectPickerModels`
  离开所有模型 picker（pinned、recent、提供商分组、搜索），而它即使在隐藏时也始终保留调用方当前的
  选择，新模型则默认显示。隐藏是一条**客户端本地**偏好，不是宿主配置：`chat/modelVisibility` 的
  `initModelVisibilityPersistence`（由 `main.tsx` 调用一次）注水 `store.hiddenModels` 并把变化写回
  —— 在注入了原生外壳稳定的 `clientPreferences` 适配器时经由它在键 `hidden-models` 下写，否则写
  浏览器 localStorage `${STORAGE_PREFIX}hidden-models:<httpBase>`，后者的 `storage` 事件会同步其他
  标签页。完整目录在这里仍然可用于配置。

  REVIEW 分组的开关：一个 **agent-review toggle**（`agent-review-toggle`、`agent-review-row`，一个
  关于 `store.agentReviewEnabled` → `settings.update { agentReviewEnabled }` 的开关）—— 关闭会扣留
  worker 会话内的 `request_review` 工具，因此 review 只通过 Review 按钮发生（宿主据此实时切换该工具的
  活动集合，见 `submodule-server-host-plan-review`）；该行在
  `AGENT_REVIEW_SETTING_PROTOCOL_VERSION`（v68）以下隐藏，因为在那里的宿主可能存下该字段却仍然注册
  该工具。以及一个 **auto-fix toggle**（`review-autofix-toggle`、`review-autofix-row`，一个关于
  `store.reviewAutoFix` → `settings.update { reviewAutoFix }` 的开关）—— 关闭意味着一个
  `request_changes` 判定只记录发现并等待（宿主据此门控它的自动修复循环，见
  `submodule-server-todos`）。

  **GPT CONTEXT WINDOW** —— 上文描述的 `ModelContextSettings` 区块。

  **没有单独的 Review 导航 section**；所有与 review 相关的控件都住在 Models 的 REVIEW 分组里。
  **`ExtensionsSettings`**（**Extensions** section，导航 `settings-nav-extensions`，仅在
  `protocolVersion >= EXTENSION_CATALOG_PROTOCOL_VERSION` 时列出）在该 section 每次挂载时用
  `extension.list` 取宿主注册表的目录 —— 目录在每个宿主进程内是静态的，因此它是 section 本地状态，
  而不是 store 切片 —— 并通过 props 驱动的 `ExtensionsCatalog` 渲染它：每行是标题、描述、工具名 chip
  以及一个 `@thinkrail/ui/switch`（`extension-toggle-<name>`）。开关状态来自
  **`store.disabledExtensions`**，而不是目录的 `enabled` 快照，因此它会跟随来自任何客户端的
  `settings.changed`；一次切换通过 `settings.update { disabledExtensions }` 写入整个列表，并且像
  每个设置开关一样收敛于那次广播，而不是乐观渲染（`submodule-server-settings` § 必须做对的事）。
  已经在列表中的未知名称会原样带过。空注册表渲染 `extensions-empty`；取数失败渲染
  `extensions-failed`。禁用绝不注销一个工具渲染器（[[submodule-web-extensions]]），因此过去的对话
  记录仍会渲染。
  `ProvidersSettings`/`McpSettings`/`AppearanceSettings`/`LineWidthControl`/`ChatSettings`/`TemplatesSettings`/
  `WorkspacesSettings`/`PrivacySettings`/`ModelsSettings`/`FeedbackSettings`/`ExtensionsSettings` 以及
  全应用范围的 **`InterviewPromptDialog`** 都是 panels 拥有的**集成件**（store + transport）。该提示
  渲染共享的激励文案与固定的 Calendar 锚点，动作为 `Schedule an interview`、`Not now` 和
  `Never show again`。主键与中键预约激活会立即打开 Calendar 并记录 `book`；close、Escape 与背景点击
  记录 `postpone`；永久关闭记录 `never`。受控对话框只在宿主 ack 之后关闭，并报告被拒绝的动作而不丢弃
  仍然打开的选择。`SettingsDialog` 从外壳组合根接收 Layout section，因此没有面板会横向伸进 shell，
  而 `LoginDialog` 保持纯呈现（`auth` 模块）。

  面板组合自己的子面板（例如侧工具 → `FileTree`/`ChangesPanel`，资源面板 → 已注册的内置渲染器）——
  一个内部层级。当一个中央分组没有资源标签页时，workbench 向 panels 请求那个空表面，作为一份常驻的
  创建/定向回执，而不是一个通用占位：**“Workspace ready”**、显示名称、`branch · from baseBranch`，
  以及 **“Files, chats, changes, and terminals are scoped to this workspace,”**，随后是既有的
  **New chat** 动作。对 **Default 工作区**，该回执讲真话而不是承诺隔离：**“Default workspace”**、
  项目名、`on <branch>`，以及 “Chats, changes, and terminals run directly in your project folder.”
  一个**外部工作区**出于同样的理由读作 **“Existing worktree”** 加 `on <branch>` —— ThinkRail 没有
  切出它，因此没有 `from <base>` 可声称。它既不是一次性的，也不可关闭，因此它也在最后一个标签页关闭
  之后仍然有用，而不引入 onboarding 状态。workbench 的资源渲染器通过惰性的 **`PlanPane`** 处理已注册
  的 **`plan`** 标签页（`PlanTab`）—— 即聊天计划的那个**实时 review-map 页面**。前端本地的放置只存
  `todo-plan` 解析器种类 + 会话身份，绝不内联计划内容；另一个客户端可以显式重新打开同一个宿主拥有的
  页面，而不继承放置。

  **TODO 列表是一个右侧栏工具。** `LAYOUT_TOOLS` 携带 `"plan"`；`WorkspaceWorkbench.toolBodies.plan`
  渲染惰性的 **`PlanRailPane`**（新文件，`apps/web/src/panels/PlanRailPane.tsx`），它**不是**
  `PlanPane` —— 它 import 了聊天视图所依赖的同一个紧凑 `TodoAddRow` + `TodoRows`
  （`apps/web/src/chat/TodoList.tsx`），因此对一个表面的视觉改动会落到另一个上。其外层 div 上的
  `data-testid="plan-rail-pane"`（与中央标签页的 `plan-pane` 不同）让 e2e 可以无歧义地定位任一
  表面。该栏通过 `selectRailPlanSessionId` 挑选该工作区当前活动的聊天，并显示那个聊天的 TODO；当该
  工作区完全没有聊天标签页时，`plan-rail-empty` 占位符会邀请 "Open a chat to see its plan here."。
  `TodoAddRow` 内部的 `todo-open-plan` 按钮打开文档尺度的**中央标签页 Plan**（`openPlan` →
  `openDoc({kind:"plan", ...})`）；该栏是始终在线的速览表面，中央标签页 Plan 是深审阅表面
  （`PlanSessionLive`、PR 动作、next-action 横幅、已采纳的提交、未归因）。它们互相补充 —— 栏负责任务
  列表，页面负责审阅轨迹。没有布局迁移：既有中央标签页 Plan 与新栏工具并存工作。

  **尚未完成的栏内条目携带一个悬停时的 Remove 按钮。** 用户可以从栏上经由一个在该行悬停状态出现的
  `data-testid="todo-remove"` × 按钮取消一个排队中或进行中的步骤；点击调用 `plan.remove(id)`，它会
  触发宿主的 `todo.remove` 线上协议调用。宿主的 `removeTodo` 会以一条解释性错误拒绝一个 `done` 条目
  （已完成的步骤是计划的审计轨迹），因此该按钮在客户端也在 done 行上隐藏。失败路径由
  `useChatTodos.remove` 自己拥有：宿主拒绝会抛出，该 hook 回滚乐观补丁并通过 store 的错误通道 toast
  "Couldn't remove the step"，因此一次陈旧点击（该行在渲染与点击之间刚变成 done）绝不会表现为一个
  未处理的拒绝。中央标签页的 Plan 页面**不**暴露这个能力 —— 它是审阅轨迹表面，队列操作住在栏上。
  agent 仍通过 pi-todos 的 `todo_remove` 工具管理它自己的移除，该工具绕过宿主守卫。

  中央标签页 Plan 以文档尺度渲染该会话的 TODO 计划，并**按状态分组**（`planSections`）：单个
  **`Now` 区块**（`plan-now-executing`）承载当前工作 —— 活动分组/散条目，随后是待定的那些（没有单独的
  To-do section；条目状态字形区分进行中与待定）。它的**实时状态是头部中 `Session` 标题右侧一个可点击
  的 chip**（`plan-now-status`、`data-glance`，取自 `sessionGlance`），它会**打开聊天**
  （`openChatInTab`），因此你可以从计划跳进对话：`working` → 一个 `Working on this` spinner，
  `waiting_question` → 一个 `Question` chip。那个等待中的问题**还可以就地回答**：Session 正文的
  **实时槽位**（`PlanSessionLive`，它订阅会话运行时，因此它的重渲染不落在沉重的 PlanPane 上）在聊天
  之外托管着同一个 **`AskUserQuestionCard`**（`plan-ask`，通过 `planView.pendingAsk` 找到），位于一个
  最小化的 `ChatActionsContext`（真实的 `session.answerQuestion`；仅聊天才有的动作 ——
  reveal/focus/subagent —— 是空操作）加上一个派生出的 `AskStatesContext` 之中，因此从计划里提交的
  答案走过的路径与聊天完全相同。当没有待定问题时，同一个槽位改为显示 **agent 的最新消息**
  （`plan-agent-message`，`planView.lastAgentText` 在一个有界的滚动区内渲染为 Markdown ——
  `max-h-[12rem] overflow-y-auto`，因此完整消息保持可读，而不会把计划条目往下推 —— 在它流式时
  实时更新）—— **始终如此，包括某一步正在进行时**，因此计划对 agent 此刻在做什么保持诚实；只有在
  待定提问占用该槽位或尚无 agent 消息时它才什么都不渲染。条目下方，Session 以一个**聊天/引导
  （steer）输入框**收尾（`plan-session-chat`，一个像聊天输入框那样工作的 `PlanComposer` textarea ——
  Enter 发送，Shift+Enter 换行），其发送会随运行状态自适应：agent 在流式时它**做引导**
  （`session.steer`，"Steer the agent…"），否则它**开启一个轮次**（`session.prompt`，"Message the
  agent…"）。一个在没有其 Chat 的情况下被恢复的 Plan 标签页没有本地运行时，而聊天协调只会注水已放置
  的 Chat 标签页，因此 `PlanPane` 自己在连接上却没有运行时时调用 `hydrateSessionRuntime`（后台执行，
  不放置标签页）—— 实时槽位、状态与计划内的提问卡都需要它。输入框保持 `ChatView.performSend` 的
  语义：它先等待 `hydrateSessionRuntime`，因此模式来自**已注水**的运行时。一条 **prompt** 在发送之前
  就被记录（`appendUserMessage`）且不被等待 —— `session.prompt` 只在运行结束时才解决 —— 因此一次
  拒绝会在那个聊天里表现为一个 `appendErrorTurn`，什么都不会丢。一条 **steer** 不被记录（它随投递的
  消息一起到达），因此它被等待：注水失败或 steer 被拒绝会 toast 并重新抛出，草稿留在计划里。
  **从计划发出的发送留在计划上** —— 它绝不自动切到聊天标签页（早先版本在成功路径上通过
  `openChatInTab` 这么做过；已移除，因为计划本身就是一个工作表面，而 agent 的回复会流进紧邻下方的
  实时 `plan-agent-message` 区块）。要跳到聊天，你点击 Now 状态 chip（`Working on this` /
  `Question`）或显式的 Open-chat 入口 —— 它们如今是计划里仅有的 `openChatInTab` 调用点。
  `PlanComposer` 在上一次提交在途期间忽略新的提交，因此重复按 Enter 无法把同一草稿添加或发送两次。
  因此一个已完成的计划（没有打开的步骤）把它的 Session 变成一个聊天入口，而不是一行死掉的
  "all steps done"，而一个运行中的计划会得到一个就地的引导字段。唯一的例外是**真正为空**的计划
  （没有条目、空闲）：那里的正文显示 `plan-now-idle` 那一行（`No steps yet…`），它本身就是一个点击
  目标，会打开添加任务输入（一个悬停显示的 `+ Add a task` 提示）来引导计划。一个 **`Done` section**
  （`plan-done-section`，始终展开 —— 该页面就是审阅轨迹）先放已完成的分组，再放已完成的散条目。
  两个区块共用同一种 `PLAN_CARD_CLASS` 卡片形状，带一个 `glyph + title` 的头部 —— Session
  （`CircleDot`），Done（`CircleCheck`，经由 `PlanCardSection`）—— 因此计划读起来是一叠一致的卡片。
  **标题层级（自上而下，不反转）：** 页面标题 `tr-heading-sm` → 卡片与分组任务标题 `tr-title-dialog`
  （14/600）→ 条目标题 `tr-title-section`（14/500）→ 元数据 `tr-text-metadata` —— 分组标题绝不比
  它所承载的条目更小。Now 区块的头部携带计划页面的**添加任务控件**（计划页面唯一的页内添加方式）：
  一个 `+ Task` 按钮（`plan-add-task`）切换一个内联的**自动增长 textarea**（`plan-add-input`）——
  纯 **Enter 即添加**，**Shift+Enter** 插入换行（像输入框一样多行），Esc 关闭 —— 它接到与栏的
  `TodoAddRow` 相同的 `useChatTodos.add` —— 一个散落的 **user** 条目加上给 agent 的提示 —— 因此两个
  入口保持同一套流程。条目保持一种**扫描优先的条目解剖**：条目标题是唯一全尺寸的文本
  （`tr-text-ui font-medium`），每个细节都降一级（`tr-text-metadata`，subtle/muted）—— 因此标题
  绝不混进正文里。标题会**换行**（`break-words`，绝不截断）—— 一个长标题完整呈现，不被裁剪。一个
  **done 条目不携带前置状态字形**（`hideStatusGlyph` —— 它的 section 已经说了 "done"；只有活动的
  review 或一个 `changes_requested` 警告才保留前置字形；该槽位放一个幽灵占位以保持标题对齐）。
  一个 **done 条目会塌缩成一个紧凑区块，凡是 agent 写了 `summary` 时就始终内联携带该预览**
  （`plan-item-meta` / `plan-item-summary-preview`）：第 1 行是一个前置 chevron（与变更集展开区的
  解剖一致；不可折叠的行用一个幽灵占位留出 chevron 的宽度，从而列表里的每个标题都对齐）+ 标题，
  且**review 槽位在它的右边缘**；第 2 行（当该条目有 `summary` 时）是摘要的第一行渲染为 Markdown 并
  加 `line-clamp-1`，因此扫一眼就能看出做了什么而无需点击；第 3 行（当存在 `verification` 和/或
  变更集时）是安静的元素条 —— 验证字形（`ShieldCheck` / `CircleAlert` 取自 `verificationStatus`，
  完整验证文本作为它的原生悬停 tooltip，因此鼠标一悬停就能读到确切检查项 —— 页内 tooltip 组件会
  捕获焦点并与该行的点击展开冲突）、`N files`，以及 —— 在 `sm` 以下隐藏，以便标题在手机上保住
  自己的宽度 —— 短 sha + `DiffStatBadge`。两个元素行都通过同一个幽灵 chevron 占位与标题对齐。元素
  信息住在它自己的一行（或多行）里，正是为了让标题行的右边缘空给 review 槽位 —— 悬停显现的动作绝不
  与标题、摘要预览或元素信息撞车。始终在线的预览 + 可悬停的验证，省掉了为了看交付了什么而展开每个
  done 条目的成本。**展开是一次点击，而不是悬停**（`plan-item-toggle` → `data-expanded`）：细节区块
  始终挂载但被 CSS 隐藏（`hidden` → `group-data-[expanded=true]:flex`），因此一次点击会持久保留它
  （这在没有悬停的**触摸**上也有效），而元素行让位给它（`group-data-[expanded=true]:hidden`）；
  chevron 以同样的方式旋转。没有 JS 悬停状态 —— 一个带 mouse/focus 处理器的静态 `<div>` 是一种
  a11y 异味，lint 正确地拒绝它。细节区块是一个缩进的左轨（`border-l`）区块，装着备注、agent 的
  `summary`（Markdown）、完整的 `VerificationBadge`（字形 + 验证内容作为 Markdown 渲染，因此多个
  检查项读作条目列表）、一条 changes_requested 的 `feedback` 备注、变更集，**以及 —— 当该条目累积了
  2 个以上提交（修复循环）时 —— 一条 REVISIONS 迷你时间线**（`plan-revisions`/`plan-revision`，取自
  `planView.itemRevisions`）：按顺序每个提交一行（`#n` + sha chip 路由到 Changes 面板 + sha 仍可解析
  时的 `DiffStatBadge`），最后一个标为*current*，而 review 的 `unreviewedShas` 差值中的任何 sha 标为
  *unreviewed*（`data-unreviewed`）—— 这是任何最终 diff 视图都讲不出的、agent 如何走到这里的诚实故事
  （提交 → review → 修复 → 提交）。任何携带细节的条目都可折叠 —— 包括一个**只有 `note` 的非 done
  条目**：备注是面向 agent 的工作细节，因此它留在展开区之后，默认的人类视图是标题 + 状态，绝不是
  agent 的内联备注。在细节内部，变更集仍是它自己的**可折叠**展开区 —— 一条摘要行（sha chip +
  `N files` + `DiffStatBadge`）切换该提交的 `GitFileChange[]` 行；chevron/摘要就是开关，而 sha chip
  仍是一个单独的按钮（路由到 Changes 面板，绝不切换）。展开后，文件行会在该条目的 `commit:{sha}`
  scope 下打开由注册表分派的 diff 标签页（`openDiffInTab`，preview 意图；路径列表回退则在分支 scope
  打开，没有计数因为它们会漂移），**以及条目行本身上的 review 判定**：该行的右边缘是一个 review
  槽位，按优先级顺序恰好渲染以下之一：不可点击的脉动 `Checking…` 状态（`plan-item-reviewing`，取自
  宿主推导的 `review.reviewing` —— review 以隐藏子代理运行，因此没有聊天可打开）、警告色的
  `Needs a fix · N` chip，或者对一个未落定的可审阅条目是 primary 填充的 `Check it` 按钮
  （`plan-start-review` —— 标准的**小号**动作按钮：`h-6`/`tr-text-action`/`control-primary-bg`，
  与 `SendReviewButton` 同尺寸，而不是一个超大的 `min-h-8` 区块）。两个**状态**读数始终可见（是
  状态，不是动作）；**`Check it` 动作在该行的悬停 / 键盘焦点时显现**，与 ProjectTree 的 kebab 完全
  一致：`[@media(hover:hover)]:opacity-0` + `[@media(hover:hover)]:group-hover:opacity-100` +
  `focus-visible:opacity-100` —— 因此一墙的 primary 按钮绝不会在桌面上铺满每个可审阅行，而在没有
  悬停的**触摸**设备上它保持可见，并且它绝不会像 `group-focus-within` 那样粘住。它是标题行上的一个
  **在流内**按钮（第 2 行的元素信息腾出了那个右边缘，因此标题只是为它收缩 —— 没有重叠，也没有空的
  保留槽位）。仍然是一个槽位，没有重复 —— 变更集展开行**不**携带任何 review 能力。
  `Check it` 触发 AGENT review（`todo.startReview` —— 一个隐藏的 review 子代理）并**停留在**计划
  页面上：该行的 `Checking…` 脉动和一个 toast 是仅有的信号，成功**与**失败都是如此 —— 该 review 没有
  自己的聊天，因此 toast 必须承载错误。判定通过 `review.changed` 广播落地（`useChatTodos` 据此重新
  取计划），而不是本会话的 `pi.event` —— 子代理的事件是隐藏的；一次 ack 之后的失败通过
  `review.failed` 广播落地（`useChatTodos` 把它作为错误 toast 抛出，按所属的 `sessionId` 过滤，并
  由 toast 正文在分栏视图之间去重）。
  **计划 review 的 STATE 始终从计划推导；只有 ACTIONS 才按宿主版本门控在
  `transport.supportsPlanReview`（v67）上。** `reviewables`/`unsettledReviewables`/`planReady` 无论
  宿主版本如何都来自 `TodoItem.review` —— 把它们门控成空会让 `planReady` 在一个未审阅的步骤上读成
  ship-ready。面对一个不提供 `todo.startReview`/`reviewAll` 的较旧宿主，`PlanPane` 只禁用那些变更
  性能力（逐行的 `Check it`、两个 `Check All` 触发件），因此一个独立发布的较新客户端绝不会*调用*一个
  宿主无法兑现的能力，同时仍反映宿主确实报告的 review 状态。
  行控件（`plan-item-toggle`、变更集开关、sha chip、review 槽位、`FileRow`）都带 `min-h-8` —— 密集的
  元数据行在触摸上仍然可点。`planView.changeSetCounts` 是唯一的计数/统计推导（路径 → 只计数；提交 →
  `changeSetStat`），由该行的元素条与展开行共享。**没有页内手动判定 UI** —— 以前的 `manually` 开关 +
  `ReviewActions` 对（Approve / Ask to fix）随 `PlanReview.tsx` 一起移除了；`todo.review` /
  `todo.requestFix` 线上协议方法与宿主处理器保留，因此一个手动覆盖表面可以不带协议工作就回归；
  agent 撰写的发现出现在 Review 面板中并带 `agent` 徽章（`review-comment-agent`），而一个 agent 已
  落定的卡片读作 `Reviewed · agent`；一个 **changes_requested** 判定会大声标记该条目：状态字形翻成
  警告色的 `CircleAlert`（`StatusIcon changesRequested`、`data-changes-requested` —— 栏行与计划页面
  一致），计划页面的标题行长出一个警告色的 **`Needs a fix · N`** chip
  （`plan-item-changes-requested`；N = `planView.itemOpenFindings`，审阅者未解决的评论，按 `origin`
  来源匹配（无来源的用路径连接回退）—— Review 标签页才是真相；该 chip 会 `requestToolView` Review
  标签页），而判定的 `feedback` 备注内联渲染（`plan-item-review-feedback`）；批准会落定该条目 ——
  计划页面在该行的 review 槽位、标题右侧显示一个 **`Checked` 标签**
  （`plan-item-verified`，`CircleCheck` + 文本，success 色调），并在该行上带 `data-reviewed`（栏
  保留带圈的 `StatusIcon reviewed` 字形）；`planView.reviewSettled` 是唯一的推导 —— 已批准且没有
  未审阅差值，因此一次新的修订会让该条目同时掉出标签与已审阅计数。**头部是一个标题 + 一个生命周期
  步骤条（STEPPER）以及一个 kebab 菜单**。该步骤条（`plan-progress`）渲染计划的交付漏斗 ——
  **Build（`d/t done`）→ Review（`r/k reviewed`，`plan-review-progress`，仅当计划有可审阅条目时）→
  PR（`plan-pr-stage`，`data-state`）** —— 每个阶段按其状态带一个字形：done（对勾）、active（计划
  当前所处的阶段）、pending（弱化）。PR 阶段读取与该按钮相同的 `useOpenBranchReview` 查询，并在已有
  一个打开时显示 `PR #N`；"merged" 不可知（该查询只看得见 OPEN 的 review），因此漏斗诚实地终止于
  PR-open。步骤条下方是**工作上下文行**（`plan-context`）：`baseBranch ← branch · N commits · +A −R`
  —— 箭头指向合并目标（base ← head，GitHub 的 PR 惯例：变更从工作区分支流入它的 base）。
  `N commits` 是 **`PlanCommitsMenu`**（`plan-commits-trigger`）—— 一个镜像 Changes scope 菜单提交
  列表的下拉：`git.listCommits`（急切加载，每当计划的提交计数变动时重新加载）是计数与列表两者的唯一
  来源，因此它们绝不背离 —— 并且，作为 `base..HEAD` 的枚举，它已经把已采纳的提交（没有步骤拥有的分支
  提交）与逐步骤提交并列覆盖；每一行（`plan-commits-item`、`data-sha`）通过逐步骤提交 chip 使用的
  同一个 `openChanges({ sha })` 在 Changes 面板中打开该提交的 diff。该 chip 在加载期间以及分支没有
  提交时自隐藏。总 diff 来自工作区记录的 `diffStats`；每一块在未知时隐藏。头部与摘要之间住着
  **NEXT-ACTION 横幅**（`plan-next-action`、`data-kind`）—— 报告里唯一的 "what now"，按紧迫度渲染
  **第一个**匹配的状态：`fix`（N 个步骤带 changes_requested → **Show step** 滚动到第一个被标记的
  条目并通过 `focusRequest` token 自动展开它 —— `{ id, tick }`，tick 每次点击递增、由目标
  `ItemBlock` 每 tick 消费一次，因此再次点击会重新展开一个被手动折叠的行，而一个陈旧请求之后无法
  重新打开它）→ `review`
  （N 个未落定的可审阅条目 → 一个内联的 **Review All** 按钮，与 kebab 项相同的 `todo.reviewAll`
  流程，且该项保留）→ `ship`（全部已完成 + 已审阅，没有打开的 PR → 一个内联的 **Open PR**，与头部
  按钮相同的 `pr.open` 流程）→ 当没有什么需要动作时隐藏。计划级的完成备注带一个 `Summary` 眉标，
  因此报告读起来是带标签的分节；当备注很长时它会钳到两行，而它的**展开/折叠开关住在卡片头部**
  （在可点击的 `plan-overall-summary-toggle` 头部上一个右对齐的 chevron，随 `open` 旋转）—— 而不是
  一个尾随按钮 —— 因此折叠永远不需要滚过已展开的正文。next-action 横幅、Summary 区块与
  Now-executing 区块共用同一种卡片形状（`PLAN_CARD_CLASS` —— 相同的 elevated 背景、边框、圆角与
  内边距），因此计划的顶部读起来是一叠一致的卡片。在条目的各 section 之后，页面渲染
  **`Committed outside the plan`**（`plan-adopted-commits`，仅当 `TodoPlan.adoptedCommits` 非空时
  —— 包括在一个本来为空的计划上）：那些宿主推导出的、没有条目拥有的 `base..HEAD` 提交（推导见
  [[submodule-server-todos]]），每个都用与计划步骤相同的 **`ItemBlock`** 渲染，因此它携带完全相同的
  变更集、Start-review 与修订能力 —— 它们与某个条目的提交一样可审阅。**仅限 Review 阶段：** 它们被
  *排除*在 build 的 `d/t done` 计数之外，也绝不门控 `ship`，但 `planView.reviewableItems` 包含它们，
  因此 Review 步骤条、`review` next-action 与 Review All 都覆盖它们。然后页面渲染
  **`Outside the plan`**（`plan-unattributed`，仅当 `TodoPlan.unattributed` 非空时 —— 包括在一个
  本来为空的计划上）：那些宿主推导出的、没有任何条目认领的未提交行（推导见
  [[submodule-server-todos]]），渲染为打开**未提交 scope** diff 的 `FileRow` —— 这个诚实区块让未
  计划的工作在 review map 中保持可见，而不是读成 "nothing else changed"；`chat/planMarkdown` 把它
  作为自己的一节导出。kebab 菜单（`plan-menu`，一个 `DropdownMenu`）装着 **Copy**（剪贴板）/
  **Save .md**（浏览器下载）—— 两者都通过 `chat/planMarkdown` 编译 —— 以及，当计划有可审阅条目时
  **Review All**（`plan-review-all`）：触发 `todo.reviewAll`，它会在计划的串行链上对所有*未落定*的
  可审阅条目逐个做 agent review（没有未落定项时禁用；一个 toast 报告启动了多少个，逐行的
  `Reviewing…` 脉动跟踪进度），外加 **Open draft PR**（`plan-open-draft-pr`，一旦已有 PR 就隐藏）。
  **头部还拥有计划的终点线 —— Open PR**（`plan-open-pr`，task-open-pr）：一个确定性的宿主侧流程
  （push + `gh`，**绝不**是一个 agent 提示词），它**仅在首次创建时**（`openReview` 不存在）经过
  **组合对话框**（`PrComposeDialog.tsx`、`pr-compose-dialog`）：点击会取 `pr.preview` 并打开可编辑的
  Title（`pr-compose-title`）+ Description（`pr-compose-body`，从计划预填）字段；只有提交
  （`pr-compose-submit`，标签跟随动作 —— Open PR / Open draft PR）会用编辑过的 `title`/`body` 运行
  `pr.open`。该对话框在成功时关闭，在一般性失败时保持打开（编辑内容在 toast 之后仍在），并在
  `PUSH_AUTH_FAILED` 时移交给 `PrSetupDialog` —— 后者的 Try again 会重新提交**最后一次**编辑的
  title/body（保存在一个 ref 中），绝不是一个重渲染的草稿。当计划*就绪*（全部已完成 + 所有 review
  已落定）时头部按钮是 primary 填充，否则安静；一旦有打开的 PR 存在（在 v78 上，宿主保留的快照拥有
  身份/状态，一个匹配的 `workspace.openReview` 应答覆盖实时细节；较旧的宿主只用该查询，全都经由
  panels 拥有的 `resolveBranchReview`，因此 shell 与 Plan 无法分歧）标签翻成
  **Push updates**
  且该按钮**完全绕过组合对话框** —— 按下它（或 next-action 的 `push` 臂）会直接调用 `pr.open`，
  不带 `title`/`body`，因此宿主推送到**同一个**分支/PR，并静默地从计划刷新它的正文
  （`renderPrBody`），同时不动 PR 标题（没有 `titleEdited`）。每次推送都重新编辑一次 PR 描述读起来像
  "set up the PR again"；该模态只是创建入口。当查询报告 **`unpushedCommits`** 时标签会附上计数
  （`Push updates (N)`），按钮变为 primary 填充，而 next-action 横幅长出一个 `push` 臂
  （"N new commits aren't in PR #N yet" + Push updates），因此 PR 之后的新工作绝不会静默地留在本地
  —— 一次成功的推送会重新读取权威状态，并在远端跟踪分支追上时把两者都清除。当查询改为报告
  **`behindCommits`**（origin 有 HEAD 缺少的提交 —— 分支**分叉**了，因此一次普通推送是非快进的、
  会失败）时，一个独立的 **diverged** 状态优先于 push 臂，并把它当作**同步冲突，而不是强推提示**：
  头部按钮读作 **Branch diverged**（`data-diverged`），next-action 横幅
  （`data-kind="diverged"`）说明 origin 有该检出缺少的提交、必须先整合 —— 普通推送落不下去，而强推
  会**丢掉远端的提交**。两者都复制安全的 `git pull --rebase origin <branch>`
  （`plan-integrate-command`），**不是**强制命令 —— 它点出测量分叉所用的确切 ref，而不是碰巧配置的
  任何 upstream。只有当分支在每个受支持的 shell（POSIX、PowerShell、cmd：
  `[A-Za-z0-9][A-Za-z0-9._/-]*`）里都是 shell 惰性的时它才会被插值；任何其他名字得到一条纯文本
  说明，没有可复制的命令，因为没有任何一种引号方式在这些 shell 之间都安全。这是刻意的：`behind > 0`
  只证明分叉，**并不**证明这个检出改写了历史（另一个检出可能只是推送过），而宿主自己的新 fetch 已经
  移动了 `--force-with-lease` 基线 —— 因此从分叉推断强推可能静默删除另一个检出的工作。一次真正的
  历史改写仍是应用既不发起、也不给出已加载命令的显式终端动作。
  `behind` 只在一次新的查询上被信任（宿主那时会 fetch origin；见 [[submodule-server-git]]）；该字段
  是增量式且向后兼容的（较旧的宿主省略它 → 沿用先前的行为）。分叉逻辑在 `countPushDivergence` 上有
  单元覆盖；分叉的 UI 状态未由浏览器 E2E 测试装置覆盖，因为它无法捏造一个被检测到的打开 PR（真实的
  `gh` 查询）。还有一个 **`PR #N` chip**（`plan-pr-chip`）在 URL 已知时向外链接 —— 这在如今是每次
  读取，因为 `workspace.openReview` 携带 review 自己的 `url`
  （[[submodule-server-branch-review]]）；带键状态优先采用它，并回退到同一 review 早前应答里带出的
  url，因此一次不报告 url 的刷新绝不会让 chip 丢掉链接。该 hook 拥有唯一的带键 PR 状态：
  `noteOpenReview(review, url?)` 在 `pr.open` 之后立刻播种它（页面上没有单独的影子状态），并取代
  任何为同一键已在途的读取，因此一个变更前的应答无法覆盖变更结果。该带键状态与请求世代由每个已挂载
  的 hook 使用方共享，使计划与外壳 scope 标签停在同一份变更结果上。一个陈旧的变更闭包在该 hook 已经
  移到另一个分支之后无法写穿。焦点重新取数会覆盖状态。工作区激活显式选择加入宿主 60 秒的已落定应答
  缓存，用 `allowCached: true`，而焦点触发的省略则为较旧客户端保留线上协议原本的强制新鲜行为，因此
  一个在 GitHub 上关闭/合并的 PR 会在那次重新取数时从 chip、标签与步骤条中掉出，而不是粘到重挂载为止。
  在断开连接期间收到的焦点会锁存那个新鲜意图，并在重连时花掉它，而不是回退到一次有资格用缓存的激活
  读取。工作区的 `fsChanged` tick 用 `allowCached: true` 重新读取（`reload`）：宿主在 `.git` 元数据
  提示时丢弃它的缓存应答，因此一个从终端打开或推送的 PR 仍会浮现，而一次新鲜读取会 `git fetch`、
  写 `.git`、再次提示、然后循环。在 review 编号匹配期间 URL 会跨重新取数保留。一个 `compare` 结果会
  打开预填的 GitHub compare 页面（`window.open`）；每种结果都 toast，未提交文件得到单独的 info toast。
  `pr.open` 请求以 **180s 超时**运行（push + gh 变更可能超出 transport 的 60s 默认值），而头部按钮
  在任何 PR 工作在进行期间都戴一个 spinner —— **Pushing…** 标签只在真正提交期间出现（一次预览取数
  不是推送，它的失败 toast "Couldn't prepare the PR"，绝不是 "Open PR failed"）。未提交文件的 info
  toast 在结果分支之前触发一次。每次成功提交都会在播种 `pr.open` 返回的任何 review 之后，启动一次
  全新的共享 open-review 读取。它绝不把变更载荷当作最终的未推送计数：推送后的读取决定该计数是清零了，
  还是更新的本地提交已经让它再次非零。组合提交还会报告标题是否被触碰（`titleEdited`），因此宿主绝不
  用重新生成的预填去改写 GitHub 侧的一次改名。
  **点出一个可修复配置缺口的失败会打开 `PrSetupDialog`（`PrSetupDialog.tsx`、
  `pr-setup-dialog`）而不是 toast**：一个 `PUSH_AUTH_FAILED` 拒绝（通过 transport 的 `wsErrorCode`
  匹配）说明宿主在没有终端的情况下推送，并显示 git 的 stderr（`pr-setup-detail`）外加可复制的修复
  命令（SSH 用 `ssh-add --apple-use-keychain …`，HTTPS 用 `gh auth login`）；一个携带 `ghProblem`
  的 `compare` 结果说明缺失/未认证的 GitHub CLI，给出安装/登录命令，并提供 compare 页面作为对话框内
  链接（`pr-setup-compare` —— 一个真实锚点，因此没有弹窗拦截风险）而不是盲目的 `window.open`。两个
  变体都保留一个 **Try again**（`pr-setup-retry`），它会重跑同一个流程 —— 始终用**最后一次**编辑的
  title/body（`lastPrSubmit` ref，每次提交时设置，只在流程完全成功、用户显式取消组合对话框，或者
  他们接受 compare 页面移交（客户端无法观测的外部完成）时清除 —— 一个 `ghProblem` 结果否则会保留它，
  因此 gh 对话框的 Try again 确实会重新提交；一次失败之后重新打开 Open PR 会复用那些编辑（包括
  已编辑标题的基线，因此重新打开的草稿不会丢掉它的 `titleEdited` 标志）而不是重新取一个重新生成的
  草稿）；命令行通过 `copyText`（`pr-setup-copy`）复制，并携带一个 **Run**（`pr-setup-run`），它会
  关闭对话框并通过 store 的 `addTerminal(workspaceId, initialCommand)` 在一个新的工作区终端里执行
  该命令 —— 该 pty 是一个真实的交互式 shell，因此口令/登录提示就在那里回答，而不用让用户去找一个
  外部终端。命令集是**感知宿主平台的**（welcome 的 `hostPlatform`，在接收时校验，并在每次 welcome
  时**重置**，因此切换宿主不会留下陈旧平台；**没有 darwin 回退** —— 一个 null/未知平台得到通用命令：
  普通 `ssh-add`、不猜包管理器、一条 cli.github.com 安装提示）：macOS 上是
  `ssh-add --apple-use-keychain` / `brew`，Linux 上是普通 `ssh-add` + 发行版提示，Windows 上是
  `$env:USERPROFILE` + winget —— 这些命令运行在**宿主**上，因此浏览器自己的平台从不被咨询。一条匹配
  `Host key verification failed` 的 push-auth 详情会增加一行批准主机密钥（`ssh -T git@github.com`
  交互式运行）—— ssh-add/gh 的补救并不能修 known_hosts。一个*不带* `ghProblem` 的 `compare`（离线
  接缝、瞬时的 gh 失败）保留 window.open + toast 路径。这个对话框在服务端有单元/e2e 钉住
  （`isPushAuthFailure`、`ghSetupProblem`）；浏览器侧的臂需要一个真正损坏的 push / 缺失的 gh，因此
  它们保持由约定约束。
  那个 **`Summary` 卡片**（`plan-overall-summary`）**只**显示 agent 的计划级备注 —— 当每一步都完成时
  通过 `planCompletionSummary` 给出新鲜的，或在计划被重做期间通过 `planStaleSummary` 给出陈旧备注。
  它**不携带任何步骤/文件/review 事实**（那些住在头部步骤条 + 上下文行里，因此在这里重复只是噪音），
  并且**在没有正文时被完全省略**（一个已完成但 agent 没写备注的计划不渲染空卡片）。agent 的备注仍会
  通过 `planCompletionSummary` 进入 Copy / Save-.md 导出。**没有页内的 "Review mode"** —— 发现住在
  右侧面板的 **Review** 标签页里；当审阅 agent 有未解决的评论时
  （`selectAgentReviewCommentCount` —— open、`author: "agent"`），头部显示一个 **`N comments`** chip
  （`plan-review-comments`），它 `requestToolView(ws, "review")` 以聚焦该标签页。一旦某个条目在一次
  完成之后重新打开，Summary 备注会通过 `planStaleSummary` 保持可见，用一个 `Updating…` 徽章
  （`plan-summary-stale`）标为陈旧而不是消失，直到 agent 在下一次完成时重写它 —— 导出仍由
  `planCompletionSummary` 门控。`FileRow`（`planFileRow.tsx`，它自成模块，以便计划各表面共享同一行
  而不产生循环）是共享的变更集行。它按构造就是实时的，通过和 TODO 栏相同的 `useChatTodos` hook 读取
  （逐挂载取数 + `pi.event` 重新取数），因此它无法显示陈旧快照。
  `TerminalWorkbench` 为每个语义终端身份拥有一个按可见性门控的终端主体，以及那个宿主原子的关闭流程。
  一次忙碌关闭在确认与强制重试之间始终是同一个相关的请求；对话框自动关闭无法释放那个请求，权威的目录
  移除会关闭陈旧的确认，而一次被拒绝的强制会用错误恰好清除那个请求，使之后的一次关闭可以干净地开始。
  对一个聊天的 workbench 关闭命令路由到 `store.closeChatToHistory`（让会话保持存活）并显示一个
  **chat-history** 下拉（最近关闭的 + 仅磁盘上的聊天，仅当非空时显示）；每一行有一个一键垃圾桶动作
  （`session.delete` → 幂等的 `store.deleteChat`，没有确认）；`session.deleted` 广播在每个已连接的
  客户端里驱动同样的折叠。在工作区激活与每次重连时，`session.list` 先核对读取开始时捕获的客户端成员
  快照（运行时/缓存身份，加上已放置的聊天/TODO 文档引用），因此一个如今已不在权威结果中的基线会话会
  走正常的墓碑与本地放置清理，而一个在读取期间创建的聊天会存活。由这个表面的本地工作区视图引用的聊天
  通过 `session.getMessages` → `messagesToRuntime` → `store.hydrateSession` 注水。其余每个会话都进入
  本地历史，而不打开或选中任何标签页：另一个前端创建或使用一个聊天是领域活动，不是一条放置指令。
  一次失败的对话记录读取会抛出一个错误 toast，并让那条摘要在历史里可重试；一次失败的 `session.list`
  同样抛出错误，而不是呈现一个无从解释的空工作区。一旦协调被取消、断开连接或归档，两个 toast 都会
  静默。实时注水刻意不携带当前磁盘的技能基线；只有仅磁盘附件才收到它捕获的 `syncedTick`。
  `session.deleted` 在每个客户端里驱动同样的幂等运行时/历史/本地放置折叠；不存在当前布局推送。重新
  打开一个历史行会把它的既有会话身份加到从那个 Group Header 捕获的请求时中央目的地（包括一个空分组）；
  被拒绝的读取会让该行留在历史中并抛出错误 toast。
  workbench 外壳集成还会解析历史搜索的 **`chatLocationRequest`** 深链（见 `store/SPEC.md`）：一旦它
  的工作区处于活动状态，它就聚焦一个已打开的标签页、`reopenChat` 一个活着但已关闭的，或者取出 +
  注水一个仅磁盘上的 —— 即上文中重新打开流程的两个情形，外加针对已打开标签页的第三个情形 —— 让
  `ChatView` 消费该请求以完成滚动 + 闪烁（`chat/SPEC.md` 的 Jump-to-message 条目）。
  **`Toaster`** 是外壳挂载一次的全应用 toast 宿主：它订阅 `store.toasts` 并通过
  `@thinkrail/ui/toast` 原语渲染每一个，让 Radix 拥有自动超时 + 滑动/悬停暂停，并把每次关闭都路由回
  `store.dismissToast`（因此 store 保持为唯一事实来源）。错误持续到被关闭为止；success/info 会超时。
  这是**集成件** —— 原语保持纯呈现。
- **Public surface（公开接口）：** 与布局无关的功能渲染器（`ProjectTree`、`WelcomePanel`、
  文件/diff/文档/聊天面板、单例侧工具、终端主体、Settings，以及 `Toaster`），**逐文件** import，因此
  Monaco/shiki/xterm 保持惰性。标签条、分组头部、侧堆栈与中央拓扑不是面板表面；外壳布局模块包裹这些
  渲染器。
- **允许的依赖：** `store`、`transport`、`components`（`SkeletonRows` —— 每个异步面板的待定状态都渲染
  内容形状的骨架行，绝不是一个光秃秃的 "Loading…" 行）、`@thinkrail/ui/*`（包括对话框用的
  `popover`/`command`/`textarea`）、`chat`（`ModelEffortPicker` 加上供它取数的
  `useModelCatalog`/`useModelPreferences` hooks，由 `NewWorkspaceDialog` 复用；
  `ModelSelector`/`ThinkingSelector`，仍由 `ModelsSettings` 挂载；`modelPicker` 的
  `AUTH_KIND_LABEL`，即 `ProvidersSettings` 与 picker 共享的唯一连接种类词汇表，以及它的
  `formatContext` 与 `ProviderGlyph`，由 `VisibleModelsSettings` 的行复用；`Markdown`，由
  `MarkdownPreview` 复用；`TemplateEditorDialog`，由 `TemplatesSettings` 复用）、`auth`
  （`LoginDialog`，由 `ProvidersSettings` 与 `McpSettings` 挂载）、`resources`、`lib`、`themes`
  （目录 + 通用应用契约）、`contracts`；`@remixicon/react`；以及每个惰性面板自己拥有的重型库
  （`monaco-editor`、`shiki`、`@xterm/*`），通过 `import()` 加载。
- **绝不触碰：** `server`/`shared`/`pi`；import `shell`；横跨无关面板去够。

## 必须做对的事

- **workbench 的标签页外框不是功能面板。** 外壳布局模块给每个分组提供同一套选中标签页语法：
  整个可选标签页背后是 `control-bg-selected`、`text-default`，以及底边上一条**横跨标签页全宽的 2px
  `primary` 标记**（`after:inset-x-0`，与选中填充齐平 —— 没有水平内缩）。非活动标签页保持透明配
  弱化文本；悬停使用 `control-bg-hovered`；键盘焦点保留它独立的焦点环。该标记是一个形状提示，而不
  仅仅是文本颜色的变化，因此当高对比度主题让相邻表面变得相同时选中依然明显。这套语法还提供有界的
  单行溢出，以及完整的 WAI-ARIA tabs 模式（漫游焦点与带标签的 tabpanel）。面板渲染器提供
  标题/图标/状态/关闭元数据并填充选中的 tabpanel；它们绝不读取分组顺序，也不绘制自己的停靠条。
  共享的 `ToggleSegment`（List|Tree、Split|Inline，以及已解析出的资源候选项）为其活动段借用同样的
  `control-bg-selected` 填充 + `text-default`（没有底部标记 —— 它是一个纤细的开关，不是标签页），
  因此 "selected" 在各处读起来一致，且绝不派生出一个平行的表面 token。
- **文件与 diff 面板只做分派；它们不分类格式。** 每一个描述宿主元数据、为其意图与手机类别解析注册表、
  惰性挂载选中的候选项，并把 `rendererId` 加上不透明的视图状态留在标签页上。惰性实现的身份包含
  renderer id 与手机类别，因此跨越断点会换掉代码实现并丢弃不兼容的状态。由滚动支撑的视图状态走唯一的
  `useScrollViewState` hook：偏移量在滚动器脱离时保存，在滚动器挂上时重新应用。一个渲染器只能在挂载
  之后填充它的滚动器 —— Pierre 各表面在它们的共享 worker 池初始化之前什么都不渲染 —— 因此一个滚动器
  还装不下的恢复会保持待定，直到它的内容长到装得下或用户滚动，而如果标签页先离开，被保存的就是那个
  待定的偏移量。没有这个保持，切回一个源 diff 的标签页会落在顶部，然后把 0 持久化下来。两个或更多
  候选项变成一个有序开关，其 id 就是测试钩子。那些选中渲染器无法为面板的视图或 diff 意图放置其选择器
  的线程，仍会留在一个未放置条里可见；它的动作会切到第一个为该意图声明匹配锚点几何的候选项。内置
  注册是 workbench 挂载时的副作用，而渲染器实现的 import 保持惰性。
- 单例侧工具渲染器是 **Projects | Specs | Files | Changes | Review**。它们当前的位置与本地选择由外壳
  提供；Review 把它的 store 推导出的待定草稿计数作为标签页元数据暴露。一个渲染器在其单例移到对侧时
  仍是同一个。
- **`ReviewPanel`** 是 review 侧边栏（模型见 [[submodule-server-reviews]]）—— **一个界面，按文件
  的手风琴**：每行是一个路径 + 草稿/已发送/已解决计数，带一个折叠 chevron；**点击一行会就地展开它的
  评论，并且打开该文件的标签页**（折叠是第二次点击，且不导航到任何地方 —— 该行是唯一的开关；另一个
  行动作在下面）。一个所有评论**都已**解决的文件**仍留在列表里**，直到用户显式地完成它：该行自己长出
  一个 **Done 对勾字形**（在计数之后内联 —— 折叠与否都可见；下方一条只放一个字形的小条读作游离的空白
  区域），它调用 `review.fileDone`，并且只有它才会移除该文件（`Review.doneFiles`；一条新评论会重新
  打开它）。一个展开的 section 按 TODO 计划那一模一样的 section 流程显示该文件的评论，由**共享的**计划
  原子构建（`chat/planKit`：`SectionLabel` + `PlanStatusIcon` —— `TodoList` 渲染所用的同一批零件）。
  **审阅 agent 的评论与用户的评论走同一个生命周期** —— 唯一的区别是一个作者徽章
  （`review-comment-agent`：一个 `Bot` + "ThinkRail" chip）：它们共享同样的 section、字形、导航、
  逐行发送/删除/解决，以及草稿计数（`fileDraftIds`/`allDraftIds` 与宿主隐式的 `sendableComments`
  都是作者无关的；判定的修复包仍会扫走用户尚未发送的任何 agent 草稿）。各 section 按状态 —— 先
  **Drafts**（用户可操作、未发送的备注；行动号召位于该文件的 `Send review (N)` 条之下，而不是埋在
  已发送行下面）→ **In progress**（已发送的 —— 聊天接手了它们；字形**感知速览**，与 TODO 的进行中
  条目完全一样，经由 `sessionGlance` + `TodoList.glanceIcon`：working 时是点 / 会话在等待一个
  `ask_user_question` 时是 **(?)** / 它在等用户而空闲时是暂停 —— 没有已加载的运行时读作等待中）→
  **Resolved**（弱化的 Done 样式：primary 对勾 + 删除线的提示文本；聊天动作在悬停时显现 —— resolved
  是终态，不可重开）。没有逐行状态词 —— 由 section 命名状态；行只携带字形、被钳制的文本，以及 `L3`
  ref（外加当锚点消亡时的一个 `outdated` 眉标，它的原生 tooltip —— `reviewModel.outdatedReason`，
  与线程卡片的标签共享 —— 说明什么无法被重新找到，依据锚点自己的选择器：未能再次匹配的文本、一个
  改变了的字节位置，或者一个整个消失的文件。线上协议不携带原因，只有状态，因此文本与字节两种措辞都
  承认 "or the file is gone"，而不是声称客户端并不具备的精确度；规则本身是
  [[submodule-server-reviews]] 的重新锚定第 4 步）。本地选中的中央资源若是一个被审阅的文件，它所在的
  section 会**自动展开**，而一次展开绝不自动折叠（折叠只是用户的手势 —— 一次发送打开它的聊天标签页
  绝不能折叠用户正在读的那个 section）；**Drafts 行是编号的**（1.、2.、…）而不是戴待定字形 —— 并且
  workbench 的工具路由在这样的标签页被**激活**时会**显现 Review 工具**（以本地选中资源的变化为键，
  因此在一个已选中的资源里保存草稿绝不会猛然吸引注意力；`selectActiveReviewedPath` 是共享的推导）。
  每一行评论都是一个**导航手势**，对所有作者都是同一条规则：一个有链接聊天的行（`comment.sessionId`）
  打开**讨论**（它的聊天标签页）；一个没有链接的行 —— 每个草稿，因为草稿从不被发送 —— 打开该文件并
  **聚焦到那条评论**。该文件始终只隔一个悬停动作（`FileText` 字形运行文件+聚焦导航；聊天字形已从
  打开的行上移除）。文件聚焦经由 store 的 `reviewFocusRequest` 生效，由面板恰好消费一次：Monaco 显现
  锚点行 —— 包括在一次全新挂载时，经由 `onMount` —— 预览把流内卡片滚动进视野）。**这里没有编辑** ——
  文件内卡片才是编辑器；该行的动作图标（它们自己的图层，绝不触发导航）是逐行的 **Send**
  （→ `review.sendComment`，通过与 New Workspace 相同的 `openChatSession` 尾巴打开创建出的聊天标签
  页）
  **Delete for DRAFT 行**（ConfirmPopover → `review.commentDelete` —— 一条未发送的备注是用户自己的草稿
  纸）、已发送行的 **Open chat**（复用历史重开流程），以及手动的 Resolve 覆盖
  （`review.commentUpdate`）。**一旦发送，一条评论就是一条记录 —— 不删除、不回滚、不重开**，且
  resolved 是终态（由服务端强制）：对一个变更的反对意见用一条新评论说，而一条新备注就是一条新评论。
  **一个普通列表 —— 没有页脚**：批量发送住在面板工具栏（`SendReviewButton`）以及面板本身 —— 每个展开
  section 的条携带相同的逐文件 `Send review (N)`（`testid: review-panel-send`；`path: null` 覆盖无
  锚点的整个变更集桶），面板头部则是一个跨每个文件的 **`Send all (N)`**（`SendAllReviewsButton`，
  `testid: review-send-all`，作用于 `allDraftIds`；不传 id —— 宿主的 "all drafts" 就是这一批，因此
  计数不会与并发的编辑竞争）。**头部（及其 Clear）跟随 review 的 RECORDS，而不是它的文件行**：只要
  review 持有**任何**评论它就显示，因此完成每个被审阅的文件 —— 这会让手风琴变空，而 resolved/已发送的
  记录仍在 —— 仍留下一条关闭该 review 的路径（早先那个由文件门控的头部让一个完全完成却无处 Clear 的
  review 搁浅）。`Send all` 仍由草稿门控；**Clear**（`testid: review-clear`）是一个破坏性的
  `ConfirmPopover`，调用服务端原子的 `review.close` Clear；宿主归档非草稿记录、丢弃草稿、替换活动
  review，并发布全新的空快照，因此发起方与兄弟客户端都通过 `review.changed` 收敛。空正文区分两种空：
  **记录仍在但每个文件都已完成**（"…finished — Clear to archive…"）对一个**真正空**的 review
  （"No review comments yet…"）。没有归档浏览器。review 级（整体备注）的输入框目前被移除了（`review`
  评论种类仍留在模型里，但无 UI）。`review.get` 的注水读取**由 workbench 工具集成拥有**，位于条件挂载
  的 Review 正文之外（`useWorkspaceReview`，即 `useWorkspaceSpecs` 的模式 —— 该读取也会在服务端重新
  锚定）：即使面板正文未挂载，标签页标志与 Review 徽章也需要那份快照。每个客户端都收敛于折进 store 的
  `review.changed` 推送；这里没有任何东西乐观变更。评论撰写是**由选择触发的，没有模式开关**。渲染器
  实现投影 `SurfaceReview` 锚点，且绝不重写它们。共享的 React `ReviewComposer` 拥有 textarea、
  Save draft / Send now / Cancel 动作、忙碌状态、焦点与光标位置；`PreviewCommenting`、Pierre
  `FileDiff` 与 Pierre `File` 把同一个组件放进它们自己的几何中。一个已保存的草稿携带原始文件的
  `lineRange`；一个无法定位的渲染预览选区产生空的选择器集合，因此产生一条整文件评论。`useFileReview`
  把草稿与路径、scope 以及该表面的**侧**组合起来（宿主填充 `contentHash` 与容忍漂移的 `textQuote`）；
  Send now 还会触发 `review.sendComment` 并打开创建出的聊天。

  **Pierre 拥有每个 diff 和每个手机类别的代码文件。** 带 `lineRange` 的线程在该范围末行变成
  `lineAnnotations`（`base` → `deletions`，`worktree` → `additions`）并渲染 `ReviewThreadCard`；
  注解元数据与数组在无关的 review 推送之间保持 comment-id 身份。因为 Pierre 1.5.1 按数组下标给 React
  注解包装器做键，每次挂载都保持只追加的 comment-id 槽位与墓碑，并为输入框保留那个始终存在的第一个
  槽位。行号选择与装订线工具会在那一侧打开一个输入框。一个跨越两侧空间的选区（统一视图，从删除行拖进
  新增行）**不打开输入框**：输入框槽位显示 `review-selection-blocked` —— "a comment anchors to one side
  of the diff" —— 同时用户自己的选区仍然高亮，并有一个 Dismiss，因为一个落在用户没有选择的侧上的锚点
  会是一次静默的重新指向，而两个侧空间之间的坐标转换并不存在。焦点请求会在 `onFocusHandled` 之前把
  匹配的注解滚动进视野；一个没有 `lineRange` 的线程，或端点被隐藏在 Pierre 初始折叠的未变更上下文里
  的线程，绝不进入 Pierre，而是留在面板级的未放置条里，由它消费针对它的任何焦点请求。Pierre `File`
  在手机上应用同样的注解、选择、焦点与未放置规则，并把结束行存在于当前文本中的那些线程准确地报告为已
  放置（`filePlacedThreadIds`）—— Pierre 只为存在的行发出注解行，因此一个指向已被缩短的文件之外的
  线程否则会同时从表面与未放置条中消失。review 只挂在修改侧是工作树的地方（`branch`、`uncommitted`
  或 `pinned`）；提交 scope 是历史的，既不接受 review 撰写也不接受 hunk 变更。一个 diff 的删除列与
  新增列保持为两个权威锚点空间：原始侧选区创建 `side: "base"`，修改侧选区创建 `side: "worktree"`，
  两者都不会被重新映射到另一侧的行号。

  **Pierre diff 文本选区崩溃（WebKit）—— 一个本地内置（vendored）的 `@pierre/diffs` 补丁。** 在
  review diff 中拖选代码会让 WebKit 的 web-content 进程崩溃（Electrobun 桌面："A problem repeatedly
  occurred"；`WebCore::EventHandler::handleMouseDraggedEvent` 中的 `EXC_BREAKPOINT`）。Pierre 的
  `InteractionManager` 会在悬停行变化时把装订线工具移进悬停行的号码单元，并在 `pointerleave` 时移除
  它；在我们的 `renderGutterUtility` 下那个节点持有一个 `<slot>`。WebKit 在每次 slot 插入或移除时重建
  整个 shadow host 的渲染器，而在文本拖拽的指针处理器里同步这么做会让它崩溃：一个不含 Pierre 的页面
  就能复现该签名，而一个被移动的普通元素、同一个 slot 移动推迟到一帧，或一个约 100 行以下的 diff 都
  不会。不变量：Pierre 表面绝不从指针或鼠标处理器同步地插入、移除或移动一个 `<slot>`。
  `patches/@pierre%2Fdiffs@1.5.1.patch`（根 `patchedDependencies`）携带那个开源的上游提案
  pierrecomputer/pierre#1185（issue pierrecomputer/pierre#1184）外加它所缺的两处补充：在鼠标键按住
  且处于 Pierre 自己的选区会话之外时放置是空操作 —— 由 `pointermove` 与 `pointerleave` 武装，因此
  一次第一次移动就已离开 diff 的拖拽无法移除该 slot —— 以及第一次无按键移动会重新放置该工具，即使
  在拖拽结束的那一行上。Bun 只把补丁应用到它确切的版本，并静默跳过一个不匹配的版本（安装成功而
  lockfile 丢掉该条目），因此 review 的 e2e 测试 "a text-selection drag leaves the comment button on
  the line it started from" 与 "… that leaves the diff on its first move keeps the comment button"
  就是那道守卫：只要被补丁的行为缺失，它们在 Chromium 上就会失败，包括一个只携带 #1185 的 Pierre 发布
  版本。一次 Pierre 升级会让它们保持绿色，而一旦某个发布版本包含该修复，就删掉补丁文件及其
  `patchedDependencies` 条目。同一个补丁还修复了 `FileDiff.trimColumnRows`：当一个虚拟化窗口的末端
  收缩时，1.5.1 会把跟在最后一个保留行之后的注解行与无换行行连同被丢弃的行一起裁掉，而之后追加的块
  绝不重新发出它们，因此那一行上的输入框、线程或工具栏会消失，直到一次完整渲染（在输入框的焦点滚动
  移动了窗口时可见）。如今跟在一个保留行之后的尾行会留下；而位于其行之前的行分隔符仍会离开。守卫是
  `e2e/changes-review-drafts.spec.ts` 中的 "Changes keeps unsaved composer selection…"。Turbo 对
  `patches/**` 做哈希，因此一个被编辑的补丁会重建 web bundle，而不是从缓存恢复一个陈旧的。测试的
  对照项（该工具落在起始行；选区持有被拖拽的文本）让一个被清空的布局无法蒙混过关 —— 早先用
  `display:grid` 二分只在那种方式下"修好"了崩溃。崩溃本身只在 WebKit 中复现（一个临时的 Playwright
  `webkit` 项目）。跟踪于 #683。

  **Monaco 只渲染桌面文件。** `reviewWidgets.ts` 为那一个表面保留它的内容部件选区能力、上下文菜单
  动作、装饰，以及视图区核对。它暴露以 comment id 为键的稳定区节点；`MonacoReviewZones` 把共享的
  React `ReviewThreadCard` 与 `ReviewComposer` portal 进这些节点，而 `ResizeObserver` 把它们测得的
  高度回喂给 Monaco。因此一次无关的推送会保住同一个带键的草稿 textarea，包括共享卡片的 Escape 取消与
  快捷键保存行为。没有 `lineRange` 的线程留在同一个未放置条里。`monacoMenuIcons.ts` 装饰 Monaco 独立
  的文件编辑器菜单；不再残留任何 diff 编辑器或 diff 侧分支。**渲染预览**：`MarkdownPreview` 在每个
  插入点的锚点处切开已剥离的文档，并把它拼接进 markdown 段之间（`splicedSegments` —— inline-edit 的切分
  模式；一次切分**绝不切开一个多行构造**：一个位于围栏代码块或 GFM 表格内部的锚点会贴到该构造的最后
  一行（`sourceLines` 的 `indivisibleSpans` + `snapSplitLine`），因此卡片落在它所评论的区块*之后*，
  而两半都保持为完整文档 —— 半个围栏不是文档，它未闭合的开头会把它下面整个文件剩余部分都渲染成代码，
  只要那条评论还活着；列表与引用块分成两个格式良好的构造，这正是夹在两个条目之间的卡片应有的样子；
  一个无法定位的行追加在文档之后，绝不丢失）—— 这些插入项既是已保存的卡片**也是**打开的输入框
  （位于选中区块之下的流内，通过 `PreviewCommenting` 的子项即函数的契约；只有那个瞬时图标保持浮动）。
  **与 Monaco 的区域对等**：每个未解决评论之下的区块 —— 以及输入框目标在打开期间的区块 —— 都戴
  `.review-region`（`markReviewRegions` —— 只有一条细的**左轨**，即 Monaco 装饰的装订线轨那一半；
  **绝不是背景涂色**：整块涂色读起来像坏掉的文本选区 —— 在一个条目里选中三个词会把整个条目刷满；
  只作用于最叶子层的**区块**元素）。预览锚定是**精确的**：`sourceLines.ts`（从 inline-edit 采纳而来）
  用原始文件坐标里的 remark 源码位置给元素打戳（`sourceLineRehype` 的元组形式取每个段的偏移 —— 段从
  第 1 行重新解析；经由 `chat/Markdown` 的 `rehypePlugins` prop），而输入框通过戳记解析选区（一个仅
  边界的结束区块会被它前一个带戳的兄弟替换），对未打戳的内容回退到 `previewAnchor` 的短语搜索。侧边栏
  仍是全细节表面。**review 存在感是自宣告且逐文件的**：一个路径仍在 review 中的中央资源标签页
  （文件或 diff）戴一个 `Review` 标志，它有**两种状态**（`ReviewTabFlag`，作用于唯一的 `reviewFlags`
  推导）—— 当该文件持有**未发送草稿**时是强调色（`tr-text-eyebrow text-primary`），一旦只剩**已发送**
  的评论就弱化（`text-text-subtle`）；resolved/dismissed 则完全去掉它。两种状态，而不是有或无，因为
  *"in review"* 与 *"there is something to send"* 是不同的两件事，而 review 词汇表的其余部分早已把
  草稿**或**已发送都算作 in review（`fileSummaries`、`selectActiveReviewedPath`、`fileThreads`）——
  一个只看草稿的标志会让聊天正积极处理的文件在标签条里看起来与从未审阅过的文件一模一样，而侧栏却坚称
  它在 review 中。**`Send review (N)` 严格只算草稿且是逐文件的** —— 文件或 diff 面板的资源工具栏携带
  那个文本按钮（`SendReviewButton`，作用于唯一的 `fileDraftIds` 推导）：计数与发送恰好是**这个**文件的
  草稿，成批送进该文件自己的 review 聊天（每个文件一个聊天 —— 宿主把它钉在 `Review.fileSessions` 中
  之后往那里发 `followUp`），它会**立即打开**（宿主把该包裹分离地发射进会话 —— 见 reviews SPEC 的
  发送延迟说明）。其他文件的草稿原地不动；每个面板携带自己的按钮，而 Review 面板在每个展开 section 的
  条上显示同一个按钮（面板头部另加跨文件的 `Send all (N)` —— 见上文）。在没有什么可发送时提供它会是一
  个谎言，因此一个进行中的文件保留它弱化的标志且不长出工具栏。一个覆盖无评论文件的面板两者都不显示。
  没有可进入的手动 review 模式。每个发送入口（输入框的 Send now、线程卡片、侧栏行/页脚、标签页的
  Send all）都走唯一的那一对 `reviewSend.ts`（`sendReviewComment`/`sendReviewBatch`：请求 → 显示聊天
  标签页 → 失败时 toast），而各面板通过唯一的 **`useFileReview`** hook 集成，把它以锚点为键的
  `worktree`/`base` 表面经由注册表 props 传入。一个批次会用它触及的**每个**会话应答（每个分组一个），
  因此一个多文件批次会打开它启动的每个聊天并聚焦第一个 —— 一个用户从未见过的聊天仍是一个正在处理他们
  评论的 agent。**显示每个聊天分歧于结果的 `reused` 标志：** 这次发送**创建**的聊天直接从结果打开
  （`openChatSession` —— 没有往返，且它的运行时在第一个流式事件之前就存在），而一个**复用**的则走
  `openChatInTab` 的标签页→运行时→磁盘逐级升级，因为它可能是这个客户端从未见过的聊天（第二个客户端，
  或这个客户端在一次重载之后 —— review 状态与 pi 对话记录都比宿主的生命周期更长）；把它当新的打开会为
  已被标记为已发送的评论显示一个空白对话。**侧栏导航去到锚点**可读**的那个表面**（一个推导，
  `reviewModel` 的 `ReviewSurface`：行用 `commentSurface`，文件行用 `reviewFileSurface` —— 后者仅当该
  文件上**每个**未解决评论都是 base 侧时才选 diff）：一个 `base` 锚点的行索引变更前的 blob，只有
  Pierre 的删除侧渲染它、也只有它挂载 `base` 线程，因此它会重新打开**一个钉在该锚点自己 `baseRef`
  上的 diff**（`GitDiffScope.kind: "pinned"`，线上协议 v30：工作树对一个不可变提交）—— 绝不是它被捕获
  时所处的 scope，后者会针对当前分叉点/`HEAD` 重新解析，并在工作树发生提交或 review 目标被重新指向时
  从评论脚下移开（旧卡片会挂载在另一个 blob 上、使用陈旧的行号）。一条在 `baseRef` 被打戳之前保存的
  评论回退到它捕获时的 scope，再回退到工作区当前的 scope。把每一行都路由到文件标签页会把 base 备注放在
  说了别的内容的工作树行上，既没有卡片，还有一个没人消费的焦点请求。
- **实时刷新（工作树面板跟随磁盘）。** 每个按工作区限定 scope 的读取都经过一个 hook ——
  **`useWorkspaceRead(workspaceId, read, handlers, readKey?) → { reload }`** —— 它拥有*何时*读取
  （工作区变化、该工作区的 `fsChangesByWorkspace` tick、一次 **`readKey`** 变化，或为手动 Refresh 调用
  `reload()`），而调用方拥有*对结果做什么*（`onResult` / `onFailure` / `onSwitch`）。之所以集中化，
  是因为每个站点否则都在重新实现**陈旧应答守卫**：调用方已经前进时在途的应答绝不能落进新工作区的视图
  （读取都打世代戳 —— 最新者胜，被放弃的保持静默）。一个 `null` 的 workspaceId 什么都不读，这也是一个
  组件表达*暂停*读取的方式。一个可见的 `FileTree` 目录在折叠时只探测到足以识别它的紧凑单目录连续段
  所需的程度；位于该连续段最深目录之下的后代只在那条紧凑行被展开时才挂载并读取。不需要把任何 tick
  作为 prop 往下穿。它的使用方 —— `FileTree`（根 + 每条可见目录链）、`ChangesPanel`（`git.status`）、
  `useWorkspaceSpecs`（`spec.graph`）—— 外加 `FilePane`/`DiffPane`，它们对每个打开的标签页遵循同一套
  tick 契约。agent 的编辑、终端命令与 Finder 里的改动全都会落地，无需任何手动步骤。三种形状让它的
  effect 依赖列表保持**诚实**（其中任何地方都没有 exhaustive-deps 豁免）：fs tick 作为**事件**被消费
  （`useAppStore.subscribe`），而不是被选择进组件 —— 因此它触发一次重读而不成为渲染输入，使用方也不再
  因无关的工作树变动而重渲染；**重置就是该 effect 的清理函数**，它闭包捕获那个被*离开*的工作区（重置
  真正需要的 id —— 一个以 `workspaceId` 为键的普通 effect 运行时作用域里已经是*新* id）；而一次手动
  刷新是一个**命令式的 `reload()`**，不是一个 nonce 依赖。`readKey` 是该读取的**第二个身份维度**，
  用于一个参数不止工作区的读取 —— `ChangesPanel` 传入 `${scopeKey}:${targetRef}`，因此切换 diff scope
  或重新指向目标分支会像工作区切换一样重置并重读，而一个 scope 的列表绝不会滞留在另一个之下。
  `onFailure` 收到的是**那次拒绝**，而不只是工作区 id：一个对某个*具名*失败做出反应的调用方（见下文
  的已消失提交规则）必须能把它与一次超时或一次未具名的宿主失败区分开。那个刻意**不**经过此 hook 的
  唯一读取是 `ChangesScopeMenu` 的惰性读取对 —— 它们由*打开*触发，而不是由 tick 触发 —— 因此该菜单
  改为**以它的完整身份为键，`(workspaceId, targetRef)`**：它的提交行是 `git log <base>..HEAD`，因此
  重新指向目标会改变存在哪些提交，而重挂载会清掉属于前一对的行，同时中和任何仍然在途的应答。在一次
  挂载之内，这一对同样是**打世代戳的**，因此连续两次打开不会让较早的应答覆盖较晚的那个。它**只是
  身份** —— 是让一次重读发生的东西，绝不是这次读取*用什么*读取（参数住在调用方的 `read` 闭包里，
  hook 每次渲染都重新捕获它，因此一次重读所用的值按构造就是键所命名的那个）。它作为参数被穿给 `read`
  （以及 `reload`），供宁可据此分支也不闭包该参数的调用方；忽略它 —— 正如 `ChangesPanel` 那样，它的
  `scope` 只是一个被键命名的对象 —— 是预期内的。重新取数**保留视图状态**：`FileTree` 重读根，以及每个
  可见紧凑行与展开分支背后的目录探测。展开状态住在各行之上，并以一条紧凑行所代表的每条目录路径为键，
  因此缩短或加长一条链无法隐藏重新取数之前可见的后代；消失的目录通过它们的父节点掉出。`ChangesPanel`
  重读 `git.status`（仅列表 —— diff 作为中央资源渲染，不在列表之下），`SpecsPanel` 重新取数而不重挂载
  （展开状态存活），而 `FilePane`/`DiffPane` 在工作区 tick 越过它已加载的 tick 时重读一个打开资源的
  内容（可见时实时；后台标签页在本地选中时追上 —— 只有每个分组选中的主体被挂载；一次失败的重新读取
  —— 文件被删除 —— 保留最后的内容，不自动关闭；一个文件已离开变更集的 diff 标签页同样保留它最后的内容
  —— 变更列表才是消失显现的地方）。`FilePane` 与 `DiffPane` 运行**同一个**标签页内容实时刷新契约 ——
  共享的 **`useLiveTabContent(tab, {read, applyFresh, keepCurrent}, reloadKey?)`** hook —— 只在读取
  方法（`fs.readFile` 对 `git.diffFile`）与 store 按工作区限定的写入（`updateFileTabContent` 对
  `updateDiffTabContent`，各自收到被捕获的工作区，因为不透明的缓存 id 可能跨工作区重复）上不同。它的
  单批次跳过（"this file isn't in it—just advance the tick"）要求该批次有**具名**文件：一个
  **无路径**的帧（`paths: []`，宿主的 ref 移动提示）总是重新读取，因为路径成员资格说明不了任何关于一次
  没有触及文件的变化 —— 这正是当一个终端 `git commit` 移动 `HEAD` 时让一个打开的 `uncommitted` scope
  diff 保持诚实的东西。`reloadKey` 是该 hook 的**第二个实时维度**，用于一个内容依赖文件之外东西的
  标签页：`DiffPane` 传入 `selectDiffTabTargetRef`，因此重新指向 review 目标会立刻重读一个
  **branch scope** 标签页，而不是拖到下一个 fs tick（一个提交 scope 没有这样的维度 —— 它的两侧动不了）。
  该重读保留标签页既有的 tick：它回答 "what does this tab mean now"，它不观测一次文件变化。两个维度是
  两个 effect，因此**两次读取可以同时进行**（一次缓慢的 tick 重读，然后一次重新指向）；两者都从**每个
  标签页一个的定序器**（`createReadSequencer`，有单元测试）取号，而一个应答**只在没有更晚的读取开始过**
  时才被写入。
  否则就是网络在挑赢家：乱序解析时，较旧的读取最后落地并用它自己诚实但现在陈旧的戳记覆盖较新目标的内容，
  因此两个 effect 都看不到任何漂移，而该面板会无限期地把旧目标的 diff 挂在新目标的标签下。丢弃被取代的
  读取毫无成本：取代它的那次读取才是用户在等的。面板只为活动工作区挂载，因此限定 scope 是自然的。一个
  退化的宿主 watcher 会暂停自动失效，直到下一次工作区读取重建它；可编辑文件的冲突处理要等 `fs.writeFile`
  （今天的查看器是只读的）。
- **`useWorkspaceSpecs` 拥有 `spec.graph` 读取**（一个取数器，一份 "this file is a spec" 的定义）：
  快照落在 store 里（`specsByWorkspace`），而不是面板状态，因为聊天的轮次分隔线需要同一个答案来路由它的
  chip。它由 **workbench 工具集成**调用，而不是由 `SpecsPanel` —— 面板正文只在它的标签页显示时才存在，
  因此在那里拥有读取会意味着一个坐在 Changes 上的用户会让图停止跟踪工作树，而 agent 写的每个规范都被
  算作一个变更文件（这个拆分被一次标签页选择静默撤销）。由于按工作区为键，切换时会显示该工作区最后已知
  的树，同时重读在途（没有什么需要重置），而失败读取标志是按工作区限定 scope 的，因此它无法把一个提示
  泄到兄弟工作区健康的树上。它返回 `{ failed, reload }` —— `SpecsPanel` 那个只针对错误的 Retry 直接
  调用 `reload`，因此不必在面板状态里持有重试计数器。
- `SpecsPanel` 是只读的规范图查看器 —— 那份快照的纯读取方。每次工作区激活取一次数，在 fs tick 时自动
  重新取数，渲染为 **`parent` 树**（根 = 无/悬挂的 parent；默认展开）。**没有常驻的 Refresh 控件或面板
  工具栏行**：例行的同步是自动的。一次取数**失败会渲染一个独立的、带 Retry 的内联错误提示**，绝不是
  "No specs" 空状态 —— 离线和为空是两个不同的答案。有上一份快照时，该提示坐在保留的树之上；没有时，它
  替换加载状态。树构建（`specTree.ts`）假定图是良构的 —— **parent 环是 `spec_validate` 的问题，不是
  查看器的问题**（环成员从任何根都不可达，因此干脆不渲染）—— 但遍历是**有访问守卫的**，因此一个畸形图
  绝不可能让 UI 挂起或打转。这个切片里只有树 —— 没有跨边显示、没有编辑、没有校验徽章、没有图画布。
- `SpecsPanel` 是一棵紧凑的**文档优先的树**：规范节点既是容器**也是**文档，因此这些控件把两种角色都
  显式化。层级使用固定的逐深度缩进 + chevron，刻意**没有连接轨或分支肘**（常驻的线条让狭窄的侧栏过载）。
  只有那个带内边距的 **chevron** 负责展开/折叠，而该行的其余部分是一个原生文档按钮，它的**单击预览**渲染
  后的规范 —— 而**双击保留**它 —— 通过与 `FileTree` 相同的 `fs.readFile` → `openTab` 流程（见 Preview
  tabs 条目；顺着规范图往下读正是这个可复用槽位存在的场景）。每一行都停在一行上：缩进 → chevron →
  形状编码的角色图标 → 截断的标题 → 尾部角色（`ARCH` / `MODULE` / `SUBMODULE` / `TASK`；未知类型紧凑地
  降级）。角色**在该行悬停/聚焦时显现**，不截断，而 `aria-label` 无条件携带它。标题经由
  `specDisplayTitle` 渲染，它把一个标题的 ` — ` / ` – ` 分隔符折叠为 **` · `**。顶层
  `goal-and-requirements` 行则携带确切的 **`Main spec`** 标签与一个不同的根图标；一个本地选中的文件
  资源行有常驻的选中处理。**生命周期状态完全不呈现** —— 未来的 lint 健康度随一个真正的 linter 特性到来，
  而不是靠推测性的点或复用状态外框。这仍是一个克制的层级 —— 没有 hero、没有重复的根、没有预览窗格、
  没有图画布。`FileTree` 共享同一套文件手势模型（preview/keep）但保留自己的目录行为 —— 整行点击切换目录，
  那里没有冲突。
- **聊天深链保持与排布无关。** 一个外壳拥有的 **`LayoutIntent`** 命名该单例工具；外壳解析它当前的
  侧/分组，就地显现它，并在本地选中它。`changesRequest` 与 `specRequest` 加上那唯一一条聚焦/打开的路径，
  而不命名任何布局目的地。因此一个只显现某工具的分隔线 chip 不需要编造路径，也不需要固定右侧面板的假设。
  `ChangesPanel` 监听 `changesRequest`（由聊天轮次分隔线的 "files changed" chip 设置），**高亮**被请求
  文件的行（用 `matchesWorktreePath` 对 `git.status` 解析）**并在该文件处打开 review 标签页**，落在目的
  中央分组的**预览槽**里（一个 `path: null` 的请求会打开该标签页而不做显现，也不等面板自己的
  `git.status`，因此一个刚挂载的面板在其轮次被剪掉后的回退无法把它重定向；一个携带 scope 的请求会打开
  那个 scope 的标签页）—— chip/列表行的点击*就是*用户显式要求看到那个变更，因此停在一次高亮上读起来像
  坏了，而跟随一个 chip 是浏览，与点击它所指向的行一样，因此它复用槽位而不是每跟一个 chip 就累积一个保留
  的标签页。一个不再在当前 diff 中的路径（几天前的一轮）降级为仅高亮：没有 diff 可显示。**一个用户已经
  导航离开的深链也是如此** —— 这次打开是那个在发生时*无法*标记自己导航的一次，因为该路径只有在
  `git.status` 落地后才可解析，而这个视图通常正是由该 chip 显现的（一次全新挂载、一整趟往返）。它比较的
  是点击时打戳的目的分组 id 与本地导航时钟，因此用户在列表加载期间选中的标签页就是更晚的导航并保住焦点。
  该意图在处理之后被**消费**（`clearChangesRequest`）—— 它打开一个中央资源，因此一次重放它的
  git-status 重读会把用户的标签页拽回去。`SpecsPanel` 监听 **`specRequest`**（那个 "N specs" chip）并
  **打开渲染后的规范**，同样落在目的分组的预览槽里（`openFileInTab`，它把报告的路径规范化 —— pi 可能
  报告绝对路径或 `./` 前缀 —— 成工作树相对的**标签页身份**，因此一个深链绝不能为一个已经以其相对路径
  打开的文件再开第二个标签页
  打开的同一路径下；那住在咽喉点，而不是每个调用方里，而它意味着一个几秒前创建、尚未进入图的规范也照样能
  打开）—— 一个规范除内容之外没有什么可预览的，而树行会因本地选中资源的身份而亮起。该意图在处理之后被
  **消费**（`clearSpecRequest`）：像 Changes 链接一样，它打开一个中央标签页，因此在一次重挂载或一次图
  重新取数时重放它会把用户的标签页在编辑中途拽回去。两个意图，两个 effect：一个规范 chip 绝不能落进
  由 git 推导的 Changes 视图，后者在结构上无法显示一个被 gitignore 的 `.thinkrail/context/` 草稿规范
  —— 正是那个促使拆分出 Changes 空视图的 bug。两个意图都携带**恰好一个路径**：一轮写了多个产物的
  情况在聊天里解决其中的歧义（chip 在那里展开成一个列表 —— 见 chat/SPEC.md），因此没有面板需要标记一个
  *集合*。这是刻意的 —— 在这些按工作区限定 scope 的树上再引入第二套按轮次限定 scope 的标记词汇，会重新
  引入上文那条单选择规则存在的意义所在于防止的"两行读作被选中"的歧义。
- **diff scope 在 Changes 头部选择，并进入标签页的身份。** 两个头部控件说明正在 diff 什么：**`ChangesScopeMenu`**
  pill —— *All changes*（该工作区自分叉出目标分支以来的工作 —— 从 merge-base 起算，因此落在目标上的上游
  提交在这里绝不是幻影行；默认值）/ *Uncommitted changes* / 来自分支列表的一个**提交** —— 以及共享的
  **`BranchPicker`** pill 用于**目标分支**（`workspace.setDiffBase`；面板收敛于广播的
  `workspace.updated`，绝不乐观）。在两个固定行之下，菜单提供 **Last turn · N files** —— 最新的宿主记录
  的 agent 运行（`store.turnsByWorkspace` 经 `useWorkspaceTurns` 读取；外壳在每个位于
  `TURN_CHANGES_PROTOCOL_VERSION` 的宿主上按连接加载它；在没有运行改变过任何东西之前以 "No agent turn
  changed files yet" 禁用）—— 以及，当存在不止一次运行时，一个 **Agent turns** 列表（最新在前，
  时间 · 文件 · 相对落定时间）。选择其一会设置 `turn` scope `{ id, baseTree, headTree, startedAt }`；
  review 标签页与逐文件标签页都从快照读取两侧（`/blob` 提供带树限定的路径），因此当工作树继续前进时
  该 scope 保持冻结，而因为它的修改侧是历史的，它不提供任何 revert 或 keep 控件。一个被剪掉的快照会像
  一个被改写的提交一样被拒绝。该菜单的其他内容**在每次打开时惰性加载**，绝不在面板挂载时加载：提交行用
  `git.listCommits`（主题 + `shortSha · author · relative time`），未提交 scope 下做一个 `git.status`
  探测，这正是让 *Uncommitted* 行可以说 “No uncommitted changes”（禁用）而不是打开一个无从解释的空列表
  的原因；每一项各自独立降级。菜单内容是**有高度上限且可滚动的**（基于共享的 `DropdownMenuContent`
  原语，因为任何长菜单都有这个问题）—— 200 个提交行绝不能跑出视口边缘之外变得不可达。该 pill 用**短
  sha** 来命名一个提交 scope，绝不是它的主题（`scopeLabel`；主题是触发件的 `title`，经由 `scopeTitle`，
  而菜单行会完整显示它）—— 侧栏头部里的一句说明会把相邻的目标分支 pill 挤到只剩省略号。一个命名了仓库
  已不再拥有的提交的 scope（rebase、分支重置）会让宿主用**具名**代码 `UNKNOWN_COMMIT`（`wsErrorCode`）
  拒绝 `git.status`，而*那个*拒绝 —— 且只有那一个 —— 会**重置到分支 scope 并抛一个 toast**，而不是卡死
  在一个死掉的 sha 上。一个 review 标签页的 scope 就是它的身份，因此同样的代码在*它*的读取上绝不会重新
  指向该标签页：它会丢掉陈旧的列表，点出什么不见了（提交或轮次快照），并提供 *Review all changes*，后者
  经由 `requestChangesView` 去到侧栏重置所落在的那个分支标签页 —— 绝不是一个无用的 *Retry*。其他每一种
  失败（超时、长时间网络中断、git 错误）都不碰用户选定的 scope，保留最后一份好列表，并在每一段连续失败
  中只说明一次：在一次网络抖动上静默替换 scope 是比一份陈旧列表更糟的谎言。该代码的存在正是因为
  "the read failed" 无法区分这两者。
- **"从未应答"、"失败"与"应答为空"是三种状态，绝不是两种。** 该面板分别持有 `GitStatus` *和*一个失败：
  还没有状态读作 **Loading…**，一次没有列表可保留的失败渲染错误外加一个 **Retry**
  （`changes-error` / `changes-retry`，`reload()`），而只有一次已落地、其 `changes` 为空的应答才可以
  说 “No changes in this scope.”（`changes-empty`）。一次失败的首次读取绝不能走空状态分支 —— “clean”
  是一个*关于工作树的断言*，而一次没有落地的读取没有做出任何断言；一个在本不干净时显示干净的 review
  表面是本产品最糟的失败。宿主侧同样的规则：一个非零的 `git diff` 退出会**抛出**，而不是产出一个空的
  变更集（见 `server/src/git/SPEC.md`）。**目标分支住在 scope 菜单旁边，而不是它里面**（与最初的设计
  不同）：一个可搜索的列表属于 combobox，而一个嵌套的 Radix 子菜单会在那些惰性读取落地、菜单重渲染时
  自我关闭。
- **diff 是一个中央资源标签页，而不是 Changes 工具内部的一个内嵌视图，且 Changes 有两种呈现。** 在
  Changes 行上的单击会为该面板的 scope 打开（或显现）工作区的 **review 标签页** —— `ChangesReviewPane`，
  每个 *(workspace, scope)* 一个 `ChangesTab`（`changesTabId`），preview 意图 —— 把该 scope 的每个
  变更文件作为**一个 section** 放进同一个滚动表面：粘性 section 头部（状态、路径、`+N −M`、当注册表返回
  多于一个候选项时的渲染器段、*Open as tab*、*Revert file*、*Viewed*）、在滚进视野时惰性读取
  `git.diffFile` 的正文，并像 `DiffTab` 一样在同一套实时刷新契约下刷新。双击，或一个 section 的
  *Open as tab*，会在 `keep` 意图下通过 `openDiffInTab` 打开逐文件的 **`DiffTab`** *(path, scope)*
  —— 深层的单文件表面是一次提升，绝不是第一次点击。双击携带它前导单击的预览槽声明；显式的 *Open as
  tab* 则保留既有的预览。review 标签页有两种**视图模式**，由其工具栏中的一个 `Stacked | One file` 段
  选择，并在全应用范围保持（`store.changesLayout`，像 `changesView` 一样）：*Stacked* 是连续列表；
  *One file* 一次显示一个 section，带 `Prev / Next` 与一个 `n / N` 计数器（`V` 切换已查看并在标记时
  前进，`Alt+↓` / `Alt+↑` 逐文件步进）。两种模式读同一个模型 —— 该 scope 的有序文件列表、`viewed`、
  `activePath`、折叠覆盖、`Split | Inline`、¶ —— 因此切换绝不丢失审阅进度；正因如此，每个模式一个第二
  标签页种类才被否决。
  **瞬时撰写属于标签页的 section，而不属于它挂载的渲染器。** 一个可选的、按 scope 限定的 review 草稿
  上下文会在虚拟化、折叠、渲染器切换以及 Stacked/One-file 切换之间保留打戳的选区、输入框文本/光标、
  待定提交，以及未保存的线程编辑。共享的 `useStampedComposer` 与线程卡片对代码与富表面使用这套策略；
  渲染器、侧/页、文件、scope 与工作区身份隔离它们各自的草稿状态。Notebook 选区保留一个打戳的侧与单元
  索引，绝不是一个已解析单元对象的身份。Cancel 与成功的 Save/Send 会退役它；迟到的完成无法关闭一个
  更新的选区。恢复草稿绝不聚焦 textarea，也绝不发送任何宿主变更。既有的线程编辑保留 blur 保存与快捷键
  保存；发送会等待任何被编辑的正文保存完成，而 Escape 只丢弃本地编辑。线程卡片在每个表面上只有一条
  编辑状态路径 —— 没有草稿上下文时它回退到本地状态，因此逐文件标签页无法与 review 标签页漂移。内容戳记
  变化仍会使陈旧选区失效。草稿仅在标签页生命周期内存在，不跨重载持久，而它的第一次写入会保留那个预览。
  **Changes 侧边栏是 review 标签页的导航器**：它的行高亮跟随该标签页的 `activePath`（头部越过工具栏
  中线的那一个 section，或所显示的单个文件），已查看的文件带一个对勾字形，而点击一行会显现那个 section
  （若它已折叠则展开它）—— 在异步 section 各自决定高度期间该显现保持按路径锚定，直到一次视图模式切换或
  用户的滚轮、触摸、指针、键盘输入接管。一次超时无法界定远端读取。查找导航只在 section 显现之后把滚动
  交给该线程，并禁用后续的头部校正，使该线程无法被滚出视野；一次被用户接管的显现、一次更新的显现，或
  面板卸载，会撤回它待定的 `reviewFocusRequest`，因此一个稍后挂载的线程绝不再把视口拽到一个没人在等的
  发现上。每个 section 只在 `memo` 之后收到属于自己路径的那一片标签页数据（草稿、保留键、标志），因此
  在一个 section 的输入框里敲一个键只重渲染那个 section，而不是它的兄弟；一个正文具有自然高度的堆叠
  section 不保存任何视图状态 —— 只有 One-file 与有界渲染器拥有滚动器；`changesView` 默认为 **Tree**，
  而一个文件行在两种视图里都是 `change-item`，因为它就是同一个东西。当被显示的文件离开该 scope（被
  revert，或 agent 移除了它的变更）时，One-file 模式停在该位置，而不是跳回第一个文件。列表以一个与
  视口等高的、测量出来的尾部收尾，因此最后一个文件可以被滚到顶部并成为活动项，就像在 GitHub 上那样。
  滚动侦测绝不自动显现 Review 工具：`selectActiveReviewedPath` 刻意忽略 review 标签页，因为一次由滚动
  触发的显现会在读取中途替换掉它共享侧分组里的 Changes 导航器。
  **Hunk 分诊是同一标签页上的一层覆盖，而不是第二个变更模型。** 在一个可变 scope 里，每个 hunk 工具栏
  都会在既有的 Revert 与 Ask-agent 动作旁获得 **Keep**；一个被保留的 hunk 以**内容键**记录在标签页上
  （`kept[path]`）—— 该 hunk 被移除与被新增文本的哈希，当内容完全相同时再加上重复组大小与原始侧位置，
  因此 revert 掉一个更早的双胞胎无法把它的决定转移给一个未审阅的双胞胎。歧义组在大小变化时会保守地丢掉
  它们的决定。唯一的键能挺过相邻一次 revert 引起的行位移，并在 agent 再次改动那个 hunk 的那一刻失效。
  一个*被 revert* 的 hunk 不需要状态：ThinkRail 的 revert 恢复基础文本，该 hunk 离开 diff，而 toast 的
  Undo 是回头路。section 头部显示 `k/n kept`，而保留一个文件的最后一个 hunk 会原子地把它标为**已查看**
  —— 一个动作边界，而不是一条常驻渲染规则，因此一个被显式取消查看的文件在虚拟化与模式切换之间保持未查看。
  Hunk 与文件进度是同一个模型；堆叠视图的底部条显示 `n of N reviewed`、**Next unreviewed**（`J`，循环）
  与 **Mark all viewed**，而 `V` 切换活动 section。这里刻意没有 *Revert all*：宿主没有原子的多文件丢弃，
  而一个 review 表面上的批量破坏性动作只有在服务端存在之后才配得上它的按键。逐文件的 `DiffTab` 不传
  分诊，且保持不变。
  **审阅者的故事是一场行走，而不是一份报告。** 当工作区 review 携带一个 `guide`（最新的计划步骤判定的
  摘要与建议阅读顺序，见 [[submodule-server-reviews]]）或任何未解决的 agent 发现时，堆叠视图会长出一条
  左侧的 **review 引导轨**（`ChangesReviewGuide`，从工具栏切换，绝不在 One-file 模式显示）：判定徽章 +
  摘要、编号的阅读顺序（scope 之外文件的步骤是禁用而不是隐藏，因此顺序保持可读），以及那些发现。
  `guideSteps` 是唯一的推导 —— 先阅读步骤，再按路径列出未解决的 agent 发现 —— 而
  **Start / Next / Restart**（`N`，`P` 后退）沿着它行走，跳过文件不在本 scope 内的步骤
  （`nextGuideStep`；一个被禁用的步骤只为上下文显示，绝不会被落上去）：一个步骤通过标签页的一次性显现
  显现它的 section，一个发现步骤还会触发 store 的 `reviewFocusRequest`，因此线程卡片会被 Review 面板
  使用的同一条路径滚动到。*Fix this one* 与 *Apply fixes* 是 Review 面板的发送路径
  （`sendReviewComment`、`sendReviewBatch` 作用于未解决的发现 id）藏在一个忙碌标志之后，而不是新的变更。
  光标就是步骤的身份（一个阅读步骤在顺序中的位置 —— 契约允许一个文件出现两次 —— 或一个发现 id），因此
  一个从它下面被解决的发现会让位给它的后继，而不是跳过一个。该轨绝不在手机类别视口上渲染 —— 390px 屏幕
  里的 280px 会不留下任何可被引导穿过的 diff。纯字母快捷键（`V`、`J`、`N`、`P`）属于中心正在看的那个
  review 标签页（`ownsReviewShortcut`：注意力分组选中的标签页、没有打开的模态或菜单层、没有文本输入
  目标，且没有更早的处理器消费该事件），因此并排分栏的两个 review scope 无法同时应答一次按键。
  **规模规则**：一个文件变更超过 400 行的 section，或路径是 lock/生成文件的 section，会折叠挂载在
  *Expand* / *Open as tab* 之后；一个文件超过 50 个的 scope 会显示一条可关闭的通知，提供 *One file*；
  没有任何东西会自行切换模式，因为一个在审阅中途自我重排的 review 表面会丢掉读者的位置。该列表是一个扁平
  的 `react-virtuoso` 列表，一个文件一个条目，头部粘在它自己的条目内（不用 `GroupedVirtuoso`：一个比它
  条目内容活得更久的组头部无法承载逐文件控件）；Pierre `CodeView` 曾被评估用于该容器并被否决，因为它的
  条目只有 `file` / `diff`，因此它无法承载一个 section 必须像 `DiffPane` 那样分派到的那批渲染器：
  rendered-markdown、image、SVG、CSV、JSON、notebook 与 PDF。**一个 section 在还没有 diff 之前就保住
  它的形状。** 每个 section 在它的正文首次变为可见时惰性读取 `git.diffFile`，经由该面板的
  `SectionContentCache`：进行中的读取只对同一路径、同一 diff 目标与同一文件系统世代共享。最新的请求可以
  在它的 section 滚出之后填充缓存，但一次更早的初始读取无法覆盖一个更新的目标或一次实时刷新。一次失败的
  读取什么都不存，因此 *Retry* 会再次读取。加载期间，一个堆叠 section 的占位符预留
  `estimatedSectionHeight(change)` —— `232 + 40 × changed lines` px，上限 20 000 —— 这与 Pierre 为同样统计
  渲染出的高度相差约在 2× 以内。没有这个预留，一个只有它 diff 十分之一大小的骨架会让 Virtuoso 一次挂载
  十几个 section（也就是那么多并发读取），然后随着每一个长大而重新估算整个列表，因此跳到远处的一个文件会
  落偏几十个文件。`DiffPane` 与一个 section 都渲染共享的 **`DiffSurface`**：它描述返回的
  `ResourceMeta`、为 `diff` 解析注册表、惰性挂载选中的渲染器、托管该文件的 review 线程与 hunk 动作，并
  显示未放置条。仅有字节的原始侧使用响应已解析的原始 oid 配 `/blob`；一个缺失的侧是显式的，绝不是一个带
  捏造 URL 的字节值。固定的工具栏保留路径与逐文件 review 发送，然后只在选中的渲染器声明相应能力时才暴露
  ¶ 空白、修改侧复制，以及 **Split | Inline**。当注册表返回多于一个候选项时，它为每个候选项渲染一个
  `view-toggle-<renderer suffix>` 段。渲染器选择取代了旧的、仅 markdown 的 `rendered` 状态；布局与空白
  仍是独立的 diff 状态。review 标签页的工具栏一次为每个 section 携带同样的空白与 `Split | Inline` 控件、
  作为只读 chip 的 scope 与目标（scope 在 Changes 头部选择，并且是标签页身份的一部分）、带已查看计数的
  文件 / `+ −` 合计、*Collapse all* / *Expand all*，以及作用于工作区草稿的 `Send review (N)`。

  **大规模重写在一则通知之后等待。** 源 diff 在主线程上运行，而那份成本跟踪的是变更行数，不是文件大小：
  一个 10 MB 全新增文件约 0.1 s 就 diff 完，而 ~10k 变更行要花 20 s 以上。在挂载一个渲染器之前，
  `DiffSurfaceBody` 会估算变更行数（`largeDiff.ts`：两侧行的线性多重集差）。超过
  `LARGE_DIFF_CHANGED_LINES`（2000，约一秒的 diff），或者当一个顺序敏感的检查无法在 50 ms / 2000 次编辑
  内完成时，它显示 `diff-too-large`，带 **Show diff anyway**（逐表面挂载）以及 —— 当存在一个由工作树
  支撑的修改侧时 —— **Open file** 进入桌面编辑器。一个单侧 diff（新增或删除文件）绝不被守卫：它不花
  diff 的成本。这个有界检查封住了多重集估算对重排行的盲点。两个守卫都显示 “This diff is too expensive to
  show automatically”，而不带行数；该守卫只返回是否应当等待自动渲染。

  内置候选项从 `panels/resources/register.ts` 注册一次：`thinkrail/code` 用 Pierre `FileDiff` 渲染
  每个源 diff，并支持复制、布局与空白控件；`thinkrail/markdown` 提供 `RenderedDiff`，而
  `thinkrail/binary` 报告两侧的字节大小。富渲染器省略那些控件，但 CSV、JSON 与 notebook 的 diff 支持
  修改源复制。`thinkrail/lfs` 认领宿主的 `application/vnd.git-lfs` 文本（一个*是* Git LFS 指针的文件，
  无论它什么扩展名），排在代码渲染器之上，并在视图里显示一张卡片 —— "Stored in Git LFS"、大小、object
  id、`git lfs pull` 提示 —— 在 diff 里则是每侧一张卡片，因为 Monaco 编辑器里三行指针协议完全解释不了
  为什么一个 `.png` 没有图像；Source 仍只隔一个开关，而该渲染器不放任何锚点，因此一个指针的线程住在
  未放置条里。`RenderedDiff` 保留它的 worker 隔离 htmldiff 合并、加载/错误状态与 token 样式，但不声明
  任何 diff 锚点：两侧的线程都留在面板的未放置条里，**Show in Source** 选中代码渲染器，而 diff 撰写只在
  Source 中可用。它由注册表匹配选出，而不是面板里的一个路径分支。修改侧是历史的 scope 得不到任何 review
  表面或变更动作。

  **渲染后的 diff 像 Pierre 那样把焦点放在它的变更上。** 合并后的文档被解析一次，而一个 prose 根区块在
  它自身是或包含 `ins`、`del` 或 `[data-diff-node]` 元素时，**或**当它确切的渲染 HTML 与它所对齐的
  变更前单元不同（`changedUnits`）时，就算作*已变更*。对齐是位置性的：变更前与合并后的单元序列（先是
  区块，然后每个列表的条目）通过一次在其剥离属性后的 HTML（`shapeKey`）上的 LCS 一对一匹配，因此文档
  别处一个完全相同的双胞胎无法为一个区块作保，在两个否则完全相同的 `<details>` 之间互换 `open` 会把
  两者都标记出来，而一个没有对齐对应物的单元保持可见。第二个子句存在是因为 htmldiff 只按标签名给普通标签
  做键，并为相等的连续段发出*变更后*的 token：一个被勾选的任务复选框、`<details>` → `<details open>`、
  一个列表的 `start`，或一张图片的 `alt` 从不获得标记，因此没有它的话它们会作为 "unchanged" 折叠起来，
  而那条空通知会声称一个完全相同的预览。这样的区块会以其变更后状态保持可见（不加标记，因为合并没有什么
  可高亮的）。未变更区块的连续段按 git 的 hunk 语义折叠（`renderedDiffFocus.focusSegments`）：
  `FOCUS_CONTEXT_BLOCKS`（2）个区块在每处变更的两侧保持可见，一个开头或结尾的连续段只在触及一端的那个侧
  保留上下文，而只有一个区块的连续段绝不隐藏，因为一个替换一段文字的展开器什么也省不下还多花一次点击。
  同一条规则向下应用一层，作用于一个已变更 `ul`/`ol` 的条目，只要至少有一个条目变了 —— 一份 markdown
  规范常常带着一个三十条目的列表而只有一条被编辑 —— 而一个唯一差异是自身属性的列表，以及表格、引用与
  嵌套列表，则整体渲染；有序条目保留它们的编号（`start` 与显式的 `value` 按 HTML 的整数解析规则读取，
  因此 React 留在 DOM 里的非法值 —— `start=""`、`value=""` —— 会像浏览器那样精确地回退到 `1` / 运行中
  的计数；`value` 胜出，其余继续计数），因此隐藏条目绝不会给其余条目重新编号。
  每个隐藏的连续段是一个 `rendered-diff-collapsed` 按钮，命名计数，并且对区块连续段还命名它隐藏的最后一个
  标题（它下方可见内容所属的那个 section —— 相当于 Pierre 的行信息分隔符）。点击会就地单向展开该连续段；
  展开是组件本地且位置性的，因此一次实时刷新会保留一个其连续段仍然起始于同一位置的展开，并重置其余的。
  没有任何东西一次提供整个合并文档：Source 与文件预览已经这么做了。一次没有任何区块变更的合并 ——
  frontmatter 在渲染前被剥离，而空白或 HTML 注释也不渲染 —— 会显示 `rendered-diff-empty` 通知指向
  Source，并把文档折叠成单个展开器，而不是把一个未标记的完整文档当作 diff 呈现。可见区块从已解析的元素
  重新创建（标签、属性、`innerHTML`），绝不包裹，因此 prose 样式所针对的 DOM 保持不变；消毒器放行的
  布尔属性（`details[open]`、一个独立复选框的 `checked`/`disabled`）被映射为 `true`，因为 React 会丢弃
  空字符串布尔值。

  `thinkrail/image` 渲染宿主支撑的字节 URL，支持适应、原始尺寸、按钮/滚轮缩放、固有尺寸与字节大小，
  始终置于 `.media-backdrop` 透明棋盘格之上（视图的图像与两个 diff 帧；差值混合保持画布平坦，因此棋盘格
  无法泄漏进相减的结果中），因为在纯暗色画布上，一个透明 PNG 上的深色 logo 与一张加载失败的图像无法区分。
  在渲染出的固有尺寸框上拖拽会产生一个规范化的 `region` 选择器；已放置的线程把该选择器投影回轮廓矩形与
  带编号的标记，卡片在图像下方。它的 diff 默认为 2-up，也提供滑动、洋葱皮与差值混合模式。2-up 直接锚定
  到被绘制的那一侧；叠加模式显式暴露活动的旧/新锚点空间，因此 base 与 worktree 坐标绝不被转换。一个缺失
  的侧是一个带标签的空框。图像缩放、渲染出的固有宽高比边界、区域矩形、滑动裁剪/分隔位置，以及洋葱皮
  不透明度都是测量出来的几何，因此是无内联样式规则的那个有界例外：只有这些值是内联的，而每种颜色、边框、
  间距与控件外观仍是一个 token 工具类。

  `thinkrail/svg` 是排名更高的 SVG 候选项，同时 Source 仍可通过 `thinkrail/code` 获得。它的
  `sandbox=""` iframe 收到一个最小化的 `srcdoc` 文档，其中唯一的图像是一个百分号编码的
  `data:image/svg+xml` URL；SVG 源码绝不进入该文档的 HTML 流。该帧没有脚本或同源能力，且 CSP 为
  `default-src 'none'; img-src data:; style-src 'unsafe-inline'`，因此 SVG 脚本与外部引用保持惰性。
  该文档只收到已解析的工作区/内容背景与前景语义 token 值，并通过 `@thinkrail/ui/theme` 的 `onThemeSwap`
  重建。在该帧上拖拽会撰写与光栅图像相同的规范化 `region` 选择器，以从根的
  `width`/`height`/`viewBox` 解析出的固有尺寸为度量（该帧被设成那个宽高比，因此被包含的矩形就是该帧）。
  它绝不降级成整文件草稿：早先的一个修订版会这样（`selectors: []`，标签 `file`，等一个源码跨度映射），
  而一个以 "the whole file" 抵达 agent 的拖拽矩形读起来像丢失的坐标。SVG 元素的源码跨度仍未映射，因此
  锚点就是几何，而不是一个行范围；那些分数是相对于 SVG 根视口的，而发送包裹会告诉 agent 反转
  视口到 viewBox 的变换（viewBox 原点加 `preserveAspectRatio`）以找到它们之下的元素。它的 diff 使用与
  光栅图像相同的四种视觉模式与两个锚点空间；每一侧的叠加都通过它自己的 object-contain 矩形投影，而只有
  测量出的宽高比边界加上滑动/分隔/不透明度叠加几何使用内联值。

  `thinkrail/csv` 用一个 RFC-4180 状态机在本地解析 CSV/TSV，包括转义引号、CRLF，以及跨源码行的带引号
  字段。分隔符是**从最前面二十条非空记录的形态推断**的（`sniffDelimiter`，忽略 BOM）：`, ` `;` `\t`
  `|` 中的某个候选项只有在把每条采样记录都切成相同数量的字段（至少两个）时才合格；逗号只要合格就胜出，
  否则取唯一最宽的那个合格者，再否则就是逗号 —— 因此一个恰好包含分号的 header 值绝不会把逗号文件重新
  分类，而一个 `id;name;score` 的本地化导出是一张表而不是一列；`.tsv` 永远是制表符。一次 diff 先采样
  修改侧，失败再回退到原始侧，因此两侧用同一个分隔符解析。视图固定头部并用 `react-virtuoso` 虚拟化数据
  行。一个选中的单元或 shift 扩展出的矩形发出所选行的原始文件 `lineRange` 加上
  `structural { scheme: "table-cell", ref: "<row>:<column>" }`，header 行为零；一个缺失的单元，或一个
  其行不再与宿主重新锚定后的行范围相交的坐标，会从实际放置中省略而不是被猜测。统一 diff 用 `diffArrays`
  对齐完整的原始行键，把等长的删除/新增连续段配对为变更行，并只高亮不同的单元；未匹配的行使用
  success/error 的 subtle 表面。diff 选区使用修改后的源码行，除了被删除的行，它们留在 base 锚点空间。

  `thinkrail/json` 只匹配 `*.json` 与 `*.jsonc`。它的扫描器**按设计容忍 JSONC** —— `tsconfig.json`、
  `.vscode/*.json` 与大多数编辑器设置文件都带注释和尾随逗号，而一棵拒绝它们的树会恰好把这些文件送去
  Source —— 但它对此是诚实的：文档记录它所需的 `dialect`，而一个只有作为 JSONC 才能解析的 `.json` 文件
  会在树的上方显示一条 `json-dialect` 通知（`.jsonc` 文件不显示，因为在那里这正是重点）；一个连 JSONC
  都不是的文件会渲染一条显式的 `json-invalid` 通知指向 Source，而不是一个空白面板，视图与 diff 中都是
  如此。该扫描器一趟就构建出解析后的值与一个 RFC-6901 的指针到源码行索引；重复的对象键解析为最后一次
  出现，符合 JSON 的值语义。选择一个非根节点会发出它必需的 `lineRange` 加上
  `structural { scheme: "json-pointer", ref }`；一个在一次编辑之后就消失的指针，或一个如今命名了宿主
  重新锚定后行范围之外的节点的指针，被报告为未放置。可折叠的统一 diff 来自一个 `jsondiffpatch` 实例，
  带移动检测与稳定的对象哈希，为新增/删除/变更/移动的节点着色，并把原始值替换显示为旧 → 新。被删除的
  节点与注释留在 `review.base` 上并带 base 扫描器行；所有其他选区使用修改后的文档与 `review.worktree`。
  非法源码不渲染任何树，让 Source 作为备选候选项。

  `thinkrail/notebook` 接受 nbformat-4 JSON，并复用那个宽容的位置式 JSON 扫描器，把每个渲染出的单元绑定
  到它原始单元对象的行范围。Nbformat 4.5 的 id 是 `ipynb-cell` 结构 ref；更旧的 notebook 使用
  `index:<zero-based>`。Markdown 单元使用共享的 Markdown 解析器而不带原始 HTML。它的 notebook 组件映射
  （`notebookMarkdownComponents(resource)`，按 notebook 构建，因为图像解析是相对于 notebook 自己的路径，
  就像在 Jupyter 里那样）允许应用文档中出现 base64 的 PNG/JPEG/GIF/WebP/AVIF 图像，把 SVG data 图像
  路由经过空 sandbox 的 `NotebookFrame`，从宿主 `/files` 路由加载**相对**图像（通过与 markdown 预览
  使用的同一个注入式字节 URL 组装器；一次越过工作树的穿越是惰性文本，绝不是一次请求），并把链接加上
  每个远端图像 URL 渲染为惰性文本 —— 一个 notebook 的 `![plot](figures/x.png)` 是仓库内容，第三方 URL
  不是。Notebook 的语言元数据必须能通过共享的 Shiki 目录解析；缺失的元数据默认成 Python，未知值渲染为
  纯文本。ANSI 会从 stream 与 error 输出中移除。MIME 包按 image（PNG、JPEG、GIF、SVG）、HTML、JSON、
  再纯文本的顺序选择。SVG 输出留在惰性帧文档内部作为 data 图像。HTML 输出使用与 HTML 渲染器相同的已消毒、
  零能力文档。单元 review 同时发出原始行范围与结构 ref，把卡片留在已解析单元下方，只报告实际放置，并对
  一个打开的输入框打哈希戳。diff 先对齐 id，再对齐精确的规范化源码。剩余的连续段按顺序以有界的行 token
  相似度对齐；不使用字符级的全配对 diff。变更源码使用一个由提供商支撑的统一 Pierre 单元 diff，图像输出
  复用视觉比较模式，文本输出使用 Pierre，而 HTML/JSON 输出保持并排。原始单元选择器留在 `review.base`；
  两侧都不被转换。

  `thinkrail/pdf` 匹配字节 PDF，并惰性加载 pdf.js 与它的 Vite 产出的 worker。在页数元数据已知之前不报告
  放置。一个页区域线程恰好在它的从 1 起算的页存在时才可放置，与该页当前是否拥有一个画布无关。一个被聚焦
  的页会被强制进渲染窗口，而焦点只在它的区域卡片挂载之后才被消费。渲染窗口是可见页加上每侧两页。离开它
  的工作会被取消；画布与位图被释放，diff 的对象 URL 被吊销。输入框身份使用文档身份加页，绝不用缩放。
  工具栏的当前页是第一个可见页（在任何页报告可见性之前的导航目标），因此它既跟随滚动也跟随导航；该页与
  缩放会在视图卸载时写入标签页视图状态，像其他可恢复滚动的渲染器那样。PDF diff 使用一个同步的页序列：
  每一对页从 2-up 开始，并可在共享的滑动、洋葱皮与差值模式之间切换，缺失的一侧由一个显式的空页帧代表。

  `thinkrail/html` 先把源码解析成文档，再在一个零能力 `sandbox=""` iframe 中预览它。消毒器移除活跃、
  导航、嵌入与表单元素；剥离事件处理器与非 `data:` 资源 URL；并把锚点变成惰性的带文本元素。样式保留。
  Notebook 的 HTML 输出使用同一个消毒器。注入的 CSP 确切为 `default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';
  font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; child-src 'none'`。diff 是共享的视觉帧，只限于
  2-up 的沙箱文档。它不声明任何锚点几何，因此
  HTML 线程留在面板拥有的未放置条里，而 Source 是唯一的撰写候选项。

  Pierre 用当前的忽略空白值解析两个完整的文本侧（`absent` → `null`），使用 `thinkrail` 的 CSS 变量
  Shiki 主题、词级内联变更、折叠未变更区块并带行信息 hunk 分隔符，以及并排/统一布局；手机类别视口强制
  统一布局并隐藏 Split/Inline 段，因此没有控件承诺一个视口拒绝的布局。折叠阈值
  （`COLLAPSED_CONTEXT_THRESHOLD`，3 行）就是 git 自己的默认 hunk 上下文（`-U3`），因此 Pierre 在一处
  变更周围保持可见的内容正是审阅者已经从 `git diff` 期待的东西，而同一个数值也喂给
  `renderedDiffLineNumbers`，由它决定一个线程的末行是在屏幕上还是被停在未放置条 —— 一个常量，因此两者
  绝不可能不一致。焦点显现（`usePierreFocus`）只在有一个焦点请求待定时安装一个子树 `MutationObserver`
  加一个 `ResizeObserver`，并在卡片被显现的那一刻断开两者；它不是常驻监听器，因此一旦焦点稳定下来，
  Pierre 在每次注解变化时重渲染毫无成本。一个两侧完全相同的 diff（一个在带外提交之后离开变更集的文件）
  会在 Pierre 的表面之上显示一条显式的 `diff-empty` 通知，而不是一个空白面板。惰性的 Pierre 文件/diff
  模块只在它们的表面渲染时才挂载 `PierreProvider`；它把模块单例（`getOrCreateWorkerPoolSingleton`，
  来自 `@pierre/diffs/worker/worker.js` 的四个模块 worker）交给 Pierre 的 `WorkerPoolContext`，并**绝不
  终止它**：该池在任何代码表面首次渲染时创建，然后为页面而活。Pierre 自己的提供者会在它最后一个实例卸载
  的那一刻拆掉该池，而虚拟化的 review 列表在每次跳转或快速滚进尚未加载的文件时都会到达那一刻；每次重建
  都会重新生成 worker、重新取 WASM、主题与语法、丢掉每个已高亮的 AST，并直到初始化完成前什么都不画 ——
  这就是堆叠视图的 "loading forever"。四个空闲 worker 就是再也不付这份代价的价格；该列表一次挂载少数几个
  section，因此四个跟得上。手机代码文件实现是带同一主题与 review 语法的 Pierre `File`；只有桌面文件加载
  Monaco。

  **Pierre 各表面是虚拟化的。** 未虚拟化的 Pierre 把每一行都放进 DOM（一个 10 万行文件约 40 万节点），
  而 WebKit —— 桌面外壳的引擎 —— 无法为其做样式或布局，导致应用挂起。`pierreVirtualizer.ts` 为每个表面
  拥有一个 `PierreVirtualizer`（一个核心 `Virtualizer` 子类），通过 `VirtualizerContext` 提供，以便
  `FileDiff`/`File` 构建它们虚拟化的实例，并与 `useScrollViewState` 用同一个 ref 回调装配，因此滚动恢复
  继续有效。滚动器的第一个子项是内容容器，且必须从第一帧起就给 Pierre 元素一个非零高度（`min-h-full`
  列中的 `flex-1`）：Pierre 的滚动锚点会把一个零高度文件当作位于视口之上，并在高度落地后跳到它的末尾。
  该滚动器退出浏览器的滚动锚定（`overflow-anchor: none`，正如 Pierre 自己的 `CodeView` 那样），因为
  Pierre 自己修正滚动。注解子项留在 light DOM 中，但只在渲染窗口内布局，因此焦点显现会先要求虚拟化器把
  线程的末行居中（`revealLine`，经由已连接实例的 `getLinePosition`），然后在卡片渲染之后把它居中。
  一个刚打开的 diff 输入框得到同样的处理 —— Ask agent 把它锚在该 hunk 的
  末行，而对一个很高的 hunk 那在窗口之外 —— 并且 `ReviewComposer` 会推迟它的初始焦点直到它的 textarea
  有了盒子，因为聚焦一个未渲染的元素是一次静默的空操作。恢复出来的输入框则保留恢复出的滚动位置。
  一个虚拟化器只针对真实的滚动器开窗：一个自然高度的堆叠 Changes section 与它的内容一样高，因此它的
  虚拟化器"看得见"每一行并全部渲染（一个 10 万行的新增文件约 7.2 万行，一旦落地就冻住应用）。因此代码
  渲染器声明 `boundedDiff: "large"`，而一个超过 `VIRTUALIZED_DIFF_LINES`（1000，按较大的文本侧行数，
  包括未变更上下文）的堆叠 section 得到与 `"always"` 渲染器相同的、有界的 `60vh` 视口，并拥有自己的
  滚动器。按源码行计数让展开区在大文件只有一个小编辑时仍保持虚拟化，也覆盖了没有 git 缺失计数的未跟踪
  文件。同一个阈值在每个宿主里门控虚拟化：`DiffSurfaceBody` 只在它之上传 `virtualize`，而在它之下
  `PierreDiff` 收起它的虚拟化器，因此普通 `FileDiff` 渲染每一行，与虚拟化之前一样。虚拟化小 diff 什么
  也没换来，却付出了两次失败。一个虚拟化实例的 hydrate 在它的容器仍然为空时测量它的偏移（强制布局）；
  在堆叠列表里，其末端处于最大滚动位置以便最后一个头部能到顶部，那个坍缩的布局会钳住 `scrollTop`，而
  Virtuoso 的大小校正会叠加这次跳变，直到被审阅的 section 离开渲染窗口。而 `@pierre/diffs` 1.5.1 的
  虚拟化就地列重渲染会丢掉该实例仍然记录的注解行，让一个刚打开的输入框被放进无处可去的位置，直到有什么
  东西强制一次 `rerender()`。大 diff 仍携带那份注解风险。

  **虚拟化滚动是按块成本调校的。** Pierre 把每个代码列布局成一个子网格、每行一个条目，因此每次渲染窗口
  移动都会重新布局整个已渲染网格，而一次移动的成本跟踪的是插入的行，而不是保留的行。并排布局在新行携带
  注解（hunk 工具栏、线程）时会付两次：Pierre 的 `ResizeManager` 用一次强制的 `getBoundingClientRect`
  把每个注解行跨两列配对，然后同步这一对的 `--diffs-annotation-min-height`，强制第二次布局。在 Pierre
  的 50 行块下，那在 Chromium profiler 里是每次移动约 90 ms 的长任务，在 WebKit 里是约 80–95 ms 的卡顿。
  因此 `usePierreVirtualizer` 传 `hunkLineCount: 5` 与 400 px 的过滚（Pierre 的默认值：50 行、1000 px），
  在一个 6 千行、150 个 hunk 的 diff 上以滚轮甩动测量：在 WebKit 里内联与新增文件的滚动从掉 12–34 帧
  降到掉 2–3 帧，而最糟的并排卡顿大致减半（约 45 ms）。在密集 hunk 工具栏之上的并排滚动在 WebKit 里仍掉帧；
  没有工具栏时它很顺滑，而 `overflow: "wrap"`（跳过配对，因为两侧共享网格行）有助于中等速度的滚动，但对
  甩动无用。虚拟化器的 `lineHeight` 度量是真实行高：`.pierre-code-surface` 把 `--diffs-line-height` 取整
  到整像素（`s11` × `default` = 14 px，与 Monaco 的取整一致），而 `codeLineHeight()` 从 token 推导出同一
  个数值。对着 Pierre 20 px 的默认估算，一个 2 万行文件的滚动高度起初高了约 40%，并在滚动中随行被测量而
  收缩。测量之后被否决的：把一个不可见占位镜像到对面的并排列（它削减了绘制面积，但在任何引擎里都没减少
  掉帧），以及更大的过滚（在 5 行块下掉帧约为并排的两倍，快速甩动时空白帧也没更少）。

  **`PierreScroller` 让合成器不显示未绘制的行。** WebKit（桌面外壳）在主线程之外滚动溢出内容：在一个
  2 万行文件里拖动滚动条每步跳约 2,600 px，而每步都会在主线程绘制新窗口之前显示一帧完全空白的画面。
  没有任何过滚能覆盖这一点，而像绘制行那样绘制 Pierre 的占位元素也没用：那处空白是未光栅化的空间，
  不是占位元素。因此该滚动器保留原生滚动（滚动条、滚轮、按键、惯性、自动滚动），但持有一个按内容高度
  测量的尺寸器、一个裁剪到滚动器高度的 `sticky` 视口，以及主线程上按 `-scrollTop` 平移的内容。线程外的
  滚动只移动尺寸器，因此被钉住的视口持续显示最后绘制的行，直到主线程在它渲染窗口的同一帧里移动内容 ——
  快速拖动会滞后，但绝不空白。Pierre 在它的 rAF 通道里修正滚动位置，而 `useScrollViewState` 从一个
  ResizeObserver 恢复它，两者都在那一帧的滚动事件之后，因此滚动器自己的 `scrollTo` 与 `scrollTop` 会
  同步地重新对齐变换；否则 Pierre 会对着一个陈旧的偏移测量行。自然高度的堆叠 section 运行同样的结构但
  不滚动：视口的高度在尺寸器设置之后从滚动器读回，因此它绝不反过来喂给内容自己的高度。

  可变 scope（`branch`、`uncommitted`、`pinned`）只在当前 welcome 声明
  `CHANGE_MUTATIONS_PROTOCOL_VERSION` 且携带两个哈希的 diff 元数据已落地之后才收到 `hunkActions`。
  变更块独立于 Pierre 的 hunk 模型：`diff@8` 的 `structuredPatch` 以零上下文与同样的空白策略产出送去
  `change.revert` 的原始/修改 `LineSpan` 对。每个块在它第一条变更行之上得到一个纤细的注解工具栏，带
  **Revert**（`hunk-revert`）与 **Ask agent**（`hunk-ask-agent`）；纯删除把该工具栏锚在删除侧，而一个
  缺失的修改侧会压制每个块工具栏，只留下头部级的 Revert file。一个运行中的会话会加上那条安静的
  “the agent is working in this workspace” 通知，但保护该动作的是 CAS，而不是禁用它。Ask agent 用修改
  后的 `lineRange`、一个确切的 `diffHunk` 头部，以及光标处的 `Please revise this change: ` 打开工作树
  输入框；一次纯删除会锚到其前面那条既有的工作树行（顶部时是第 1 行）并说明它指的是被删除的行，而一个
  空工作树只发出 `diffHunk`，因此得到一条整文件评论。它随后使用普通的
  `review.worktree.commenting.onSend`。固定头部增加 **Revert file**（`diff-revert-file`）。

  `DiffPane` 在每次范围/文件 revert 时发送两个渲染哈希。成功会抛出一个八秒的 toast，其 **Undo** 动作
  会带上回执 id 与 `receipt.after.hash` 发送 `change.undo`；一个被丢进垃圾桶的整个文件会说它已移到垃圾
  桶。`STALE_VIEW` 立即使用 `useLiveTabContent.reload()` 并说 “This file changed since you opened it —
  review the new diff”；`RECEIPT_UNKNOWN`（回执被淘汰、它的工作区被遗忘，或宿主在一个仍在屏幕上的 toast
  背后重启了）以同样的方式重新加载，并把 “This change can no longer be undone — the host no longer holds
  it” 作为信息而不是错误说出；其他每一种具名或未具名的失败都使用 `errorText`。提交 scope 绝不收到
  `hunkActions`，因此工具栏与 Revert file 都无法渲染。
- **Changes：List | Tree。** 一个头部开关（`store.changesView`，全应用 —— 持久化在 store 里，不按工作区，
  因此它能挺过工作区切换）在扁平 **List** 与文件夹 **Tree**（`ChangesTree`）之间切换，两者都由同一份
  `git.status` 列表构建。Tree 的样式与 Files 树完全一致（共享 `TreeRow`）；文件夹**默认展开**（变更集
  都很小），而一个单目录连续段是一条斜杠连接的紧凑行（基于变更文件树，不论磁盘上是否有未变更的兄弟），
  与 `FileTree` 一致。**状态显示在文件名上，而不是一个字母字形**（git 装饰的惯例 ——
  `changesModel.statusNameClass`，两种视图共享）：新增 / 未跟踪 → 绿色，删除 → 红色 + 删除线，重命名 →
  蓝色，修改 → 普通。每个文件显示一个 `+N −M` 徽章（共享 `DiffStatBadge`），而一个文件夹**只在折叠时**
  显示它的聚合徽章 —— 展开后它的子项已经携带计数 —— 逐文件计数来自 `git.status`
  （`GitFileChange.added/removed`，来自 `git diff --numstat`；未跟踪文件把它的整个内容算作新增 —— 但
  一个二进制或过大的未跟踪文件得不到计数，镜像着被跟踪的二进制如何从 `--numstat` 中掉出），文件夹计数
  在客户端求和。两种视图共享 `ChangesPanel` 的 `openDiff` + `isActive`。**List 显示完整的、工作树相对的
  路径** —— 弱化的目录前缀（当行溢出时它先让位）+ 状态着色的基名，因此用户扫读的名字保持可见。
- **浏览在每个中央分组复用同一个标签页：preview 对 keep。** 每个工作区视图为每个 frame 分组持有一个本地
  预览身份；它的标签是斜体并携带 `data-preview="true"`。单击一个文件/规范/变更行，或跟随一个渲染文档/
  聊天产物链接，会以 preview 打开到浏览器的最后聚焦目的分组。双击则保留；点击一个已经活动的预览作为触摸
  路径也会保留。一个显式的 Settings/open-as-file 动作以保留状态开始。聊天与已注册的计划/文档标签页绝不
  进入预览。标签条与上下文/命令表面也暴露一个可用键盘操作的 Keep Preview 命令。

  一个预览只替换那个分组同一位置上的槽位，因此浏览绝不重排标签条。一次双击先组合 preview 再提升；
  `openTabs.ts` 对底层读取做单飞，并把前导单击的槽位声明带进一次最终的保留本地转换，因此没有任何中间
  预览状态被持久化，网络延迟也无法让这些意图倒序。新鲜度戳记（`loadedTick`，外加一个 diff 的
  `loadedTarget`）在读取离开之前捕获，绝不来自响应时的更新状态。本地按分组的导航时钟在请求时捕获：一次
  陈旧的预览完成会输给更晚的注意力；刻意的保留仍然提交。如果目的分组消失了，外壳会重路由到当前最后焦点，
  而如果一次更新的本地转换已经放置了那个规范资源，完成时会选择那个放置而不是复制它。预览放置与注意力
  提交都在本地。单元与 E2E 测试钉住了双击合并、陈旧读取拒绝、按分组隔离、本地身份收敛，以及键盘/触摸
  提升。
- **行动作：一个菜单，两个触发件。** 每个**文件**行（两种视图）都包在 **`ChangeRowActions`** 里：一个
  悬停/聚焦显现的 `⌄` 按钮*和*在该行上右键打开同一个下拉。`⌄` 不是装饰 —— 它是**触摸路径**，那里不存在
  右键（移动优先）。项：**View**（与普通点击相同的动作）与 **Copy path**（工作树相对）。刻意没有别的：
  该面板是**只读的** —— 没有 discard-file/-folder/-all —— 也没有 “Open in ‹external app›”，因为一个
  宿主侧的 `open` 对每个远程/手机客户端都会静默地错（Copy path 是可移植的逃生口）。**文件夹行没有菜单**
  —— 那个列表里没有一项适用于文件夹。构建在已有的 `@thinkrail/ui/dropdown-menu` 上（没有新的
  `context-menu` 原语）；右键处理器通过一个 render prop 交回，因此它落在该行真正的交互元素上而不是一个
  光秃秃的 div，而 `⌄` 触发件是该行按钮的*兄弟*（按钮套按钮是非法的）。三条布局规则让那个包裹器隐形而
  不是一道接缝 —— 每条都由一个几何 e2e 断言钉住，因为每一条都是初稿交付时的真实 bug：
  **(1) 包裹器拥有该行的高亮**（悬停 / 选中 / 菜单打开），因为那条色带必须也跨过尾部槽位，否则一行会在
  自己的菜单之前读作被裁掉 —— 内层元素**完全不**绘制背景（扁平列表的按钮不携带任何 `hover:`/选中类，而
  `TreeRow` 取 `highlight="wrapper"`，其 `"self"` 默认值是 Files 树想要的）。始终恰好一个绘制者：两个会
  掩盖"包裹器停止绘制"这种情况，这就是为什么 e2e 钉住比较的是*包裹器*的计算色带与*内层按钮*的（透明）
  色带，而不是一个包裹器对另一个包裹器；**(2) 没有菜单的行保留同一条槽沟**（`ROW_MENU_SLOT`，从
  `ChangeRowActions` 导出，并由树的文件夹行佩戴），否则 `+N −M` 列在文件夹上会比在文件上右移 24px；
  以及 **(3) 一行与那个槽位共享它的 flex 行，因此它必须能收缩到标签之下** —— `TreeRow` 携带 `min-w-0`，
  而每条路径都渲染为*两个可截断的半边*（目录 + 基名），因此一个长基名绝不可能把计数（或者，在 `DiffPane`
  的孪生 chip 里，¶/复制/布局控件）挤出盒子。两个半边**不**是等可截断的：目录前缀在基名让出一个像素
  之前就**完全**让位，因为名字才是用户扫读的东西。这个次序是*结构性的* —— 目录是唯一可收缩的项
  （`shrink`），基名是 `shrink-0` —— 不是一个收缩*比例*。一个比例（这曾是 `shrink-[20]` 对 `shrink`）
  只能近似它：flex 按 factor × basis 的比例分摊缺口，因此基名总是丢掉一片，在小字号下是亚像素，在 14px
  下约 2px —— 这就是 UI 缩放提升后一个 12 字符的 `shortName.ts` 长出省略号的原因。e2e 钉住分别测量两个
  span，因此 "the dir yields first" 仍是一个测试可以证伪的断言。**单独**用 `shrink-0` 会让 chip **对布局
  隐形地**溢出，同时在屏幕上溢到按钮之上，因此基名把它与 `max-w-full` 配对：flex 绝不偷走名字的宽度，
  但 max-width 仍会把它钳到该行，这也是为什么 e2e 钉住测量的是*该 chip 的* `scrollWidth`，而不是头部的。
- **文件标签页使用与 diff 相同的渲染器分派。** `FilePane` 描述第一次 `fs.readFile` 的元数据（在它落地
  之前临时当作文本 —— 而对一个早于 `RESOURCE_META_PROTOCOL_VERSION` 且从不发送 `meta` 的宿主则永久当作
  文本，那正是该宿主自己的遗留表面，因此仅有字节的渲染不需要任何协议门禁）、解析 `view`，并挂载选中的
  惰性候选项。`thinkrail/markdown` 仍是对 `.md`/`.mdx` 排名更高的匹配，因此文档在 `MarkdownPreview` 中
  打开；`thinkrail/code` 是文本回退，在桌面用 Monaco、在手机类别视口用 Pierre `File`；
  `thinkrail/binary` 显示身份与一个宿主支撑的下载。仅凭候选列表就决定了资源开关是否存在。面板或标签页里
  不再残留任何格式谓词或 preview/source 字段。

  `MarkdownPreview` 保留上文描述的文档排版、frontmatter 剥离、提示块、Mermaid 渲染、源码行戳记、
  review 评论，以及有界的阅读宽度。这些是渲染器行为，不是分派策略。
- **渲染后的 markdown 会导航。** 在预览中，链接 + 图像针对文件自己的路径解析（经由 `markdownLinks`，
  作为 `a`/`img` 渲染器传入）：一个**相对链接**通过共享的 **`openFileInTab`** 在**预览**标签页中打开
  目标文件（与 `FileTree` 相同的流程）—— 跟随一个链接是浏览，因此槽位被复用，而不是像 VS Code 那样把
  源文档提升；一个被接受的文件目标是一个样式化为文档链接文本的按钮，绝不是一个带裸相对 `href` 的锚点，
  因为那个 URL 不是 ThinkRail 路由，原生导航会逃到 Main 页面；URL 路径名解码一次，两种路径分隔符形式在
  解析之前都规范化，而畸形编码与越过工作树根的穿越会产生一个惰性控件，而不是打开错误的文件；槽位就是
  槽位，无论这次打开来自哪里 —— 一个**文档内 `#` 链接**滚动预览（标题携带来自仓库内
  `remarkHeadingIds` 变换的 slug id），一个**外部**链接打开新标签页，而一个**相对图像**改写为宿主
  **`/files/…`** 路由（经由 `resourcePane.resourceBytesUrl` 注入 `documentComponents`，因此 markdown
  层绝不自己去够 transport）。跨文件链接的 `#fragment` 尚未被跟随（只打开该文件）。
- **文档 markdown 渲染经消毒的原始 HTML；聊天 markdown 不这样。** README 用
  `<p align="center"><img src width>` 放 logo 与横幅、用 `<img align="right">` 浮动图像、用
  `<details>` 折叠小节，并用 `<picture><source media srcset>` 交付随主题变化的 logo；当作字面标签显示时，
  那些文档恰好失去它们最显眼的内容。`markdownHtml.documentRehypePlugins` 先跑 `rehype-raw`，再在 GitHub
  的 `defaultSchema` 上跑 `rehype-sanitize`，带三处差异：仓库内 remark 变换发出的提示块元素
  （`mdalert` + `variant`）被允许，以及 `<source>` 保留 `srcset`/`media`/`type`/`sizes`。GitHub 的
  **`user-content-` clobber 前缀保持开启**，作用于每个 `id`/`name`（一个文档绝不能凭空造出
  `window.MonacoEnvironment`，或通过把一个元素命名成某个全局变量来遮蔽它），因此文档内的 `#slug` 链接
  经由 `scrollToAnchor` 解析，后者先试带前缀的 id，再试裸 slug。一切活跃或样式性的东西 —— `script`、
  `iframe`、`style`、事件处理器、内联 `style`、`javascript:` URL —— 都被丢弃，`data:` 图像随之而去
  （该 schema 的 `src` 协议是 http/https/相对）。原始 `<img>`/`<source>` 走与 markdown 图像相同的相对
  URL 改写，因此一个 README logo 从工作树加载；`srcset` 用 HTML 的候选语法解析
  （`srcsetCandidates`：URL 内的逗号、描述符括号），并且因为消毒器与 react-markdown 都不对 `srcset` 做
  协议检查，每个候选只作为工作树 URL 或 `http(s)`/协议相对 URL 才被重新接纳 —— `javascript:`/`data:`
  候选被丢弃，那些种类的裸 `src` 同样如此；`width`/`height` 存活，而 `align="left|right"` 映射到一个
  float 工具类，而不是一个表现性属性。用于评论的源码行戳记在消毒**之后**才加上，因此消毒器绝不可能把它们
  剥掉。聊天的 `Markdown` 原语不被触碰：模型输出不是用户撰写的文档。
- **桌面文件源码在同步的文件列处换行。** `MonacoEditor` 把 `fileLineWidth` 用作 `wordWrapColumn`（40–240，
  默认 120）。独立的 `fileLineWidthBounded` 默认映射到 Monaco 的 `wordWrap: "bounded"`，在挂载的文件面板
  处更早换行；关闭则映射到 `"wordWrapColumn"`，在更窄的面板里以水平滚动保住选定的列。广播变化会更新一个
  已挂载的桌面文件编辑器。Pierre 的 diff 与手机文件自己拥有水平溢出，不消费这份 Monaco 偏好。渲染的
  Markdown 与渲染的 Markdown diff 保留它们各自约 78ch 的阅读宽度。
- **桌面 Monaco 表面是一个阅读器，而不是一个语言工作站。** 它仅针对文件的选项保留配置好的换行、生成的
  代码排版、移除 minimap/概览标尺与 6px 无阴影滚动条，并加上只读提示语、把路径作为它的可访问标签、8px
  顶部内缩、三字符行号装订线、完整的活动行绘制、平滑滚动、活动括号对 + 缩进参考线、单文件出现高亮，以及
  歧义 Unicode 抑制。不透明的 `viewState` 只在它的编辑器状态形状被校验之后才恢复，并在卸载时保存，因此
  标签页切换会往返滚动与折叠。Monaco 从 `editor.api` 导入，只带阅读用的贡献（查找、折叠、括号匹配、上下文
  菜单/复制、链接、悬停、词高亮、粘性滚动、转到行/命令面板、只读提示与 Unicode 高亮）；保留词高亮保住了
  F7。TS/JS/JSON/CSS/HTML 的语言服务贡献及其 worker 都不在场，因此这个查看器按构造不发出任何语言服务诊断。
- **代码表面从通用 token 重新换肤，且抗故障。** `MonacoEditor` 拥有唯一的 `EDITOR_THEME`。主题拥有一份
  TextMate scope 定义：聊天使用它的实时 CSS 变量形式，而 Monaco 把同一份定义加上它完整的编辑器/部件/菜单/
  输入颜色映射解析成十六进制，加载进一个专用的 JS 正则 Shiki 高亮器，并每页安装一次 `@shikijs/monaco`。
  它精选的语言目录与聊天高亮器共享，并为桌面文件格式扩展；缺失的 Monaco 语言 id 会在 Shiki 安装提供商之前
  连同它们的文件关联一起注册。一次主题切换会在同一个名字下替换高亮器主题、重新定义 Monaco，并选中
  `EDITOR_THEME`。普通/高对比度的基底来自 manifest 的外观/对比度元数据 —— 绝不是一个已知 id —— 而显式
  映射之外的专门颜色仍保持继承。读取经过 `lib.cssColorToHex`；一个缺失或无法解析的 token 会被省略，因此
  选中的基底调色板胜出，而不是让面板崩溃。Pierre 那一个注册在 `thinkrail` 下的 CSS 变量 Shiki 主题发出
  变量引用而不是目录颜色；继承的 `--diffs-*` 属性把前景/语法映射到 `--code-*`、把画布映射到工作区/内容
  角色、把新增/删除涂色映射到反馈角色，因此一次主题切换不需要重新高亮。`TerminalInstance` 同样从完整的
  16 槽 ANSI 变量集重建。Monaco 与 xterm 在提供时消费那个可为空的编辑器选区前景覆盖值。
- **终端渲染器 + 字体测量。** `TerminalInstance` 刻意运行 xterm 的**默认 DOM 渲染器** —— `addon-webgl`
  *没有*被加载，而加载它会是一次倒退（见 `architecture.md` 的决策 #11：DOM 渲染器是触摸的前提，而
  `WebglAddon.dispose()` 会泄漏它的 WebGL2 上下文，我们按工作树的终端更替会撞上这一点）。插件确切就是
  `fit`、`clipboard`、`unicode11` 与 `web-fonts`；其他任何被钉住却未 import 的东西都是死重，也是给下一个
  读者的陷阱。`web-fonts` 是承重的而非装饰性的：我们的代码字体按字母表以 woff2 子集交付，因此西里尔/CJK
  文件会在 xterm 已经测量完字符单元*之后*才落地（它只在构造时测量一次，之后再也不测 —— 不像 Monaco 会
  重新测量一次不可信的早期读数）。没有这次重测，非拉丁字形会被渲染进为回退字体设定大小的单元里，而 PTY
  持有错误的列/行。因此初始附着会等待 `relayout()`、执行最后一次 `fit()`，然后才捕获 PTY 网格。这个等待
  **由截止时间约束**，因为被钉住的那个插件里的 `relayout()` 会等待 `document.fonts.ready` 外加每个已注册
  face 的 `FontFace.load()` —— 一次卡住的字体响应会让它无限期地保持*待定*（而不是被拒绝），而无界的等待
  会让面板空白且没有 shell。relayout 失败或截止时间到期会回退到构造时的测量，而不是让面板搁浅；到期时
  会先中和那个陈旧的 relayout（销毁该插件会跳过它重新测量的 `fontFamily` 切换），因此一个很晚才加载完的
  字体无法重新布局一个已经附着的终端。这个次序也防止了一次回退宽度的附着之后紧跟一次纠正性 resize 而产生
  快照后的 shell 重绘，那种重绘会擦掉重放出来的行。它的绑定前输出缓冲区是一个有界的等待状态：成功的绑定
  把它过滤到被采纳的 PTY，而创建失败会清空它并停止接受页面范围的终端帧。那次失败会把宿主稳定的指引渲染为
  转义后的 DOM 文本，而不是可执行的终端输出，并带 Terminal Settings 与 Retry 动作。失败的 xterm 子树是
  惰性的；一次显式重试让那个恢复表面保持挂载、其动作在请求落定之前保持禁用，保住焦点的同时不偷走无关的
  workbench 焦点。初始 xterm 焦点被推迟到一次成功附着之后，并且只在请求它的那个终端标签页仍拥有焦点时生效；
  Retry 在成功交接期间保持它的覆盖层挂载，并只在焦点仍留在那个终端区域时恢复 xterm 焦点。一次竞争的 detach
  会使那次交接失效，并在再次暴露 Take Back 之前清除它的重试状态。
  **历史重放是输入惰性的：** PTY id 在 xterm 的重放回调之前保持未被采纳，该回调会重新检查附着的鲜度，
  然后才绑定并排干真正实时的帧；因此 xterm 为录制的终端查询合成的回复绝不可能进入活的 shell。PTY 尺寸区分
  期望的、在途的与宿主已确认的网格；只有一次成功的 `terminal.resize` 才推进确认，因此重连重放无法让一个
  全屏应用永久停留在宿主从未应用过的请求尺寸上。16 个 ANSI 槽位来自主题的 `--ansi-*` 领域调色板（绝不是
  语义 UI 文本 token）；在此之上 xterm 运行一个**`minimumContrastRatio` 可读性下限**，由主题的对比度
  元数据驱动（普通 `4.5`，高对比度 `7`，位于 `panels/terminalContrast.ts`）。xterm 默认为 `1` 会禁用
  校正，这让接近终端背景的颜色（近黑深色画布上的 `black`）没有下限；该比率在不编辑调色板的情况下把已解析
  的前景对着实时背景抬升 —— 全部 16 个高对比度 ANSI 颜色都渲染为 ≥ 7:1，色相得以保留。该下限**无法**修复
  ANSI 的**暗色**（SGR 2）：xterm 把 dim 渲染成 50% 不透明度的前景，校正从不为那个本就高对比度的默认前景
  触发（Vite 的 `(client)` 标签是在*默认前景*之上 dim，而不是某个 ansi 颜色），而 50% 落在浅色画布上
  上限约 3.3:1。因此在**高对比度主题中，dim 属性会从终端输出里被剥离**（`stripAnsiDim`），把那段文本渲染
  成全前景对比度（≥ AA）。`terminalContrast.test.ts` 门禁复现 xterm 的颜色计算，把两个高对比度主题都保持在
  阈值上。**12px 内容内缩**住在 xterm **挂载宿主自己的盒子**上（绝对定位，每边 `inset-12`），而不是作为它
  的内边距 —— FitAddon 从该宿主测得的尺寸推导列/行，因此内边距会多算网格并裁掉最后一行/列；给盒子做内缩
  则让测量面积等于可见内容面积。
- **终端文本只有一个输入所有者。** 豆包输入法的英文模式仍报告 `keyCode=229`，且 `input` 可先于
  `keydown`；快速交叠按键会被 xterm 6.0.0 的 input 门禁吞掉（上游 #5887），229 的延迟 textarea
  差分还可能重复发送。因此 `terminalInputCompat` 在 xterm 元素的捕获阶段接管 textarea 的非组合态
  `insertText` 与 `deleteContentBackward`，普通可打印键的 keydown/keypress 不再由 xterm 发送，
  但不阻止浏览器编辑 textarea。229 不进入 xterm 的延迟差分路径；死键不遗留其内部待处理标志，
  修饰键产生的文本 keypress 也不能获得第二个发送出口。粘贴、导航与非 229 控制键仍由 xterm 处理。
  真正的中文组合由 xterm 拥有：compositionend 冒泡后，兼容层的收尾任务排在 xterm 的延迟提交之后，
  期间尾随 input 与紧接的文本仍由 xterm 从 textarea 一并提交，不能补发或清空 textarea；导航等
  会同步提交组合文本的按键则结束这一等待窗口。所有补偿均使用公开 `term.input(data, true)`，经
  `onData` 的活 PTY 门禁发送，历史重放隔离也不例外；不修改 xterm 私有字段或依赖源码。
  **IME 控制键救援**（上游 #6065）从物理 `event.code` 推导非组合态 229 的 `Ctrl+<letter>` 与
  `Escape`；若组合提交尚在排队，救援字节必须在组合文本之后发送。组合中不抢走输入法的控制键。
  单元测试与 `e2e/terminal-ime.spec.ts` 钉住输入所有权与组合提交时序；xterm 升级必须重跑这些回归。
  浏览器测试使用合成 IME 事件，不代替桌面原生输入法实测。
- 重型依赖（Monaco / shiki / xterm）通过 `React.lazy(() => import())` 加载，以留在急切打包之外。一个
  加载失败的惰性块（或一次渲染抛出）会被 **shell** 包裹每个区域所用的 `components/ErrorBoundary` 兜住
  （见 `shell/SPEC.md`），因此单个面板会降级而不是把应用整片变空；面板自己并不拥有该边界。
- 流式不变量（当聊天落地时）：`text_delta`/`thinking_delta` **追加（APPEND）**；
  `tool_execution_update.partialResult` **替换（REPLACE）**。
