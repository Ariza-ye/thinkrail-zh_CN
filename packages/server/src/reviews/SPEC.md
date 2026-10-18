---
id: submodule-server-reviews
type: submodule-design
status: active
title: reviews —— 针对文件/差异的草稿评论 + 评审会话
parent: module-server
depends-on: [module-contracts]
tags: [review]
---

## 职责

评审层：GitHub 风格的**草稿评论**，锚定到工作区的文件与差异上，在不启动 agent 的情况下收集，
然后发送 —— 按**每个文件**分组，每个文件的评论进入该文件唯一的那一个评审聊天 —— 作为**结构化
上下文包**。拥有每工作区的评审存储、锚点重新锚定，以及包渲染。

## 模型（镜像 `contracts` 里的线上 DTO）

- **每工作区一个打开的 `Review`**（首次读取/评论时惰性创建）。惰性创建会 await git（钉定的基线
  经由异步范围解析器解析），所以它**按工作区做 single-flight**：否则未加锁的 `review.get` 读取
  与一个穿过该窗口的加锁变更会各自保存一份不同的新评审，最后一份静默替换掉对方的（可能已被变更
  过的）快照。Clear 会加入那次创建飞行，然后才解析它的替代品，所以一次首次 `review.get` 绝不可能
  用一份未宣告的快照盖过 Clear 已发布的那一份。`freshSnapshot` 在它的 git await **之后**重新读取
  工作区：移除会在任何东西持久化之前抛出，而改变的差异身份（`worktreePath`、`baseBranch`、
  `diffBase`）会重试基线解析，而不是把新评审钉到旧目标上。创建是一次快照过程唯一可以跨越的
  await：对打开快照的每一次 加载→变更→持久化 都同步运行。变更辅助函数立即使用已打开的
  快照，只在必须加入惰性创建时才 await；它们绝不把已加载的快照包进 `Promise.resolve` 然后带着
  陈旧状态让出。未加锁读取的重锚定过程（`getReviewSnapshot`）遵循同一规则。`addComment` 在取
  快照**之前**解析它不可变的基线侧 ref，但只在最后的同步变更/持久化过程中捕获一个可变的工作树
  锚点；`clearReview` 在加载它要归档的活跃快照**之前**解析新基线 —— 因为评审锁只覆盖变更，
  而一个跨 await 持有快照的过程会盖掉并发写入者（一次加锁变更、`rollbackSend`、一次 agent
  解决）在那道间隙里持久化的东西，静默删掉它。这套纪律仍允许的唯一损失，是一次加锁变更（其快照
  早于它的 await）覆盖一次重锚定持久化 —— 良性：锚点状态派生自工作树内容，并在下一次读取时
  重新计算。线上协议的 **`review.close` 就是 Clear 操作**：在宿主的工作区评审锁下，`clearReview`
  先把当前评审的非草稿记录作为一份已关闭快照持久化到
  `reviews/archive/<workspaceId>/<reviewId>.json`，然后用一份新的打开评审替换活跃快照，并且只
  发布那份新快照 —— 客户端绝不会收敛到中间那份已关闭副本。草稿被丢弃；已发送/已解决/已忽略的
  记录存活下来。没有归档浏览器，但在途的 agent 仍能按 id 解决一条已发送的归档评论。
  `Review.fileSessions` 把每个评审 KEY 钉到它的聊天（key → sessionId）：评审生命期内每文件一个
  聊天 —— 该文件的首次发送创建它，之后每次发送（单个或批量）都向它追加。key 是评论的路径，或
  对无锚点的整个改动集备注来说是**空字符串**，钉法与文件完全相同（`reviewSessionKey`），这样第二条
  整体备注会延续那段讨论，而不是开一个无人能追加的聊天。`Review.doneFiles`（同样的 key）标记
  用户**已完成**评审的文件：一个完全解决的文件会留在评审里，直到 `markFileDone`（线上：
  `review.fileDone`，任何未解决时被拒绝）说"这里完成了"—— 而对该文件的新评论会清除该标记
  （`addComment`），把它重新打开。
  `Review.baseSha` 把**被评审差异的原始侧**钉住 —— 分支范围的 `originalRef`，即**分叉点**
  （差异目标与 `HEAD` 的 `merge-base`）—— **到一个完整提交 oid，一次，在创建时**。不是
  `diffBaseRef` 的尖端：分支差异展示的是 分叉点-对-工作树（merge-base 语义），所以一个已经
  越过产生分叉的工作区的目标，其尖端带着这次评审从未展示过的上游提交。有意取分支范围，无论
  Changes 面板显示什么范围 —— 范围切换绝不能重新定义这次评审*是什么*（在另一个范围里写下的
  评论仍引用它自己的 `anchor.baseRef`）。出于同样的原因不可变：目标在评审中途可被重新指向，
  它的分支也会移动。当原始 ref 无法解析时它退化到该原始 ref，所以评审界面在一个不可读的基线
  之下仍能存活，而不是随之消失。`reviewBaseRef` 是 `host` 读取它的方式。
- **`ReviewComment`**：`kind` inline/diff/file/review；`status` draft → sent → resolved（或
  dismissed）；**`author`** —— 人类（默认，缺失）或 `"agent"`：计划的评审 agent 通过同一个
  `addComment` 提交发现项（工作树侧锚点），在面板中被标记，并被同一套发送机构接走（TODO 的
  修复包搭乘 `buildSendPackage`，见 [[submodule-server-todos]] §agent reviewer）。线上协议
  （`review.commentUpdate`）只能落地终态的人工结果（resolved/dismissed，来自 draft 或 sent）；
  `draft`↔`sent` 的迁移完全由发送路径拥有（`markCommentsSent`/`rollbackSend`）—— 一个能把评论
  取消发送的客户端，就能重写或删除一条 id 已被某次 agent 聊天引用的备注；
  `sessionId` 链接该评论被发送进去的聊天 —— 也就是它所属文件的评审聊天。**一条评论一旦被发送
  就是一条记录**：草稿 —— 用户自己未发送的草稿 —— 仍可被删除（`review.commentDelete`，仅草稿，
  否则被拒绝），但已发送的评论绝不被删除 —— Clear 在替换活跃评审之前把那条记录移进已关闭归档
  —— 而评审不提供对工作树改动的回滚（旧的 `git.revertFile` Reject 已消失）；对一处改动
  表示反对的方式，就是在评论里说出来。
- **`ReviewAnchor` = `path` + `side` + `contentHash` + 一条有序的 `selectors` 回退链**
  （`lineRange`、带 exact/prefix/suffix 的 `textQuote`、针对文档节点的 `structural` scheme+ref、
  针对归一化 `0..1` 几何的 `region`；Ask-agent 用实际显示的 hunk 头填充 `diffHunk`，而
  `textQuote` 承载重新锚定）。`anchorState` 轴（`anchored`/`moved`/`outdated`）与 `status`
  **正交**："是否讨论过"与"锚点是否还活着"绝不互相覆盖。
  **`contentHash` 是资源字节之上的 sha-256**（`fs.hashBytes`），捕获跟随资源而不是评论：**文本**
  侧（`fs.classifyBytes` —— 没有可识别的二进制魔数、前 8 KiB 无 NUL 字节，且严格 UTF-8 解码；
  BOM 算文本，SVG 算文本）像以前一样从 `lineRange` 派生 `textQuote`，而**字节专用**侧对字节取
  哈希，并**按给定**保留渲染器的选择器，绝不派生引文 —— 因为没有可引用的文本。`addComment`
  在任一种捕获**之前先收窄线上协议的选择器** —— 每个元素都是已知 `kind` 的对象，每个声明的
  字段都做类型检查（`region` 分量有限且落在 `[0, 1]`，`page` 是正整数；`structural.ref` 是非空
  字符串且 `scheme` 匹配 `/^[a-z][a-z0-9-]*$/`；`lineRange` 为整数、1 起、不倒置）—— 并存储
  *那个*收窄后的值，所以一个未声明的字段无法搭着线上协议进入存储。它除形状之外什么都不校验：
  一个未知的 structural scheme 属于某台宿主从未听说过的渲染器，会被保留，而不是拒绝。
- **两个差异侧是两个锚点空间。** 一个 `side: "worktree"` 锚点捕获自工作树文件；一个
  `side: "base"` 锚点捕获自差异的 ORIGINAL 编辑器正在展示的那个 blob —— 宿主从标签页的 `scope`
  解析它（`resolveDiffRange(...).originalRef`），**把该 ref 钉到一个完整提交 oid**
  （`git.resolveCommitOid`）并作为 **`baseRef`** 盖在锚点上，这样片段及其上下文在评审生命期内
  保持可读 —— 且保持**同一份**。钉住是承重的部分：一个范围的 `originalRef` 对 `uncommitted`
  是符号性的（字面的 `HEAD`），并在 `merge-base` 失败时退化到原始基线 ref，所以逐字存储它意味着
  用户的下一次提交会重新指向它，包会在昨天的行号处读到今天的内容。不指向任何提交的 ref 会被
  当场拒绝，而不是锚定到某个会移动的东西上。两侧在捕获时都按**字节**读取（基线侧用
  `git.readBlobBytesAt`，工作树侧本就如此），因为解码读取会为一张图哈希出替换字符，并丢掉
  工作树侧保留的 BOM。基线选择**绝不翻译成工作树行号**：两侧在同样的行号上说的是不同的
  事，所以对一行被删除或重写内容的备注会挂到如今占据该位置的东西上 —— 而*那*正是发送包会给
  agent 看的内容。一个其路径在基线里根本不存在的基线锚点会被预先拒绝，绝不静默重新指向。

## 重新锚定（评论之下的文件变了）

每次快照读取时以及任何发送之前（`reanchorWorkspace`）都对着工作树重新计算：
1. `contentHash`（文件字节的 sha-256）未变 → `anchored`。
2. 否则搜索 `textQuote.exact`（用 prefix/suffix 消歧）→ 恰好一处匹配 → 更新 `lineRange`，状态
   `moved`（静默重钉）。**`moved` 是黏性的**：重钉会刷新锚点的 `contentHash`，所以紧接着的下一趟
   本会看到哈希匹配并把它静默降级为 `anchored` —— 丢掉该状态所记录的"自创建以来已漂移"这一事实。
3. 无匹配/歧义匹配，或文件已消失 → `outdated`；评论保留它创建时的快照（`textQuote.exact`），
   所以它仍然有意义且仍可发送（包会把它标记为 outdated）。
4. **根本没有 `textQuote` 可搜索**（一个字节专用资源，或一个不用文本锚定的渲染器）：
   一个**带位置**的锚点 —— 任何 `lineRange`/`structural`/`region` 选择器 —— 是 `outdated`，因为
   重钉需要证据，而一张变了的图片或笔记本提供不了；一个**整文件**锚点（没有选择器，即 `file`
   评论种类）保持 `moved` 并带刷新后的哈希，因为那条备注针对的是文件，而不是文件中的某个位置。
   这是有意的，而严格也是有意为之：一个尺寸相同、被重新编码或被动过元数据的 PNG，*大概*在同一
   归一化区域下仍有那条备注的对象，但"尺寸相同"并不是"那里的像素相同"的证据，而 `outdated` 的
   全部意义就是"再次查看之后才可信这个位置"。曾考虑过"尺寸保持 → `moved`"的规则并否决了它，
   因为那会让宿主断言一个它无法核实的视觉事实 —— 那项核实属于差异查看器
   （2-up、滑动、洋葱、差异），而一条 `outdated` 讨论串仍画在它的区域上、仍可发送、仍携带它创建
   时的快照。客户端的 UI 文案会说出原因（`outdatedReason`）：文本未被再次找到、位置之下的字节
   变了，或文件已消失。
`side: "base"` 锚点从不重新锚定：`baseRef` 是一个提交 oid，所以它所指的 blob 不可变，没有什么
可以漂移 —— 而对着*工作树* 重新锚定它们，正是每侧捕获所要防止的那种重新指向。

## 发送流程与上下文包

`review.sendComment` / `review.sendBatch` 在 **`host` 的处理器里组合**（本模块绝不导入 `agent`）：
重新锚定 → 渲染包（一条结构化的 user 消息，带稳定的评论 id，每条评论一个片段 + 周边上下文 ——
或者，对一个由几何或文档节点而非行来命名位置的情形（一个栅格或 SVG 区域、一个笔记本单元格），
用一行 `<locator>` 命出区域几何或 `<scheme> <ref>` 节点，因为没有行跨度可引用；每条评论都携带
`anchor-kind`（`region`/`structural`/`line`/`file`），这样 agent 把几何读作几何 ——
绝不读取整个差异。**每个动态属性和定位器值都做实体转义**（`& < > "`，CR/LF 用数字引用），因为
仓库路径或渲染器的节点 ref 是不可信文本，否则就能闭合标签并伪造一条用户从未写过的评论；片段、
上下文与正文保持逐字，因为它们就是 agent 要原样阅读的内容 —— 而 Web 卡片解析回同样的转义（见
`apps/web/src/chat/SPEC.md`）。agent 用自己的工具读取工作树；**每一侧读取自己的内容** ——
工作树锚点读工作树，基线锚点读该锚点的 `baseRef` blob，因为基线行号索引的是改动前的文件）
→ `agent.createSession`（或在发送点名一个聊天时 `followUp` 进客户端的**最后打开的聊天** —— 用户
屏幕上已经打开的那段对话 —— 否则进该 KEY 已钉住的那个聊天，**当它不活跃时从磁盘重新挂载**，
因为评审状态与 pi 记录都能在宿主重启后存活；一个跨多个 key 的批量会分别发送每一组并以全部会话
作答，所以没有一组在无人看见的情况下运行着；无论谁接收了这个包，就成为该 key 的钉子）→
`markSent` → 提示词。`markSent` 要求每个被请求的 id 仍然命名活跃快照里的一条草稿 —— 它在生命
周期漂移之后绝不静默标记部分集合。整个序列与**每一次评审变更**一起**按工作区串行化**（`host`
的 `withReviewLock`）：草稿/会话检查发生在被 await 的会话创建*之前*，所以在那道间隙里两次并发
发送都会看到"有草稿、无会话"并分叉这次评审 —— 而一次并发的 `review.close` Clear 会让已经建好
的包失效，留给 agent 的评论 id 不在任何打开的评审里。**提示词是分离（detached）触发的**
（`fireReviewPrompt`）：会话一存在处理器就返回，好让客户端立即打开聊天 —— await 确认意味着每次
发送都要坐等 pi 的 10s 接受窗口。因为 `markSent` 在锁内被 await，且在轮次被知晓接受之前 ——
它必须如此，这样该 key 的钉子在锁内存在，并发发送无法分叉聊天 —— 一次轮次前拒绝（坏模型、
缺失/过期 key）既会作为扩展 UI 通知出现在**刚打开的聊天内部**，**又会把评论回滚到 `draft`**
（`rollbackSend`，以 `ackSend` 的接受-对-拒绝窗口为键）：一次 agent 从未收到的评审保持可重试，
而不是以 `sent` 搁浅、连带发送/编辑/删除动作都没了，而一个专为那次失败发送而开的聊天会被解钉，
除非还有另一条评论支撑它。接受之后发生的故障是真正的轮次故障（包**确实**交付了）并沿事件流
传出，让 `sent` 状态保持正确。回滚分离运行（在发送的锁释放之后）且完全同步，所以 —— 和
`reanchorWorkspace` 一样 —— 它在无锁下保持正确，并且它用 `load`（绝不用 `ensureSnapshot`）读取：
一个先落地的 `review.close` Clear 会让它对着新评审成为干净的空操作，而不是复活被清除的评论。
**`resolve_comment`** 能力是一个 agent 模块的自定义工具（`agent/reviewTool.ts`，像
`ask_user_question` 一样注册在每个会话上），其执行通过一个宿主安装的接缝交回这里 —— agent
模块因此保持无依赖。**会话绑定**：工具线程的 `ctx.sessionManager.getSessionId()` 一路传到
`resolveCommentFromAgent`，而 `applyAgentResolution` 只解决 `status === "sent"` **且**
`sessionId` 等于调用者的评论 —— 即 `markCommentsSent` 记录的实际收件聊天。一条 `draft` 评论
经该工具无条件不可解决（一条评论只有它真正交付到的那个聊天才能调它；无论 agent 还是人类，都
不能解决自己未发送的草稿）—— 这正是让评审 agent 无法提交一条发现项后立刻自己清掉它的机制
（见 [[submodule-server-host]] 的 approve 门禁）。解决先搜活跃快照，再搜已关闭归档，所以一次在
Clear 落地时已在途的工具调用仍能完成它的记录；归档更新会持久化，但不发布非活跃快照。

## 边界

- **拥有：** 活跃的 `reviews/<workspaceId>.json`，以及数据目录下
  `reviews/archive/<workspaceId>/<reviewId>.json` 处的已关闭记录归档（经由 `persistence.dataDir`；
  id 会成为路径段，所以每次文件触碰都拒绝带路径段的 id —— `/^[\w-]+$/` —— 否则一个线上协议传来
  的 `../config` 式字符串就能把 读/写/unlink 指向 reviews 目录之外：这是处理器自身查找之后的
  纵深防御）、评论 CRUD + 状态/生命周期迁移、锚点捕获 + 重新锚定（纯函数、有单元测试的
  `anchoring.ts`）、包渲染（纯函数 `packageRender.ts`），以及 `review.changed` 发布器接缝
  （`setReviewPublisher`，由 `host` 安装 —— 全快照推送，在末值重放之下幂等）。
- **Public surface（公开接口，barrel）：** `getReviewSnapshot`, `addComment`, `updateComment`, `deleteComment`
  （仅草稿）, `clearReview`, `markCommentsSent`, `rollbackSend`（在一次轮次前发送拒绝时撤销
  `markCommentsSent`）, `markFileDone`, `fileReviewSession` + `reviewSessionKey`/`REVIEW_LEVEL_KEY`
  （每 key 的聊天钉子）, `resolveCommentFromAgent`, `reanchorWorkspace`, `sendableComments`,
  `buildSendPackage`, `removeWorkspaceReviews`, `setReviewPublisher`, `setReviewGuide`（最新一条
  计划步骤裁决的叙述 —— 摘要、建议阅读顺序、裁决、来源 —— 存在打开评审上作为 `review.guide`
  并随快照一起扇出，所以 Changes 的评审标签页无需二次读取就能走查它；由 `host` 的裁决记录器
  写入，绝不由客户端写入）（+ 纯的 锚定/渲染 辅助函数：`reanchor`, `buildTextQuote`, `hashContent`,
  `lineRangeOf`, `textQuoteOf`, `renderPackage`）。
- **允许的依赖：** `contracts`（类型）、`persistence`（数据目录）、`log`、`workspaces`（工作树
  路径查找）、`git`（评审 `baseSha` 的解析、基线锚点 `baseRef` 背后的差异范围，以及基线侧的
  blob 读取）、`fs`（`classifyBytes`/`decodeText`/`hashBytes` —— 文本性与锚点 `contentHash` *就是*
  的那个 sha-256 都在那里一次决定，所以一条评论的哈希与一次回退的期望，绝不可能对同一批字节
  意见不一）、Node 的 `fs`。
- **绝不触碰：** 导入 `host`/`agent` 或任何 pi 包；经该接缝之外发布。

## 必须做对的事

- **状态经由推送收敛，绝不靠乐观** —— 每次变更（UI 编辑、agent 解决、一次改变了状态的重锚定）
  都发出一个完整的 `review.changed` 快照；客户端折叠它。Clear 只发出那份新的打开快照（绝不是
  被归档的那份评审），于是每个连上的客户端一起清空。已关闭归档先写入；一次失败不可能在未保留
  其非草稿记录的情况下替换活跃评审，而重试按评审 id 幂等。
- 发送**先重新锚定**，所以包里的行号在发送时刻是真的 —— 并且**按工作区与每次变更一起串行化**，
  这样没有任何东西能在一次 检查→标记 之下关闭或重发。一个引用了某评论 id 的包，就是该 id 仍然
  存在的承诺。
- **片段读取自它被捕获的那一侧。** 基线锚点绝不读工作树，工作树锚点绝不读 blob：从 agent
  的角度看，给它看错的那一侧，与用户说错了话毫无区别。一个基线锚点还携带它被捕获时的 **`scope`**
  （紧挨着已解析的 `baseRef`）—— 评审侧边栏据此重新打开那条备注自己的界面（见 `panels/SPEC.md`）。
- **持久化绝不因文件损坏而丢掉一次评审。** 写入是**原子的**（临时文件 + rename，所以一个在写入
  中途被杀掉的宿主不可能留下截断的评审），而读取**只把 `ENOENT`** 当作"没有评审"：一个无法解析
  —— 或根本无法读取 —— 的文件**抛出**并被留在磁盘上，因为唯一按"不存在"行事的调用方
  （`ensureSnapshot`）会以在它之上写一份新的空评审作为回应。失败会浮现在 `review.get` 上
  （面板会这么说），而不是静默丢弃每一条评论。唯一的例外是 agent 解决背后的跨工作区扫描：一个
  损坏的*兄弟*会被记录并跳过，绝不允许它让属于健康评审的一次解决失败。
- 一次**未知/重复的 agent 解决会大声失败**（错误文本回到模型），绝不静默。一次在 Clear 之后
  到达的解决会原地更新归档记录，且不发出活跃评审推送。agent 解决接受 `sent` 评论**以及
  agent 撰写的 `draft`**：在自动修复关闭时，评审者的发现项被记录但从不发送，而重评审包仍告诉
  评审者去解决修复所处理的每条发现项 —— 只允许 sent 的门会让该指令无法满足，并把发现项搁在
  一个已批准事项之下。人类的草稿仍不可由 agent 解决（它们是用户未发送的草稿）。
- 工作区移除会清除活跃评审及其归档目录（`removeWorkspaceReviews`，由工作区归档处理器调用）。
