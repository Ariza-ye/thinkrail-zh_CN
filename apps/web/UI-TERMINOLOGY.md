# ThinkRail UI 术语参考

ThinkRail Web UI（`apps/web`）的规范词汇表，供设计师、ChatGPT 以及
pi agent 在设计讨论中使用。

**本文档的范围与规则：**

- **仅限前端。** 记录 `apps/web` 当前已实现的样子 —— 唯一的事实来源。
- **描述性，而非规定性。** 不做重新设计，不提建议，不杜撰名称。当代码库
  中没有清晰的名称或命名不一致时，会用一条 **⚠ 命名说明** 明确标注出来。
- 每个区域在适用时会列出：**规范名称**（canonical name，即标题）、**实现名称**（implementation
  name，即 React 组件／文件）、**`data-testid`** 钩子（应用的稳定标识锚点）、**父级**、
  **子级**、**位置**、**职责**。
- 活动工作区布局把本窗口的前端本地框架与工作区视图投射为一张桌面工作台，其中包含可递归的中央分组与可移动的侧边分组。移动端单视图外壳已有设计但尚未实现。

本文档自上而下展开：应用布局 → 各个区域 → 共享基础组件 → 术语表。

---

# 应用布局（Application Layout）

整个应用由一个根组件组合而成，并拆分为固定的顶部栏，以及其下具有两个互斥状态的主体。

- **App Shell** —— 根框架（`Shell`）。
  - **Top Bar**（`<header>`）—— 始终存在。
  - **Body** —— 两种状态之一：
    - **Workspace Workbench** —— 本窗口本地框架与活动工作区视图的投射。
    - **Welcome Layout** —— 没有活动工作区时，欢迎页旁边的项目栏。
  - **Toaster** —— 应用级通知宿主，在任一状态之上只挂载一次。

| 规范名称 | 实现 | `data-testid` | 备注 |
|---|---|---|---|
| App Shell | `shell/Shell.tsx` → `Shell` | `shell` | 组合根；负责主题 DOM 副作用 + 全局快捷键 |
| Top Bar | `Shell` 内部的 `<header>` | — | ⚠ 见下方命名说明 |
| Workspace Workbench | `shell/WorkspaceWorkbench.tsx` + `shell/layout/Workbench.tsx` | `workbench` | 一个窗口本地框架；工作区专属的资源投射 |
| Welcome Layout | `ResizablePanelGroup`（`autoSaveId="thinkrail-shell-welcome"`） | — | 项目栏 + 欢迎页 |
| Toaster | `panels/Toaster.tsx` → `Toaster` | — | 见「共享 UI 基础组件」 |

**⚠ 命名说明（Top Bar）：** 代码中没有为这个头部提供组件或具名 prop —— 它是 `Shell.tsx` 里一个内联的
`<header>` 元素。本参考称之为 **Top Bar**。不要把它与 **Chat Header**（每个聊天标签页各自的横栏）
或 **Group Header**（工作台的标签条）混淆。

---

# 顶部栏（Top Bar）

横跨最顶部的应用级横栏。它与布局无关（在两种主体状态下都存在）。

- **父级：** App Shell。
- **位置：** 通栏宽度，位于顶部；主体之上的固定行（`grid-rows-[auto_1fr]`）。
- **实现：** `shell/Shell.tsx` 中的内联 `<header>`。

子级（从左到右）：

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Logo | `<BrandLogo />`（所提供的完整矢量图形） | `brand-logo` | 跟随主题的 ThinkRail 品牌标识 |
| Scope Context | `Shell.tsx` 中的内联块 | `scope-context` | 常驻的位置面包屑；有活动工作区时显示两行 |
| — Scope Project | 内联 `<span>` | `scope-project` | 所属项目名称 |
| — Scope Name | 内联 `<span>` | `scope-name` | 活动工作区的显示名，或 `"Project home"` |
| — Scope Branch | 内联 `<span>` | `scope-branch` | 活动工作区的 Git 分支 |
| — Scope Base | 内联 `<span>` | `scope-base` | `· from <baseBranch>`（在 Default 工作区中隐藏） |
| Connection Status | 内联 `<span>` | `connection-status`（`data-status`） | 带颜色圆点的胶囊标签：Connected / Connecting… / Disconnected |
| Settings Button | 内联 `<button>`（齿轮图标，来自 `@remixicon/react` 的 `Settings`） | `open-settings` | 通过 `store.openSettings()` 打开 Settings Dialog |

**⚠ 命名说明（Scope Context）：** `data-testid` 是 `scope-context`，而规范文本称它为
“location context”。本参考采用 **Scope Context** 作为规范名称；“location context” 是
散文中使用的另一种叫法。

---

# 项目工具（Projects Tool）

单例的 Projects 工具，初始位于左侧。它的 Projects Rail 视图列出项目，并在每个项目下方展开显示其工作区。

- **规范名称：** Projects Tool；其导航视图名为 **Projects Rail**。
- **实现：** `panels/ProjectTree.tsx` → `ProjectTree`，由外壳的 Projects 工具渲染。
- **`data-testid`：** 工具主体外层是 `left-nav`。
- **父级：** Workspace Workbench（一个可移动的单例侧边工具），或 Welcome Layout。
- **位置：** 初始位于左侧；其所在分组可以调尺寸、折叠、隐藏或移动。
- **职责：** 打开一个仓库、选择一个项目（这是一种 “project home” 手势，会取消选中任何活动的
  工作区）、关闭项目、展开／折叠以显示工作区、创建／选择／移除工作区，以及在外部编辑器／
  文件管理器中打开工作区。

**⚠ 命名说明（Projects Tool）：** 旧名称仍然并存 —— 组件是 `ProjectTree`，其导航视图
是 **Projects Rail**，兼容性测试 id 是 `left-nav`。因为该工具可以移动，所以“Left Nav”
和“Left Sidebar”都不能描述其持久位置。

子级：

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Add-Project Button / Menu | `panels/AddProjectMenu.tsx` → `AddProjectMenu`（项目栏上的 “+”） | `add-project-menu` | Open project / Open GitHub（即将推出）/ Recents 下拉菜单 |
| Project Row | `ProjectTree` 中的内联行 | `project-item` | 一个项目（git 仓库）；点击即选中它（project home） |
| — Project Expander | 折叠箭头控件 | `project-expand` | 展开／折叠该项目的工作区列表 |
| — Project Name | 内联 `<button>` | `project-name` | 选中该项目（project home） |
| — Workspace Count | 内联 `<span>` | `project-workspace-count` | 折叠行上显示该项目 worktree 工作区的数量 |
| — Add-Workspace Button | 内联 “+” | `add-workspace` | 打开 New Workspace Dialog |
| — Project Actions Menu | 行上的 Context Menu | `project-actions` | Create workspace（`project-menu-create-workspace`）/ Close project（`project-menu-close`） |
| Workspace Row | `ProjectTree` 中的内联行 | `workspace-item` | 一个工作区（git worktree）；两行：名称 + 分支 |
| — Workspace Name | 内联 `<span>` | `workspace-name` | 显示名称 |
| — Workspace Branch | 内联 `<span>` | `workspace-branch` | Git 分支（弱化色、比例字宽的元数据；与名称相同时隐藏） |
| — Working Badge | `components/RunningIcon.tsx` → `RunningIcon` | `running-icon` | 行内会话运行期间，代替该行身份图标显示的实时 TR 品牌徽标（项目行上也如此）；标签 “Agent working” |
| — Attention Dot | `components/AttentionDot.tsx` → `AttentionDot` | `attention-dot` | 用于 needs-input / 未读结果的静态强调圆点；标签 “Needs attention” |
| — Workspace Actions Menu | `MoreVertical` Dropdown Menu | `workspace-menu` / `workspace-actions` | Open in（`workspace-open-in`）/ Copy path / Reveal / Remove workspace |
| — Remove-Workspace Item | 操作菜单中的菜单项 | `workspace-remove` | 打开 Confirm Dialog；在 Default 工作区上不显示 |

**Default Workspace** 行（`kind === "default"` —— 即项目文件夹本身）固定在最前面，用
`House` 图标代替 `GitBranch` 字形，并且没有 Remove 项 —— 但它得到与任何 worktree 相同的
Open in / Copy path / Reveal 菜单。

---

# 欢迎页（Welcome Screen）

在没有活动工作区时显示在 Welcome Layout 的右栏中（全新安装，或归档最后一个工作区之后）。
与 Workspace Workbench 互斥。

- **规范名称：** Welcome Panel（又称 Welcome Screen）。
- **实现：** `panels/WelcomePanel.tsx` → `WelcomePanel`。
- **父级：** App Shell（Welcome Layout，`id="welcome"` 面板）。
- **位置：** 位于 Projects Rail 旁边宽右栏中的居中内容。
- **职责：** 首次接触面 + **模式分叉** —— 将 “Start building”（隔离的 worktree）与
  “Work in project folder”（Default 工作区）配对呈现。

子级：

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Welcome Heading | 内联主标题 | `welcome-title` | 项目名称；没有项目时为 `PRODUCT_NAME` |
| Provider Warning Banner | `panels/ProviderWarningBanner.tsx` → `ProviderWarningBanner` | — | 仅在没有任何提供商连接时显示的金色横幅 |
| Project Trust Notice | `panels/ProjectTrustNotice.tsx` → `ProjectTrustNotice` | `project-trust-notice` | 工作区之前的信任确认面，说明一次授权会加载什么，并带有 Stop trusting |
| Primary Card (CTA) | `WelcomePanel` 中的 `Card` | `welcome-cta` | 填充主色的操作 |
| Action Card | `WelcomePanel` 中的 `Card` | `welcome-action` | 低调的次要操作 |

---

# 中央工作台（Center Workbench）

中央工作区是一棵由一至四个标签页分组构成的递归树。每个分组都有自己的 **Group Header**（标签条加上
分组控件）、选中项、预览槽位和主体；水平或垂直分隔条可调整相邻分组的尺寸。

- **规范名称：** Center Workbench（又称 Center Tabbed Area / Editor Area）。
- **实现：** `shell/layout/Workbench.tsx`（拓扑与容器外观），由
  `shell/WorkspaceWorkbench.tsx` 集成（功能主体与本地状态编排）。
- **`data-testid`：** 兼容性外层是 `center-tabs`；叶子是 `center-group`，Group Header 是
  `center-tab-strip`（一个遗留名称），分隔条是 `center-split-resize`。
- **父级：** Workspace Workbench。
- **职责：** 承载 **File**、**Chat**、**Diff**、**Changes review**、可重建的 **Document** 以及
  **Terminal** 标签页；负责递归放置、按分组区分的 preview/keep 语义、移动、溢出以及
  焦点恢复。

**⚠ 命名说明（标签页元素）：** file/chat/diff/changes/document 标签页带 `data-testid="editor-tab"`；terminal
放置项带 `terminal-tab`。资源种类也可通过 `data-kind` 获得。“Editor tab” 是一个兼容性测试钩子，
而不是种类。

子级：

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Center Group | `Workbench` 中的 `CenterGroupView` | `center-group` | 一个叶子：标签条 + 本地选中的主体 |
| Group Header | `Workbench` 中的 `TabStrip` 加上注入的分组控件 | `center-tab-strip` | 固定的单行外观，包含 ARIA tablist、滚动、可搜索的溢出列表以及分组操作 |
| Tab | `WorkbenchTab` | `editor-tab` / `terminal-tab` | 一个规范放置项；`data-preview` 标记预览 |
| — Tab Close | 内联 `X` 操作 | `editor-tab-close` | 关闭该放置项（而非底层的持久资源） |
| New-Chat Button | 注入的中央操作 | `new-chat` | 打开一个新的聊天标签页 |
| Chat-History Menu | `shell/WorkspaceChatHistory.tsx` | `chat-history` | 重新打开或删除已关闭／仅存在于磁盘的聊天 |
| Editor Pane | 注入的选中主体 | `editor-pane` | 本地选中的中央主体 |
| Workspace-Ready Receipt | 注入的空状态 | `workspace-ready` | 当最终中央叶子为空时的引导回执 |
| — Start-Chat Action | 内联操作 | `start-chat` | 从空回执中新建聊天 |

标签页主体组件：

| 规范名称 | 实现 | 标签页类型 | 职责 |
|---|---|---|---|
| File Pane | `panels/FilePane.tsx` → `FilePane` | `FileTab` | 由注册表分派的文件查看器；更丰富的格式带渲染器切换 |
| — Code File | `panels/MonacoEditor.tsx` / `panels/resources/code/PierreFile.tsx`（懒加载） | — | 桌面端为只读 Monaco 源码，手机端为 Pierre 源码 |
| — Markdown Preview | `panels/MarkdownPreview.tsx` → `MarkdownPreview`（懒加载） | — | 渲染后的 markdown（文档皮肤） |
| Diff Pane | `panels/DiffPane.tsx` → `DiffPane` | `DiffTab` | 文件差异；Split\|Inline 或 Source\|Rendered 切换 |
| — Source Diff | `panels/resources/code/PierreDiff.tsx`（懒加载） | — | 只读的 Pierre 分栏／统一源码差异，带审查与 hunk 操作 |
| — Rendered Diff | `panels/RenderedDiff.tsx` → `RenderedDiff`（懒加载） | — | 富文本 markdown 差异（`<ins>`/`<del>`） |
| Changes Review Pane | `panels/ChangesReviewPane.tsx` → `ChangesReviewPane` | `ChangesTab` | 一个范围内每一个变更文件都作为一个节；**Stacked** \| **One file** 模式（见下方单独小节） |
| Chat View | `chat/ChatView.tsx` → `ChatView`（懒加载） | `chat` | agent 对话（见下方单独小节） |
| Document Pane | `WorkspaceWorkbench` 的引用渲染器 | `document` | 可重建的虚拟文档，例如 TODO 计划 |
| Terminal Body | `panels/TerminalWorkbench.tsx` → `TerminalWorkbenchBody` | `terminal` | 受可见性门控的 xterm 表面 |

---

# 聊天视图（Chat View）

agent 对话，渲染在 Center Tabbed Area 中的一个 Chat 标签页内。

- **规范名称：** Chat View。
- **实现：** `chat/ChatView.tsx` → `ChatView`（唯一的应用集成部分；接上 store +
  传输层）。它下面的所有渲染器都是展示型／由 props 驱动的。
- **父级：** Center Workbench（选中的 `chat` 标签页主体）。
- **位置：** 填满 Editor Pane。纵向：Chat Header（顶部）→ Message List（中部，可滚动）→
  Composer（底部）。
- **职责：** 把 pi 的规范消息／内容块模型渲染成折叠行；负责输入框、历史记录浮层以及各类对话框。

## 聊天头部（Chat Header）

- **规范名称：** Chat Header。
- **实现：** `chat/ChatHeader.tsx` → `ChatHeader`。
- **父级：** Chat View。
- **位置：** Chat View 顶部的细横栏。
- **子级／槽位：**
  - **Status Entries** —— 内联的弱化色 `statusEntries` 文本（扩展状态）。
  - **Session Stats Bar** —— `chat/SessionStatsBar.tsx` → `SessionStatsBar`（token／成本统计）。
  - **Resources Trigger** —— `chat/resources/ResourcesButton.tsx` → `ResourcesButton`
    （`data-testid="resources-trigger"`）；活动资源计数 —— 实时工作加上已连接／正在启动的 MCP
    服务器（或在计数不具权威性时显示 `—`）—— 有工作时会呼吸式脉动；切换
    **Resources Inspector**。它旁边是 **MCP Attention Marker**（`ResourcesAttention`，
    `resources-mcp-attention`），当某个服务器需要登录、失败或等待审批时，它会打开
    Settings › MCP servers。
  - **Skills Button** —— `chat/SkillsButton.tsx` → `SkillsButton`（`data-testid="open-skills"`）；打开
    **Skills Dialog**（`chat/SkillsDialog.tsx` → `SkillsDialog`）。

## 资源（Resources）

当前聊天在后台运行的命令与子代理，通过一套行语法渲染在由 `chat/resources/` 拥有的三个
表面上。

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Resources Trigger | `resources/ResourcesButton.tsx` → `ResourcesButton` | `resources-trigger`（`data-active-count`） | 检查器的头部开关；实时计数 |
| Resources Dock | `resources/ResourcesDock.tsx` → `ResourcesDock` | `resources-dock`（`resources-dock-toggle`） | Composer 上方的实时行；检查器打开时隐藏；超过四行即折叠 |
| Resources Inspector | `resources/ResourcesInspector.tsx` → `ResourcesInspector` | `resources-inspector` | 覆盖在 Message List 之上的非模态就地对话框：名单（Active / Finished / MCP servers）+ 选中行的详情 |
| MCP Server Row | `resources/mcpRow.tsx`（私有） | `resource-mcp`（`data-name`、`data-state`；`resource-mcp-state`、`resource-mcp-disable` / `-enable` / `-reconnect` / `-settings`），紧邻节标题的 Settings 链接 `resources-mcp-settings` | 检查器第三节中该聊天的某个 MCP 服务器：状态标签、工具数量、传输层、按聊天区分的操作 |
| Resource Row | 停靠区与检查器内共用的行 | `resource-command` / `resource-subagent`（`data-resource-id`、`data-status`、`data-state`） | 一条命令或一个子代理：字形 · 名称 · 活动 · 状态 · 耗时。在停靠区中，名称与活动是一个 Inspect 按钮（`resource-inspect`）；在检查器中，行外层（`data-selected`）容纳一个 listbox 选项（名称 · 状态 · 耗时位于一行被截断的活动行之上；无障碍名称为 `name: activity, state`）以及它旁边的 Stop。Stop 在悬停与聚焦时出现（`resource-stop`） |
| Command Log View | `resources/CommandLogView.tsx` → `CommandLogView` | `command-log-output` / `command-log-unavailable` | 有界的纯文本输出；检查器中命令的详情主体 |
| Subagent Transcript Pane | `chat/SubagentTranscriptDialog.tsx` → `SubagentTranscriptPane` | `subagent-transcript` | 只读的子级对话记录；检查器中子代理的详情主体（也是 Subagent Transcript Dialog 的主体） |
| Stop-All Action | 检查器中的名单头部 | `resources-stop-all` → `resources-stop-all-confirm` | 在一次明确说明数量的确认之后，停止本聊天活动的子代理 |
| Still-Running Chip | `chat/turns.tsx` 中的 `TurnDivider` | `turn-divider-running` | 最新轮次分隔条上的 “N still running”；打开检查器 |

## 消息列表（Message List）

- **规范名称：** Message List（又称 Transcript）。
- **实现：** `ChatView` 中的一个 `react-virtuoso` `Virtuoso`，通过 `chat/rows.ts`（`deriveRows`）
  渲染 **派生行**，并由 `chat/turns.tsx` → `ChatTurnView` 分派。
- **父级：** Chat View。
- **位置：** 头部与输入框之间的可滚动的中部区域。
- **职责：** 把 pi 的轮次渲染成带渐进披露的折叠行。

**⚠ 命名说明（Message vs Turn vs Row）：** 代码区分三个层级。一个 **Turn**（`ChatTurn`）是 pi 的
消息级单位；一个 **Row**（`ChatRow`）是派生的渲染单位（折叠会跨越轮次边界）；每个被渲染的
消息元素都带 `data-testid="chat-message"` 和一个 `data-role`。渲染单位用 **Row**，pi 消息用
**Turn**；“Message” 是通用的表面术语。

行／消息渲染器（除特别说明外均在 `chat/turns.tsx` 中）：

| 规范名称 | 实现 | `data-testid` | 行类型 | 职责 |
|---|---|---|---|---|
| Turn Dispatcher | `ChatTurnView` | — | — | 把一个派生行分派给它的渲染器 |
| User Message | `UserTurn` | `chat-message`（`data-role="user"`） | `user` | 一个用户提示词气泡 |
| Assistant Markdown | `chat/Markdown.tsx` → `Markdown` | — | `markdown` | 助手文本（GFM + shiki） |
| System Notice | `SystemTurn` | `chat-message` | `system` | Web 本地的系统提示 |
| Error Turn | `ErrorTurn` | `chat-message` | `error` | 持久的着色失败提示（绝不折叠） |
| Retry Indicator | `RetryIndicator` | `retry-indicator` | `retry` | 重试倒计时（轮次／摘要） |
| Tool Card | `chat/ToolCard.tsx` → `ToolCard` | `tool-card`（`-toggle`） | `tool` | 一个主要工具调用（可折叠框架） |
| Activity Group | `chat/ActivityGroup.tsx` → `ActivityGroup` | — | `activity` | 折叠的例行步骤串（“N steps · …”） |
| Turn Divider | `TurnDivider` | `turn-divider` / `turn-divider-<id>` | `divider` | 轮次结束摘要 + 产物芯片 |
| — Artifact Chip | `ArtifactChip` | `turn-divider-specs` / `turn-divider-files` | — | “N specs” / “N files changed” 深链／展开；带主机轮次回执时，文件芯片显示 `N files changed · +a −r` |
| — Artifact List | `ArtifactList` | `<testid>-list` / `-list-item` | — | 展开的按路径列表（从回执得到每个文件的 `+/−`） |
| — Review-Turn Chip | `TurnDivider` 中的内联 | `turn-divider-review` | — | “Review turn”：在该轮次的范围内打开 Changes Review Tab（仅回执时） |
| Stream Indicator | `chat/StreamIndicator.tsx` → `StreamIndicator` | `stream-indicator` | — | 实时流式状态：Working Badge + 阶段标签（“Thinking…”、“Running bash…”） |

## 工具调用（Tool Call）

- **规范名称：** Tool Card（框架）；Tool Renderer（主体）。
- **实现：** `chat/ToolCard.tsx` → `ToolCard`（可折叠框架），主体通过
  `chat/toolRegistry.tsx` → `registerToolRenderer` 注册。未注册的工具会回退到
  `DefaultToolRenderer`。
- **父级：** Message List（一个 `tool` 行），或某个 Activity Group 的步骤行（例行工具）。
- **职责：** 渲染一次工具调用；“card” 外观使用 `ToolCard`，“bare” 外观自带
  框架。

内置工具渲染器（除特别说明外位于 `chat/tools/` 中）：

| 规范名称 | 实现 | 显著度 | 职责 |
|---|---|---|---|
| Bash Card | `BashCard.tsx` → `BashCard` | 例行 | 终端命令块 |
| Read Card | `ReadCard.tsx` → `ReadCard` | 例行 | 文件读取（路径 + 高亮后的文件） |
| Write Card | `ReadCard.tsx` → `WriteCard` | 例行 | 文件写入 |
| Edit Card | `EditCard.tsx` → `EditCard` | 例行 | 编辑（删除／新增行的差异） |
| Ask-User-Question Card | `AskUserQuestionCard.tsx` → `AskUserQuestionCard` | 主要，“bare” | 内联问卷 |
| Visualization Card | `thinkrail-extensions/visualize/web/` → `VisualizationCard` | 主要，展开 | Mermaid 图／对比卡片 |
| Web Card(s) | `tools/web/` | 例行 | 搜索／抓取渲染器 |
| Default Tool Renderer | `DefaultToolRenderer` | 例行 | 未注册工具的兜底渲染器 |

## 输入框（Composer）

- **规范名称：** Composer。
- **实现：** `chat/Composer.tsx` → `Composer`。
- **父级：** Chat View。
- **位置：** Chat View 的底部。
- **职责：** 提示词输入 + 发送／steer／followUp／中止、`@` 提及、`/` 斜杠命令、
  模板槽位会话、图片粘贴／拖放、`↑` 召回，以及打开历史的入口。

子级／相关表面：

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Model Selector | `chat/ModelSelector.tsx` → `ModelSelector` | — | 模型选择器（+ Refresh catalog） |
| Thinking Selector | `chat/ThinkingSelector.tsx` → `ThinkingSelector` | — | 思考／投入程度选择器 |
| Slash-Command Menu | `chat/SlashCommandCompletion.tsx` → `SlashCommandMenu` | `slash-templates-empty`（页脚） | `/` 命令 + 模板补全 |
| Send Button | 内联（`ArrowUp` / `Square` 中止） | — | 发送／steer／follow-up／中止 |
| History-Open Button | 内联（`History` 图标） | `history-open` | 打开 History Overlay |
| Slot Hint Chip | 内联胶囊 | `slot-hint` | 模板槽位会话进度（`slot n/m · ⇥ next · esc done`） |
| Slot Highlight | 内联背景 span | `slot-highlight`（`data-slot-state`） | 着色的模板槽位范围 |

## 历史记录浮层（History Overlay）

- **规范名称：** History Overlay。
- **实现：** `chat/HistoryOverlay.tsx` → `HistoryOverlay`，由 `chat/useHistorySearch.ts` 驱动。
- **父级：** Chat View（由 Composer 或 `Ctrl+R` 打开）。
- **职责：** 历史召回／搜索；紧凑的单列，按 `Tab` 会撑开为双栏的放大
  布局（结果 + 预览）。

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Results List | `HistoryOverlay` 内部 | `history-results` | 提示词／消息命中项 |
| Preview Pane | `HistoryOverlay` 内部 | `history-preview` | 选中命中项的完整文本 |
| Scope Picker | `HistoryOverlay` 内部 | `history-scope` / `-option` | This chat / Workspace / Project / Everywhere |
| Jump Action | `HistoryOverlay` 内部 | `history-jump`（`-shortcut`） | 跳转到聊天 |
| Save-as-Template Action | `HistoryOverlay` 内部 | `history-save-template`（`-shortcut`） | 打开 Template Editor Dialog |

## 聊天计划（Chat Plan，TODO plan）

- **规范名称：** Chat Plan。
- **实现：** `chat/TodoList.tsx` → `TodoList` + `panels/PlanRailPane.tsx` → `PlanRailPane`
  （侧栏主体）+ `panels/PlanPane.tsx` → `PlanPane`（中央标签页页面，通过 `openPlan` 打开）。
- **父级：** 紧凑 TODO 列表位于右侧栏工具（`plan`）；文档规模的 Plan 页面位于中央编辑器标签页。
- **职责：** 呈现该聊天的 `pi-todos` 计划（分组优先、按状态排序）。TODO 列表
  是位于 Files / Specs / Changes / Review 旁边的侧栏工具。

---

# 变更审查标签页（Changes Review Tab）

针对单个差异范围的连续审查表面：该范围内的每一个变更文件都作为一个 **File Section** 呈现在
一个中央标签页中。单击 Changes 中的某一行，或点击聊天中的 **Review-Turn Chip**，即可打开它；
Changes 工具是它的导航器。

- **规范名称：** Changes Review Tab；其主体是 **Changes Review Pane**。
- **实现：** `panels/ChangesReviewPane.tsx` → `ChangesReviewPane`，每个文件渲染
  `panels/ChangesFileSection.tsx` → `ChangesFileSection`，并渲染 `panels/ChangesReviewGuide.tsx` →
  `ChangesReviewGuide` 侧栏。
- **`data-testid`：** 主体为 `changes-review`；其标签页是带 `data-kind="changes"` 的 `editor-tab`。
- **父级：** Center Workbench（选中的 `changes` 标签页主体；每个工作区 + 范围一个）。
- **位置：** 填满 Editor Pane。纵向：Review Toolbar（顶部）→ 各节（中部，可滚动）→ Triage
  Bar（底部，仅 Stacked）；Review Guide 是各节左侧的侧栏。
- **视图模式：** **Stacked**（默认；所有节在一个虚拟化列表中）与 **One file**（在 Walk Bar
  下一次一节），由工具栏的 Stacked\|One file 分段控件选择，并在全应用范围内保持。
- **职责：** 按需把每个文件的差异读成一个节，保持标签页的 viewed／collapsed／kept
  状态，并引导审查者走完整个范围。

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Review Toolbar | `ChangesReviewPane` 中的内联 `role="toolbar"` | `changes-review-toolbar` | 范围 + 目标（`changes-review-scope`）、`N files · +N −M · n/N viewed`（`changes-review-summary`、`changes-review-viewed-count`），以及下列控件 |
| — Send Review | `SendAllReviewsButton` | `changes-review-send` | “Send review (N)” |
| — Collapse / Expand All | `HeaderIconButton` | `changes-review-collapse-all` / `changes-review-expand-all` | 一次作用于所有节（仅 Stacked） |
| — Review Guide Toggle | `HeaderIconButton` | `changes-review-guide-toggle` | 显示／隐藏 Review Guide |
| — Whitespace Toggle | `HeaderIconButton`（¶） | `changes-review-toggle-whitespace` | 隐藏空白变更 |
| — Diff View Toggle | `ToggleSegment` | `changes-review-toggle-split` / `changes-review-toggle-inline` | Split \| Inline（仅桌面端） |
| — Layout Toggle | `ToggleSegment` | `changes-review-layout-stacked` / `changes-review-layout-single` | Stacked \| One file |
| File Section | `ChangesFileSection` | `changes-section`（`data-path`、`data-status`、`data-collapsed`、`data-viewed`） | 一个变更文件：头部 + 按需读取的差异主体，与 Diff Pane 一样分派 |
| — Section Header | 内联；在 Stacked 中吸顶 | `changes-section-header` | 折叠箭头（`changes-section-toggle`）、状态、路径（`changes-section-path`）、`+N −M`、`k/n kept`（`changes-section-kept`）、渲染器分段控件、Revert file（`changes-section-revert`）、Open as tab（`changes-section-open-tab`）、操作菜单（`changes-section-menu`） |
| — Viewed | 内联切换按钮 | `changes-section-viewed`（`aria-pressed`） | 标记该文件在此标签页中已查看 |
| — Collapsed Notice | 内联 | `changes-section-collapsed` / `changes-section-expand` | 过大或自动生成的文件默认折叠：Expand / Open as tab |
| — Section states | 内联 | `changes-section-loading` / `changes-section-error` / `changes-section-retry` | 预留高度的占位；读取失败 + Retry |
| Hunk Toolbar | `panels/resources/code/PierreDiff.tsx` 中的 `HunkToolbar` | `hunk-toolbar`（`data-kept`） | 按 hunk 的 Source Diff 操作：Revert（`hunk-revert`）、Ask agent（`hunk-ask-agent`） |
| — Keep | 内联切换按钮 | `hunk-keep`（`aria-pressed`） | “Keep” / “Kept” hunk 分诊；仅在可变范围中的审查标签页 |
| Triage Bar | `ChangesReviewPane` 中的内联（Stacked） | `changes-review-triage` | 底栏：`n of N reviewed` |
| — Progress Bar | 内联 | `changes-review-progress` | 已查看比例 |
| — Next Unreviewed | 内联按钮 | `changes-review-next-unreviewed` | “Next unreviewed” 文件（`J`，循环） |
| — Mark All Viewed | 内联按钮 | `changes-review-mark-all` | “Mark all viewed” |
| Walk Bar | `ChangesReviewPane` 中的内联（One file） | `changes-review-walk` | 上一个／下一个文件（`changes-review-prev` / `changes-review-next`，`Alt+↑` / `Alt+↓`）、`n / N`（`changes-review-counter`）、Mark viewed（`changes-review-mark-viewed`，`V`） |
| Review Guide | `ChangesReviewGuide` | `changes-review-guide` | “Review guide” 左侧栏（Stacked，手机上不显示），当审查有 guide 或有未解决的 agent 发现时显示：结论 + 摘要（`changes-review-guide-summary`） |
| — Guide Step | 内联按钮 | `changes-review-guide-step`（`data-active`） | 一个 “Suggested reading order” 步骤；当它的文件在范围之外时禁用 |
| — Guide Finding | 内联卡片 | `changes-review-guide-finding`（`data-active`） | 一条未解决的 agent 发现；“Fix this one”（`changes-review-guide-fix`） |
| — Guide Prev / Next | 内联按钮 | `changes-review-guide-prev` / `changes-review-guide-next` | 走查这些步骤：Start / Next / Restart（`N`；`P` 返回） |
| — Apply Fixes | 内联按钮 | `changes-review-guide-apply` | “Apply fixes”：把所有未解决的发现发送给 agent |
| Large-Scope Notice | 内联 | `changes-review-large-notice` | 超过 50 个文件：提供 One file；可关闭 |
| End Note | `ReviewListFooter` | `changes-review-end` | Stacked 列表尾部的 “End of changes · N files” |
| Empty / Error states | 内联 | `changes-review-empty` / `changes-review-error` / `changes-review-retry` / `changes-review-all-changes` | 该范围内没有变更；读取失败 + Retry；提交或轮次快照已消失的范围 + Review all changes |

---

# 侧边工作台（Side Workbench）

左侧和右侧是各自可独立调整尺寸的区域。每一侧都包含一组按顺序纵向堆叠的标签页分组；
分组可以调整尺寸、折叠成 27px 的行、移动，并在为空时消失。隐藏某一侧后会留下一条
紧凑的恢复栏。侧边排布在工作区范围内共享；选中与焦点是浏览器本地的。

- **规范名称：** Left Side、Right Side、Side Group、Hidden-Side Rail。
- **实现：** `shell/layout/Workbench.tsx`（`SideStack`、`SideGroupView`）。
- **`data-testid`：** `left-stack`、`right-stack`、`left-layout-rail`、`right-layout-rail`、
  `side-group-fold`，以及各侧专属的分组尺寸调整手柄。
- **父级：** Workspace Workbench。
- **职责：** 安排单例外壳工具与终端，而不把功能面板与其位置耦合。
  文件、差异、聊天与文档仍只出现在中央；终端可以跨域。

每个 Side Group 都有一个 **Group Header**；折叠时会把这个头部保留成 27px 的行，而其关联
主体保持原生隐藏且未挂载。初始的 Balanced 排布把 Projects 放在左侧，Specs 与
Files 放在右侧第一组，然后是 Changes 与 Review 在第二组；默认的终端清单加入最后
这一组。这是启动行为，而不是固定的层级。

## 侧边工具（Side Tools）

| 规范名称 | `data-testid` | 实现／职责 |
|---|---|---|
| Projects | `tab-projects`，主体 `left-nav` | `panels/ProjectTree.tsx`；项目与工作区 |
| Specs | `tab-specs` | `panels/SpecsPanel.tsx`；自动刷新的只读规范图，带仅用于错误的 `specs-retry` |
| Files | `tab-files` | `panels/FileTree.tsx`；worktree 文件树 |
| Changes | `tab-changes` | `panels/ChangesPanel.tsx`；范围内的 git 变更、Changes Review Tab 导航器、差异打开 |
| Review | `tab-review` | `panels/ReviewPanel.tsx`；审查手风琴与发送操作 |

`WorkspaceWorkbench` 持有长期存活的 Specs 与 Review 读取，因此即使这些工具主体未被选中，
徽标、审查标记与产物分类也保持最新。

## 变更工具（Changes Tool）

Changes 主体保留自己的功能工具栏：范围菜单、目标分支选择器，以及 List\|Tree 切换
（默认 Tree）。单击某一行会打开该范围的 **Changes review tab** —— 每个变更文件作为一个
堆叠的节，或在 **One file** 模式下逐个显示 —— 侧边栏就是该标签页的导航器
（视野中那一节对应的行处于活动状态，已查看的文件带标记）；双击或 *Open as tab* 会打开
单文件差异标签页。`ChangesPanel` 仍与排布无关；只有它的侧边位置变了。

| 规范名称 | 实现 | `data-testid` | 职责 |
|---|---|---|---|
| Changes Header | `ChangesPanel` 中的内联 `role="toolbar"` | `changes-view-toggle` | 范围菜单、目标分支选择器、List \| Tree |
| Changes Scope Menu | `panels/ChangesScopeMenu.tsx` → `ChangesScopeMenu` | `changes-scope-trigger`（`changes-scope-label`） | 范围胶囊：All changes（`changes-scope-all`）、Uncommitted changes（`changes-scope-uncommitted`）、Last turn、Agent turns、Commits（`changes-scope-commit`） |
| — Last Turn | 菜单项 | `changes-scope-last-turn` | “Last turn · N files”：最新的一次 agent 运行；在某次运行改动了文件之前禁用 |
| — Agent Turns | “Agent turns” 下的菜单项 | `changes-scope-turn`（`data-turn`） | 最近的 agent 运行，最新在前（仅当多于一次时） |
| Branch Picker | `panels/BranchPicker.tsx` → `BranchPicker` | `changes-target-picker` | 目标分支（`vs <base>`） |
| Changes View Toggle | `panels/ToggleSegment.tsx` | `changes-toggle-list` / `changes-toggle-tree` | List \| Tree |
| Changes List Row | `ChangesPanel` 中的内联 | `change-item`（`data-active`、`data-viewed`） | 扁平的变更文件行 |
| Changes Tree | `panels/ChangesTree.tsx` | 文件行为 `change-item`，文件夹为 `change-tree-folder` | 变更文件的文件夹树 |
| Viewed Mark | `panels/ViewedMark.tsx` → `ViewedMark` | `change-viewed` | 审查标签页标记为已查看的行上的对勾字符 |
| Diff-Stat Badge | `panels/DiffStatBadge.tsx` | — | 按文件／按文件夹的 `+N −M` |
| Empty state | 内联 | `changes-empty` | 该范围内没有变更 |
| Error state | 内联 | `changes-error` / `changes-retry` | 读取失败 + Retry |

**⚠ 命名说明（Changes Header）：** `changes-view-toggle` 标记整个头部工具栏，而不是 List\|Tree
分段控件（`changes-toggle-list` / `changes-toggle-tree`）。

---

# 终端放置（Terminal Placement）

终端是一个可移动的资源标签页，而不是固定在右下角的面板。它可以占据一个中央分组
或任意侧边分组。在每个可见且展开的分组中，被选中的终端会挂载；未激活、已折叠或
隐藏的终端放置项不挂载。同一个终端身份在每个浏览器中至多有一个已挂载的主体。

- **实现：** `panels/TerminalWorkbench.tsx` 集成宿主清单与关闭流程；
  `panels/TerminalInstance.tsx` 是懒加载的 xterm 主体。
- **`data-testid`：** 放置项为 `terminal-tab`，兼容性主体外层为 `terminal-panel`，实例为
  `terminal-instance`，添加操作为 `terminal-add`。
- **职责：** 在布局控制放置与可见性的同时，保留宿主拥有的 shell 身份。
  关闭时仍会走显式的忙碌进程确认流程。

**⚠ 命名说明（Status Bar）：** ThinkRail **没有专门的状态栏组件**。最接近的表面
是 Top Bar 的 Connection Status 与 Chat Header 的 Session Stats Bar。

---

# 设置对话框（Settings Dialog）

- **规范名称：** Settings Dialog。
- **实现：** `panels/SettingsDialog.tsx` → `SettingsDialog`（由 store 驱动；打开状态放在
  store 中，以便多个表面都能以深链方式打开它）。
- **父级：** App Shell（在 Top Bar 的 `<header>` 内只挂载一次）。
- **位置：** 模态覆盖层；一个双栏外壳（左侧分区栏 + 可滚动的内容面板；移动端
  会把分区栏折叠成横向条）。
- **分区（每个都是自己的组件）：**

| 规范名称 | 实现 | 职责 |
|---|---|---|
| Providers | `panels/ProvidersSettings.tsx` → `ProvidersSettings` | 应用内的提供商鉴权（+ `panels/JetBrainsAiCard.tsx` → `JetBrainsAiCard`） |
| MCP servers | `panels/McpSettings.tsx` → `McpSettings`（+ `panels/McpServerDialogs.tsx`） | 活动工作区的 MCP 服务器（`mcp-server-row`、`mcp-add-dialog`、`mcp-approve-dialog`） |
| GitHub | `panels/GithubSettings.tsx` → `GithubSettings` | 本地 GitHub 连接状态 |
| Appearance | `panels/AppearanceSettings.tsx` → `AppearanceSettings` | 主题选择器 |
| Layout | `shell/LayoutSettings.tsx` → `LayoutSettings`（注入到对话框中） | 默认／应用／捕获工作台预设与侧边分组上限 |
| Terminal | `panels/TerminalSettings.tsx` → `TerminalSettings` | 终端回放预算 |
| Templates | `panels/TemplatesSettings.tsx` → `TemplatesSettings` | 全局／项目提示词模板（`template-row`、`template-starters`） |
| Privacy | `panels/PrivacySettings.tsx` → `PrivacySettings` | 匿名使用分析开关 |
| General | 置灰的导航项 | “Soon” 占位 |

---

# 共享 UI 基础组件（Shared UI Primitives）

可复用的基础积木（shadcn/ui、Radix），由 `packages/ui/` 拥有，并用
ThinkRail token 做主题化。按文件逐个导入为 `@thinkrail/ui/<primitive>`（没有 barrel）。

| 规范名称 | 实现 | 备注 |
|---|---|---|
| Button | `packages/ui/button.tsx` | `default` / `destructive` / `outline` / `ghost` |
| Dialog (Modal) | `packages/ui/dialog.tsx` | **Modal** 基础组件；可选的 `hideClose` |
| Dropdown Menu | `packages/ui/dropdown-menu.tsx` | 有高度约束、可滚动的菜单；子菜单通过 `DropdownMenuSub*` |
| Context Menu | `packages/ui/context-menu.tsx` | 右键菜单；与 Dropdown Menu 共享 `menu-styles.ts` |
| Popover | `packages/ui/popover.tsx` | 可选的 `container` portal 目标 |
| Command | `packages/ui/command.tsx` | cmdk 组合框主体 |
| Textarea | `packages/ui/textarea.tsx` | |
| Tooltip | `packages/ui/tooltip.tsx` | |
| Resizable | `packages/ui/resizable.tsx` | `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` |
| Toast | `packages/ui/toast.tsx` | 展示型；队列由 store 拥有 |
| Error Boundary | `components/ErrorBoundary.tsx` → `ErrorBoundary` | 按区域隔离崩溃 |

构建在这些基础组件之上的应用级对话框／浮层实例：

| 规范名称 | 实现 | 基于 | 职责 |
|---|---|---|---|
| New Workspace Dialog | `panels/NewWorkspaceDialog.tsx` → `NewWorkspaceDialog` | Dialog | 开始工作的表面（模式分叉：隔离的 worktree / 项目文件夹） |
| Confirm Dialog | `panels/ConfirmDialog.tsx` → `ConfirmDialog` | Dialog | 没有稳定锚点的模态是／否（初始化仓库、关闭项目、移除工作区） |
| Notice Dialog | `panels/NoticeDialog.tsx` → `NoticeDialog` | Dialog | 针对失败的单按钮信息模态 |
| Confirm Popover | `panels/ConfirmPopover.tsx` → `ConfirmPopover` | Popover | 从专用操作控件弹出的锚定式是／否（删除模板） |
| Template Editor Dialog | `chat/TemplateEditorDialog.tsx` → `TemplateEditorDialog` | Dialog | 创建／编辑提示词模板 |
| Skills Dialog | `chat/SkillsDialog.tsx` → `SkillsDialog` | Dialog | 技能管理器（聊天 + 项目两种模式） |
| Ext-UI Dialog | `chat/ExtUiDialog.tsx` → `ExtUiDialog` | Dialog | `pi.extensionUi` 桥接对话框 |
| Login Dialog | `auth/` → `LoginDialog` | Dialog | 提供商 OAuth / API key 登录 |

**⚠ 命名说明（基础组件）：**

- **Modal** = **Dialog** 基础组件。没有单独的 `Modal` 组件；“Modal” 是通用
  术语，“Dialog” 是实现。
- **Context Menu** —— 两种形态并存。**Context Menu** 基础组件（`packages/ui/context-menu.tsx`，
  Radix）支撑 Project Row 的右键菜单；较旧的右键表面（Change-Row Actions 菜单）
  仍然是 **Dropdown Menu** 基础组件加一个共享的右键处理器 —— 后者应称为
  “Row Actions Menu”。两者通过 `packages/ui/menu-styles.ts` 呈现同样的外观。
- **Drawer** —— 既没有 **drawer** 基础组件，也没有对应组件。移动端单视图外壳已有设计
  但尚未构建；不要用 “Drawer” 指称任何当前区域。**Resources Inspector** 是一个就地的
  非模态 **Dialog**（`DialogPanel`），不是 drawer。
- **Toolbar** —— 没有 `Toolbar` 组件；每个面板的纤细控件行（Changes Header、Diff Pane
  头部、Review Toolbar、视图切换）都是内联的。请描述性地使用 **Panel Header** / **Panel Toolbar**，
  而不是当作组件名。

---

# 术语表 —— 规范名称（Glossary — Canonical Names）

在设计讨论中使用这些术语。当存在多个名称时，会列出 **规范**术语，并在括号中给出
它的替代名称。

**顶层布局**

- **App Shell** —— 根框架（`Shell`）。
- **Top Bar** —— 应用级头部（没有组件名；内联的 `<header>`）。
- **Workspace Workbench** / **Welcome Layout** —— 两种主体状态。
- **Toaster** —— 应用级 toast 宿主。

**顶部栏（Top Bar）**

- **Wordmark** —— ThinkRail 品牌标识。
- **Scope Context**（替代名：location context）—— 常驻的位置面包屑。
- **Connection Status** —— 「已连接／连接中／断开」的胶囊标签。
- **Settings Button** —— 打开 Settings Dialog。

**项目（Projects）**

- **Projects Tool** —— 可移动的单例；**Projects Rail**（替代名：Project Tree；遗留测试 id：Left Nav）是它从项目 → 工作区的视图。
- **Project Row**、**Workspace Row**、**Default Workspace** —— 项目栏中的行。
- **Add-Project Menu**、**Add-Workspace Button**、**Remove-Workspace Button**。
- **Diff-Stat Badge** —— `+N −M` 徽标。

**欢迎页（Welcome）**

- **Welcome Panel**（替代名：Welcome Screen）—— 无工作区时的表面。
- **Welcome Heading**、**Primary Card (CTA)**、**Action Card**。
- **Provider Warning Banner**、**Project Trust Notice**。

**中央（Center）**

- **Center Workbench**（替代名：Center Tabbed Area、Editor Area）。
- **Center Group**、**Group Header**、**Tab Strip**、**Tab**、**Tab Close**、**Split Separator**。
- 标签页种类：**File tab**、**Chat tab**、**Diff tab**、**Changes review tab**、**Document tab**、
  **Terminal tab**。
- **Editor Pane**、**Workspace-Ready Receipt**。
- **File Pane**（**Code File** / **Markdown Preview**）、**Diff Pane**（**Source Diff** /
  **Rendered Diff**）、**Changes Review Pane**（**Stacked** / **One file**）、**Document Pane**、
  **Terminal Body**。
- **Chat-History Menu**、**New-Chat Button**。

**聊天（Chat）**

- **Chat View** —— 整个对话表面。
- **Chat Header** —— 它的顶部横栏。**Session Stats Bar**、**Resources Trigger**、**Skills Button**。
- **Resources** —— **Resources Trigger**、**Resources Dock**、**Resources Inspector**、**Resource Row**、
  **Command Log View**、**Subagent Transcript Pane**、**Stop-All Action**、**Still-Running Chip**。
- **Message List**（替代名：Transcript）。单位：**Turn**（pi 消息）、**Row**（派生的渲染单位）。
- 行渲染器：**User Message**、**Assistant Markdown**、**System Notice**、**Error Turn**、
  **Retry Indicator**、**Tool Card**、**Activity Group**、**Turn Divider**（带 **Artifact Chip** /
  **Artifact List** / **Review-Turn Chip**）、**Stream Indicator**。
- **Tool Card**（框架）/ **Tool Renderer**（主体）：**Bash Card**、**Read Card**、**Write Card**、
  **Edit Card**、**Ask-User-Question Card**、**Visualization Card**、**Web Card**、**Default Tool
  Renderer**。
- **Composer** —— 提示词输入。**Model Selector**、**Thinking Selector**、**Slash-Command Menu**、
  **Send Button**、**History-Open Button**、**Slot Hint Chip**。
- **History Overlay** —— **Results List**、**Preview Pane**、**Scope Picker**、**Jump Action**、
  **Save-as-Template Action**。
- **Chat Plan** —— **TODO List**（右侧栏工具，`PlanRailPane`）+ **Plan Page**（中央标签页，`PlanPane`，通过 `openPlan` 打开）。

**变更审查（Changes review）**

- **Changes Review Tab**（主体：**Changes Review Pane**）—— 每个工作区 + 范围一个；模式为 **Stacked** /
  **One file**。
- **Review Toolbar**、**File Section**（**Section Header**、**Viewed**、**Collapsed Notice**）、
  **Hunk Toolbar**（**Keep**）。
- **Triage Bar**（**Progress Bar**、**Next Unreviewed**、**Mark All Viewed**）、**Walk Bar**。
- **Review Guide**（**Guide Step**、**Guide Finding**、**Apply Fixes**）、**Large-Scope Notice**、
  **End Note**。

**侧边（Sides）**

- **Left Side**、**Right Side**、**Side Group**、**Hidden-Side Rail**。
- 单例工具：**Projects**、**Specs**、**Files**、**Changes**、**Review**。
- **Specs Panel**、**Files Panel**（替代名：File Tree）、**Changes Panel**、**Review Panel**。
- **Changes Header**（没有组件）：**Changes Scope Menu**（含 **Last Turn** / **Agent Turns**）、
  **Branch Picker**、**Changes View Toggle**。
- **Changes List** / **Changes Tree**、**Change-Row Actions**、**Tree Row**、**Viewed Mark**、
  **Diff-Stat Badge**。

**终端（Terminal）**

- **Terminal Placement**、**Terminal Tab**、**Terminal Instance**、**Add-Terminal Button**。一个终端
  可以位于中央分组或侧边分组；它不是一个固定的右下区域。

**设置（Settings）**

- **Settings Dialog**，分区为：**Providers**、**GitHub**、**Appearance**、**Layout**、
  **Terminal**、**Templates**、**Privacy**。

**共享基础组件（Shared primitives）**

- **Modal** = **Dialog** 基础组件。**Dropdown Menu**、**Context Menu**、**Popover**、**Command**、
  **Tooltip**、**Toast**、**Resizable**、**Error Boundary**。
- 应用对话框：**New Workspace Dialog**、**Confirm Dialog**、**Notice Dialog**、**Confirm Popover**、
  **Template Editor Dialog**、**Skills Dialog**、**Ext-UI Dialog**、**Login Dialog**。

**不映射到 ThinkRail 区域的术语（避免使用，或仅按下述方式使用）**

- **Status Bar** —— 不存在；最接近的是 Connection Status 胶囊与 Session Stats Bar。
- **Context Menu** —— 现在是一个真实的基础组件（Project Row 右键）；Changes 各行的右键仍然是
  Dropdown Menu（即 **Row Actions Menu**）。请指明具体的表面，而不只是说 “context menu”。
- **Drawer** —— 不存在（移动端外壳尚未构建）。
- **Toolbar** —— 没有组件；纤细的控件行是内联的 **Panel Headers**。
- **Bottom Terminal** —— 不存在固定区域；请说 **Terminal Placement** 并指明它所在的分组。
