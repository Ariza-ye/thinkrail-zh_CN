---
id: submodule-web-chat-tools
type: submodule-design
status: active
title: tools — 内置工具渲染器
parent: submodule-web-chat
depends-on: [module-contracts]
tags: [chat]
---

## 职责

**内置工具的、应用本地的呈现半边**，按工具名与服务端能力接合（扩展模型住在父级规范里）。`register.ts` 通过
`registerToolRenderer`（以及仅对 `mcp__*` 使用的 `registerToolRendererPrefix`）接线这些渲染器——渲染器 +
折叠头部摘要 + chrome/显著度——作为 `ChatView` 的副作用导入。被抽取出去的扩展渲染器由宿主的
`extensions/registry.ts` 注册。未注册的工具回退到 `DefaultToolRenderer`，并被当作**常规**（它们折叠进活动组）。

## 这里有什么

- **pi 核心工具**——`BashCard`（终端块）、`ReadCard`/`WriteCard`（项目相对路径 + 高亮的文本文件）、
  `EditCard`（路径 + 移除/新增行差异）。全部**常规**。已落定的 `read`（成功或错误）与成功的
  `write`/`edit` 在路径属于活跃工作树时使用共享的结构化文件链接原语，打开外壳的预览槽；正在运行/失败的
  变更或外来路径保持为文本。`read` 返回的图像内容由父级 chat 模块公共的 result-content 层预览，与每个其他
  产出图像的工具走同一条路径；`ReadCard` 不特判图像载荷。
- **`ResolveCommentCard`**——宿主拥有的 `resolve_comment` 复查工具的紧凑回执（能力：服务端的 `agent` 模块 +
  `reviews` 接缝；见 [[submodule-server-reviews]]）：一个 ✓ + 已解决评论的 id/note。**常规**——复查侧边栏才是
  解决状态所在之处；卡片只是对话记录里的痕迹。
- **`RequestReviewCard`**——宿主拥有的 `request_review` 工具的裁定卡片（能力：服务端的 `agent`/`host` 请求
  复查接缝，它会派生一个只读的复查子代理）。它从工具结果的 `details` 里读取结构化 `PlanReviewResult`
  （防御式，经由 `isPlanReviewResult`），显示一个批准/请求修改的指示器 + 复查者的一段式摘要，并把发现渲染为
  共享的可展开 `ReviewPackageComments`（评论→条目的映射与行原语都住在 `reviewPackage.ts` +
  `ReviewPackageComments.tsx` 里，由 `reviewFix`/review-package 渲染器复用）。注册为 `primary` +
  `defaultExpanded`；`data-verdict` + `data-testid="request-review-card"` 是测试钩子。
- **`AskUserQuestionCard`**——宿主拥有的 `ask_user_question` 工具的内联问卷（能力 + 理由：服务端的
  `agent/askUserQuestion` 规范）。注册为 `"bare"`：它拥有自己的全宽框架，绝不折叠，并通过 `ChatActions`
  上下文作答（按 `toolCallId` 关联）。值得它们各自不变量的行为：
  - **生命周期从对话记录推导，跨两条宿主路径：** 一次活跃的阻塞调用用真实的工具结果解析；一次重启后悬空的
    调用被修好为 ack，稍后与一条 `ask-user-answers` 自定义消息配对。`useAskState(toolCallId)` 提供重启回复 /
    被取代的裁定，卡片按顺序解析——**answered/declined**（两种真实结果形式之一）、**superseded**（一条更晚的
    自由形式用户消息替换了被修好的空闲问题）、**stopped/error/length**（显式 Stop 或一个不可执行的 assistant
    结果把该工具定稿），否则 **awaiting**——在 Pi 被阻塞时、重连之后，或任意次数的宿主重启之后都是可交互的。
  - **控件从不流式出现**——参数流式期间它显示一个稳定的编写中占位，完整问卷在消息结束时原子地显露（理由见该
    组件的 jsdoc）。
  - **多问题的完成由复查把关**——每个问题页都用 **Next** 前进，包括最后一道问题；只有合成的
    **Review & submit** 页才暴露 **Submit**。它的复查条目显示完整的原问题以及每个带选中标记的选项（还有
    自定义回答 / note），因此提交可以在上下文中被检查。选中状态也作为屏幕阅读器文本暴露——绝不只靠图标/颜色。
    单个问题保留它直接的 **Submit** 动作。
  - **按调用的 UI 状态能在虚拟化中存活**——一个按 `toolCallId` 键控的模块级缓存（不再等待时丢弃），因为
    react-virtuoso 会卸载离屏的行。活动折叠的展开状态复用的就是这个模式。
  - **注意但不敌意地抢焦点**——一旦参数完整，等待中的卡片就以一个断言式的视觉“需要你”处理加上礼貌的辅助
    技术播报显露出来。播报的那一半是一个**始终挂载的 live region，由同一次一次性认领稍后一帧填充**：与文本
    一起插入的 region 播报不可靠，而虚拟化的重新挂载绝不能再次播报用户已经被告知过的问题。**无障碍树里恰好
    只有一份**：一旦该 region 携带文本，可见的那行就变为 `aria-hidden`，因此重新挂载（region 故意留空）仍然
    暴露那一行。
    每次活跃聊天挂载时，它聚焦一次选中的选项（包括 Other）或第一个手写选项；虚拟化的重新挂载绝不重新夺回
    焦点，而全新的 `ChatView` 挂载会（见 `chat/SPEC.md`——那意味着任何切回聊天标签页的动作，不只是重新打开
    聊天）。它显露，但**不**把焦点从 Monaco、xterm、content-editable/表单字段、非空的输入框草稿，或一个
    **在打开期间拥有焦点**的表面——对话框、菜单、另一个选项列表（回答到一半的第二个问卷）——移走：等待一个
    模态焦点域要么输掉这场争夺，要么把一个未被捕获的 popover 从用户脚下拽走，因此卡片不进入它。**粗指针从不
    放弃焦点**：在手机上没有被移交的键盘流，而聚焦一行（尤其是 Other 输入）会在正阅读的人头上抬起软键盘——
    显露 + 滚动入视*就是*那里的注意处理。一次**页面切换**跟随一次轻点，因此它可以聚焦——除非在粗指针上聚焦进
    一个文本字段（`shouldFocusPageTarget`），那会抬起同一个键盘。每次页面切换先请求父级 chat 的滚动所有者清除
    并抑制任何临时的流式跑道，然后把新页面的起点与对话记录视口对齐；它随后在浏览器自动滚动被抑制的情况下应用
    焦点规则。全新的 `ChatView` 注意认领会通过一个有界的稳定窗口重复那次当前页显露，使 Virtuoso 稍后的初始
    边缘放置无法撤销它；焦点资格仍然独立于显露。卡片留在普通的对话记录流里——没有嵌套的垂直滚动器——因此长
    页面用同一个聊天滚动条去到达后面的回答与 Next/Submit。粗指针焦点被扣留时显露仍然发生，且绝不重新武装跟随
    模式。Send 之后留下焦点的空输入框可以安全移交。稳定窗口**向用户让步**：显露之后第一次真正的
    `pointerdown`/`keydown`/`wheel` 结束这次认领，因此更晚的一帧绝不可能把焦点或对话记录从用户还在它尝试时
    就做出的交互下面拽走。
    出去的路上是镜像：回答或拒绝会卸载被聚焦的控件，因此卡片把焦点**交回输入框**
    （`ChatActions.focusComposer`），而不是把它丢在 `<body>` 上——但只当它仍然持有焦点*且*该焦点是
    `:focus-visible`，即平台自己那个“由键盘抵达”的信号（这张卡片里每个环都从它画出）。一次轻点/点击的回答
    不动焦点，因此触摸保持它的键盘不动。一次**发送失败用闩锁撤销交接**：表单恢复可交互，而由于那次一次性认领
    早已用尽、既无法重新聚焦也无法重新播报，卡片自己把焦点夺回，而不是在键盘停在输入框里、又没有任何提示说它
    已经回来时重新出现。
  - **卡片里的每个焦点指示器都是应用级的 accent 焦点环**（`focus-visible:ring-2` + `ring-primary`；Other
    行上是 `focus-within:`，它的环标记漫游光标正穿过一个文本字段）——依照颜色系统的“accent = focus”规则
    （`styles/COLOR.md`，Control 行）。该卡片最初发布在 `ring-primary-soft` 上，主题精修的调色板扁平化把它
    合成到近乎不可见（accent @20% 覆在扁平化的表面上），让键盘用户看不到光标——它是全应用焦点环清扫唯一漏掉
    的那个文件。`ring-primary-soft` 只剩作等待中卡片的装饰性活跃光晕，那不是焦点指示器。
  - **Claude 风格的本地键盘选择器**——一个手写选项在 Tab 顺序里；Up/Down 绕过每个手写选项**以及 Other**，
    Home/End *从某个选项行*跳到第一个/Other 目标（在 Other 字段内部它们仍是光标键，与 ←/→ 完全一样——自由
    文本字段保留那些在文本中移动的键，只有 ↑/↓ 从它里面升出去），Space 选中/切换一个手写选项，Enter 确认
    （单选选中被聚焦的选项；多选确认其非空集合），前进到下一道问题/复查，或直接提交只有一个问题的调用。到达
    Other 会聚焦它的文本输入，随时可打字——但**让 Other 成为答案的是文本，而不是焦点**（`customTextPatch`）：
    光标是*穿过*那一行的，因此一到就激活会清掉单选的选中项，并把一个只是因为路过就被涂成已选中的空行。打字
    认领答案（单选上排他，多选上叠加），清空字段则交还它，多选保留它显式的复选框来排除不该提交的文本，Up/Down
    离开或环绕，Enter 确认非空文本。该行是一个 `<label>`，**通过 `htmlFor` 显式绑定到它的输入**——`<button>`
    也是可标记元素，因此在多选上隐式控件会按树序变成输入上方那个包含/排除切换，而点击该行的 chrome 会翻转一个
    空复选框，而不是把光标放进字段（在触摸上，那是唯一的进入方式）。
    **复查标题**是复查页的键盘落点。它把焦点可见地留在回顾起点旁边，而不是在页脚武装一个屏幕外的
    Submit/Unanswered 动作；在读者复查完答案之后，Tab 按普通顺序到达那些真实控件。在多问题卡片上，Left/Right
    在问题页与最终复查页之间移动但不会绕回；文本输入保留那些键。问题小标签是一个真正的 `tablist`，覆盖在共享
    的问题 `tabpanel` 之上（每个小标签 `aria-controls` 它，活跃的小标签为它打标签），并采用**自动激活**——一次
    箭头/点击直接切换页面，焦点*进入*面板而不是留在小标签上，因为用户是来对页面动手的。
    **确认手势绝不是静默空操作**：没有东西可确认时的 Enter（空的多选集合、一行未被触碰且上方没有选中项的 Other
    行）会在它所瞄准的动作旁边说 “Choose an option first”，问题一旦变得可回答就清除，并通过与注意行相同的
    live-region 模式播报。抱怨属于**提出它的那道问题**（`nudgeShowsOnPage`）——在它短暂的生命里翻页绝不能在
    用户从未尝试确认的问题上留下警告——并且每个手势都被打戳，因此*第二次*无果的 Enter 会先把 region 清空一帧
    再填回：未变的 live-region 字符串就是沉默，而那正是这条提示存在要终结的空操作。
    两条 Enter 路径都走同一个 reducer（`confirmStateFor`），因此“确认这道问题拥有的东西”不可能有两种含义。
    从上方的确*有*选中项的 Other 行出发，Enter 确认那个选中项。从 Other 行出发时，它**完全按它当前的样子**
    提交状态，绝不从文本重新推导激活：打字已经把 `customActive` 逐击键地保持同步，因此在确认时刻重新打补丁
    只可能与屏幕上的行矛盾——让用户明确取消勾选的多选文本复活，或者在卡片仍然画着其后所选选项时提交更早一次
    编辑遗留的文本。被确认的东西永远与被画出的东西一致。
    备注在每个**已勾选的选项**上仍是一个显式的次级控件：被选中的单选选项，或**每个已勾选的多选选项**——每个
    勾选一个 Add/Edit note 控件，渲染在**它自己那一选项行的正下方**，在做出选择的那一刻出现。（多选备注之前
    完全缺失，而单选备注漂到了列表底部、读起来像属于最后一个选项——两者都被报为回归；契约一直允许备注。）
    线上协议**每个答案携带一个 `notes` 字符串**，因此多选答案把它按选项的备注拼成 `label: note` 行（以换行
    分隔——备注本身可以多行）。可见的切换文本仍是简短的 Add/Edit note；它所属的选项由 `aria-label` 携带，
    相邻性在视觉上携带它。Tab 能到达 Add/Edit note，Enter 打开它（只有在存在一个可挂靠的选择之后，图例才
    承诺 `Tab note`——`answerSupportsNote`）。在编辑器里 Enter 完成并把焦点交回该选项，Shift+Enter 仍是多行
    的逃生口，Escape 也会返回**而不丢弃已键入的文本**——**包括 `Shift+Escape`**，打开的编辑器会消耗它，而不
    让卡片的跳过手势把备注在句子中途扔掉。这一点**在 IME 组词过程中同样成立**，那里 Escape 是*被消耗而不是
    完成*：IME 拥有那个键（它取消组词，因此备注保持打开），但该手势仍然不能到达卡片——既拒绝完成又拒绝吞下
    会让 `Shift+Escape` 冒泡出去，连同正在组词的文本一起把问卷带走。因此卡片的跳过还**忽略 IME 正在组词的
    任何击键**，这覆盖了 Other 字段，它的自由文本没有内部守卫。`Shift+Escape` 除此之外就是刻意的卡片本地
    跳过；备注之外的普通 Escape 从不拒绝。
    Tab 仍然能到达 Other、Skip 与页脚动作。一个紧凑的可见快捷键图例让交互可被发现，而选项是带 `aria-checked`
    的已勾选行——绝不是 `aria-pressed`，后者会把一个排他的选择播报成切换按钮、且对集合什么都没说。容器角色
    携带单选 vs 多选（`radiogroup` vs 复选框的 `group`），每一行在播报时带上它在选项中的位置。备注控件住在
    **行与行之间，各自在它已勾选的选项下方**，因为相邻性正是告诉用户某条备注属于哪个选项的东西——更早那种
    备注在列表下方的布局读起来像备注属于最后一个选项，并被报为回归。正是这种交错迫使了容器角色：一个
    `listbox` 除了 `option`/`group` 之外不能拥有任何东西（交互式后代不合规，某些 AT 会把它们压平或跳过——
    多选备注变更上的复查发现；`aria-posinset` 只给选项编号，无法让杂散的子节点变得合规），因此选项是一个
    **`radio` 行的 `radiogroup`（单选）/ `checkbox` 行的 `group`（多选）**，带 `aria-checked`，其契约对
    兄弟内容不作约束——备注编辑器与切换是它们旁边普通的具名控件。每个角色的键盘契约都被遵守，而不只是它的
    标记（第二个复查发现：一个用箭头只移动焦点的 radio 会把被聚焦的行暴露为未勾选，而 Enter 会提交它——语义
    状态会同时与光标和答案矛盾）：**单选箭头在移动时即选中**（APG 的 radio 契约；Space 也选中，Enter 仍
    保持为独立的确认），落到 Other 行上只移动焦点而不选中（它是文本字段，不是 radio），而**多选箭头只移动**，
    由 Space 切换（checkbox 契约）。选中仍然绝不是提交——Enter 才确认。**Other 行保持为这些行下方的兄弟**。
    移动由选项 refs 驱动，而不是 DOM 包含关系，因此那些键不受影响。
    取消勾选一个备注编辑器处于打开状态的选项，也会在同一次更新里清除 `noteFor`（`toggleMultiPatch` /
    `selectOptionPatch`），同时保留已键入的备注文本：一个过期的 `noteFor` 会在重新勾选时重新挂载那个打开的
    编辑器，偷走一个用户从未做出的聚焦动作。裸字母/数字快捷键与全局和弦被刻意排除在外，因此浏览器扩展、自定义
    文本与显式拒绝都保持安全。
  - **推荐理由可供性**——被推荐的选项（标签后缀 `(Recommended)` **或**非空的 `recommendedReason`——有理由就
    *意味着*推荐，防御式的）把它的理由**内联**渲染为选项卡片里的一个 `Why: …` 块（在描述之下；`Why:` 为
    accent 颜色）。对每个被推荐的选项都前置显示，不以选中为条件：比 tooltip 更易发现，而且作为普通可见文本，
    它在触摸上和给 AT 时无需 popover 即可读取。**只在活跃卡片上**——已解析的记录只显示选择，不显示理由。
- **Visualize** 由 [[module-ext-visualize]] 拥有，在本模块之外。它的 primary/default-expanded 注册与具名
  `MermaidView` 经由公开的 web 入口点到达 chat。
- **规范图工具**——一个防御式的 `SpecToolCard`，为全部七个 `spec_*` 名字注册。每个都保留该能力可读的文本、
  折叠长输出、用有意义的活动摘要替换多余的 args JSON，并且只把从已知成功结果 `details` 形状取得的、精确且
  独立的工作树路径 token 变成预览动作；更短的已知路径绝不会去链接另一条路径内部的某个后缀。`spec_delete`
  绝不链接它成功删除的路径。常规。
- **`web/`**——`pi-web-access` 的搜索/抓取/已存储内容渲染器；有自己的子规范
  （[web/SPEC.md](web/SPEC.md)）。常规。
- **`mcp/`**——pi 内置的 MCP 工具：`mcp__*` 卡片（服务器 / 工具、键/值参数、有序文本、宿主结构化内容摘要的
  折叠 JSON 树、Full output、登录动作）、资源列表/读取卡片与 `tool_search`；有自己的子规范
  （[mcp/SPEC.md](mcp/SPEC.md)）。常规。
- **五个 `todo_*` 工具**刻意保留常规的回退回执：它们相连的产品表面是聊天计划，而不是本模块里的第二套渲染器
  系统。
- **`subagent/`**——`pi-subagents` 的委派渲染器：`AgentCard`（`Agent` 工具——**primary**；也为
  `get_subagent_result` 注册，常规）、`SubagentCompletionCard` 轮次卡片，以及纯的
  `runDetails` 读取器/格式化器；有自己的子规范（[subagent/SPEC.md](subagent/SPEC.md)）。
- **共享部件**——`CodeBlock`（shiki）、`Collapsible`（长输出的 "Show all N lines" 折叠；调用方提供一个由
  工具调用派生的稳定 id，使状态与几何锚定能熬过虚拟化）、`ToolFileLink` + 精确引用链接文本，后者由父级 chat
  模块共享的 `workspaceFileTarget` + `lib` 的 `projectRelativePath` 支撑。纯的 `toolHelpers`（参数读取器、
  `resultText`、`languageFromPath`）与规范的 `toolResultContent` 解析住在 `@thinkrail/extension-api/web`
  里，因此扩展的文本提取与 chat 公共的图像层不可能对有效内容产生分歧。

## 边界

- **Public surface（公开接口）：** 副作用 `register` 导入 + 供兄弟渲染器使用的共享 `CodeBlock`/`Collapsible`。
  没有 barrel（chat 会引入 shiki——按文件导入，与父级一致）。
- **允许的依赖：** 父级 chat 原语（`toolRegistry`、`Markdown`、`ChatActions`、`askState`、`fileTargets`、
  `foldState`）；`contracts`（仅类型 + `ASK_USER_ANSWERS_CUSTOM_TYPE` 常量）；`@thinkrail/ui/*`；
  `@thinkrail/extension-api/web`；`lib`；`@remixicon/react`。
- **绝不触碰：** 值导入任何 `pi` 包；`store`/`transport`（渲染器保持展示型——随时可抽取进未来的
  `packages/chat-ui`）。

## 必须做对的事

- **防御式渲染：** 工具的 `details` 结果形状不是稳定的 API——尽力读取，并回退到它的文本内容（`resultText`）。
  缺失的结构化引用会移除链接，绝不移除散文。
- 文件动作只来自显式的 args/details，且只通过 `ToolRenderProps.onOpenFile`；绝不从任意结果文本推断它们，也
  绝不把应用集成导入渲染器。
- 工具名必须与该能力完全一致——名字就是接合键。唯一被许可的例外是 `mcp__` 前缀：pi 把 MCP 工具命名为
  `mcp__<server>__<tool>`，因此注册表先解析精确名字，其次解析最长的已注册前缀，经由渲染器、摘要、chrome 与
  显著度共享的**同一个**解析器。前缀渲染器绝不从服务器加载代码；它们渲染 pi 的结果
  （[mcp/SPEC.md](mcp/SPEC.md)）。那三个资源工具与 `tool_search` 都是精确注册。
- 只用 token 工具类样式（不用裸十六进制 / 内联 `style`）。
