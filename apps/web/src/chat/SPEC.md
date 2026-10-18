---
id: submodule-web-chat
type: submodule-design
status: active
title: chat — pi 会话 UI 原语
parent: module-web
depends-on: [module-contracts]
tags: [chat]
---

## 职责

chat/agent 会话 UI：**呈现型 React 原语**，用于渲染 pi 的**规范化消息 / 内容块模型**；一个**工具渲染器
注册表**（扩展点）；以及 `ChatView`（应用集成层）。全部手写——pi 不提供 Web UI，而官方的
`@earendil-works/pi-web-ui`（MIT、**Lit**、在浏览器内运行 agent /“Direct Mode”）是我们在学习的规范化
事件→渲染*参考*，但**不**采纳（架构 + 框架与我们的“宿主运行 pi / 类型化 WS / React+shadcn”模型不
匹配）。它的构建方式让人可以复用/贡献（可抽取为未来的 `packages/chat-ui`）。内置工具渲染器住在子模块
[tools/SPEC.md](tools/SPEC.md)；抽取出去的扩展渲染器住在 [[module-thinkrail-extensions]]。

## 渲染模型 —— 行与渐进披露

对话记录是 pi 规范化的轮次（`types.ts` 里的 `ChatTurn`：user/assistant 是 pi 消息；`system`、`error`、
`retry` 是 Web 本地通知；`compaction` 同时承载实时生命周期与 pi 在替换早先消息处留下的持久摘要记录），
但列表渲染的是**派生行，而不是原始轮次**——折叠会跨越 assistant 消息边界（pi 每轮工具调用发一条
assistant 消息），因此按轮次的条目模型无法分组。纯函数 **`deriveRows(turns, toolResults,
isStreaming, isSpec?)`**（`rows.ts`）按顺序把块走成行；`ChatTurnView` 按行种类分发：

- `user` / `system` / `retry` —— 1:1 渲染器。一条用户消息若是 Pi 规范化的展开技能块（`<skill name="…"
  location="…">`），会渲染成一张**折叠的技能调用卡片**，而不是暴露整份 `SKILL.md`：技能名始终可见，
  `/skill:<name>` 之后提供的任何请求仍作为普通用户文本显示在其下，展开则把持久化的确切指令以 Markdown
  呈现。解析来自 `lib` 的锚定 Pi 格式镜像（浏览器代码不能 value-import Pi）；该展开走共享的折叠缓存，
  因此手动的选择能在虚拟化中存活。一条本身就是复查上下文包的用户消息（`reviewPackage.ts` 识别
  `<review …>` 头 + `<comment …>` 条目，即服务端 `packageRender` 生成的格式——解析器是该格式的读取半边，
  并由单元测试对着渲染器的逐字输出钉住）渲染为一张**紧凑卡片**：一句摘要（“Sent 3 review comments on
  script.ts”）加上正下方的 COMMENT 行——没有文件层级，因为一次发送就是每个文件一条消息
  （`review.sendBatch` 按文件分组，并把每组作为自己的消息发出），所以文件行永远只会持有摘要已经点名的
  恰好一个条目。每行是一条评论（`▸ L2 · the remark…`，一行），展开后显示其全文加上原样引用的
  `<fragment>`——或者当该位置没有源文本时显示该评论的 `<locator>` 行——用等宽字体，并限制高度。属性值与
  locator 值都经由渲染器自己的转义读回，因此带 `" < > &` 或换行的路径/node 引用能精确往返。一切都从
  消息本身解析——绝不用复查快照（下一次复查会替换它）——所以在任何客户端上，任何对话记录都能永远回答
  “发了什么”；评论行的折叠走共享折叠缓存（键为
  `rowId:<content-key>`），在虚拟化中存活。一个**普通**用户气泡（不是技能/复查卡片），
  其文本超过 **500 个字符**，会在 agent 已开始对它响应之后折叠成 `line-clamp` 预览 + 一个
  `Show more`/`Show less` 切换，该切换**位于卡片内部**（在其内边距里、紧贴消息正文下方，因此 line-clamp
  只截断正文自身的元素——绝不截断该控件）：`UserTurn` 基于 `useFold(`${id}:user-collapse`,
  !agentResponded)` 折叠，因此回退状态在 agent 响应之前是*展开*、之后是*折叠*——共享缓存的“手动切换
  永远胜过回退翻转”正好给出所需行为（发送后立即显示为展开；agent 一产出任何东西就自动折叠；随后一次
  手动 `Show more` 能在持续流式期间存活）。共享的 `deriveMessageActions` 分类器从按时间顺序的行派生
  `agentResponded`（该用户行之后存在更晚的 `markdown`/`tool`/`activity`/`divider` 行，**或**它就是
  末尾的用户行且 `isStreaming` 为真），每个对话记录集成都会把这个状态提供给渲染器。它仍然只是客户端
  视图状态，对线上协议零影响。低于 500 字符时气泡不变。展开时，大正文会被限制高度并带内部滚动
  （`max-h-[60vh] overflow-y-auto`），因此一次巨型粘贴绝不会把该行撑成几千 px 的 DOM 节点；而
  `estimateChatRowHeight` 按折叠尺寸（静止状态）而不是完整折行后的高度来估算大用户行——两者都防止
  虚拟化器预留过多空间、在流式期间留下幻影般的空白间隙。重试倒计时携带 `source`（`turn` =
  pi 的 `auto_retry_*`；`summarization` = compaction/分支摘要的 `summarization_retry_*`，pi ≥0.81.1）——
  这些流程可以在运行中重叠，每个保持恰好一个指示器（重新调度会替换，每个来源的结束事件只清除自己的），
  而 `RetryIndicator` 用标签把它们区分开（“Retrying” vs “Retrying summarization”）。**`ErrorTurn`** 是
  持久化的失败通知（provider/模型错误、未恢复的 `length` 截断，或被拒绝的发送），按共享的
  [[web-notices]] 样式绘制：中性填充、错误色边框与图标、页脚行里的 **Try again**。它**绝不折叠**，因此
  失败的轮次不会看起来像什么都没发生。只有当前由落定派生的失败才带 Web 本地的 `try-again` 恢复动作；
  它的 **Try again** 按钮通过 `ChatView` 既有的立即发送路径发出一条可见的普通 `Try again.` 用户消息。
  被拒绝的发送、扩展通知与通用应用错误保持不可操作，因为缺失的提示词或修复可能不在 Pi 的上下文里。
  乐观的用户追加会立即消费掉该动作，之后任何 `agent_start` 都会为其他客户端/自定义消息的启动消费它，
  因此历史错误绝不会重新获得该提示。实时落定与对话记录水合共用同一个 assistant 失败分类器与动作派生，
  因此重新加载不会把最新的未解决失败变成成功、也不会丢掉它的恢复能力；已恢复的历史 `length` 尝试如果
  后面还有更晚的工作，不会被重新标为当前失败。
- `compaction` —— 一条 1:1 的、打破折叠的行，有两个汇聚的来源。实时 `compaction_start` /
  `compaction_end` 事件产出 `CompactionNotice`（见 store 规范）：运行中为“Compacting context…”
  （spinner），完成为 **“Context compacted”**（+ “— resuming…”，当 pi 的溢出重试仍在继续该运行时；
  + token 前→后的变化，当结果携带了它们时），失败时显示可操作的错误文本，被取消则作为一条弱化的通知。
  这些状态可通过 `data-testid="compaction-notice"` +
  `data-status="running|done|failed|cancelled"` 断言。一次成功的实时结束会让应用集成的对话记录同步器去读
  Pi 的规范化摘要加尾部；对来自更旧连接世代的运行时，重连做同样的事。**当它的宿主摘要正在流式时不安装任何
  快照**，无论需求来自重连还是 compaction：Pi 持久化的 `session.messages` 不含在途的 assistant 片段，
  而版本栅栏无法保护一个在读取开始之前就已折叠的更新。同步器等待落定并重新读取，而不是删除那个片段
  并清除它的关联 id。待处理的连接世代同步优先，即使同一次读取同时也满足了一个未解决的 compaction 需求。
  瞬时的对话记录读取失败以有界退避重试；只有耗尽才抛出刷新错误，而新的世代/compaction 键会得到全新的
  预算。store 的对账只替换宿主派生的会话状态，并保留浏览器本地状态。随后持久化的 `compactionSummary`
  就地变回同一行（实时 id、估算后的计数，以及实时 `resuming` 标志在仍然适用时存活下来），而被 Pi
  摘要掉的这些消息立即消失，而不是等到重新加载之后。它的 `summary` 点击即可展开
  （`data-testid="chat-compaction"`）。水合/重开会直接从同一份持久形态开始。两种形态共享
  **“Context compacted”** 标题；只有重新加载后不再可用的事实才消失。
- `markdown` —— 一个非空的 assistant 文本块（react-markdown + remark-gfm + shiki）。assistant 散文里
  安全的工作树相对链接会通过 `ChatTurnView` 既有的工作区文件回调在 ThinkRail 中打开目标；绝对路径只在它
  归一化后落在活跃工作树内时才被接受，而 URL scheme、协议相对 URL、片段，以及不安全/外部路径保留普通的
  安全新标签页锚点行为。百分号编码的文件路径在校验前被解码一次，因此编码过的分隔符与路径穿越无法绕过
  包含检查。一个窄的、仅限 assistant 的 URL 变换会把可识别的 Windows 盘符锚点路径（包括 Markdown 的
  百分号编码反斜杠形式）保留到校验为止；盘符根的包含性比较不区分大小写，但保留被链接路径的大小写。
  其他所有值都委托给 react-markdown 的默认消毒器，而被拒绝的 Windows 路径在回退锚点渲染前会再次消毒。
  通用的 `Markdown` 原语保持 props 驱动，只在 assistant 轮次的集成边缘以 `a` 组件覆盖的形式获得这一
  行为；被接受的工作区目标渲染为按钮控件、不带原生浏览器 `href`，因此备用的原生锚点激活无法逃逸进 SPA
  回退。该覆盖在其工作区输入不变时保持稳定的组件身份：工作台焦点可能在 pointer-down 与 click 之间重渲染
  一行聊天，而在那个间隙替换控件会取消激活。一个围栏式
  ```mermaid 块通过 `@thinkrail/ext-visualize/web` 的 `MermaidView` 渲染为带主题的图表（全屏
  平移缩放，错误 → 源文本回退）——在每个 `Markdown` 表面（聊天、文件/规范预览）都一致；在挂载之前它
  渲染为高亮的源码，因此静态上下文（`RenderedDiff` 的 `renderToStaticMarkup`）会像 shiki 块那样降级为
  代码。
  Assistant 文本按顶层块渲染（`BlockMarkdown`）：`markdownBlocks` 用 `marked` 的块词法器切分它，每个块
  是一次带 memo 的 react-markdown 渲染，因此流式的增量只重新解析尾部。块是散文 `div` 的直接子节点，用与
  整文档渲染相同的 `"\n"` 分隔。切分器按实例且增量：它从最后一个已闭合且其后还有两个块的块开始重新
  做词法分析。一个块在它以空行、或 ATX 标题、分隔线、CommonMark 也会闭合的围栏结尾时闭合，除非原始 HTML
  （一个未闭合标签，或任意行上未结束的 `<!--`、`<?`、`<!X`、`<![CDATA[`）或一个未闭合围栏（也在列表项
  或引用里）可能仍在延续它。每个 token 的空行检查只看前一个 token 的尾随空白，因此一个长块花费线性时间。
  不变量：增量切分等于全新切分；块渲染等于整文档渲染，除了下面已知的缺口；一个链接或脚注定义（也在列表项
  里）在其行结束后，会让消息在流的剩余部分整体渲染（半流式的 `[Label]: x` 行会在下一个增量时重新检查）；
  回退情形（未闭合 HTML、惰性行、缩进代码、只有 `marked` 闭合的围栏、并非无损的词法输出）只会合并块，
  绝不切分块。选择 `marked` 而非 micromark 切分：它的块词法分析比一次 micromark 解析快好几倍，而切分
  跑在逐块 micromark 渲染之上；代价是即时打包里约 12 KB gzip。`BlockMarkdown` 的 memo 需要稳定的
  `components`，因此调用方要对它们做 memo。已知缺口——`marked` 与 micromark 对结构的读法不同、导致一个块
  渲染可能与整文档不同：原始 HTML 行（注释）惰性地延续列表；一个惰性行 `marked` 在其上结束块而 micromark
  继续；一个 HTML 块 `marked` 让它吞掉一个链接定义；一个引用块与缩进代码 `marked` 把它们折进列表，并切出
  一个更晚的非 1 起始有序列表，而 micromark 把它读成段落；一个表格前带尾随空格的空列表项；一个列表项里
  未闭合的围栏后面跟着 2+ 空行和一次 dedent；某个构造没有闭合块，比如一个列表的条目靠惰性行一直延续，
  此时每个增量都从开头重新做词法分析；当块合并或消息变为整体时，被移动的块会重新挂载，因此代码块从高亮
  缓存重新渲染（命中时立刻高亮），Mermaid 图重新绘制，而它们内部的焦点或选区丢失；保留的块持有更旧流
  文本的子串，对一条 11 万字符的消息约 1 MB，直到该行卸载。
- **可配置的对话记录度量** —— 宿主同步的 `chatLineWidth`（40–240，默认 120）是一个近似 CSS `ch` 的
  文本度量，因为聊天保留了它比例字宽的阅读字体。`ChatView` 这个感知 store 的集成边界把它应用到一个居中的
  外部列上，该列由每个对话记录行、流指示器与粘性活动面包屑共享；普通行的侧边留白落在这个度量之外，用户
  气泡在其内部保留 85% 的上限。输入框/头部/队列/历史等外壳保持窗格宽度。启用 `chatLineWidthBounded`
  （默认 `true`）时，该列被挂载的聊天窗格封顶；不启用时，列保持它配置的度量，对话记录视口从它的左边缘
  水平滚动——但右对齐的**用户侧**还会额外被夹到窗格宽度（一个以 `data-line-width-bounded=false` 为键的
  容器查询封顶），因此用户消息永远不会越过可见视口而在左侧被裁掉；只有 assistant/工具内容使用完整的
  度量。代码块与表格保留它们自己的内部滚动。这只改变呈现：规范化轮次与 props 驱动的行渲染器绝不获取
  设置状态。
- **消息复制** —— 普通用户气泡与**本轮收尾的 assistant 回答**携带一个悬停才显示（`group`/`opacity-0
  group-hover:opacity-100`）的 **`CopyButton`**（`chat/CopyButton.tsx`、`data-testid="chat-copy"`），
  它复制整条消息的**源文本**——用户气泡用 `userText(message.content)`，assistant 行用 markdown
  `text`——绝不复制折叠后的预览或任何 UI 外壳。一轮里只有**最后**那条 `markdown` 行可复制，而不是 agent
  在工具步骤之间发出的中间叙述：当没有更晚的 `markdown`/`tool`/`activity` 行位于下一条用户轮次之前时，
  `deriveMessageActions` 就把该 markdown 行标为最终（`finalAnswerRowIds`，由每个对话记录集成以
  `isFinalAnswer` 提供）；非最终的 markdown 行按普通方式渲染，不带该动作。两者都走**同一个共享布局**
  `MessageWithCopy`（在 `turns.tsx`）：一个 `relative` 包装器，把动作覆盖在**角色底部角落、与内容同一行**
  ——assistant 回答在左下（`left-0 bottom-0`），用户气泡在右下（`right-0 bottom-8`，对齐在气泡现有的垂直
  内边距内）——绝不在其下方单独一行。用户气泡保持纯内容：按钮对着外部包装器定位，而不是注入气泡标记。
  消息内容在动作那一侧预留一条横向的 `size-24` 带（最终 assistant Markdown 包装器用 `pl-24`，用户气泡用
  `pr-24`），而不是预留一条纵向带，因此文本与大消息切换不会落在点击目标之下。最终答案的列表标记留在其
  内容盒内，而不会反向画进 assistant 的动作带。assistant 包装器只移除它最后那个 Markdown 块的尾随外边距，
  以便把动作与实际最后一行对齐；块间与起始外边距保持不变。`MessageWithCopy` 还携带跳转/闪烁 + 测试所
  依赖的 `data-testid="chat-message"`/`data-role` 钩子。`CopyButton` 是一个自包含的呈现型原语，通过共享的
  `copyText()`（`@/lib`）复制——那是唯一一条把降级内建的剪贴板写入路径——只有当它报告成功时才翻成本地的
  约 1.2s `Copy`→`Check` 图标；它**不**像 `panels/PlanPane` 那样去碰 store 的 toast，从而保持消息渲染器
  props 驱动。
  技能调用卡片与复查包卡片保留它们自己的展开 UI，也不携带复制入口。
- `tool` —— 一次**主要**工具调用：可折叠的 `ToolCard` 框架（除非注册了 `defaultExpanded`，否则折叠；
  出错时自动展开；手动切换优先），或一个拥有自己框架的 `"bare"` 渲染器。死消息上的 `"bare"` 调用
  （`stopReason` 为 aborted/error——pi 从不执行这些调用）渲染为出错态，而不是永远保持可交互。每一次渲染器
  调用——已注册或回退、常规或主要、卡片或 bare——都经过同一个公共的结果内容层。一旦结果完成，每个合法的
  规范化图像块都会追加一个受约束的卡内预览，并带一个明确的全屏对话框动作；多个图像保留块顺序。这是
  按内容类型的行为，不是 `read` 的特例，它也不会提升或自动展开该工具。结果字节已经在对话记录里，因此预览
  不需要宿主抓取，对工作区之外的路径也有效。可预览的块要求非空数据，且属于 `contracts` 共享的光栅媒体
  类型之一（PNG/JPEG/GIF/WebP）；畸形的形状与不支持的媒体类型被忽略，而规范化内容数组绝不序列化成
  base64 JSON。
- `activity` —— 一段连续的常规工作保持为一个**折叠的外部展开块**，其头部汇总每一个原子步骤（思考块 +
  常规工具调用）。展开它会先把第一个思考之前的工具保留为直接行，然后把每个非空的思考块渲染为一个嵌套的
  展开块。当该块的第一非空行是一个完整独立的 Markdown 粗体片段（`**…**` 或 `__…__`）时，它的折叠头部
  会用模型写出的内部文本替代那个冗余可见的 `Thinking` 标签，使用该行普通的继承字重、同时保留其默认文字
  颜色，放在尾随的工具/字符元数据之前；teaser 在该元数据之前截断，展开时消失——展开时该展开块保留通用
  标签并包含确切文本。没有这个约定的块在折叠时保持通用标签。语义面包屑与辅助技术标签在任何状态下都保持
  `Thinking`。之后每一个常规工具调用都留在那个思考之下，直到下一个思考块或活动边界。那些思考组是外部运行
  **内部**的兄弟节点，甚至跨越 assistant 消息边界；该层级只是呈现层面的，绝不虚构 pi 条目的父子关系。
  单个原子步骤仍然直接渲染。非空文本、主要工具与非 assistant 轮次会打断外部运行。只有它尾部的那个实例
  携带实时 ticker。出错的常规工具**不做任何特殊处理**（有意为之——agent 常常能自行恢复；`ErrorTurn`
  与主要工具的错误自动展开才是安全网）。
- `subagentCompletion` —— 一条 `subagent-completion` 自定义消息：一个分离的（后台）子代理运行的终端
  报告，在运行结束时由 `pi-subagents` 注入父级。渲染为紧凑的自带框架卡片
  （`tools/subagent/SubagentCompletionCard`）——后台运行的**那个**终端信号，其 `Agent` 工具卡片已在
  它的 ack 处冻结（原因 + 卡片解剖：[tools/subagent/SPEC.md](tools/subagent/SPEC.md)）。绝不折叠进
  活动组。
- `reviewFix` —— 一条 `todo-review-fix` 自定义消息（#363）：计划复查裁定里的修复请求，宿主把它作为
  **结构化的 `ReviewFixDetails`** 投递给 worker 聊天（而不是合成的用户轮次）。渲染为紧凑的
  `ReviewFixCard`（`turns.tsx`、`data-testid="review-fix-card"`）——一句摘要
  （`Requested a fix on “<title>” · N findings`）、可选的反馈备注，以及通过共享的
  `ReviewPackageComments`（`ReviewPackageComments.tsx`，那个可展开行原语）呈现为可展开评论的发现，
  路径/行号由服务端预先解析。那个共享列表 + `ReviewFixComment`→`ReviewPackageItem` 映射
  （`reviewPackage.ts`）被复查包卡片与 `request_review` 裁定卡片复用（[[submodule-chat-tools]]）。
  与上面文件聊天的复查评论卡片不同：那条路径仍是由 `reviewPackage.ts` 解析的 `<review …>` **用户**消息
  （自己的 `review-package-*` testid）；只有 todo 修复那条路径是结构化的。绝不折叠进活动组。
- `divider` —— 轮次结束摘要（`TurnDivider` + 纯函数 `turnDivider` 派生器），在轮次结束的那一刻锚定：
  耗时、工具调用数，以及该轮写出的文件，表现为**按所属工具切分的两个 chip**——“N specs”与
  “N files changed”。该切分是一次**划分**（一个路径只落在一侧，绝不重复计入），由派生器根据注入的
  `isSpec` 谓词计算——store 的 `specPathMatcher` 作用于工作区的规范图，外加 `spec_create` 的目标，
  后者按构造就是规范，即使图快照还没跟上。为何重要：规范常常是**被 git 忽略**的临时产物
  （`.thinkrail/context/`），因此把它算成一个“变更的文件”会把用户深链到一个结构上无法展示它的
  Changes 视图。现在每个 chip 都路由到拥有该产物的面板。
  **一个产物 → chip 就是直接深链；多个 → 它就是一个展开块**，把该轮的文件集就在此处的对话记录里
  展开成列表（`ArtifactChip` + `ArtifactList`），每行深链一个路径。这个集合被保留在聊天里而不是框在
  面板之上，是有意的：它属于*这一轮*，而面板显示的是*现在*——几天前的轮次会标出那些早已变动的行（或者
  对 Changes 而言，已完全不在 diff 里）。这也让计数保持诚实：点“5 files changed”绝不会悄悄只给出第一个，
  而各 handler 恰好只接受一个路径，因此下游无需猜测用户指的是几个中的哪一个。
- 这两个 chip 是一个**开关，而不是两个独立的折叠**：最多只有一个列表打开，选择另一侧会替换它，再次选择
  已打开的那个会清除选择。该不变量是*结构性的*——分隔条存储**选中的键**（`useSelection`，每个分隔条行一个
  条目），因此不存在两者同时展开的状态。展开还会**揭示拥有该侧的单例工具**（`onReveal` → store 那个与
  布局无关的工具揭示意图）而不暴露任何路径，这正是让这一对读起来像在 Specs 与 Changes 之间切换的原因；
  关闭等于“算了”，并把该工具留在用户最后送到的地方。
- **宿主的轮次回执胜过工具参数。** `deriveRows` 还会接收**本聊天**记录下来的 agent 运行
  （`ChatTranscript` 里按 `sessionId` 过滤的 `store.turnsByWorkspace`——一个工作区的其他聊天也会写文件）；
  `matchTurnReceipt` 按运行的开始时间把它们与某一轮关联起来，区间从该提示词到（不含）*下一条*提示词。
  两个时间戳都来自宿主，而 pi 在开始运行之前就给用户消息打了时间戳，因此这里不该留时钟偏移余地：把区间
  向后挪会在两条提示词相隔不到一秒时偷走回执。规范化的用户回声会替换懊观消息，同时保留它的行身份与附件
  标签，因此即使浏览器时钟不同，实时回执也使用宿主时钟。当一轮拥有回执时，文件 chip 会列出*那些*路径
  并带上每个文件的 `+/−` 计数，读作 `N files changed · +a −r`——工具参数会漏掉 shell 写入、格式化器与
  重命名，而快照才是 agent 实际留下的东西（见服务端 `turns` 规范）。合并回执之前，工具路径会对着工作区
  规范化；`spec_create` 的分类能在待处理的图刷新中存活，因此一份规范绝不会同时出现在两个 chip 里，也不会
  以绝对与相对路径形式出现两次。一轮中的多次运行（一次引导、一次重试）会合并成一份回执，横跨第一次运行的
  基准树到最后一次运行的头部树，并使用它自己的 scope id（`first..last`），因此它绝不只与最后一次运行共享
  同一个复查标签页。文件 chip 旁边会出现一个 **Review turn** chip，它调用 `onReviewTurn(scope)`，
  `ChatTranscript` 把它路由到 `requestChangesView(workspaceId, null, scope)`：Changes 面板采用该轮次的
  scope 并为其打开复查标签页；chip 的 `+a −r` 是它计入的文件的求和（规范有它们自己的 chip），而多次运行
  的一轮的每文件统计是最后一次运行对该路径的——复查标签页显示真正的 first-base → last-head diff。没有
  回执时（更旧的宿主、零变更的运行）分隔条行为与之前完全相同；快照已被清理的回执仍会渲染（客户端无从
  知道），而清理只在点击 *Review turn* 时才显露——作为复查标签页那个感知 scope 的 `UNKNOWN_COMMIT`
  通知。

行/步骤 id 在流式快照之间保持稳定（外部运行的第一个原子步骤 id、每个思考块以消息为锚的索引，以及每个
工具自己的 id——pi 只追加，绝不重排），因此折叠状态能在重新派生与虚拟化中存活：**每个折叠表面（外部
活动组、嵌套思考组、工具行、`ToolCard`、分隔条的多产物 chip）都把手动切换记录在共享的 `foldState`
缓存里**（`foldState.ts`，按行/步骤 id 键控。该模块之上有两个 hook：**`useFold`** 用于独立的布尔值，
**`useSelection`** 用于单选组——分隔条的 chip，它们把*选中的键*存在 `${rowId}:artifacts` 下，而不是
每侧一个布尔值，因此“只有一个列表打开”不可能被违反；`AskUserQuestionCard` 也是这个模式，见
tools/SPEC.md；有意地从不驱逐——增长由手动切换限制）。手动切换永远优先——优先于自动展开的默认值*也*
优先于虚拟化重新挂载。`FoldGeometryProvider` 是对话记录显式的变更前/后接缝：每个折叠头部都通过
`useFold` 注册一个稳定的、由行派生的 id，包括 `Collapsible` 与由回退驱动的自动展开/折叠。它把脱离锚点的
稳定化通过 `ReadingBandController` 的单一运动通道路由，并从变化行的测量几何刷新。完全在屏幕外的展开块
用自身的行高增量来保住可见的对话记录。如果一个粘性面包屑折叠了包含读者视口的展开块体，那段内容就不再
拥有存活的锚点，于是折叠后的原头部在视口边界处取而代之。读者输入或更新的揭示只取代稳定化的滚动段，
且不会让一个在途的跑道释放无处安放。

**消息顺序投影。** `deriveRows` 仍然是规范化且按时间顺序的。纯函数 `projectRows(rows, chatMessageOrder)`
在用户行处划分该序列（用户之前的一段通知自成一个组）；oldest-first 原样返回输入，而 newest-first 反转
组顺序**以及**每个组的顶层行：`1,2,3 | 4,5,6 → 6,5,4 | 3,2,1`。稳定的行 id 逐字存活，因此折叠、闪烁、
工具状态与历史锚点都不会分叉。该投影绝不深入到一行内部：Markdown 段落/代码、工具卡片体、复查包评论，
以及 Activity 行自身的展开层级都保留它们的语义顺序。Virtuoso 与 DOM 遍历消费投影后的行；Pi 轮次、
持久化、流状态与每一项非呈现的派生都保持时间顺序。`chatPreferences.ts` 拥有这个封闭的偏好及其
oldest-first 默认值，然后在 React 挂载之前水合 store。浏览器客户端读写一个限定宿主的 localStorage 键，
并在同源标签页之间同步该键；原生外壳可以在它稳定的后端配置/窗口身份之下注入同一个窄的字符串存储适配器，
这样动态的 loopback 端口就不会在重启时抹掉该偏好。它绝不进入 `AppConfig`，因此选择 newest-first 不会
改变另一个浏览器、设备、宿主或原生窗口。同一条持久化接缝还拥有**流式响应移动**，那是一个
`{ settle, trigger }` 客户端本地偏好，而不是第二条适配器/订阅路径（Trigger 是响应边缘触发一次步进的
位置；Settle 是每次步进把它放置的位置）：两个值都用 5 点步长，Settle 为 25–90，Trigger 为 35–100，
两者间隔至少 10 点，默认值为 `{ settle: 75, trigger: 100 }`。无效的存储会原子地回退到默认对。它同样
绝不进入 `AppConfig`，也不跨线上协议。

**粘性活动面包屑。** 当对话记录顶部可见的内容仍处于已展开的 Activity → Thinking → 工具展开块内部、而
这些块的原本头部已滚出视口上方时，一行不透明的紧凑行会携该活跃的根到叶路径叠在滚动容器之上。各段只在它
自己的头部越过顶部之后才加入，在兄弟/结束边界或折叠时离开，并包含活跃的叶子工具。一个段的标签会滚动并
聚焦它位于粘性行正下方的原头部，而不改变折叠状态；它单独的 chevron 通过既有的折叠状态源写入。这一轨迹
永远只有一行：元数据在名字之前截断，然后在窄窗格里保留最外层与活跃的段，把中间的祖先压缩为 `…`。它绝不
重排对话记录内容、创建并行的导航/折叠状态，也不干扰 Virtuoso 那个感知模式的 latest-edge、reading-band
与跳转消息行为。根到叶的标签与 chevron 在一个有标签的导航区域里是彼此独立的键盘目标；视觉上的进入/退出
遵循 reduced motion。

## 扩展点 —— 工具注册表

`toolRegistry.tsx` 是**那个扩展点**；一个工具有两个解耦的半边，由**工具名**连接：**能力**在服务端向 pi
会话注册（自定义工具或 pi 扩展/技能），**呈现**在这里注册。注册表 `Map` 与回退渲染器保持应用本地；
`extensions/registerWebExtensions()` 在 `ChatView` 加载时把来自 `extensions/registry.ts` 的有序描述符
馈给它。内置应用渲染器保留它们本地的副作用式注册。渲染契约（`ToolRenderProps`、`ToolStatus`、注册
元数据）与纯的参数/结果辅助函数来自 `@thinkrail/extension-api/web`，而不是 chat 内部。`Markdown` 从
`@thinkrail/ext-visualize/web` 具名导入 `MermaidView` 用于围栏 mermaid；shiki 与高亮的 `CodeBlock` 仍是
应用本地的。一次注册包括：

- 一个**渲染器**（专门的卡片体；`ToolRenderProps` 携带 `toolCallId`/`args`/`result`/
  `status`/`workspaceRoot`/`streaming`，外加一个可选的、由外壳注入的 `onOpenFile` 回调——足以保持
  props 驱动；公共调用接缝会一致地装饰它已完成的规范化图像结果），以及可选的
- 一个 **`summary`** —— 折叠头部与活动步骤行用的纯函数一行摘要，
- 一个 **`chrome`** —— `"card"`（默认，`ToolCard` 框架）或 `"bare"`（拥有自己的框架；用于
  `ask_user_question` 这类可交互/主要工具），
- **显著度元数据** —— `prominence`：`"routine"`（默认，包括未注册的工具——进外部 Activity 运行，
  直接在第一个思考之前或当前嵌套 Thinking 展开块之下）或 `"primary"`（逃出折叠；`"bare"` chrome
  **无条件** 蕴含它，甚至压过显式的 `prominence: "routine"`——自带框架的渲染器无法活在折叠的步骤行里，
  因此错误的注册绝不能让折叠悄悄坏掉），以及 `defaultExpanded`（一个主要卡片在完成后展开渲染，例如
  `visualize`）。通过单一的 **`resolveProminence`** 接缝读取——按用户覆盖的映射（设置）以后可以从那里
  接入。

每次注册表读取（渲染器、摘要、chrome、显著度）都走同一个解析器：精确工具名，否则最长的应用本地前缀注册
（`registerToolRendererPrefix`——今天只有 `mcp__`，因为 pi 按服务器给 MCP 工具命名），否则默认值。精确名
永远优先，空前缀绝不匹配，而扩展描述符只按精确名。

未注册的工具回退到 `DefaultToolRenderer`。运行中需要用户输入的工具，要么走扩展 UI 桥
（`pi.extensionUi` → `ExtUiDialog`），要么——对于丰富的内联卡片——从它们的 `toolCall` 参数渲染并通过
**`ChatActions`** 回复（见下文）。完整示例：[tools/SPEC.md](tools/SPEC.md) 里的 `ask_user_question`
流程。

## 交互接缝

- **对话记录/外壳拆分** —— `ChatView`（导出的集成组件）拆成一个隔离频繁变动的 `ChatTranscript` 子组件，
  它拥有每次增量的对话记录渲染——（通过 `useShallow`）订阅它所渲染的流式运行时字段（turns、
  toolResults、currentAssistantId、askAnswers、turnIdByMessageIndex、isStreaming、settlementTick、
  hostState、syncedConnectionGeneration、eventRevision）——并拥有滚动容器与行——外加一个外壳，只读
  细粒度的、很少变化的字段，因此文本/思考/工具的增量不再重渲染头部/输入框/队列/对话框；完成 ack、
  位置揭示以及提问焦点 scope 住在子组件里（一次内部重构；`ChatActions`/`AskStatesContext` 由
  `ChatTranscript` 提供）。外壳仍然读取 `turns`/`askAnswers`/`toolResults`，但只通过浅比较的派生选择器
  （最近的提示词、计划一瞥），这些选择器在流式增量之间保持稳定，因此它不会因它们而重渲染。
- **结构化工具文件导航** —— `ChatView` 接受外壳传来的可选 `onOpenFile(path)`，并把它透传给每条
  `ToolRenderProps` 路径（常规、主要、卡片或 bare）。共享的工具文件原语只为非空相对路径，或被
  `workspaceRoot` 包含的绝对路径提供该动作；URL、逃逸出工作区的相对路径与外来绝对路径保持为可选中文本。
  渲染器只从明确的工具参数/详情取候选——绝不用正则去猜 Bash 输出、代码或散文。独立渲染器没有回调，因此
  保持惰性。该回调的预览槽语义属于 [[submodule-web-panels]]。
- **`ChatActions`** —— 一个 React context（由 `ChatTranscript` 提供，独立时 `null`）：渲染器如何**回话**给
  agent——或请求集成层打开某个东西——而不导入 store/transport。今天有：`answerQuestion(toolCallId,
  result)`——当宿主拒绝（未知/已作答/已被取代的调用）时它会拒绝，失败 UX 归调用方所有——外加
  `focusComposer()`，供一个*自己*就把自己解析掉的渲染器使用：它卸载了用户当时站着的那个控件，否则焦点
  会落到 `<body>` 上、吞掉随后的每一次按键（正是历史浮层的解除后重新聚焦所避免的那种错位）。只有卡片
  自己的回复路径调用它，且只在卡片仍持有焦点时。外加 `openSubagentTranscript(childSessionId)`——子代理
  卡片的对话记录链接（没有 provider → 卡片隐藏该动作）。
  可选的 MCP 动作——`readMcpOutput(toolCallId)`（本聊天的 `mcp.readOutput`）、`openMcpSettings()`
  （Settings › MCP servers）与 `openProviderSettings()`（provider 支持的认证用 Settings › Providers）
  ——由 `ChatView`（经由 `ChatTranscript` 的 provider）只在支持 MCP 的宿主上提供；没有它们时（更旧的宿主、
  计划页面的 provider，或 `null`）MCP 卡片会隐藏 Full output 与 Sign in
  （[tools/mcp/SPEC.md](tools/mcp/SPEC.md)）。
- **子代理对话记录视图**（`SubagentTranscriptDialog.tsx`——一个集成文件，像 `SkillsDialog` 那样）：
  `SubagentTranscriptPane` 用同一套原语（`messagesToRuntime` → `deriveRows` → `ChatTurnView`）渲染一个
  隐藏子代理的**只读**对话记录，经由以 `(workspaceId, parentSessionId = this chat, childSessionId)` 为键
  的 `subagent.getTranscript` 抓取；同一文件里的对话框把该面板包成浮层，供子代理卡片的
  `ChatActions.openSubagentTranscript` 使用，而 Resources 检查器把该面板嵌为它的子代理详情。两者都渲染在
  一个 `null` 的 `ChatActions` provider 之下，因此里面的任何东西都无法回话（也不可能存在嵌套的对话记录
  链接）。活性随每个响应来自**宿主**：`subagent.getTranscript` 携带该运行当前的注册表 `status`（宿主不再
  知道该运行之后——重启、dispose——则为缺省）。挂载的面板保持恰好一次在途读取，只在状态为 queued/running
  且收到响应之后才调度下一次约 2.5s 的轮询——绝不来自本聊天自己的运行时（它冻结的后台 ack 无法区分一个
  活跃运行与一个丢失于重启的运行）。终态/缺省状态，或线上协议永久的 `SUBAGENT_TRANSCRIPT_NOT_FOUND`
  会停止；普通传输失败在面板保持挂载时以封顶退避重试。轮询快照以子作用域 id 水合，这些 id 由每条持久化
  消息的 role/timestamp/index 派生，因此只追加的刷新能保住行身份与手动折叠，而不是重新挂载对话记录。
  它在该运行期间、完成之后，以及宿主重启之后都能工作（对话记录持久化在磁盘上；只有内存注册表会丢失——
  而它的缺失恰恰是让轮询停止的东西）。
- **`askState`** —— 问卷生命周期接缝：纯函数
  `deriveAskStates(turns, askAnswers, toolResults)` + `AskStatesContext`/`useAskState`（由 `ChatTranscript`
  提供，也由计划页面的 `PlanAskQuestion` 提供，以便同一张 `AskUserQuestionCard` 可以从计划里作答——见
  `panels/SPEC.md`；独立时 `null`）。一次活跃的阻塞提问通过它的原生工具结果解析；一个重启后被修复的合格
  ack 稍后通过 `ask-user-answers` 解析；一次用户直接打字越过的活跃提问会原生返回同一个 ack，因此
  “已被取代”（ack + 之后的用户轮次）无论会话是实时的还是恢复的，读起来都一样；stopped/error/length
  结果则是终态，因为 Pi 从不执行来自被 length 截断的 assistant 响应的工具。“已作答 / 已被取代 / 已停止 /
  等待中”因此从全部三个对话记录投影中派生一次，并被卡片与计划一瞥消费，使两者在其他地方都保持 props
  驱动。同一条接缝还提供一个不透明的**按挂载的 ChatView 焦点作用域**：一张等待中的卡片在该作用域内只
  认领一次注意（因此 Virtuoso 的重新挂载无法偷走焦点），而全新的挂载会创建新作用域、并可能再次聚焦那个
  仍然待答的问题。“全新挂载”比关闭/重开聊天更宽：`CenterTabs` 只渲染活跃标签页的主体，因此**每一次切回
  聊天标签页**——从文件、从 diff、从另一个聊天——都是一个新作用域，并会为仍在等待的问题重新认领注意。
  这正是预期的读法（你回到了需要你的那个聊天），而不只是一个副作用。它不携带任何 store 或 transport 状态。
- **水合**（`hydrate.ts`）—— 纯函数
  `messagesToRuntime(TranscriptMessage[], lastSettlement?, { idScope? })` 转换器（事件 reducer 的读取侧
  对应物）：从持久化的对话记录重建 `{ turns, toolResults, askAnswers, turnIdByMessageIndex }`（一个
  `HydratedRuntime`），使重连/第二个客户端渲染得与实时路径完全一致（相同的 `raw` 结果形状）。一次性消费方
  保留新铸的 id；重复快照的消费方提供它的会话作用域，为持久化的轮次派生稳定的 role/timestamp/index id。
  当提供了 `lastSettlement` 时，以实时摘要的它为准；否则只有最后的对话式 assistant 能合成一个
  error/length 轮次。被压缩掉的历史 length 尝试后面跟着更晚的消息时仍是历史，而不是一条陈旧的当前警告。
  两条路径上同一条重试呈现规则：pi 会持久化一个被取代的自动重试尝试（“keep in session for history”），
  而实时 reducer 在 `auto_retry_start` 时已丢弃它，因此水合会隐藏一条后面紧跟着另一条 assistant 消息的
  出错 assistant 消息——正是 `_prepareRetry` 产生的相邻形状（`isRetriedAttempt`）；一个终态失败——出错的
  assistant 后面跟着一条用户消息或什么都没有——保持可见，它的失败由尾随的、由落定派生的错误轮次报告。
  它还返回 `turnIdByMessageIndex`（消息位置 → 铸造的轮次 id）——历史搜索的“跳到消息”深链
  （`chatLocationRequest`，见 `store/SPEC.md`）所解析的跳转锚点映射；对 `toolResult` 或非轮次的 `custom`
  消息，条目为 `null`（一条 `subagent-completion` 消息映射到它自己的完成轮次的 id；即使没有文本，它也
  永远不是锚点匹配），而对 `compactionSummary` 同样如此（它自成一轮，但绝不是搜索命中——宿主的索引
  消耗同一个槽位，因此两者保持对齐）；而以 `stopReason: "error"` 结束的消息映射到它自己的 assistant 轮次
  的 id，绝不是合成的错误轮次的 id。`custom` 消息：`ask-user-answers` 索引进 `askAnswers`（绝不是轮次——
  问卷卡片是它的渲染）；`subagent-completion` **变成它自己的 `subagentCompletion` 轮次**（完成卡片是按
  对话记录位置放置的，因此它同样映射自己的消息索引）；`todo-review-fix` **变成它自己的 `reviewFix`
  轮次**（同样的定位）；未知的 customType 被忽略。不碰 store/transport/shiki。
- **跳到消息**（`chatLocationRequest`——在一条已映射的消息命中上按 Enter 时由 `useHistorySearch.ts` 的
  `openMessage` 设置；store 层的请求/清除契约与工作台外壳集成的打开/重开/水合半边见 `store/SPEC.md`）
  —— `ChatTranscript` 是唯一的消费方。一旦 `rows.length > 0`，它就通过 `runtime.turnIdByMessageIndex`
  解析请求的 `messageIndex`（该映射只存在于*已水合*的运行时——实时/已打开会话的运行时由事件 reducer 构建，
  从不携带它），回退方案是扇描 `turns` 找出自身文本包含 `anchorText` 前缀的最新一条——同样的回退也覆盖
  一个已水合映射条目其轮次已不再包含该锚点的情况（例如对话记录在它下面变了）。解析出的轮次通过纯函数
  **`rowIndexForTurn(rows, turnId)`**（`rows.ts`）映射到行，调用时传入投影后的行——`user`/`system`/
  `error`/`retry` 用轮次自己的行，`assistant` 则用它的第一个 `:text:` 行（后者的轮次会消解成
  `markdown`/`tool`/`activity` 行，绝不自成一行）——随后一次可取消、无动画的实体化从 Virtuoso 的测量
  尺寸快照派生目标（只对从未测量过的行用保守估算），再由控制器拥有的居中像素修正完成。实体化会一直挂起，
  直到该确切行在稳定帧之间保持挂载、且在该对齐处保持已测量；Virtuoso 估算修正期间的一次短暂挂载不算成功。
  它绝不启动 Virtuoso 内部会重试的 `scrollToIndex`，因此读者接管能取消每一个未完成的写入。它的生命周期
  以请求身份为键，而不是随流式行数组的频繁变动；它的实时行索引解析器会跟随请求挂起期间发生变化的投影。
  一个短暂的 `flashRowId`（渲染为 `data-flash` + 行包装器上的 `bg-primary-subtle` 过渡，1600ms 后清除）
  只在行挂载之后吸引视线。解析到一行、读者显式取消，或耗尽有界的实体化等待（以“couldn't locate the
  message”弹出 toast）都会清除那个确切的、仍然当前的请求；更早的 effect 不得清除更新的跳转。取消是
  用户优先的失败路径，有意做成静默的，而不是顶着读者重新开始。effect 的拆除会把它的身份校验式清除推迟
  一个微任务：紧接着的 StrictMode 或替换挂载会先认领同一个请求，而真正的卸载会终结它。`ChatTranscript`
  是它唯一的终态消费方，因此一个未解决的当前请求绝不能滞留。
- **在当前对齐目标处打开** —— `ChatMessageOrder` 选择物理的 latest 边缘：oldest-first 为底部，
  newest-first 为顶部。阅读带是唯一的挂载放置拥有者。它在第一行挂载之后、依据那一刻的工作状态
  放置一次：一个空闲的 oldest-first 对话记录会无动画地跳到最终行，并在测量帧之间把它保持住（运动种类
  `mount`）；一个空闲的 newest-first 对话记录留在原生的零滚动原点；一个工作中的对话记录直接在 Settle 处
  重建，只留出其活跃响应所需的空间，并在同样的测量帧之间保持 Settle，无动画地重新应用且绝不后退，因此
  行测量无法把 latest 边缘推出屏幕。挂载目标跳过跟随步进的上限，因此短视口仍能把边缘落在 Settle。
  Virtuoso 不获得 `initialTopMostItemIndex`：它会隐藏列表直到滚动到那一行时看到尺寸不再变化，而流式的
  最终行永远不会允许这一点，因此一个返回的或刚打开的工作中聊天曾一直空白。放置会在原生输入挂起期间、
  以及工作中对话记录还没有流边缘时保持挂起。空闲保持期间开始的流会取消该保持，并在 Settle 重新放置。
  读者接管、新轮次，或任何控制器揭示/锚点稳定化（跳到消息、卡片自动展开、折叠）都会取消待处理的放置；
  那股运动随后拥有位置。切换顺序会重新武装放置，因为跨越整体反转去保留像素位置没有稳定含义。不存在
  中间的错边缘绘制，也没有跨顺序的动画。初始虚拟几何是**感知行的**：每个投影行获得一个保守估算，它由
  散文折行、块间断与物理的围栏代码行派生，且不切开一个规范化 Markdown 块。这些估算镜像渲染后的行外壳
  （行与气泡内边距、段落间隙、散文行高、高度下限）并随之移动：曾经一次密度处理让它们变陈旧，从而把
  Virtuoso 的测量修正从增长翻成收缩，并让一个 newest-first 的 return-to-latest 卡成脱离状态
  （`chat-scroll.spec.ts`）。有界的像素与条目 overscan 让附近的离群值在粗粒度输入耗尽虚假范围之前替代
  估算。原生滚轮物理保持不动。`chat-history.spec.ts` 钉住默认的 latest 边缘与高历史几何；
  `chat-order.spec.ts` 钉住两种投影。
- **对齐是显式的，而非根据邻近推测** —— `useChatScroll` 拥有两个正交事实：实际工作（`agent_start` 到
  `agent_settled`）与对齐（`following` 或手动 `detached`）。工作中跟随意指配置的响应窗口；空闲时跟随意指
  物理的 latest 边缘。工作中处于 detached 时显示感知顺序的 **Follow response** 按钮；空闲时处于 detached
  时显示 **Latest**。自动聚焦、行测量、内容增长、程序化揭示，以及 Virtuoso 的便利边缘阈值，永远不能创建
  或清除 detachment，因此该按钮永远意味着有人接管了。
- **读者意图与精确边缘重新武装** —— 滚轮、触控板、触摸、滚动条与导航键输入，只在它能导致或已经导致真实
  视口移动时才解除跟随；对一个正在跟随的读者，朝当前物理边缘向外推是空操作，而一个已经恰好停在该边缘的
  detached 读者（保护读者的空间可能让那里无可滚动）会在同一次推动上重新武装。潜在的原生输入会暂停与之
  竞争的控制器运动，并阻止新的自动运动直到它解析为止，而不改变对齐（连续跟随几乎每一帧都写入，因此
  落在读者手势与其滚动之间的一次写入否则会被它吞掉）。一次被中断的返回在等待滚轮或导航键默认动作时，
  逻辑上仍在运动；显式的指针按住则是静止的。如果之后没有移动，对齐会在有界的输入意图窗口之后恢复，而不是
  在下一帧，因为内嵌的 webview 可能在该帧之后应用默认的滚轮滚动。向历史中的移动会解除一次；打断活跃对齐
  的原生移动也会解除，即使它朝着 latest 方向，除非那次移动本身就到达了精确边缘。显式的文本选择，以及用户
  发起的消息/历史、面包屑或工具页面导航，也会解除。指针来源在释放后仍存活足够久，以覆盖原生滚动条轨道
  动画；键盘来源覆盖来自可交互对话记录控件的焦点诱发滚动；两者都在滚动结束或有界超时后失效，因此之后的
  几何无法继承它们。一次返回手势只有当它在共享的 1px 几何容差内到达物理 latest 边缘时才重新武装一次；
  方向随顺序反转，而触摸/触控板意图能穿过惯性存活。没有 50px 的近边缘阈值，仅几何变化也不得重新武装。
  展开或折叠一个 Activity、Thinking、工具或消息展开块是几何变化而非导航：它保持对齐，在跟随时重新指定
  当前 latest/响应目的地，并让 detached 读者的可见锚点保持固定。自己的 Send 会有意重新接上，并把它的
  用户行放在对话记录高度的 10% 处、夹在 48–80px；一次排队/后台的延续在启动时保留 detached 读者。
- **流式响应移动只存在于工作期间，且以窗口步进移动** —— 跟随时，当活跃响应填满其提示词下方的窗口时，
  视图保持静止。每当响应边缘越过 Trigger（默认 100%），唯一的运动拥有者就做一次缓动的约 220 ms 步进，
  把边缘放到 Settle（默认 75%），然后再次静止，直到边缘又一次越过 Trigger。正在阅读的文本保持静止正是
  重点：连续跟随（把边缘保持在 Settle 并逐帧平滑）曾被尝试并否决，因为正在读的那一行从未停止缓慢漂移。
  步进的目的地在步进的每一帧都从实时几何重新计算，因此步进期间的增长被计入，且步进绝不越界。步进
  绝不后退。合成空间是**派生出来的，绝不累积**：在步进期间它恰好是 Settle 目的地中超自然滚动范围的
  那部分；步进之间它是保护读者的余量，在每次内容变化时于绘制前重新计算，因此响应增长一对一地消耗它，而
  可见内容与滚动范围都不移动。旧的步进实现在晚一帧才消耗空间，导致滚动范围抖动、每次步进都摇晃；正是
  那个缺陷（而不是步进模型）让它感觉跳。因此 oldest-first 最多需要下方 `100% - Settle` 的带；
  newest-first 在可用时使用更旧的投影内容，并把任何合成余量留在最旧的组之后。合成空间绝不切开一个被
  反转的请求/回答组。**Follow response** 与一次精确边缘返回会做一次到 Settle 的步进并重新武装循环。
  读者接管绝不移动读者：空间只收缩到读者当前位置所允许的程度（文档可能恰好结束在其视口底部），之后
  增长或向上阅读会消耗剩余部分。一次释放空间的揭示（工具注意、跳到消息、面包屑）在其目标仍是最新行时
  暂停步进，因为它即将自己放置视口；它之后的第一个新的 latest 行（例如解析完一个问题之后的回答）会结束
  暂停。为响应的剩余部分一直暂停会让每一次问题卡片之后的跟随被冻结，然后在落定时飞出 2–2.6k px。一次在
  原生输入仍挂起时到来的落定，会把它的返回推迟到该输入解析，并在该输入已解除时丢弃这次返回。
- **高个子到达会显示它的起点** —— 在 oldest-first 里，控制器记住读者真正在屏幕上拥有过的最后一个响应边缘。
  当跟随目的地会把该边缘带到轮次内缩之上时——高于阅读空间（Settle 线减去轮次内缩）的内容到达了它下面，
  通常是一张立即渲染的图或卡片，可能分几个快速的布局步骤——目的地会被封顶，使那个点落在轮次内缩处，即
  自己的提示词落到的同一位置。封顶生效后 300 ms 内的增长属于这次到达；之后每一次增长都会按自身高度的两倍
  释放封顶，直到达到 Settle，而视图仍然只按窗口步进移动：一旦封顶后的目的地至少超前一个窗口
  （`Trigger − Settle`），就发生一步，因此该块以两倍阅读速度前进，而不是一拭而过（一张 mermaid 卡片被
  测到在不到一秒内滑行 1.5k px，而单独判断每个布局步骤会漏掉那些分两步落地的卡片）。第二次高个子到达
  绝不把生效的封顶再往前推。封顶在跟随目的地所在的任何位置都被评估，因此它也给一个已在途的步进设了界。
  位置相对于最上方的可见行而不是文档坐标保存，而每次评估都会把它们相对当前那次重新表达，因此视口上方的
  高度变化（Virtuoso 替换估算、一个代码块高亮）既不会触发也不会错放封顶，行可以卸载，而一个在已经跟随
  它的行上方增长的块（WebKit 在下一轮的行已存在之后才渲染图）仍然被计入。改为锚定最后一行恰好漏掉了那种
  情况。一次宽度重排、读者自己的展开块切换，以及一次全新挂载会重新取用已见边缘，而不是算作一次到达；自动
  展开（卡片完成时打开）仍然可以算。一个 Markdown mermaid 围栏就地替换自己的源码，因此它渲染后的顶部
  位于旧边缘上方恰好一个源码高度处，而封顶从那个点开始显示图。Newest-first 在最前面插入它的最新行，因此
  那里的边缘增长不是追加内容，封顶不适用。**Follow response**、一次精确边缘返回、新轮次、读者接管，以及
  一次释放空间的揭示会清除它。落定像任何其他跟随式落定那样结束封顶：下方仍未看到的内容得到那一次向前的
  移动直到末尾。在那里把读者解除反而会让 **Latest** 在无人接管的情况下出现，并把增量成大批到达的纯文本
  回答卡住。
- **跟随会让屏幕上已有的内容保持静止** —— 当一位跟随的读者观看 oldest-first 的流时，最上方的可见行就是
  视图的锚点：只有控制器自己的写入与读者输入可以移动它。在每一次改变条目列表的布局之后（绘制前），以及在
  hook 未引发的任何滚动上，移动了的锚点都会在同一帧被恢复，并在滚动范围收缩时补上合成空间。一次恰好落在
  收缩后范围末尾的滚动是一次 clamp，会被留给绘制前路径处理，该路径跑在 Virtuoso 自己的尺寸补偿之后；若从
  滚动事件里恢复它，Virtuoso 会把该 clamp 读成向上阅读并把恢复补偿掉（Chromium 里 844 px 的跳动）。有
  两个被测量到的原因促成了这点，而两者在无虚拟化时也同样出现：一张已作答的问题卡片折叠 400–800 px
  （浏览器 clamp 该范围，然后 Virtuoso 的尺寸补偿再滚动剩下的部分），以及 WebKit 在一条工具行出现在一条
  被重渲染的文本行旁边时重置 `scrollTop`（627 → 0），其间没有任何脚本写入、焦点或滚动锚定参与。该守卫在
  读者处于 detached 时、原生输入挂起时、揭示/折叠锚点/落定运动期间，以及一次轮次锚点把放置交给 Virtuoso
  之后的 1.3 s 内处于空闲（它的 `scrollToIndex` 在尺寸不断变化时会重试；之后的重试瞄准同一轮次位置），
  因此它绝不与某人要求的放置相争。合成空间始终挂载（不用时高度为零），以便守卫能同步地增长它；留下的空间
  是保护读者的，之后的增长会消耗它。会自报其到来的变化完全绕开 clamp：当一位跟随的读者观看流时，折叠接缝
  （展开块，以及问题卡片自己的提交——它把卡片换成一个小的“Answer sent”状态）在 DOM 变化之前为变化行的
  整体高度预留空间，然后把它修剪到读者位置所需。该修剪会把比视口短的内容也算进去，因为此时真正的自然
  滚动范围是负的；把它 clamp 在零会少预留那个差额，并让一段很短的对话记录在一个回答之后下滑 280 px。
- **落定绝不移动已经接管的读者，也绝不把内容往回移** —— 每一次 `agent_settled`（而不是 `agent_end`）
  结束响应移动。在 oldest-first 里，一位内容已经结束在视口内的跟随读者会精确留在原处：剩余的合成空间变成
  保护读者的空间，随着读者向上滚动或下一轮开始而消失，绝不通过滑动屏幕上的内容来消失。在落定时移除它会把
  每个已完成的回答向下滑最多 `100% − Settle` 的带（实测约 100 px），并且在一次被吸收的卡片折叠之后会滑
  几百 px。只有当下方仍有未看到的内容时，跟随读者才会做一次平滑的向前移动到物理 latest 边缘；newest-first
  保持它那一次平滑返回其顶部 latest 边缘。detached 读者的可见内容精确留在原处，只有入口从
  **Follow response** 变成 **Latest**。在落定时把 detached 读者带回是实测到的最大拉扯（几万 px），并且
  与 reader-wins 相矛盾。store 在 `isStreaming` 之外还暴露一个单调的每会话落定 tick，因此被合并进一次
  React 渲染的开始与落定不会让一个乐观的轮次内缩或跑道滞留。延迟的虚拟测量会重新指定同一个有界返回，
  而不是造成硬钉循环。如果读者输入与落定相交，任一条空闲重接路径都会把部分的空间归零段向前带，而不是
  泄漏隐藏的跑道。一次被拒绝的立即提示词同样会取消它本地武装的轮次状态。
- **稳定的工作状态几何** —— 一个固定尺寸的槽位始终占据逻辑上的 latest 对话记录边缘：oldest-first 时在行
  之后，newest-first 时在行之前。工作活跃时它始终容纳一个礼貌的实时阶段——**Working…**、**Thinking…**、
  **Running `<tool>`…**、**Writing…** 或 **Compacting context…**；重试/provider 间隔回退到 Working 而
  不是卸载它。空闲时保留一个不可访问、视觉上为空的槽位，几何完全相同。可见阶段是单行的，并在窄窗格里被
  裁在槽位内，而它的完整 live-region 文本保持可访问。因此开始、切换或结束一个阶段既不移动对话记录对齐，
  也不移动输入框。
- **工具注意保持对齐来源** —— 一张等待中的 `ask_user_question` 可以清除临时空间并执行它既定的有界起始
  揭示/聚焦，但那条自动路径会按原样保留 following 或 detached，且无法暴露该按钮。原本就已 detached 的
  读者因为那次先前的动作而保有该入口；随后一次用户驱动的工具页面导航则可能解除。所有注意、历史、面包屑与
  行揭示都路由到同一个控制器。虚拟 DOM 之外的历史行会获得一次有界的、由 hook 拥有的实体化，来自 Virtuoso
  的测量尺寸快照；一旦挂载，它的居中修正使用该控制器，因此没有独立的重新尝试能比读者取消活得更久，也无法
  与落定竞争。尺寸感知的 `nearest` 会让一个高目标的有用前沿保持可见。
- **单一的、可取消可重定向的运动拥有者** —— 渲染器与投影绝不自己滚动。新轮次放置、窗口步进、上下文按钮
  返回、落定与显式揭示共享同一条不重叠的通道，其目的地可以随 Virtuoso 测量、状态几何或跑道的变化而重新
  指定。修正会延续当前运动，而不是发起重叠的缓动或交替的硬写入。读者的第一次真实移动会同步取消它，原生
  物理获胜。Newest-first 的头部增量保留一个 detached 的历史锚点；视口尺寸变化会重新评估实时百分比，而不
  移动一个低于 Trigger 的响应。初始/顺序放置是直接的，而 reduced motion 让每个程序化目的地立即生效，同时
  保持完全相同的状态与最终几何。
- **没有隐藏的运动拥有者** —— 除了控制器与读者，任何东西都不能移动视口。对话记录滚动器退出浏览器的滚动
  锚定（`overflow-anchor: none`）：Virtuoso 会排除它的条目，但 Chromium 否则会锚定到头部/尾部，并在响应
  在其下方增长时对读者做反向滚动。oldest-first 的顶部内缩是常量，而不是随合成空间切换；切换会在解除时
  把读者的内容移动那个 48–80px 的内缩，而在那里没有锚定补偿（WebKit）。合成空间在条目列表尺寸变化的同一
  帧里于绘制前完成对账，因此滚动范围与滚动条绝不逐帧抖动。Virtuoso 的尺寸变化处理不带它自己的动画帧推迟，
  因此视口上方的测量修正会在绘制前落地。滚轮监听器保持非 passive：passive 的那个会让 Chromium 在滚轮事件
  到达 hook 之前就应用滚动，于是移动在无读者意图的情况下到来，解除与精确边缘重新武装都不会触发。滚动仍
  保持响应，因为流式的增量只重渲染内容变化了的行，让主线程空闲。
- **输入框与外壳** —— `Composer`（提示词输入 + send/steer/followUp/abort、`@` 提及、`/` 命令 + 模板
  **槽位会话**（Tab 穿插的占位符——见下面的模板槽位（Template slots）条目）、图像粘贴/拖放——经由
  **`imageAttachment.ts`** 路由：`fileToAttachedImage` 在浏览器里解码，并把超过**长边 1568px** 的任何东西
  缩小（`fitWithin`；Claude 标准档的边缘——一旦 provider 那个 >20 张图 2000px 的上限生效，历史里一张
  超大图会让此后每一轮都 400，而 pi 自己的缩放器在服务端被有意关闭）。一张图像只有在像素边界之内**且**
  类型被 provider 接受（png/jpeg/gif/webp）**且**低于 provider 的 **4.5MB 编码后 base64 上限**
  （`IMAGE_MAX_BASE64_BYTES`，经 `contracts` 共享——pi 在 Anthropic 5MB API 限制下的自有余量；线上协议
  携带 base64，因此上限是按 `data.length` 衡量，`base64EncodedLength` 则在编码前给原始 File 估算大小）
  时才会字节不变地通过；其他任何情况都经 canvas 重新编码，在编码超出上限时走一条 **JPEG 质量梯**
  （一张在边界内但好几 MB 的 GIF，或一张很小的 BMP，会像超大尺寸一样让请求 400）。一个无法解码的文件
  **只在其媒体类型被 provider 接受时**（`ACCEPTED_IMAGE_TYPES`，经 `contracts` 共享）才回退到原样；
  无法解码 + 不支持（HEIC…）会被**拒绝**（`fileToAttachedImage` → `null`）——原样透传会让此后每一轮
  都 400——并作为附件条里一个可关闭的错误 chip 露出（`composer-image-error` testid），发送时清除。一条
  消息的批次还受请求级 **`REQUEST_IMAGE_BASE64_BUDGET`** 限制（24MB base64，Anthropic 每请求 32MB
  上限下的余量）：会让批次超出它的文件会被拒绝，并走同一个错误 chip 表面。服务端的 `imageGuard` 扩展是
  历史的第二道防线。当文件仍在解码时，会渲染一个占位 chip（`composer-image-pending` testid）并扣住发送
  （`canSubmit` 是唯一的读法——`submitText` 会拒绝，发送按钮会禁用）——否则一次解码中途的发送会漏掉
  这张图，并把它滞留到下一条消息。被扣住的发送会保留它的文本：输入框自己的手势会让草稿留在原处，而
  `insertAndSubmit`（浮层的 ⌘/Ctrl+Enter，其文本还不在草稿里）会把它停在那里而不是丢弃。待处理的 chip
  显示 `filename · W×H`（所选文件的名字；只有在没有名字存活的已水合轮次回退里才会出现 mime 文本）
  （`composer-image` testid + `data-width`/`data-height`/`data-mime`——`e2e/composer-images.spec.ts` 的
  钩子；两种 chip 皮肤共享 `FileChip.tsx`）。**chip 是有界的，而标签是唯一让步的部分**：一个 chip 是
  `max-w-full` 的并截断它的 `label`，而图标、`meta` 后缀与尾随动作不收缩——文件名是用户控制的，一个无界
  chip 会把它自己的 Remove 按钮挤出手机视口（并被对话记录滚动器的 `overflow-x-hidden` 裁掉）。因此在
  任何宽度下都必须可读的东西放进 `meta`，而不是 `label`：`· W×H` 尺寸，以及一个附件错误的原因（它的
  文件名会被截断——原因才是用户能据以行动的东西，而手机没有 tooltip 可依靠）——以及其命令式句柄上的
  `openHistory` → `onHistoryOpen`）加上共享 `prompt` 模块的**斜杠补全原语**（过滤/菜单/光标 + Up/Down、
  Enter/Tab、Escape）；`HistoryOverlay`（`Composer` 打开的历史召回/搜索浮层——纯呈现，完全由
  `useHistorySearch.ts` 的状态 + 回调驱动，外加在映射命中上的 **Save as template** 与一键
  **Trash chat** 动作（`ChatView` 拥有 `session.delete` + 幂等的 store 删除折叠；成功则关闭浮层，失败
  弹 toast；`session.deleted` 也在每个已连接客户端驱动那个折叠），以及一个 **zoomed-stage 预览窗格** +
  **scope 选择器**——见下一条）、
  **`ModelEffortPicker`**（那唯一一个 **model · effort 胶囊**，在会话前模式下也由 `NewWorkspaceDialog`
  挂载；`ModelsSettings` 仍挂载更旧的 `ModelSelector` + `ThinkingSelector` 这一对——在它们迁移之前是
  有名字的幸存者）。决策：聊天的模型与 effort 是**一件事的两部分**，由一个无边框触发器展示
  （`[vendor glyph] name ▂▄▆ level [connection glyph] ▾`——effort 条点亮该档位在模型推理档位中的排名，
  `litBars`，用该档位的**色调**——off/minimal/low 用冷蓝，medium/high 用强调色，昂贵的档位用警告琥珀
  色，因此成本先于文字被读到）并在一个 popover 里选择，其中**effort 控件位于模型列表之下并跟随所选
  模型**——因此可提供的档位始终是*那个模型的* `thinkingLevels`，而禁用的 effort 状态不可能存在。流程
  是**点模型 → 滑动 effort**：挑一个模型会立即应用它并保持 popover 打开（hover 从不改变任何东西——
  更早的 hover 预览会让 effort 行随着指针移动而跳动）；effort 控件是一个**滑块**：一根粗轨道藏着一道
  冷→暖渐变（`feedback-info` → `primary` → `feedback-warning`），手柄移动时揭开它，档位词与它的字形
  骑在手柄上，下方每个档位一个可点击的标签（用户保存的 `defaultEffort` 加点——web 绝不猜测宿主的回退
  档位），一行提示，以及昂贵档位（`COSTLY_LEVELS`：xhigh、max）上的一条警告说明。一个原生
  `<input type="range">` 驱动它——拖拽、点击跳转、触摸与 ←/→ 全都免费得到——并且每次变更都立即应用
  而 popover 保持打开；当档位与保存的默认值不同时，页脚提供 "reset to ‹default›"。手柄的位置是那唯一
  一处行内样式（一个 `--effort` 自定义属性，归一化几何的例外），颜色留在 token 里，`motion-reduce`
  会压平弹簧。Escape、一次外部点击，或点击已经当前的模型会关闭。`onSelect({model, level?})` 是模型
  回调（只有键入的 `opus high` 一次性选了两者时 level 才存在），`onSelectLevel` 是只含档位的那个，
  而调用方——绝不是选择器——与宿主对话（`ChatView` 在一次选择背后串起 `session.setModel` →
  `session.setThinkingLevel`，每一次模型*或* effort 挑选都会推进同一个选择计数器，因此串起来的档位
  只在那次挑选仍是最新时才发送——失败时也只在那时回滚：先 A·high 再 B·low 绝不会把 A 的档位落到 B
  上，而先 B·high 再滑到 medium 也绝不会让 B 的响应重发 high）。当一次目录刷新让会话停在一个它的模型
  已不再提供的档位上时，`ChatView` 询问宿主的 `model.clampThinking` 并应用答案——即
  `NewWorkspaceDialog` 已经为它那一对跑过的同一套对账，也是 pi 在请求时施加的同一个钳制——因此胶囊与
  滑块显示 pi 实际会用的档位，而不是轨道上并不存在的档位。
  行是**两行**：名称，然后是 `provider · [kind glyph] what it draws on · price · context`。列表读作
  **Default row**（仅限会话前的调用方，`defaultOption`：宿主会选的那个，当调用方跟随时打勾）→
  **Pinned** → **Recent**（宿主列表中除去已固定模型）→ 各提供商分组，在存在候选清单时折在单独一行
  "All models" 之后，并在搜索时展开。每个提供商分组都可折叠：它的头部本身就是一行 cmdk
  （`model-group-toggle`、`aria-expanded`，Enter 切换）并携带匹配数，而打开选择器时除当前模型所在的分组
  外全部折叠（当前模型已被固定时则没有展开的分组）；一次搜索会展开每个匹配的分组，每个分组在那次搜索
  中仍可折叠。头部读起来像一个分区标题（强调字重的名称、厂商字形），第一个之后的分组由一条分隔线隔开，
  其行缩进在头部之下并丢掉自己的厂商字形与提供商字样（头部两者都带了）——扁平的、无内边距的列表会让
  标题与模型难以区分。已固定的模型绝不在分组内重复。标题、计数与行由各选择器自己的 cmdk `filter`
  （`chat/pickerGroups.ts`，cmdk 默认评分器的移植版）匹配，因此一个标题在其任一模型匹配时匹配，且其
  计数等于它展开的行数。在没有查询也没有模型时，列表显示 "No models to show. Connect a provider, or
  show hidden models in Settings → Models → Visible models."；"No models found." 只在有查询时出现。
  隐藏的模型绝不进入任一选择器：调用方传入 `store` 的 `selectPickerModels`，它会保留当前模型。设置里的
  `ModelSelector` 共享这套分组、过滤、Pinned 分区、空状态与 "Updating…" Refresh，但没有 Recent 与
  头部的连接详情。一个末尾的查询词若点名了高亮模型支持的某个档位（`opus high`）会预选它——pi 的
  `model:level` 惯用法改用空格输入——而输入框里的 `/model [query]` 会打开预填好的选择器而不是发送
  文本。第二行**说的是用户实际付什么**（`kindLabel` / `costLabel`）：连接字形——**key** = API key，
  **∞** = 订阅，**{ }** = 环境变量 key，一个 **JCP** 标签 = JetBrains AI（Central proxy）——然后是
  套餐/变量/key 词，并且只在提供商按 token 计费时（`auth.kind` api-key / env）才加上
  `$in / $out per M`；分组头部再加上该提供商的连接详情。**厂商字形**（`ProviderGlyph`）是来自
  `generated/providerGlyphs.ts` 的单色 `currentColor` 标记，`scripts/generate-provider-glyphs.ts` 在
  构建时从仅开发用的 `@lobehub/icons-static-svg` 集合里抽取它（`provider-glyphs:check` 守卫漂移，像
  颜色流水线那样）；pi-provider-id → 标记的映射只存在 `scripts/providerGlyphs.ts` 一处，通过多个 pi
  提供商可达的厂商共享一个标记，而未映射的提供商渲染一个字母组合。标记绝不用品牌色着色——颜色系统
  拥有颜色。Pinned/recents/default 经 **`useModelPreferences(models)`** 进来（两个调用方共享的那唯一
  一个 store+transport 接缝：列表重新指向实时目录并丢弃消失的模型，`toggleFavorite` 作为整份列表的
  `settings.update`，`setDefault` 一起写入模型 + effort，全都以 `MODEL_PICKER_PROTOCOL_VERSION` 为
  门禁，因此更旧的宿主既不显示固定开关也不显示分区）。页脚持有 **Set as default**（一旦这一对匹配就
  读作 "Default for new chats"）与 **Refresh** 行（`force: true`，在等待中的刷新运行时转圈并读作
  "Updating…"；打开时触发一次由宿主快照服务的非强制读取）。web 仍然**不枚举档位词汇**：行就是
  `WireModel.thinkingLevels` 逐字，由宿主钳制，而 `LEVEL_HINT` 是一份定性文案的部分记录，某个档位可能
  干脆没有。行跟随**实时目录**——`ChatView` 在向下传之前经 `store` 的 `selectCatalogModel` 解析会话
  的模型，因此一个改变了某模型支持什么的 `model.refresh` 会随之改变所提供的档位）、
  `SessionStatsBar`、`ChatHeader`（固定的、单行的**面板头部行**——`h-panel-header-row`
  （`--panel-header-row-height`，当前 28px），与工作台 Group Headers 和 Changes 工具栏共享的结构
  几何，而不是在这里钉住的一个值；它绝不滚动，而受约束的宽度会裁剪/截断 TODO + 状态/用量文本，同时
  保留尾部的 Skills 动作。它的 **Skills** 按钮是那个呈现型 **`SkillsButton`** 原语——一个 `BookOpen`
  胶囊，当磁盘上某个技能目录变化时带徽标——同样与 `NewWorkspaceDialog` 共享，因此两个触发器无法漂移）、
  `ExtUiDialog`，以及 **`SkillsDialog`**（那个 **Skills 管理器**：一个按来源分组的目录，带**粘性分区
  标题**——第一方的 **ThinkRail** 与 **Pi** 分组领先（在 All-plugins 总开关之上，它只管插件分组），
  然后是 Personal / **每个已安装的 Claude 插件一个分组** / 仓库的 Project 技能最后——每个都带它的准入
  裁定、项目信任（与 Welcome 通知同一套 `projectTrust` 派生与文案——`useProjectTrustSummary` 加上这个
  目录的未信任别名，因此只在工作树里的别名仍会显示——因此在聊天里它就是授予 pi 级信任的地方，而它的
  `project.setTrust` 恰在它点名了项目的 Pi 资源时才携带 `resources: true`）、re-confirm-new、一个
  逐分组的 track/thumb **开关** + 一个 **All-plugins** 总开关，以及逐技能的开关。开关位置加上语义颜色
  就能承载状态，而不用可见的 On/Off 文本；只有开关目标会变更，而不可用的控件保持既有的信任/父级说明与
  确认行为。它经一个可选的 `workspace` prop 以**两种模式**运行：聊天（`skills.state`，逐工作区的技能
  覆盖，+ 一个经 `session.reloadResources` 把变更应用到本聊天会话的 **Reload**，流式时禁用）或项目
  （`project.skills`，逐项目基线的开关，没有会话）——后者被 `panels` 在会话前复用）。全部 props
  驱动；行为细节住在各组件的 jsdoc 里。
- **实时会话遥测遵循 Pi 的落定边界。** `SessionStatsBar` 只渲染宿主权威的 `session.getStats` 快照；
  web 绝不从消息内容派生计费总额或上下文用量。已挂载的聊天在挂载/重连时、在每条落定消息、压缩与落定
  之后，以及在 Pi 接受一次模型变更之后刷新。一次重连读取可能与一个重启中的宿主竞速，此时对话记录同步
  尚未重新接上持久化的会话，因此那个同步边缘会重新触发这次读取。连续多个 Pi 事件批进一次 store 提交
  时会折叠成一次读取，而被更新的会话修订、宿主世代或卸载所取代的响应会被忽略。文本增量不触发读取，
  因为 Pi 自己在消息边界之前无法落定新的用量；瞬时的读取失败保留最后一份好的快照，而不是用猜测的
  状态替换它。
- **自适应输入框几何**（`Composer`）——一份只占一行视觉行的空闲草稿渲染为共享的两层外壳：上方是全宽、
  一行视觉行的消息行，下方是稳定的动作页脚。model · effort 胶囊是页脚唯一的左手触发器；History 与
  Send 在右侧保持显式。一次折行、显式换行或宽度变化使草稿超出一行视觉行时，消息行增长而不移动页脚；
  重新塞回一行时只有消息行收缩。这是一个持久的文本域，绝不是两个条件渲染的孪生体——这个转换不能丢失
  焦点、光标/选区、召回、草稿或一个模板槽位会话。流式时即使草稿为空也故意使用展开的消息行，因为
  Stop + 发送选项会加入页脚。`ChatView` 传入服务端同步的 `ComposerGrowthLimit` prop：`compact` 封顶
  为 6 行视觉行，`roomy` 为 10，而默认的 `half-chat` 把**编辑器外壳**（文本域 + 页脚）封顶在已挂载
  聊天面板的 50%，绝不是浏览器视口；随后溢出在文本域内部滚动。附件 chip、补全菜单、槽位提示与
  QueueStrip 保持它们既有的独立外壳。槽位高亮底板必须跟随每一次动态文本域盒变化，并遵守下面
  Template slots（模板槽位）条目里确切的盒模型与滚动同步不变量。
- **输入框的尾随控件**（`Composer`）——页脚右侧那一簇是**一个实心物体加几个 ghost**，没有边框：
  History 是一个 ghost 的 28px 圆形（`IconTooltip` 下的 `Button variant="ghost" size="icon"`），Stop
  是一个 ghost 胶囊（`■ Stop`，低饱和文本在 hover 洗色上抬起），而发送是单个 `rounded-full` 的强调
  胶囊（`chat-send-pill`、`data-armed`），其主段（`chat-send`）携带动词加一个 `↩` 键帽，其 chevron
  段（`send-menu`，仅流式时）是第二个可点击区域并带有自己的 hover——分隔它们的是间距，不是分隔线。
  更早的那一簇是四个等宽、带边框的 32px 方块，它给一个实用功能（历史）与主操作同样的权重，读起来像
  表单时代的界面。**惰性发送**：没有东西可发送时胶囊停在 `control-bg-selected` +
  `control-disabled-text` 上，而不是 60% 的主色对——一块深色强调块会把视线拉向一个无法动作的控件，
  而切换到强调填充才是 "ready" 信号（该例外记录在 `styles/COLOR.md` 里）。**紧凑模式**：低于聊天列
  的 `@md` 容器宽度（手机、窄分屏）时标签与键帽隐藏，胶囊收缩成 28px 图标，好让模型胶囊保住自己的
  空间。标签使用 `ui.action`。
- **排队消息：待处理条**（`QueueStrip.tsx`，props 驱动：`queue` + `onEdit`/`onRemove`）——pi 交互模式
  待处理消息区域的 web 镜像。一次**流式发送绝不渲染乐观的对话记录气泡**（见 store SPEC 的回声契约）：
  `ChatView.onSubmit` 对 `steer`/`followUp` 跳过 `appendUserMessage`，排队文本在对话记录与输入框之间
  渲染为暗淡的行——每条消息一行被截断的 `Steering:`/`Follow-up:`（`queue-strip` / `queue-item`
  testid，`data-kind` + `data-index`；完整文本 + 投递含义在该行的 `title` 里），来源是运行时的
  `queue`。**每一行携带自己的编辑与移除动作**（`queue-item-edit` / `queue-item-remove`）——两者都调用
  `session.removeQueued { kind, index }`（行是按位置寻址的，与线上协议操作一致）；编辑还会把被移除消息
  的文本与图像恢复到草稿并重新聚焦。逐行动作之所以存在，是因为原来的全有或全无出队（点击条 →
  `clearQueue` → 每条消息合并进一坨草稿）用起来被证明不可发现且有损。**Abort 原子地恢复完整队列**
  （`onAbort` → `session.abort { restoreQueue: true }`）：宿主把两条 Pi 车道都抽干，并把 abort 作为
  一个操作发出信号，等待空闲，然后返回每条排队消息的文本 + 图像内容；web 把这些文本前置，并重新附上
  每一张图像。因此 Stop 既不能让一个排队的续跑跑起来，也不能悄悄丢弃一个附件。一次**被拒绝的**流式
  发送同样把它的文本连同 `appendErrorTurn` 一起恢复到草稿。普通的 `queue_update` 投影仍然只携带可显示
  的文本加一个保守的 `hasImages` 聚合——没有图像字节——因此排队的图像在条里不显示 chip；规范化对话
  记录轮次稍后会用带回退标签的水合渲染它的图像块。E2e：`queue.live.spec.ts`（@agent）。
- **流式发送模式：拆分发送 + 打断**（`Composer`）——steer/queue 语义是 pi 的循环设计（steer = 在下一个
  轮次边界注入，即在当前 assistant 消息 + 它的工具调用之后；queue = 在 agent 落定后运行；只有 abort 会
  中止在途响应），并且事实证明单靠键名提示无法读懂。因此流式期间输入框会自我说明：主胶囊读作
  **Steer ↩** 而不是 Send，占位符说明一次 steer *何时*落地（"Steer the agent at its next step…"），
  以及一个**发送选项菜单**（`send-menu`——该胶囊的 chevron 段；行 `send-mode-steer` /
  `send-mode-queue` / `send-mode-interrupt`）为每种模式点名一行含义 + 快捷键。草稿为空时 chevron 仍
  启用，好让快捷键保持可发现；只有那些行禁用。菜单行是**动作**（用该模式发送当前草稿），绝不是粘滞的
  模式开关——一个持久模式会让下一次朴素的 Enter 悄悄服从隐藏状态。`Composer` 在槽位、菜单、召回或
  发送处理之前，把每一次 keydown 让给活跃的 IME。它使用 `KeyboardEvent.isComposing` 加上遗留的
  `keyCode` 229 哨兵，因为 `compositionend` 可能先于最终的 keydown，使 `isComposing` 为 false 而
  IME 仍拥有那个事件。该守卫不取消事件，因此确认候选词的 Enter 会提交；只有随后一次普通的 Enter 才
  调用发送语义。
  **打断**（`SubmitBehavior: "interrupt"`，流式期间 Cmd/Ctrl+Shift+Enter；空闲时是普通发送；单独
  Shift+Enter 仍是换行）是 pi 缺失的那个 "take my message NOW" 手势：`ChatView` 等待 `session.abort`
  （ack 意味着空闲）然后执行一次普通的空闲发送——部分回复带着已中止的标记留在对话记录里，而仍在排队
  的消息保持它们的车道（它们会在这次打断所启动的运行里投递）。被拒绝时像其他流式发送一样恢复草稿。
- **历史浮层：放大预览窗格 + scope 选择器**（`HistoryOverlay.tsx`）——`Tab` 把紧凑的单列浮层长成一个
  **双窗格**的 `zoomed` 布局：既有的 Prompts/Messages 分区列表留在左侧（约 55% 宽，
  `data-testid="history-results"`——键盘导航、`scrollIntoView`、计数与另存为模板动作全都不变），而
  扁平列表中**键盘选中的**条目的预览渲染在右侧（约 45%，`data-testid="history-preview"`，经
  `Enter`/Cmd/Ctrl+S 早已使用的同一个 `resolveHistorySelection` 解析——预览与键盘动作在 "选中的条目"
  上绝不可能不一致）。`compact` 阶段不受影响：在 `Tab` 之前 DOM 里根本没有预览窗格（不只是隐藏），
  因此 `history-preview` 的单纯存在就兼任放大/紧凑的信号。**预览正文：** 命中的完整 `text`——绝不是
  该行被截断的首行（`PromptRow`）或片段（`MessageRow`）——才是让预览值得有的东西：一条长提示词在
  列表里被切掉的尾巴，在这里能读全。`whitespace-pre-wrap break-words`、可滚动
  （`overflow-y-auto`）、查询词经**逐字**复用的 `Highlight` 高亮（与各行所用的同一个助手），因此高亮
  绝不会在行与它自己的预览之间漂移。**预览页脚**（低饱和、小字号）：对提示词命中，聊天标题（若已
  设置）/ 只要 `workspaceId` 存在就给一个工作区 chip（与 `PromptRow` 的 chip 不同，绝不受 scope 门禁
  ——单个详情窗格有密集列表行所没有的空间）/ 相对时间，以 `·` 连接；对消息命中，
  `sessionTitle · role · relative time`。没有选中（结果集为空）渲染一个空面板——绝不是崩溃。
  **窄宽度**（低于 `md` 断点）：预览折到列表**下方**而不是旁边（列表在源码顺序里在前，因此一个列向
  flex 堆叠本来就会把它放在那里），每个窗格在各自的高度预算内独立滚动。**scope 徽章**
  （`data-testid="history-scope"`，不变的 `<scope> ⌃R` 标签 + `data-scope`）现在也是一个
  `@thinkrail/ui/dropdown-menu` 触发器：它的内容按循环顺序列出全部四个 scope
  （`data-testid="history-scope-option"` + `data-scope`，标签比徽章本身更完整——"This chat" /
  "Workspace" / "Project" / "Everywhere"——当前那个带勾选标记）。挑一个会调用 `useHistorySearch.ts`
  新的 `setScope(kind)`，它重置结果选中的方式与 `cycleScope` 完全一样——`Ctrl+R` 键盘路径（见下面
  快捷键归属那条），因为两者只是设置同一个底层 scope 状态。Radix 关闭时的默认行为是把焦点还给触发
  器；`onCloseAutoFocus` 被覆写（`preventDefault` + 聚焦查询输入），因此一次鼠标挑选反而把焦点交回
  查询输入——键入立即恢复，不需要额外点击。菜单是一个**受控**的 Radix 菜单（`scopeMenuOpen`），原因
  只有一个：浮层窗口级的 `Escape` 在它打开时让位，因此 Escape 遣散的是最内层。菜单绝不与浮层自己的
  `ArrowUp`/`ArrowDown`/`Enter` 处理冲突：那个处理器绑定在查询 `<input>` 元素本身上，而 Radix 的
  传送门下拉内容是**兄弟**子树——绝不是该输入的后代——因此菜单持有焦点时的一次 keydown 按构造就无法
  到达输入的处理逻辑，而不是靠逐例的守卫。
- **快捷键归属：`Ctrl+R` 与 `Escape` 不是元素本地的。** 两者过去都是单元素按键处理器——`Ctrl+R` 在
  输入框文本域上，`Escape` 在浮层的查询 `<input>` 上——两者都因同样的原因出错：它们只在那一个元素持有
  焦点时才触发。在它之外，`Ctrl+R` 会到达浏览器并**重载应用**，而一个输入已失焦的浮层（点回输入框、
  某一行的图标按钮）**完全没有任何**键盘遣散方式。现在：
  - **`Ctrl+R`** 由 `shell/useGlobalHotkeys` 拥有——一个窗口捕获阶段监听器，在全应用范围吞掉该组合
    （`preventDefault` + `stopPropagation`，因此它恰好只有一个处理器）并经
    `store.requestHistoryOpen(sessionId)` 把它路由到那唯一挂载的 `ChatView`
    （`selectActiveChatSessionId`）。`ChatView` 翻译它：浮层关闭 → `composerRef.openHistory()`（与
    历史按钮完全相同的路径——菜单被遣散、草稿已播种）；浮层打开 → `cycleScope()`。`Composer` 与
    `HistoryOverlay` 都不再携带 `Ctrl+R` 分支。故意的例外：来自终端（`.xterm`）内部的 keydown 原样
    通过（反向搜索属于 PTY），而 `Ctrl+Shift+R` / `Cmd+R` 保持不管，好让键盘重载仍然可行。
  - **`Escape`** 由 `HistoryOverlay` 自己的窗口捕获阶段监听器拥有，只在它打开时注册。捕获 +
    `stopPropagation` 编码了 "最上层的浮动面板先关闭"（一个输入框槽位会话能在这次遣散中存活，而不是被
    同一次按键清掉）。它在 scope 选择器打开时让位——见上面关于受控 `scopeMenuOpen` 的说明——因此
    Radix 自己的 Escape 只关闭那个菜单。故意**没有**点击外部的遣散。
  - **遣散把焦点还给提示词场域**（`ChatView.onDismissHistory` → 输入框的 `refocus` 句柄）：打开把
    焦点移进了浮层的查询输入，而关闭会卸载它，因此没有这一步，每一次 Escape 之后的按键都会落在
    `<body>` 上并丢失。光标回到它原来的位置（`Composer` 在 click/keyup/change 时追踪它），或在槽位
    会话激活时回到当前槽位的标记上。遣散是*唯一*经由 `onClose` 的关闭——插入、跳转与另存为模板各自
    决定焦点接下来去哪（输入框、另一个聊天、一个对话框）。
- **历史浮层：只有 assistant 消息 + 可跳转的提示词**（`HistoryOverlay.tsx`、`useHistorySearch.ts`——
  R3）——`MESSAGES` 现在只包含 assistant 角色的命中（服务端过滤；见
  `packages/server/src/history/SPEC.md`）：一个用户角色的命中永远是与它自己 `PromptHit` 条目在文本上
  重复，因此它过去要添加的位置改放到了提示词行上。现在每个提示词行**在可跳转时**渲染一个去聊天的图标
  （`data-testid="history-jump"`、`aria-label="Go to chat"`，一个读作 "⇧⏎ go to chat" 的
  `IconTooltip`，在既有另存为模板图标旁边）——`workspaceId` 存在且 `messageIndex != null`（对于 cwd
  未映射的命中，或不填充提示词锚点字段的宿主，则缺席）。点击它，或在一个提示词行是键盘选中项时按
  **`Shift+Enter`**，都走与消息命中的 `Enter`/点击此前所用完全相同的 `onOpenMessage` 路径——两者现在
  都经共享的 **`jumpTarget(hit)`** 助手（`useHistorySearch.ts`，导出的纯函数），它把任一种命中形状
  解析成 `ChatLocationRequest` 或 `null`，因此图标的渲染门禁、`Shift+Enter` 处理器与消息命中的门禁在
  "这是否可跳转" 上绝不会不一致。一个未映射/遗留的提示词行不显示图标，且 `Shift+Enter` 是空操作
  （浮层保持打开）——消息命中路径早已有的同一套双保险门禁。图标本身保持悬停才露出
  （`group-hover`/`isSelected` 透明度，像它旁边的另存为模板图标），但它的快捷键字形
  （`data-testid="history-jump-shortcut"`，字面的 `⇧⏎`）是一个**只在选中时**、而非只在悬停时出现的
  持久 `<span>`——与 scope 徽章的 `⌃R` 同一个先例（始终在它的标签旁边）——因为纯键盘用户，也就是
  `Shift+Enter` 自己的受众，从不触发 `:hover`。另存为模板图标自己的快捷键
  （`SAVE_SHORTCUT_LABEL`、`⌘S`/`Ctrl+S`）出于同样原因得到一模一样的只在选中时的字形
  （`data-testid="history-save-shortcut"`），与跳转图标对称。
- **模板槽位**（共享 `prompt` 模块的解析器/状态机 + `Composer` 的几何 + `ChatView` 的目录/模板读取
  接线——输入框的 Tab 穿插占位符流程，端到端）。
  **解析**（`prompt`，纯）：`parseTemplateSlots(body, argumentHint)` 把 pi 自己的占位符文法
  （`$1..$n`、`$@`/`$ARGUMENTS`、`${N:-default}`、`${@:N}`、`${@:N:L}`——pi 的文法，单一所有者；见
  `packages/server/src/templates/`）展开成可见文本加 `TemplateSlot` 区间；
  `stripUntouchedSlots`/`shiftSlots` 补全会话（发送时剥离、编辑时重追踪）——**只解析**，这个模块永不
  求值该文法（一个逐字键入的 `/name args` 提示词已经由 pi 自己的
  `PromptOptions.expandPromptTemplates` 展开，无论有没有这个解析器）。**观察结果**（设计里
  "to verify" #3，由 `e2e/templates.live.spec.ts` 的逐字键入测试解决）：pi 自己的对话记录为逐字键入的
  发送记录的是**已经展开**的正文，绝不是原始的 `/name args`——`AgentSession.prompt()` 在持久化
  `role: "user"` 消息之前把参数代入 `expandedText`，因此一次 `session.getMessages` 重取（一次重载，
  或从历史重开）显示的是展开后的文本。唯一的细节差异：web 客户端自己那个即时气泡是一次**乐观回声**
  （`ChatView.onSubmit` → `appendUserMessage`，只走 store，附加在传输层调用落定*之前*；附带的图像作为
  内容块随行，好让气泡显示它们——`UserTurn` 把图像块渲染为文本上方的紧凑 "attached file" chip（没有
  内联预览；点击在对话框里打开图像，即图表全屏的模式）。chip 标签是所选文件的名字，作为
  `attachmentNames` 承载在回声轮次上（仅 UI 侧——pi 的 `ImageContent` 没有文件名），与图像块按索引
  对齐；一个水合过的轮次没有名字，回退到 mime 类型标签）——它显示的正是键入的内容（原始命令），直到
  一次重取把它换成 pi 真正持久化的记录。**`/` 菜单的合并**
  （`ChatView`）：pi 的 `commands` 快照（`session.getCommands`，在会话创建时冻结）减去其
  `source === "prompt"` 条目，加上一次新的 `template.list { workspaceId }` 抓取映射成的
  `SlashCommandInfo` 行（`source: "prompt"`，`sourceInfo` 合成得与 pi 自己的提示词模板约定完全一致：
  `{ path: filePath, source: "local", scope: scope === "global" ? "user" : "project",
  origin: "top-level" }`）——一份合并列表。聊天把它唯一那条**浏览器原生命令** `/compact
  [instructions]` 前置，作为一个显示本地的 `builtin` 行，标为 `Pi/built-in`；contracts 里镜像 Pi 的
  命令来源保持不变。原生 `compact` 对同名扩展/模板碰撞保留（技能命令保持命名空间），而那套确切的 Pi
  解析器只识别 `/compact` 或 `/compact ` 加上 trim 后的说明——每一个近似拼写都仍是普通提示词。一次
  compact 提交绕过乐观用户回声与每一种流式发送模式：已完成的草稿图像**或队列中宿主撰写的 `hasImages`
  聚合**会就地拒绝它，并给一个可据以行动的输入框 chip（草稿 + 队列都保留；待处理的草稿图像本来就会
  扣住所有提交）。否则该命令会清空，把 `session.clearQueue { requireTextOnly: true }` 按 steering
  然后 follow-up 的顺序排回输入框，然后调用 `session.compact`；宿主在那个破坏性操作处重新检查图像
  前置条件，因此一个陈旧的客户端或跨客户端竞态仍无法丢掉排队字节。宿主原子地拒绝该会话已有一个压缩
  在飞时的第二次手动压缩；中止、摘要、持久化与生命周期由 Pi 拥有。请求会快照既有的压缩轮次 id，
  而被拒绝的 clear/compact 只在没有新生命周期轮次出现时才请 store 追加一条失败的压缩行，因此 Pi
  发出的失败与生命周期之前的线上协议失败共享一个表面而不重复。既有的实时/水合压缩渲染不变。当一个
  `template.list` 响应回来是**空的**时，`SlashCommandMenu` 渲染一个 `footer` 提示
  （`data-testid="slash-templates-empty"`），经 `ChatView` 的 `onManageTemplates` 深链到
  Settings → Templates——starter-templates 提供的可发现性那一半（`panels/SPEC.md`），因为全新安装
  有一个空的全局提示词目录，而那个管理器否则要在对话框里点两层。门禁条件是 "没有模板存在"，绝不是
  "当前查询一个都没匹配上"，因此一个只是没命中的查询不会把它抬起来；`footer` 是可选的，因此
  `NewWorkspaceDialog` 对同一菜单的复用不受影响。**门禁是 `ChatView` 显式的 `templatesEmpty` prop
  ——一个已解析的、空的列表——绝不是 `commands` 没有 `source === "prompt"` 行。** 合并列表在第一次
  抓取落定*之前*和某次抓取失败*之后*同样为空（那个 `.catch` 按设计是静默的——一次失败的列表绝不能
  弄坏菜单），因此从它读出空会在每个聊天的第一次 `/` 上闪过 "you have no templates"，并在一次失败
  的列表之后把那个断言永久搁浅——而且还压在一个点击会同时清掉用户斜杠草稿的行上。抓取在**每一次**
  斜杠菜单打开转换时运行（**`onSlashActive`**，一个镜像 `onMentionQuery` 查询信号的布尔 prop——用户
  键入查询期间它保持 `true`，因此没有逐键重发）并且是故意**不缓存**的：提示词文件在应用之外也会变
  （pi CLI、编辑器、一次 git pull），任何应用内失效计数器都看不到——这里更早的一个
  `(workspaceId, templatesVersion)` 缓存，恰恰让那些被外部改动的文件在聊天的剩余时间里保持陈旧，而
  服务端每次调用都重读它的目录正是为了这份新鲜度（它的 SPEC 称那些 readdir 很便宜）——正是这一点让
  `packages/server/src/agent/SPEC.md` 的 "the composer's `/` menu path is always fresh via
  `template.list`" 断言为真，而不像逐字键入的 `/name args` 路径那份冻结的创建时快照。**挑选一个模板**
  （`ChatView` 的 `onPickTemplate`，一个 `Composer` prop）：不再做朴素的 `/name ` 插入，而是抓
  `template.get`，在客户端侧切分 frontmatter（`prompt` 模块共享的 `stripFrontmatter`——pi 自己的
  frontmatter 解析器是服务端专属，永不进入浏览器 bundle，但那条边界规则被钉成与它完全一致；见下面
  另存为模板那条），运行 `parseTemplateSlots(body, argumentHint)`，并把结果经
  **`ComposerHandle.insertTemplate`**（与既有的 `insertText` 并列）交给 `Composer`——替换整份草稿
  （像 `pickSlash`，不像 `pickMention`：一条斜杠命令占据整个输入）并且，如果解析产生了任何槽位，就
  启动一个选中槽位 0 的**槽位会话**；没有槽位 → 一次朴素插入，光标在末尾，没有会话。异步响应只在
  挑选仍然**当前**时才被应用——最新的挑选获胜**且**草稿与挑选时字节相同——因此一个慢响应绝不可能
  清掉用户在此期间键入的草稿（或他们挑的第二个模板）；在那次选中模板读取挂起期间，共享选择器禁用
  Composer 提交，好让一次快速的 Enter 无法发出原始的斜杠 token。该规则住在 `prompt` 的共享模板挑选
  控制器里，并针对延迟与乱序响应做了单元测试。
  **会话**（共享的 `prompt` state，由 `Composer` 本地持有，不涉及
  store/transport）：`Tab`/`Shift+Tab` 步进到下一个/上一个槽位（环绕；`preventDefault`；在提及/斜杠
  菜单打开时是空操作——在 `onKeyDown` 顶部、菜单自己的按键处理之前检查，因此一次真正的 Tab 挑选菜单项
  不受影响，对称地，当菜单也打开时一次 `Escape` 会让菜单自己的关闭先赢）。**步出**一个*用户编辑过*的
  槽位（其文本确实被用户改过的槽位——不是未触碰的标记，关键地也不是未触碰的 `${N:-default}`）会把它
  的当前文本拼接到共享同一 `group` 且文本不同的其他每一个槽位里（分组镜像——重复的 `$N`/`${...}`
  出现是在槽位退出时传播，而不是逐键传播），每次拼接都经共享的提示词槽位状态机重新追踪。一个槽位
  携带两个独立的位：**`filled`**（解析期属性——有真实内容：一个 `${N:-default}` 的默认值，或被键入
  过的标记——驱动发送时剥离 + 着色）与 **`edited`**（会话运行期状态——用户改过它——唯一的镜像*来源*
  门禁）。如果用户把一个未触碰的标记选区折叠到它的末尾并在那里键入，可见的标记加上键入的后缀就成了
  filled 并在发送时被保留：这就是 WYSIWYG，而剥离那个长大的区间会把用户的文本连同标记一起删掉。
  两者故意不同：`${1:-foo} … ${1:-bar}` 生来是 `filled` 但不是 `edited`，因此它两个不同的逐出现
  默认值保持独立，直到用户通过编辑其中一个来提供那个参数——与 pi 自己的展开一致，它绝不把
  "foo … bar" 重写成 "foo … foo"。`Escape` 结束会话（`setSlots(null)`），文本保持原样。一次真正的
  文本编辑（文本域自己的 `onChange`——绝不是程序化的 `onChange(text)` 调用；那些反而会直接结束会话，
  因为 `pickMention`/`pickSlash`/箭头召回/`insertText` 都不参与槽位追踪）把编辑后的
  `selectionStart` 周围的旧/新值（一次公共前缀/后缀扫描）差分进 `(editStart, removedLen,
  insertedLen)`，经 `shiftSlots` 重新追踪每一个槽位，并给编辑落到的那个槽位打上 `filled: true`
  **且** `edited: true`；一次消费了**整个**先前值的编辑（全选再键入/删除）会结束会话，而不是重新
  追踪一组此刻已无意义的折叠区间。发送时，`submit()` 对**每一个用户编辑过的槽位**跑同一趟分组镜像，
  而不只是最近一次 Tab 退出的那个（`mirrorAllGroups`——一次直接的 Send 从不需要先过一遍 Tab 才能让
  它的镜像生效），把每个传播进同组的兄弟槽位；只有**然后**它才剥离仍然未触碰的那些标记
  （`stripUntouchedSlots`），并且总是清空会话——已发送**或**已排队（steer/followUp），同一条规则。
  切换标签页不需要显式清理：工作台的可见性门禁只挂载一个分组本地选中的主体，因此离开一个聊天标签页
  会卸载 `Composer`（及其会话），而 store 的 `draft` 文本本身会留存。**提示 chip**：当会话激活时
  （且菜单未打开，好让两个绝对定位的浮层绝不共享同一个锚点矩形），文本域上方的一个小胶囊——
  `slot {slotIdx+1}/{n} · ⇥ next · esc done`（`data-testid="slot-hint"`）——可点击，点按步进到下一个
  槽位（与 `Tab` 相同的镜像规则），是无需键盘的移动端路径。**高亮底板**：当会话激活时，输入框的间隙
  在消息场域本身里被视觉着色——原生 `<textarea>` 无法为它内部的文本区间设置样式，因此 `Composer`
  渲染一块**高亮底板**（一个带样式的镜像层，定位在现在已 `bg-transparent` 的文本域之后；输入背景
  改为上移到包裹容器，裁剪到同一个 `rounded-md`，因此在会话之外视觉上什么都没变）。那个包裹器拥有
  输入边框与填充：`bg-clip-padding` 让底板着色留在圆角边框之内，而
  `focus-within:border-control-border-active` 是输入框唯一的焦点指示器，而不是文本域上再加一圈强调
  环。纯的 `highlightSegments(value, slots, activeIdx)`（来自共享的 `prompt` 模块）把 `value` 拆成
  有序的 plain/unfilled/filled/active 段——一个槽位区间在其 `slots` 索引等于 `activeIdx`（`Composer`
  自己的 `slotIdx`）时是 `"active"`，否则按其自己的 `filled` 标志是 `"unfilled"`/`"filled"`；其余
  一切都是 `"plain"`——纯偏移/切片，零间隙相邻的槽位不产生空段，且测试在每种情况下都钉住
  `segments.map(s => s.text).join("") === value`。底板的内层镜像 div **精确**匹配文本域的盒模型
  （`px-12 py-8`，同一个 `tr-text-ui` 排版类，一个同宽度的 `border border-transparent` 好让内容盒
  对齐，`whitespace-pre-wrap break-words`——明确写出来，因为 `<div>` 不像 `<textarea>` 那样默认软
  折行），因此每个 `SlotSegment` 的着色 span（`data-testid="slot-highlight"` + `data-slot-state`，
  `rounded-xs`——文本连续段的圆角层级——配 unfilled/active/filled 的
  `bg-primary-soft`/`-muted`/`-subtle`，plain 不著色，每个 span 都是 `text-transparent`，因此只有
  上层真正的文本域文字透出来）正好落在它自己的字符之下。**滚动同步**：文本域的 `onScroll` **命令式**
  地把它的 `scrollLeft`/`scrollTop` 复制到底板外层的 `overflow-hidden` 层上（一个 ref——没有 state，
  没有行内 `style`：程序化的滚动偏移根本不需要样式，因此仓库那条只用 token 工具类的不变量零例外地
  成立；更早的版本把偏移追踪在 state 里并施加 `translate(...)` 行内样式，既违反了该不变量，又在每
  一个滚动的帧上重渲染输入框）。底板的 **ref 回调**在挂载时播种偏移，因此一个在已经滚动过的输入框里
  启动的会话绝不会画出哪怕一帧错位。
- **原生 `/name`** —— 浏览器原生命令目录在 `/compact` 旁边新增 `/name <title>`，标为 `Pi/built-in`，
  并对同名扩展或提示词模板碰撞保留，以匹配 pi 自己的命令。解析器同时保留裸 `/name` 与
  `/name <title>`；一个合法参数会绕过用户消息回声与 agent 发送，调用 `session.rename`，然后清空输入
  框。空白/超限输入留在输入框里并带一个可据以行动的校验错误；传输层拒绝让持久标题保持不变，并作为
  聊天内错误露出。这个命令对早于会话改名特性常量的宿主要隐藏。它与外壳的标签页/历史控件是同一次领域
  变更的键盘路径——绝不是另一个标题来源——而自动生成没有 ChatView spinner，也没有对话记录行。
- **另存为模板 + 模板管理**（`TemplateEditorDialog.tsx`；`HistoryOverlay` 的保存动作；
  `panels/TemplatesSettings.tsx`）——一个共享的提示词模板文件创建/编辑表面，被两个彼此从不交谈的入口
  复用：Settings → Templates 面板（列表 + New/Edit/Delete，见 `panels/SPEC.md`）与下面历史浮层的
  另存为模板动作。**为什么它住在 `chat/` 而不是 `panels/`**（一处故意的边界例外，与上面的
  `ChatView.tsx`/`useHistorySearch.ts` 并列）：`panels/` 允许从 `chat/` 导入（已经这么做，为了
  `ModelEffortPicker`/`ModelSelector`/`ThinkingSelector`/`Markdown`），但反方向绝不，而
  `HistoryOverlay`——它需要这同一个对话框——住在 `chat/`，因此这一份共享实现只能住在双方都能到达的
  地方。于是 `TemplateEditorDialog` 被提升为**第三个**获准触碰 store/transport 的集成件（见下面的
  边界），尽管它本身不是 `ChatView`。
  - `prompt` 模块的**模板文本 API** 是唯一的共享 frontmatter 切分器/组装器——`stripFrontmatter`
    （`ChatView.tsx` 的输入框挑选路径 + 本对话框的 body 字段）、`assembleTemplate`（本对话框的保存）。
    它**不做 YAML 值解析**：对话框的 description/argument-hint 字段由服务端解析的 `template.get`
    响应填充（`Template`——pi 真正的 YAML 解析器跑在**整份文件**上，完整的标量风格保真，钉在
    `packages/server/src/templates/templates.test.ts` 里），绝不来自浏览器侧的重实现（这里更早的
    `splitTemplate` 只处理裸/双引号标量，于是 pi 原生的 `description: 'single-quoted'` 带着字面引号
    载入表单，保存回去时就损坏了）。它的边界规则镜像 pi 自己的 `extractFrontmatter`
    （`@earendil-works/pi-coding-agent` 的 `dist/utils/frontmatter.js` + 目录中钉住的那个 pi 的
    `dist/utils/text.js`——即 `packages/server/src/templates/SPEC.md` 在服务端依赖的同一批事实；pi
    升级时两者都要重新核对）：剥掉一个前导 UTF-8 BOM、归一化换行，然后在之后**第一个** `\n---` 行处
    结束 frontmatter 块；正文是该围栏之后的一切，再经 `.trim()`——而不是消费单个可选的 `\n`。更早的
    版本有两个各写的手搓正则切分器（每个文件一个），各自只在闭合围栏之后消费一个*可选的* `\n` 而不是
    trim——于是每次挑选、每次重开编辑都会有一行前导空行漏进正文，并且每个编辑-保存周期还会**叠加**
    多一个 `\n`（漏出的那行被存回 body 字段并在下一次保存时重新被包裹）。`templateText.test.ts` 钉住
    了这次修复所依赖的往返/稳定性性质。
  - **字段**：name（客户端侧按与服务端 `isValidTemplateName`
    （`packages/server/src/templates/templates.ts`）完全相同的规则校验——是复制而不是共享，因为它是
    一个 4 行的纯谓词，而那个服务端模块是服务端专属的）、一个 scope 单选（Global / This project；
    没有活跃工作区时 "This project" 被禁用）、description、argument-hint，以及一个 body
    `Textarea`，带一行静态语法提示（`$1, $ARGUMENTS, ${1:-default} — pi prompt-template syntax`；
    真正的语法由 `prompt` 模块解析 / 由 pi 展开——这一行只是文档文本，本身不被解析）。
  - **组装**：`---\ndescription: …\nargument-hint: …\n---\n\n<body>`，某个键的字段为空时省略它，而当
    两者都为空**且正文不以 `---` 开头**时**完全不带 frontmatter 块**——这样的正文无论如何都会被强制
    加一个显式（可能是空的，`---\n---\n\n`）块：若裸着保存，pi 自己的加载器（以及我们的
    切分器）会去该正文内部搜寻*更后面的* `\n---` 行当作闭合围栏，一旦正文里含有一个就悄悄把真实内容
    当作 YAML 吞掉；强制包一层让我们的围栏无条件成为最早可能的匹配，因此正文自己那些看起来像 `---`
    的行绝不会被重新解释（见 `templateText.test.ts` 的 ambiguous-body 用例）。每个值都以
    `JSON.stringify` 引号形式输出，而不是裸值——YAML 的双引号标量转义集是 JSON 的超集，因此这永远是
    合法 YAML，而不必仅为序列化两个短字符串就引入 `yaml` 包（见种子夹具自己的 `argument-hint:
    "[file] [scope]"`，出于同样原因加了引号：裸值并不总是合法 YAML）。
  - **编辑既有模板会锁住它的 name + scope**（两个字段禁用）：`template.save` 是按 `(scope, name)`
    键控的创建或覆盖，没有改名/移动原语，因此在编辑时改动任一个都会悄悄在磁盘上把旧文件变成孤儿，
    而不是给它改名。新建（包括另存为模板）让两者完全可编辑。**一次编辑按 `template.name` 逐字保存
    ——绝不 trim 或归一化**：带空白的名字*按设计*在服务端合法（pi 从文件名逐字派生模板名，因此手工
    创建的 `report .md` 会列为 `report `；`packages/server/src/templates/templates.ts` 的门禁故意
    接受每一个 pi 可列出的名字），而在保存时 trim 曾写出一个**新的** `report.md`，同时让正在编辑的
    那个文件原封不动（评审者标出；`templates-manage.spec.ts` 钉住了往返）。Save 按钮的空值门禁出于
    同样原因只在新模式下启用——一个只有空白的、手工创建的名字是合法的编辑身份。只有**新**模板键入的
    名字在校验/保存前被 trim：故意的表单归一化，这样一个意外的尾随空格无法铸出一个在每个列表里都与
    它 trim 后的孪生渲染完全相同的文件（输入框的 `/` 菜单可以经点击*使用*这类手工创建的名字，但键入
    的 `/name` token 无法携带空格——UI 不该制造二等名字）。
  - **打开编辑会经 `template.get` 取回完整模板**，钉到该行确切的 `(scope, name)`——`template.list`
    按设计只有元数据（有界的头部扫描 + 尺寸上限，见 `packages/server/src/templates/SPEC.md`），因此
    列表行给不出正文，而且——真正踩坑的那部分——它的元数据也不可信：一个其 frontmatter 结束围栏落在
    列表扫描窗口之外的文件，*合法地*列出来时**没有** description/argument-hint。因此 `get` 响应
    **对每个字段都是权威**：正文经 `stripFrontmatter(content)`，而 description/argument-hint 来自它
    的整文件解析，替换掉那些只是为即时绘制而*播种*表单的列表行值。（否则就是评审者标出的数据丢失：
    从降级的行播种，并在 Save 时把这些字段写回，意味着一次只改正文的编辑会悄悄删掉文件真实的
    description——`templates-manage.spec.ts` 钉住了这个往返。）在抓取落定之前，
    description/argument-hint/body 三个输入被禁用且 Save 被门禁（`loading`）——过早保存会用降级的
    种子覆盖文件；抓取失败时 Save 出于同样原因保持门禁（错误内联显示，重开即可重试）。
  - **Save** 调用 `template.save`，然后调用 store 的 `bumpTemplatesVersion()`；被拒绝的保存经
    `data-testid="template-error"` 内联渲染其消息（绝不是 toast——对话框保持打开，好让错误能就地修
    好）。**Delete 完全不涉及对话框**——`panels/TemplatesSettings.tsx` 的行直接调用 `template.delete`
    + `bumpTemplatesVersion()`，位于锚定到该行自己 Delete 按钮的 `ConfirmPopover` 之后。**被拒绝的
    删除**是与 Save 唯一一处故意的不对称：它以错误 toast 露出，而不是内联（没有对话框可供内联渲染），
    并让该行原地不动——正是 `panels/SPEC.md` 为 `ProjectTree` 自己的工作区移除行记录的那套模式。
  - **另存为模板**（`HistoryOverlay` 的选中提示词行动作，`data-testid="history-save-template"`，当
    选中提示词行时键盘 **Cmd/Ctrl+S**——浮层的 `onKeyDown` 总是 `preventDefault` 这个组合，因此无论
    选中什么，浏览器自己的 Save 对话框都不会打开，但只有解析出的选中项是提示词命中时才会触发该动作）
    打开对话框，正文从那条提示词的文本预填——一个 "new template" 情形（没有既有的名称/scope 身份），
    与点击 New 相同。**输入框溢出处的入口点作为 YAGNI 被砍掉**（计划自己的用词）——历史路径已经覆盖
    "复用我已写过的东西"；为同一个 "先打出来，再决定保存它" 的手势再开第二个入口，只会是冗余表面，
    而不是一个不同的用例。
  - **作为文件编辑** —— 只有项目范围的行会得到 `Open as file` 动作（`panels/TemplatesSettings.tsx`），
    复用 `openTabs.ts` 里确切的 `openFileInTab(workspaceId, ".pi/prompts/<name>.md", "keep")`（与
    文件树点击所用的同一动作）——故意取 **`keep`** 意图，因为一次显式的 "open in editor" 绝不能落进
    后续浏览点击会悄悄替换掉的预览槽（见 `panels/SPEC.md` 的 Preview tabs 条目）——然后调用
    `store.closeSettings()`。**全局行只能在对话框里改**——这是故意的不对称，不是疏忽：文件布局引用是
    工作树范围的，但全局模板住在宿主的 agent 目录下，在任何工作树之外，因此没有工作树相对路径可用来
    打开它。
- **纯 `↑` 召回 + 历史按钮** —— `Composer` 的 `recentPrompts` prop（`ChatView`：本聊天自己的用户轮次
  文本，经 `turnAnchorText`，最新在前，去重时**保留最新那次出现**——与服务端历史索引同一条最近优先的
  排序规则，即 atuin/fzf 约定）支撑一个轻量的召回会话（`recallIdxRef`），其门禁使它绝不吃掉草稿：`↑`
  只在场域**为空**或召回已激活时才进入（更旧 → 更高的索引），`↓` 走向更新的（越过最新则恢复 `""`），
  任何有分歧的编辑或一次提交都会退出该会话，而被召回的文本落地时光标在其末尾。会话索引是一个
  **ref，绝不是 state**：没有任何东西从它渲染，而步进把索引写在*这里*，同时草稿经 `onChange` 走进
  **父级**的 store，因此若作为 state，两者可能在不同的批次里提交。在那个窗口里，文本域已经显示了召回
  的文本，却还带着上一次渲染的处理器及其过期的索引——第二次 `↑` 重新召回同一条目而不是步进，而一次
  编辑未能结束会话，于是下一次 `↑`/`↓` 从实时索引步进，并**覆盖用户刚敲进去的内容**（`replaceDraft`
  在插入路径上防的正是这种丢失，只是改从键盘路径到达）。ref 按其最后写入的值读取，因此提交顺序无法
  介入。处理器**每个事件只取一次快照**——ref 在同步处理器内部无法改变，且一次读取保持可收窄，而重复
  读 `.current` 则不行。一个 `History` 图标的 ghost 按钮（`data-testid="history-open"`、
  `aria-label="Search history"`，同名 tooltip，始终渲染在发送旁边）调用全局 `Ctrl+R` 所到达的同一个
  `openHistory`——移动端的点按路径，桌面端的可发现性便利。
- **聊天 TODO 计划** —— 聊天的 `pi-todos` 列表，在 TODO 栏与 Plan 页露出（引擎：
  [[module-pi-todos]]；宿主读写：[[submodule-server-todos]]）：
  `useChatTodos`（`todo.*` 数据 hook——抓取 + 实时 `pi.event` 重取 + 编辑 + 添加提示 + 那次
  **复查快照重取**（计划的复查装饰是宿主派生的，因此工作区复查评论的变动——例如删除一条清除了某个
  步骤 `changes_requested` 的发现——都会重读计划）+ `openMarkdown` 快照动作；工具完成会立即刷新，
  而 `agent_settled` 提供最终刷新；重叠的列表读取是最新者胜且带连接世代戳，被接受的添加按条目 id
  折叠；`remove` 乐观地把行补掉，并在宿主拒绝时重载权威并弹出错误 toast；外加 agent 复查操作
  `startReview`（`todo.startReview`）与 `reviewAll`（`todo.reviewAll`）——两者都重读计划，因为
  复查装饰是宿主派生的、绝不本地补写；手动裁定的操作随计划页的手动模式一起移除——`todo.review`/
  `todo.requestFix` 仍留在线上协议上，宿主侧）、`planView`（对 DTO 的纯派生：`groupProgress`、
  `planSummary`、`planGlance`/`sessionGlance`（按其输入的身份 memo，因此 store 选择器可以把它当
  原始值返回，而不在无关更新上重新派生 ask 状态）、`planSections`、`shouldNudgeOnAdd`，以及复查
  踪迹那一组——`itemRevisions`（提交历史，1 个 TODO = N 个提交）、`reviewableItems`/`reviewProgress`
  （由 `TodoItem.review` 的存在与否在宿主侧把关——可复查规则只有一个家，在服务端；该集合覆盖计划里
  的条目**以及** `TodoPlan.adoptedCommits`，因此 Review 阶段/Review All 覆盖在计划之外提交的工作，
  而 `planSummary` 的构建 `done/total` 只计计划内的条目）、`reviewChangesRequested` +
  `itemOpenFindings`（changes_requested 警告的标记：该标志加上复查者未关闭评论的条数——在被盖上时按
  发现的 `origin` 溯源（todoId + 可选的 sessionId）匹配，只对无溯源的评论回退到变更集路径 join，
  因此两个步骤碰到同一个文件时不会互相计入对方的发现；Review 标签页才是真相），以及
  `planCompletionSummary`（agent 的计划级备注，以 "everything done" 为门禁，因此重开的计划绝不会把
  过期的全部完成备注泄漏进无门禁的输出——它供给 markdown 导出；计划页还会显示一段派生的一行回顾，
  见 `panels/SPEC.md`）与它只在计划页用的伙伴 `planStaleSummary`（同一条存储备注在某个条目于完成
  之后重新打开时被标为陈旧地露出，因此回顾留在页面上，而不是消失到 agent 重写它为止）以及
  `planChangeTotals`（那段回顾背后的整份计划的去重文件数）。`itemChangeSet` 的优先级：实时的
  `change` 路径优先（一次回退重做的最新增量），否则取最新的可解析提交。分组的*状态*在这里**不**派生
  ——宿主计算它并通过 `TodoGroupItem.status` 下发，因此该规则只有一个家；用户的编辑因此重读
  计划而不是本地补写它，见 `useChatTodos`）、`TodoList`（**按状态排序、分组优先**的渲染
  （`planSections`）——分组 = 任务：**进行中**的任务（它的整个分组）在最上面，**没有分区标题**，
  然后是一个 **To do** 分区（先是待处理的分组，再是用户待处理的零散条目），最后是最底部的一个
  **"Done" 标签**，其下**每个完成的任务都是它自己可折叠的行**（折叠——标题 + `N done`）外加已完成
  的零散条目（不是对全部 Done 做一次折叠）。已完成的*步骤*留在它们（活跃/待处理）的分组里内联；
  只有整个完成的任务移进 Done。每个分组是一行头部（派生的状态图标 + 标题 + done/total 徽章），
  `active` 分组被强调；用户的零散条目带一个逐行的 `user` 徽章（没有单独的 "Your requests" 标题——
  它们按状态摆放）。**紧凑列表只有标题**（状态字形 + 标题 + 变更集 chip）——一行的 `note`、已完成
  条目由 agent 撰写的 `summary`，以及它的 `verification` 在这里**不**显示，因此一份长计划能一眼读完
  而不过载；**完整计划页**（`PlanPane`）才是这些东西露出的地方：`summary` 作为 **Markdown**（一条
  低调的结构化备注——引导句 + 项目符号），`verification` 作为共享的 **`VerificationBadge`**
  （`planKit`；一个状态字形——具名检查用对勾，诚实的 "not verified" 用警告，该切分由
  `planView.verificationStatus` 派生，只有一处——旁边是作为 **Markdown** 渲染的验证内容，因此多项
  检查读作项目符号，而不是挤成一行；徽章的 title 把它标为自述——绝不是宿主运行的门禁）。计划页没有
  页内复查列表——它的头部 kebab 提供 **Review All**（宿主侧队列，`todo.reviewAll`）和一个把焦点移到
  右面板 Review 标签页的评论 chip（见 `panels/SPEC.md`）。一行若其复查是**已落定**的
  （`planView.reviewSettled`——已批准且此后没有任何东西落地）会把它的完成对勾升级为**圈住的 Verified
  字形**（`StatusIcon reviewed`，hover "Verified"，`data-reviewed`）——那一眼可见的 "this step was
  reviewed" 状态，栏里与计划页一致；一个 **changes_requested** 裁定则把字形翻成警告的 `CircleAlert`
  代替（`StatusIcon changesRequested`，hover "Changes requested"，`data-changes-requested`）——计划页
  再加上 chip + 反馈备注（见 `panels/SPEC.md`）。**一行若其条目带有宿主变更集，会长出一个安静的
  "N files" chip**（`planView` 里的 `itemChangeSet`——与下面 markdown 快照共享的那唯一一处派生，
  因此两者绝不会不一致）：**已提交**条目的 chip 通过 `useChatTodos.openChanges`（`setDiffScope` +
  一个外壳的 `reveal-tool` 意图——面板自己列出该提交的文件；N = DTO 里宿主派生的 `commit.files`）
  在它的 `commit:{sha}` scope 上打开 Changes 面板；**路径列表回退**则直接深链单个路径的实时 diff
  （先把 scope 钉回 `branch`，这样它不会继承上一次点击留下的提交 scope）或展开一个内联路径列表。
  一个 sha 已无法解析的提交产物**不带 `files`** 下发 → 没有 chip，绝不是坏掉的 diff 标签页（降级
  契约）。外加添加行 + 一个 **"Open the plan page"** 按钮（`todo-open-plan`）——`useChatTodos.openPlan`
  打开（或聚焦）聊天的**实时计划页**，一个由 `panels/PlanPane` 渲染的中心 `plan` 标签页（见
  `panels/SPEC.md`）；它的标题经 store 的 `selectChatTitle` 解析聊天名（只有一处，与该窗格共享）。
  **状态排序只属于 UI**——agent 的 `formatPlan` 保持计划顺序，因此它 "work in order" 的纪律不受
  影响）、`planMarkdown`（一个纯的 `plan → markdown` 编译器，`## <group> — n/m` 分区——计划页的
  **导出**（复制 / 另存为 .md），绝不是交互表面：已完成条目的变更集渲染为它的短 sha +
  `N files · +A −R`，以及按状态字母排列的逐文件行，**纯文本，没有链接**——导出会离开应用，在那里
  链接方案是死的；交互式导航是计划页的职责。它还会为 `TodoPlan.adoptedCommits` 输出一个
  **`## Committed outside the plan`** 分区（镜像 `unattributed` 的 `## Outside the plan`），因此
  导出覆盖没有任何步骤拥有的分支提交；`No items yet` 占位符在任一分区存在时被抑制）。紧凑 TODO
  列表是一个侧栏工具（`panels/PlanRailPane.tsx`，见 [[submodule-web-panels]]），而 Plan 页是一个经
  `openPlan` 打开的中心标签页；聊天视图本身不渲染任何计划表面。**自动摘要触发器**（一份完全完成、
  且没有 agent `summary` 的计划会触发一次尽力而为的 `todo.generateSummary`，把一条宿主起草的备注折
  进去——计划重开或其摘要被清空时会重新武装，绝不覆盖已有备注）是那个只有副作用的 hook
  `useAutoPlanSummary(workspaceId, sessionId)`，由 `shell/WorkspaceWorkbench` 通过每个唯一 sessionId
  一个的 `PlanSummaryAutoDraft` 锚点挂载，覆盖任何打开的会话支撑标签页（聊天、实时 Plan 页、
  markdown 计划 `doc` 导出），经 `editorSessionId(tab)` 解析，因此无论选中哪个标签页、打开的是哪个
  计划表面，它都会触发。计划写入会通知同一聊天其他已挂载的 `useChatTodos` 实例去重取。
  前端本地的工作区视图状态把 Plan 页持久化为一个注册的 `todo-plan` 引用（解析器种类 + 会话身份，
  绝不是计划内容）；另一个客户端可以从宿主拥有的 TODO 计划显式重开同一个实时页，而不继承放置。
  （更早的设计把计划编译成一个静态 markdown `doc` 标签页，配一套自定义的 `thinkrail-diff:` 链接
  方案——已替换：快照在 agent 翻转状态的那一刻就开始撒谎，而 markdown 无法承载 Changes 面板的便利；
  页面是实时的，markdown 被降级为它的导出。）
  **一瞥状态**让计划作为用户的状态窗口保持诚实：那个 memo 的 `sessionGlance(runtime)` 选择器
  （它在会话的流式标志 + ask 状态上运行 `planGlance`），由 TODO 栏读取，并经 `hostSessionGlance`
  叠加在宿主 `SessionState` 之上，**从不存储**，因此 agent 无法让它撒谎——它把 `in_progress` 步骤
  渲染为进行中（圆点）、**等待你的回答**（`MessageCircleQuestion`——与 `ask_user_question` 卡片同一个
  字形，在实时工具阻塞或重启修复中的会话等待时），或**已暂停**（`CirclePause`，任何其他停止：轮次
  结束、错误）。没有待答问题的停止绝不会声称用户欠一个回答。这一瞥的进行中/等待生命周期来自规范化
  的宿主 `SessionState`——在 TODO 栏里，以及经 `sessionGlance` 在 Plan 与 Review 面板里——因此一个
  闲置在其后台命令或子代理上的聊天读作进行中（`isSessionWorking`）；从对话记录派生的那一瞥只是
  旧宿主的回退。`askStates` 只保留用来识别并渲染确切的问卷/回顾。**未读结果被看到即清除**（没有
  读取手势）：`ChatTranscript` 在窗口有焦点且可见、聊天被注视（`selectChatAttended`：在活跃工作区
  最后聚焦的中心分组中被选中，没有打开或请求它的历史浮层）、Resources 检查器与任何打开的模态对话框
  都没有盖住对话记录（来自 `@thinkrail/ui/dialog` 的 `useModalLayerOpen`，它标记每一个模态浮层），
  并且对话记录跟随最新边缘（`followState`），且那一行确切结果已渲染（`selectReadyCompletionAck`）
  时，确认那条确切的未读完成。用户跟随时落地的结果绝不会一直亮着；在他们阅读历史、坐在另一个分组里
  或离开时落地的结果，会在他们回到该聊天的最新边缘时清除；打开一个落在最新边缘的聊天会立即清除它。
  一个被动可见的邻接窗格，或一个未聚焦的第二个客户端，绝不会清除另一个读者的标记。瞬时的确认失败
  以有界封顶退避预算重试；重新进入已见状态会重新武装那个确切的 id。
  `TodoList` 保持 props 驱动——它接收已解析好的一瞥，绝不读传输层。
  它的分区标签 + 待处理/活跃/完成状态字形住在 **`planKit.tsx`** 里——Review 面板
  （`panels/ReviewPanel`）复用的共享呈现型原子，因此两个 "work items in sections" 表面读起来一致。
  **添加提示尊重那个等待状态。** 用户的添加总是存下该条目（零散，放在末尾）。
  在协议 v73+ 上，`session.nudge` 原子地做出宿主权威的阻塞/执行决定：需要输入则空操作、运行中则
  排队、空闲则提示。独立发布的客户端仅为更旧的宿主保留先前的基于一瞥的提示/追加消息加水合回退；
  兼容路径跳过等待中的问题，而不是越过它的阻塞去唤醒 agent。

## Chat Resources

[[submodule-web-chat-resources]] 拥有三个呈现表面——头部触发器、输入框停靠区、对话记录区检查器
——以及它们共享的行语法。`ChatView` 用它自己的 barrel 组合
`useChatResources` 集成 hook：它在头部挂载触发器，在队列条与输入框之间挂载停靠区（仅在检查器关闭时），
并在对话记录区域内部挂载检查器，好让头部与输入框保持可用；它拥有打开/选中状态，并填充检查器的详情
槽——命令用 `useCommandLog` 供给的 `CommandLogView`，子代理用
`SubagentTranscriptPane`。不涉及新的外壳窗格、工作台资源种类或终端附加物。工具/命令
完成渲染仍留在会话原语里，通过工具/自定义消息的名字接合，而不是导入能力包；最新的轮次分隔线
携带 "still running" chip，作为父级提供的指向检查器的深链。资源视图有第三个列表，
即会话的 MCP 服务器（`SessionResources.mcpServers`）：`useChatResources` 只在 MCP 能力协议上传递它
（更旧的宿主省略该字段；两种情况下都没有列表），并用
`mcp.setSessionOverride`（在此聊天中 Disable / Enable，在下次空闲重载时生效）与 `mcp.reconnect`
扩展共享控件，键为 `mcp:<name>`，挨着各个停止动作。`ChatView` 把已连接/正在启动的服务器加进
触发器的计数而不让它呼吸，在服务器需要登录、失败或等待批准时把 `ResourcesAttention` 挂在该触发器
旁边，并把那个标记与行上的 Sign in / Review / Edit 深链到 `openSettings(SettingsSection.Mcp)`。
当检查器在一个带服务器的聊天上打开时，它会运行 `watchMcpWorkspace`，并在每个已连接世代重启，
好让一次重连得到新鲜的有限读取：宿主在服务器完成连接时不发布边缘事件，而正是 `mcp.list` 的
重新读取让它刷新状态并推送 `session.resourcesChanged`。
分隔线的 "still running" chip 与停靠区只统计工作。不显示 PID——pi 不暴露它——也没有立即的按服务器
停止。

依赖边是 `ChatView`/`useChatResources` → `resources`、`store`、`transport`，以及
`ChatView` → 对话记录窗格。`resources` 子模块保持只用 props，不导入任何同级工具实现；它把共享的
30 s 时钟作为 `now` prop 接收。命令日志由集成 hook 抓取再传进它的只读视图；该模块从不加载
xterm。

该 hook 在挂载/当前欢迎时水合，订阅 `session.resourcesChanged`，并把失效合并到一次在途读取之后。
读取期间的失效需要再跑一趟；[[submodule-web-store]] 拥有带世代/修订栅栏的快照安装与失败处理。
检查器关闭时元数据保持最新；头部计数只在权威快照时是数字，否则明确为未知。一个证明宿主早于该
能力的欢迎会关闭检查器及其 Stop-all 确认，而重连期间未知的协议只是让它们变陈旧。命令输出与
子代理对话记录只在那一行是检查器的选中项时才刷新。共享的 `detailPolling` 循环处理命令输出与
子代理对话记录的读取：单飞替换快照、在终态/永久不可用的结果上停止，以及带可见可重试失败的有上限
瞬时退避。资源控件把 pending/error 状态限定在它们自己的动作与当前连接之内；回执与详情关闭的焦点
语义属于 [[submodule-web-chat-resources]]。头部计数不需要按 token 的子代理进度或工具结果改写。

`backgroundCommandCompletion` 是一条打破折叠的历史行，由 contracts 守卫在实时归约与水合两条路径上
识别。`BackgroundCommandCompletion` 只用 props，并把终端摘要与有界输出渲染为转义后的等宽纯文本，
绝不是 Markdown 或实时权威。未知的自定义消息保持既有行为。

## 边界

- **Public surface（公开接口）：** 注册表 API（`toolRegistry`）、共享的工作区文件目标规范化器
  （`fileTargets`），以及各渲染器（含呈现型的
  `Markdown`——GFM + shiki，不碰 store/transport；渲染是固定的，但**散文皮肤**由调用方经可选的
  `className` 给出——chat 使用紧凑气泡皮肤（`tr-prose-chat`），
  `panels/MarkdownPreview` 使用文档皮肤（`tr-prose-doc`）。一个皮肤只点名一套生成的
  `tr-prose-*` 体系，然后只携带间距/度量/外壳——不带字号、字重、行距或
  字距（见 `styles/TYPOGRAPHY.md`）；调用方还可以用可选的 `urlTransform`、额外的 `remarkPlugins`
  和 `components` 来**扩展**渲染，例如文件视图的 GitHub alert callouts），视图类型
  （`types.ts`，含 `ToolResultState` + `ExtUiDialogRequest`），以及 `ChatView`（由外壳工作台的资源
  渲染器惰性挂载；它接线 `SkillsDialog` + 头部 Skills 触发器，从 store 解析所属的 `projectId`，并从
  store 选择器 `selectSkillsStale(state, workspaceId, sessionId)` 读取重载徽章——
  按会话且从 store 派生，因此能在标签页切换重挂载后存活；一次成功的重载会调用
  `markSkillsSynced` 只清除这个聊天）。
  **没有 `index.ts` barrel**——chat 会拉入 **shiki**，因此按代码分割例外，导入保持
  **按文件**；注册表可以从 `chat/toolRegistry` 导入，而**不**拉入 shiki。
- **允许的依赖：** `contracts`（pi 消息/内容块类型，**仅类型**）；`ui`（共享的
  `i18n` 运行时加原语）；与生命周期无关的
  `prompt` 模块；`store` + `transport`
  （**仅限应用集成文件**——接收 props 的渲染器绝不可去碰其中任何一个。今天那指的是
  `ChatView.tsx`、**`ChatTranscript.tsx`**（那个隔离高频重渲染的对话记录子组件——Virtuoso 列表、滚动
  控制、对话记录同步、完成回执，以及 `ChatActions`/`AskStatesContext` 两个 provider）、
  `chatPreferences.ts`（客户端本地持久化适配器），外加它组合的各个 hook 与对话框：
  `useChatTodos.ts`、`useHistorySearch.ts`、
  `useModelCatalog.ts`、**`useChatResources.ts`**（Resources 的水合/控制/日志读取接缝）、
  **`useSessionStats.ts`**（带世代/修订栅栏的权威遥测读取）、
  **`useTranscriptSync.ts`**（成功的 compaction + 连接世代下的规范化对话记录
  对账）、`SkillsDialog.tsx`、**`useProjectTrustSummary.ts`**（Skills 对话框与
  `panels/ProjectTrustNotice`、New Workspace 共享的那次信任摘要读取；它的纯派生与文案住在不碰 store
  的 `projectTrust.ts` 里）、`TemplateEditorDialog.tsx`、
  `SubagentTranscriptDialog.tsx`、**`useModelPreferences.ts`**（固定 / 最近 / 默认这一对：
  那次 store 读取加上每个选择器挂载都共享的 `settings.update` 写入），以及 **`modelVisibility.ts`**
  （`main.tsx` 只启动一次的隐藏模型持久化接缝：水合 `store.hiddenModels`，并通过稳定的客户端偏好
  适配器或带宿主限定的 localStorage 写回——store 自身不碰
  任何存储）。`useModelCatalog` 是共享的模型目录接缝，`panels/NewWorkspaceDialog` 也按文件导入它，
  因此两个选择器不会漂移；激活时它**同步丢弃目录权威**（更早的消费者设下的标志，对这一个继承来的
  列表什么都说明不了），且只在共享列表**为空**时才读 `model.list`——
  每次激活都读一次会让每次聊天标签页切换都挂上一次完整的宿主 `runtime.refresh()`，而选择器的
  Refresh 行才是获取最新状态的路径。它报告的 **`fresh`**——直接从 store 的 `modelsFresh` 读出，
  因为目录权威属于**共享列表**，而不属于某个消费者：仅当一次等待中的强制刷新**宿主报告了 `complete`**
  且其结果已安装时才为真（它的等待有上限，因此一次未落定的过程仍会作答——给出的是可渲染的列表，
  而不是结论），并会被**任何**消费者接下来的 `model.list` 安装所丢弃。`model.list` 从它触发的那次
  分离刷新*之前*作答，因此它绝不是断定某个模型已消失的依据）；
  `react-markdown` / `remark-gfm` / `shiki`（经 `lib/highlighter` / `lib/highlightCode`；流式中的围栏
  会显示它上一次的高亮，加上更新的文本作为纯文本，直到 worker 追上）；`marked`（仅用于
  `markdownBlocks` 切分的块词法分析器，绝不用于渲染）；`@thinkrail/ext-visualize/web`
  （`Markdown` 消费 `MermaidView`；`mermaid` 在扩展里保持惰性）；
  `@thinkrail/extension-api/web`；`react-virtuoso`；`@remixicon/react`；`@thinkrail/ui/*`；
  `components/useNow`；`lib`。
- **禁止：** value-import 任何 `pi` 包；**呈现型**渲染器导入
  `store`/`transport`（只有上面列举的应用集成文件可以——保持渲染器可复用）。
- **`ChatView`** 是主要的应用集成文件：接线传输层调用与本次会话面向外壳的
  store 读取（从 `store.sessions[sessionId]` 取细粒度的逐字段选择器，外加
  `recentPrompts` 与通过浅比较选择器派生的计划一瞥）——与
  **`useHistorySearch.ts`**（Ctrl+R 历史召回浮层的 store/transport 边缘）、
  **`useSessionStats.ts`**（让遥测保持实时的受保护读取）以及
  **`TemplateEditorDialog.tsx`**（共享的模板保存表单）一起，构成另外几个外壳集成点。它那个隔离
  高频重渲染的子组件 **`ChatTranscript`** 是第二个集成文件：它拥有流式运行时的
  订阅（`store.sessions[sessionId]`），提供 `ChatActions` + `AskStates` context，构建
  分隔线的深链（`onOpenChange` → `requestChangesView`，`onOpenSpec` → `requestSpecView`；每个
  都接收用户选中的那一个路径）加上它的视图切换（`onReveal` → 工具揭示意图），以及
  来自 store `specsByWorkspace` 快照的 `isSpec` 分类器（以存储的那个数组——一个稳定 ref——订阅，
  再 memo 成一个匹配器，绝不在选择器里新建 Set），还有那一次受保护的
  **`useTranscriptSync.ts`** 权威读取，用来收敛已有的运行时。一次
  **被拒绝的**发送（`prompt`/`steer`/`followUp`）经 store 的 `appendErrorTurn` 落进聊天——
  绝不被吞掉，也绝不给只有落定才有的 Try again 便利；*流式*故障则以 pi
  事件的形式到达。

## 流式模型

`store` 把 pi 事件折算成 pi 规范化的轮次，**按会话**：在途的 assistant 轮次**就是**最新的
`assistantMessageEvent.partial` 快照（每次更新都替换，而不是手工累积）。一条消息真正的终结点是
**`message_end`**：reducer 在那里采纳最终消息（它携带 `stopReason`，渲染器据此识别死掉的工具调用），
并在**那里**清除该消息的 `streaming` 标志。`agent_end` 只是一个尝试边界（对于带工具调用的消息，它在
其工具跑完之后到达，但仍可能先于自动压缩/重试）；只有 `agent_settled` 才会关闭自动运行、清除会话
加载器，并追加一个成功/错误标记。一次成功的溢出 `compaction_end` 带 `willRetry: true` 会移除被取代的
出错/截断尝试，与 Pi 重建后的上下文一致。工具结果在 `toolResults` 里按 `toolCallId` 索引；
`ask-user-answers` 自定义消息索引进 `askAnswers`（绝不是轮次列表——问卷卡片就是它们的渲染）；
`subagent-completion` 自定义消息追加一个 `subagentCompletion` 轮次（共享的 contracts 守卫在实时路径与
读取路径上都会收窄两者）。视图每次渲染都重新派生行（`deriveRows` 是纯函数；`ChatTranscript` 对它做
memo，然后通过保存在 state 里的 `stabilizeRows` 复用未变的行对象）——稳定的行/步骤 id 让折叠状态在
快照之间存活。

**始终只有一个实时指示器。** pi 会把一次运行拆成好几条 assistant 消息，因此 reducer 在新消息开始时
以及最终的 `agent_settled` 时清扫每消息的 `streaming` 标志（任何时候最多只有一个轮次被标记）。会话在
尝试级的 `agent_end` 事件之间保持活着。加载器是一个**单一页脚**（`StreamIndicator`：共享的
`RunningIcon` 品牌徽章，在这里是装饰性的，加上来自纯 `streamStatus` 派生器的阶段标签——`working` →
`thinking` → `running-tool` → `writing`，外加对话记录尾部轮次是运行中压缩时的 `compacting`）——不是
每轮次一个游标——因此它无法重复，并填补发送之后的空隙。在流式窗口之外（一次手动压缩，或 pi 在
`prompt()` 里、`agent_start` 之前跑的前置压缩），页脚按设计缺席——那条运行中的 `CompactionNotice` 行
自己带 spinner，所以那个节拍绝不是死空气。尾部 Activity 折叠的实时行情是一条*状态*行（spinner，像
运行中卡片的头部），不是第二个加载器。`data-testid="stream-indicator"` + `data-phase` 让生命周期可断言。

## 必须做对的事

- 渲染器**只通过 CSS 变量 token 工具类取主题**（不用原始 hex / 行内 `style`）——正是这一点让这些原语能穿上
  任何 token 主题，也是复用的关键。
- 让呈现型组件保持**props 驱动**（不绑定 store）；只有 `ChatView`/`ChatTranscript` 接线应用。这就是日后抽出
  独立的 `packages/chat-ui` 的接缝。
- 让本规范停留在**意图 + 边界 + 不变量**；每个组件的行为属于该组件的 jsdoc，每个工具的细节属于
  [tools/SPEC.md](tools/SPEC.md)。
