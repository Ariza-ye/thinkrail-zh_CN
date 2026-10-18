---
id: submodule-server-todos
type: submodule-design
status: active
title: todos —— 一次聊天的按会话 TODO 计划（读/写）
parent: module-server
depends-on: [module-contracts, submodule-server-git, submodule-server-assist]
references: [module-pi-todos, submodule-server-pr, submodule-web-chat]
tags: [todos]
---

## 职责

为一个聊天会话提供聊天内的 TODO 计划，映射为线上协议 DTO。该列表**以 `sessionId` 为范围**（每个会话
一个 JSON 文件，位于工作区工作树之下临时性的上下文草稿目录
`.thinkrail/context/todos/<sessionId>.json`），而不是以工作树为范围。按需读-改-写：每次调用都经由
`pi-todos` 的无 pi `TodoStore` 重新读取，因此 agent 在会话内的 `todo_*` 写入与用户的 UI 编辑收敛到
同一个文件上，没有过期窗口。`listTodos` 在输出途中还**为每个分组装饰上它派生的 `status`**（`pi-todos`
的 `groupStatus`）：该规则属于拥有计划语义的那个包，把结果发出去也让 `apps/web`（它只能导入
`contracts`）不必再携带它的第二份副本。

与 agent 自己的工具（它们拥有状态）不同，宿主的写入面是**用户**的编辑杠杆：`todo.add` 把新条目打上
`origin: "user"`，使 agent 的 `todo_write` 重新规划时绝不丢掉它们。`todo.update` 在线上协议上存在
（接受 status/title/note），但当前没有任何 UI 路径调用它 —— 状态仍由 agent 拥有（见
[[module-pi-todos]]）。`todo.remove` 是用户的队列取消动作，受 `removeTodo` 的 **done 护栏**约束：
pending / in_progress 的条目可以被移除（UI 在它们上面显示一个悬停的“移除”按钮）；一个 `done` 条目
会被拒绝，因为已完成的步骤是计划的审计线索。宿主还叠加了一个活跃评审护栏
（`isItemUnderActiveReview`），使一次评审中途的取消无法让评审记账被搁浅。agent 自己的 `todo_remove`
工具直接走 `TodoStore.remove`，不经过这道门。一次 UI 移除还会丢掉该条目的基线、评审记录与自动评审
轮次数。`updateTodo` 拆开 store 的 `TodoUpdateResult`（`{ todo, paused }` —— `paused` = 为保持只有
一个 `in_progress` 而被自动降级的条目）；线上响应仍是一个裸的 `TodoItem` —— UI 在变更时重读整个计划，
因此降级会随下一次 `todo.list` 到达。

本模块**不**推送：一次用户编辑不会被广播给其他客户端。执行的客户端乐观地更新；第二个查看者在由
`pi.event` 驱动的下一次重新获取时对账。对一个单一属主的宿主来说这没问题（它喂养的聊天-计划 UX：
[[submodule-web-chat]] 的“聊天 TODO 计划”）。

**变更产物（`artifacts.ts`）—— 一张基于提交的评审地图。** 状态仍由 agent 拥有，但宿主*观察*这些转换
以便附上一个条目的代码变更，于是计划变成一张持久的评审地图。`host/server.ts` 从会话事件流上分接
`isTodoToolEnd`，并在发布路径之外触发 `maybeAttachChangeArtifacts(workspaceId, sessionId)`
（`void` —— 它执行 git 写入）。对账**按工作区串行化**（一条 promise 链），使两次快速的 `todo_*` 结束
无法在提交中途与索引赛跑。每次 `maybeAttachChangeArtifacts` 调用都先检视最新计划，并在**入队之前**
同步捕获任何新出现的 `in_progress` 窗口；当一个更早的对账已占据队列、或一个 done 条目排在活跃条目
之前时，这仍然成立。入队的那一趟在生产中绝不打开一个缺失的窗口 —— 缺失意味着捕获失败，因此稍后的
完成会降级为无基线的路径列表回退，而不是把工作从一次迟到的基线中排除。整条路径是尽力而为的，绝不
向事件流抛错。同一条链还串行化**每一个宿主计划/伴随文件写入方** —— UI 的 `todo.add` / `todo.update`
与 `session.delete` 的窗口移除，都排在任何在飞对账之后（`enqueueTodoMutation`）—— 一次对账会读取
计划 + 基线、等待 git，并以一次整张地图的基线写入结束；一次未入队的写入若落在那段窗口内，会被那一趟
过期的处理复活。agent 侧的 `todo_*` 计划写入无法入队（它们发生在 pi 内部），因此一次对账会对它读到
过的计划与持久化基线伴随文件都做指纹，并在每次对应的写入之前重新检查权威指纹。漂移会在那一趟过期的
处理打开一个太晚的基线、提交一个被重新打开的条目、抹掉一个由外部捕获/共享的窗口，或覆盖更新的产物
之前中止它；agent 工具那个已入队的后续对账则作用于新计划。每个成功对账的条目都在循环可能为下一个条目
等待 Git 之前，为它的基线增/删打检查点，因此后来的漂移无法回滚更早条目那个已完成的窗口。

在 `in_progress` 时它**打开该条目的工作窗口**：一个由工作树**未提交**变更路径集合 + 当前 `HEAD` sha
组成的基线，在 tool-end 发布器返回之前通过 git 模块那个刻意同步的 `gitUncommittedPaths` 叶子捕获，
然后**持久化**在 todos JSON 旁边一个宿主拥有的伴随文件里
（`.thinkrail/context/todos/<sessionId>.baselines.json`，像 store 一样读-改-写）—— 因此宿主在条目的
中途重启不会改变任何东西；`head` 是**窗口内提交收编**（见下）的区间基线。在一个**另一个聊天**已经
有一个窗口时打开的窗口会记录 `shared: true`，并把那个其他窗口也标记为共享
（`markOtherSessionWindowsShared`）—— 该标志是**粘性的**，因为“这个窗口在其整个生命期内是否都是排他
的？”正是门控所需要的事实，而一旦另一个窗口关闭就无法重新推导。（*一个*计划的两个条目不可能重叠：
`pi-todos` 保持恰好一个条目处于 `in_progress`，被降级条目的窗口会被丢弃 —— 由测试固定，因为门控
依赖这一点。）**窗口绝不比它的属主活得更久**：一个其条目已从计划中消失的基线会在每次对账的开头被
清理，而 `session.delete` 会移除该聊天的整个伴随文件（`removeSessionTodoWindows`）—— 一个孤儿会被
读成一个永久开启的外部窗口，并永远把每个兄弟聊天逼进回退路径。在 `done` 时：

- **提交该条目的增量。** `git.gitCommitPaths` 提交的**恰好是那些增量路径** —— 该条目自己的工作，绝不
  是“当前所有脏东西” —— 并带 `--no-verify`（该提交绝不可运行/失败用户的钩子；作者/提交者仍是用户
  自己的配置 —— 那是他们的分支）。它会在任何失败中保留用户的索引（见 [[submodule-server-git]]）。
  该条目得到**一个 `commit` 产物**（那个 sha，`label` = 该条目标题）与**别无其他**：该提交是自足的
  —— 它的文件列表是*派生*出来的，绝不反规范化进 JSON（见下面 `listTodos` 的装饰）。
- **收编窗口内的提交。** 宿主在一个条目的窗口期间是预期的唯一提交者（worker 子代理的提示词禁止它
  提交 —— [[module-pi-subagents]]），但那是指引而非强制，用户也可能手工提交。因此在增量提交之前，
  任何在该条目打开期间落进 `base.head..HEAD` 的提交（`git.listCommitsSince`）若不归任何计划条目所有，
  都会被**作为 `commit` 产物附到该条目上** —— 最旧的在前，排在增量提交之前，使该步骤的修订历史按时间
  顺序阅读。没有这一点，一个提交了自己工作的子代理会在 `done` 时把增量清空 —— 该步骤将不显示任何变更
  集，而工作会作为孤儿泄漏到 `adoptedCommits`（见下）。收编与增量提交走**同一道排他窗口门控**
  （门控 3：绝不 `shared`，没有其他聊天正在工作中），需要一个已记录的 `base.head`，**并且要求本次
  那一趟中该条目的窗口是同会话唯一的窗口**。唯一窗口规则是承重的：区间是 `base.head..HEAD`，因此在
  一条线性分支上，一个*更早*条目的区间是一个*更晚*条目窗口的**超集** —— 若一个 done 条目在另一个
  同会话窗口仍开着时对账（它自己的 done 趟被按工作区队列推迟，而下一个条目已开始且其子代理已提交），
  一个朴素的 `base.head..HEAD` 会让更早的条目贪婪地认领更晚条目的提交（`owned` 去重只阻止*同一个*
  sha 被认领两次，不阻止这种跨窗口的越界）。因此当存在第二个同会话窗口时，该条目**什么也不**收编，
  而那些提交降级到安全的 `adoptedCommits` 回退 —— 即先前既有的行为，绝不是一次错误归因。收编**不**需要
  门控 2（外来的*未提交*脏东西），它只管增量提交。一趟中跨条目的 `owned` sha 集合还额外阻止一个已被
  任何条目拥有的提交（例如一次重做的先前提交）被重新收编。
- **消息是一行用户可以不加编辑就推送的主题行。** 这些提交落在用户自己的分支上，与他们手写的提交处于
  同一段历史里，而分支会直接发往一个 PR（[[submodule-server-pr]] 负责推送它）—— 因此任何用户推送前
  必须改写的东西都是缺陷。主题是该条目由 agent 撰写的 **`commitSubject`**（见 [[module-pi-todos]]：
  在 `done` 时按*宿主仓库的*提交风格写出，agent 从 `git log` 读到），缺席时回退到条目 `title`。
  别无其他：**没有 `todo:` 前缀，也没有正文/尾注。** 更早的版本写 `todo: <title>` 外加一条
  `ThinkRail-Todo: <sessionId>/<todoId>` 尾注；两者都已去掉。该前缀 + 一个计划步骤标题在一段
  Conventional-Commits 历史里读起来像一个外来产物（本仓库自己的
  `todo: Get design sign-off, promote decisions into apps/website/SPEC.md` 就是标本），而那个尾注是
  **只写的** —— 条目↔提交的归因是 `commit` 产物的 `sha`，从没有任何东西把尾注解析回来，因此它只换来
  一个泄漏到公开历史里的内部会话 UUID。相应地，`CommitWindow` 接缝是 `{ subject, paths }`：挑选主题
  是对账的职责，而 git 叶子只负责提交。
- **提交门控（用户分支上的安全）。** 一个提交只可包含该条目能被*证明*拥有的工作，因此四条必须全部
  成立 —— 否则**不提交**，而实时差异的 `change` 路径列表产物顶替其位（分支范围；`change` **仅**作为
  这一回退存活）：
  1. **一个已记录的基线。** 没有基线 = 没有观察到的窗口（一个直接翻到 `done` 的条目、一个早于伴随
     文件的计划）。对账没有任何诚实的依据去认领该步骤做过的任何事，因此 **`deltaPaths` 为空**：
     不提交、**没有 `change` 产物**、什么都没有。那些脏路径反而出现在 `unattributed` 里，那才是
     “对账无法归因的工作”该待的正确位置 —— 认领每个脏路径会把兄弟步骤的工作与用户的 WIP 抓进一个
     打包完成的步骤里。
  2. **没有遗留外来脏东西** —— 在基线时就脏的每条路径到 `done` 时又都干净了。这正是让持有用户 WIP
     的 Default 工作区静默禁用自动提交的那个机制，也是预期的护栏。
  3. **一个从未共享的窗口**（`shared` 未设置）且当前没有其他聊天正在工作中 —— 并发窗口共享一个工作树，
     因此它们的脏东西无法在彼此之间切分。
  4. **一个非空的增量。**

  每个被提交的条目都会离开未提交集合，因此记忆化的变更路径读取**在每次提交之后都被丢弃** —— 否则
  同一趟中对账的第二个条目会把第一个条目已提交的路径继承为自己的增量。
- **合并 + 重做时追加。** agent 的 `file`/`spec` 产物总是被保留。一个已完成、已携带变更集但**没有新
  基线**的 `done` 条目是稳态的 no-op（幂等）；一个被重新打开、重新加工过的条目（存在新基线）会把它的
  新 `commit` **追加**到既有的那些之后 —— 产物列表是该条目的**修订历史**（1 个 TODO = N 个提交是一等
  公民；每个修复周期多一个提交，而下面的评审水位相对该列表做差异）—— 而旧的 `change` 路径列表被替换
  （活的增量没有需要保留的历史）。一次重做，若其新的附件包含**任何**路径列表 `change`，会**丢弃该条目
  的评审记录**（→ `unreviewed`）：活路径增量无法用 sha 打水位，而 `reviewInfo` 只从提交推导
  `unreviewedShas`，因此一个与被收编提交同行的 `change` 对评审状态会不可见（一个被覆盖的 sha 集合
  可能读作完全已评审，而路径增量却未被看到）—— 所以“只评审新增量”诚实地降级为从头评审该变更集。
  该记录**只在新的附件完全由 SHA 支撑时**（纯粹是窗口内提交收编，没有残留的路径列表）才被保留：被收编
  的 sha 可打水位，因此 `unreviewedShas` 增量会标记它们而不丢弃先前的裁决。**自动轮次计数在那次丢弃中
  存活下来** —— 它保存在一张单独的持久映射里（`reviews.ts` 的 `autoCycles`，以条目 id 为键，与
  `items`/`pending` 并列），而不是嵌在评审记录里，因此为上面那次 sha 水位重置而丢弃记录，绝不可能
  静默地重新授予一个已用完的自动修复轮次（一个曾经存在的 bug：回退路径的 `dropReviewRecord` 过去会
  连同裁决一起抹掉 `autoCycles`，因此之后的一次手动评审把 `spent` 读成 0 并在一轮自动循环的上限之外
  又授予了一轮）。`approveTodoReview` 清除它（一轮结算会为下一轮重置计数）；
  `recordAgentChangesRequested` 独立于它同时写入的记录而写入它；`todoReviewAutoCycles` 是读取侧。

宿主自己的磁盘状态（`WORKSPACE_INTERNAL_DIR` = `.thinkrail/…` 之下的任何东西，例如 `context/todos/`
下的 todos JSON）被从每个变更集中过滤掉 —— 写一个待办会出现在 `git status` 里，但绝不是该步骤*产出*
的变更。无 pi 的 `TodoStore` 绝不碰 git；`commit`/`change` 是宿主专有的，而 agent 通过 `todo_*` 工具
自己附上 `file`/`spec`（见 [[module-pi-todos]]）。已知限制（已被接受）：一个在条目中途*自己*提交的
agent 由上面的窗口内提交收编处理（它的提交附到这个步骤上），但**只在一个排他的、唯一的、且有已记录
`base.head` 的窗口**下 —— 一个共享窗口、一个缺失的基线、一个未诞生 HEAD 的基线，或同一趟中开启的
第二个同会话窗口，仍会把那些提交留作孤儿的 `adoptedCommits`；而一个本机制看不见的写入方 —— 用户在
窗口中途通过终端或外部编辑器编辑，或一个根本没有计划的聊天 —— 在 `git status` 里与 agent 的工作无法
区分，因此它未提交的编辑可能落进该条目的增量提交，**且它的提交可能被收编进这个步骤**（应用自己的
编辑器是只读的，而窗口打开时已经脏的任何东西由门控 2 抓住）。

**`listTodos` 装饰 —— 展开那个提交。** 线上协议 DTO 的 `commit` 产物携带一个派生的 **`files`** 列表
—— 完整的 `GitFileChange[]` 行（路径 + 状态 + `+/−` 行数），在 **`commit:{sha}` 范围**上通过
`git.gitStatus` 读取（Changes 面板在那里渲染的正是这些行，只有一份推导）—— 在内存中**按工作区 + sha**
记忆化（可解析性是仓库本地的：两个克隆可以共有一个 sha，而只有一个还持有该对象，因此一个工作区的命中
绝不可满足另一个工作区的解析检查）—— 不可变，因此缓存绝不做过期检查；只有成功的解析才被缓存，一次
临时的 git 失败（或 `UNKNOWN_COMMIT`）会在下一次列表时重试。一个**无法解析的 sha**（在一次历史重写
之后被 GC 掉 —— reflog 把被重写的提交保活约 90 天，远长于一个聊天计划的临时生命；我们刻意什么也不
钉住）产出**无 `files`** —— 那份缺席就是客户端静默降级该功能件的信号（不显示胶囊，绝不是一个坏掉的
差异标签页）。同一次装饰趟也正是 `groupStatus` 已经在发的地方，因此这个模式只有一个家。

**`listTodos` 装饰 —— 未归因的剩余部分。** 同一趟还发出 **`TodoPlan.unattributed`**（只在非空时
存在）：工作树那些**不属于本计划任何条目**的未提交 `gitStatus` 行 —— 未提交集合减去应用状态路径、
减去每个条目的 `change` 产物路径，并且在有工作窗口打开时，再减去那个开启条目的在飞增量（其基线*之外*
的路径被推定为该条目的工作；基线自己的路径恰恰是上面归因永远无法认领的既有脏东西）。这是计划的诚实
小节：没有它，对账无法归因的工作 —— 在第一个窗口打开之前、在最后一个条目结算之后，或在一个从未做过
计划的聊天里所做的编辑 —— 就干脆从评审地图里消失，而那读起来就像“没有别的变更”。每次读取都派生
（`unattributedChanges`，纯函数 —— 与归因规则同一个家），绝不存储；一次 git 失败降级为省略该字段。
一个并发聊天在同一工作树里的在飞工作也会出现在这里 —— 它*确实*在本计划之外 —— 被接受的噪声，与上面
那些共享窗口限制同族。

**`listTodos` 装饰 —— 收编的提交（已提交的剩余部分）。** `unattributed` 只覆盖*未提交*的行；工作一经
提交就离开了未提交集合，会从评审地图里彻底消失（一个空计划聊天其 agent 通过 bash 提交过、用户的一次
手工提交、宿主为一个此后已被清除的计划所做的 todo 提交）。因此同一趟还发出
**`TodoPlan.adoptedCommits`**（只在非空时存在）：每个 `base..HEAD` 的提交（`git.listCommits`），
其 sha 不归**任何**条目的 `commit` 产物所有，以**仅存在于线上协议的 `done` `TodoItem`** 呈现 ——
`id: "commit:<sha>"`、`origin: "adopted"`、`title` = 该提交的主题、一个用同一份按 sha 的 `files`
列表装饰的 `commit` 产物，以及从伴随文件按该 id 读出的 `review` 装饰。这些条目**绝不写入 store**
—— agent 的计划 JSON 始终是 agent 的计划（那条不变量），而 `"adopted"` 绝不进入 `pi-todos`；它们
在每次读取时重新计算。生命周期是免费的：`commit:<sha>` 是稳定的，一个被 rebase 掉的提交其 id 直接
消失（它的伴随记录变为惰性，如同任何孤儿），而一个此后被某个真实条目认领的散落提交会自动掉出（现在
已被拥有）。一个归*另一个*会话的计划条目所有的提交也会出现在这里 —— 被接受的噪声，与共享窗口限制
同族。尽力而为地派生；一次 git 失败会省略该字段。

**收编的提交无需 store 条目即可评审。** 评审操作通过 `reviewableItem` 解析其目标，后者先读
`TodoStore`，未命中时为某个收编的 `commit:<sha>` id 重建一个合成的 `StoredItem` —— 但**只在重新
校验了推导所发出的那个确切集合之后**：`git.resolveListedCommit` 把该 sha 解析为它的**规范 OID**，并
确认其成员资格在**`listCommits` 所发出的那份同样有上限的 `base..HEAD` 列表**里（共享的
`COMMIT_LIST_MAX` —— 因此一个排在第 200 个之后的提交，永远不会为它发出任何收编条目，也就同样不可
评审），所请求的 id 必须等于 `commit:<canonical-oid>`（正是 `listTodos` 发出的形式 —— 一个缩写或
非规范的 id 会被拒绝，因此评审状态绝不可能被写在某个任何收编条目永远不会携带的 id 之下），**并且**
该规范 sha 必须不归任何计划条目所有。一个掉出该集合的 id —— 被 rebase 进基线、被 GC、被缩写、超过
上限，或此后被某个步骤认领 —— 会被拒绝（`No TODO with id`），因此一次过期的 Plan 动作绝不可能对一个
在下一次重载时就会消失的提交启动/批准/修复评审状态。因此每个操作（`startTodoReview`、
`approveTodoReview`、`cancelTodoReview`、`requestTodoFix`、`recordAgentChangesRequested`、
`renderReviewPackage`）都能在**零 store 写入**的情况下对一次收编的提交驱动开始评审 / 评审全部 / 裁决；
评审状态持久化在既有的伴随文件里、以 `commit:<sha>` 为键，而每条发现都携带它的来源计划会话 + 条目
id（`{ todoId, sessionId }`）—— 评审者是那个计划会话的一个隐藏委派子进程，因此路由不需要任何评审者
会话身份，无论是否存在一个存储的条目都能工作。修复包“重新打开这个确切条目”的指示对一个收编的提交没有
可重新打开的待办，因此它读作“修订提交 `<sha>` 里的变更”；worker 的后续提交会作为一条新的收编条目
（或作为一次修订，一旦被追加）浮现。

**收编提交的限制（已被接受）。**（1）`base..HEAD` 的枚举上限为 `git` 的 `COMMIT_LIST_MAX`（200）
—— 一条提交更多的分支会从 `adoptedCommits` 里丢掉最旧的，与 Changes/提交菜单所处的同一个上限。
（2）一个提交是不可变的，因此自动修复循环无法自愈它：agent 对一个收编提交的 `changes_requested`
裁决会让它被永久标记，而 worker 的修复会作为一条*新的*收编条目落地，而不是原提交的一次修订（并且
`maybeAutoReReview` 刻意排除 `adoptedCommits` —— 一个新的 sha 就是一个新的 id，因此在被标记的那个
提交上没有可供重新评审的新增量）。（3）一个归*另一个*会话的计划条目所有的提交在这里显示为收编的
（`owned` 集合只包含本会话的计划），并且每个会话可以为同一个 sha 各持一份评审记录 —— 被接受的噪声，
与共享窗口限制同族。（4）一条在一次收编提交里被提交、随后又被重新编辑成未提交的路径，会同时出现在
`adoptedCommits`（该提交的文件）与 `unattributed`（更新的未提交行）里 —— 它们确实是两个不同的产物。

**评审工作流（`reviews.ts` + `todos.ts` 里的那些操作）。** 一个携带宿主变更集的已完成条目是**可评审
的** —— 门控就是那个产物的存在，因此研究/验证步骤从不要求评审，也不涉及任何 LLM 归因。用户的决定住在
第二个宿主持有的伴随文件里，`.thinkrail/context/todos/<sessionId>.reviews.json`（读-改-写、原子，
与基线同一生命周期：`session.delete` 移除该文件；孤儿记录是惰性的）—— 刻意**不是**那个 agent 可写的
todos JSON：一次 agent 重新规划绝不可翻转一个评审决定。一条记录是 `reviewed` 或 `changes_requested`
加上 **`reviewedShas`，即水位**：评审者实际据以行动的那个 sha 集合。对一次人类动作，那是该条目在那个
时刻的提交 sha；对 AGENT 流程，待定标记携带真相 —— **`startTodoReview` 把该条目开始时刻的 sha 列表
盖进在飞的 `pending` 条目**（`{ at, shas }`，持久化在伴随文件里），而 `approveTodoReview` /
`recordAgentChangesRequested` 优先用那些而不是当前 sha，因此一个 worker 在评审者回合仍在流式期间落地
的提交会保持为未评审的增量，而不是被静默地打水位标为已读。`unreviewed` 就是没有记录。
同一次 `listTodos` 装饰趟还发出 `TodoItem.review`（状态、`revision` = 提交数、`unreviewedShas` = 自
水位以来被追加的提交 —— 即 UI 重新评审而不是重评审原始差异的“自评审以来有变化”增量 —— 以及
`feedback` 回显）与 `TodoPlan.summary`（计划级的完成说明，由 agent 通过 `todo_plan_summary` 撰写；
条目的 `summary` 按存储原样搭在条目 DTO 上）。

- **`generateTodoSummary`（`todo.generateSummary`）** 是宿主为那条说明准备的尽力而为回退：当一个计划
  **完全 done 却不带 `summary`** 时，宿主起草一个。它原样返回一条既有的 agent 说明，在计划未完成或
  起草失败时返回 `null`，否则返回刚起草好的说明。这次慢模型调用（对已完成步骤的 title/summary/
  verification 调用 `assist.suggestPlanSummary`）在写锁之外运行；最后的复查 + `setSummary` 在
  `enqueueTodoMutation` 内部运行，且绝不覆盖在此期间落地的一条说明，也不覆盖一个被重新打开的计划；
  每个会话至多一次在飞生成 —— 一个并发调用方会等待并共享那次生成的结果，而不是得到 `null`，因此没有
  任何界面会留下没有摘要的状态。它绝不覆盖 agent 自己的 `todo_plan_summary`。
  **`previewPr`（因而 `openPr`）在 `renderPrBody` 读取 `plan.summary` 之前等待
  `generateTodoSummary`**，因此一个 UI 锚点被拆掉的聊天（聊天被关进历史、Plan 页被关闭）无法与
  `pr.preview` / `pr.open` 抢跑到一个空摘要。在飞去重让这次额外调用保持幂等：如果 UI 的
  `useAutoPlanSummary` 已经触发起草，`previewPr` 会等待它的 promise，而不是启动第二次生成。

- **`approveTodoReview`** 记录 `reviewed` + 水位 —— 一次 agent 评审在飞时是待定标记的开始时刻 sha，
  否则是当前 sha（对未知或不可评审的 id 抛错 → 线上为 `{ ok:false }`）。
- **`requestTodoFix`** 记录 `changes_requested` + 反馈 + 水位，并渲染**修复包**（`renderFixPackage`，
  纯函数）：原始步骤（title/note）、它的完成摘要、变更集的*引用*（短 sha / 路径 —— 绝不是完整差异；
  agent 用自己工具读取内容）、逐字反馈，以及重新打开**这个确切条目**的指示 —— 修订必须附在它所修订的
  那个步骤上（todos 技能从 agent 那一侧镜像这一点）。**发送是在 `host` 里组合的**（本模块绝不导入
  `agent`）：宿主把它作为一条结构化的 `todo-review-fix` 自定义消息（`sendReviewFixToSession`）投递进
  该条目**自己的聊天**（按会话的计划/窗口强制如此）—— 渲染出的包就是 agent 读到的那条消息 `content`，
  而 `ReviewFixDetails`（`buildReviewFixDetails`，从 `reviews/` 导出）作为 `details` 搭在聊天卡片
  上；以评审发送模式分离触发 —— 一次回合前的拒绝会调用 **`rollbackTodoFix`**（恢复被该请求替换掉的
  记录）并在聊天中呈现，因此一条未投递的修复请求绝不会搁浅成 `changes_requested`。手动请求携带一个
  不透明的 `requestId`；补偿只在那同一个请求仍是当前请求时恢复先前的记录，因此一次延迟的发送失败无法
  抹掉更新的裁决或重试。

**agent 评审者（[[submodule-server-reviews]] 是发现的家）。** `todo.startReview` 与 worker 自己的
`request_review` 工具把一个可评审条目呈给一个**隐藏的、临时的评审子代理** —— 它是计划会话的一个委派
子进程，携带宿主的评审者角色（[[submodule-server-host]] 拥有提示词 + 输出契约）。没有评审者聊天，
也没有被钉住的评审者会话：这里没有任何东西存储 `reviewerSessionId`，而评审者不持有本模块的任何工具。
本模块拥有状态 + 包：`startTodoReview`（标记该条目的在飞 `pending` 标记 —— 即 DTO 的 `reviewing`
—— 并渲染 `renderReviewPackage`：一个变更集**引用**加上 worker 的摘要/验证声明供其 VERIFY，一次只点名
未评审增量的重新评审；它不点名任何工具，因为评审者的角色与输出契约是宿主的，不是这个包的）、
`cancelTodoReview`（评审失败或没有返回可解析的裁决）、`approveTodoReview(…, "agent")`（标记了
`reviewedBy`）与 `recordAgentChangesRequested`（裁决说明作为反馈 + `autoCycles`）。后两者同时改动三样
东西 —— 该条目的记录、它的 `autoCycles` 计数、以及它的 `pending` 清除 —— 因此它们把这三者作为一次
快照写入（`commitReviewTransition`）来持久化，绝不是一串：否则两次写入之间的部分失败可能让一个条目
搁浅在 `changes_requested`、处于已用完的轮次、且其待定标记仍被设置，而没有任何取消能撤销那一切。自动
轮次的机制 —— 宿主的 **1 轮自动循环上限**：轮次 0 的裁决会把评审者的发现自动发给 worker
（autoCycles 1），修好的修订会自动重新评审一次（触发条件要求 autoCycles === 1 + 一个新增量 —— 一个
被追加到水位之后的 sha，或者状态因路径列表回退把它重置而读作 `unreviewed`，那本身就是路径列表条目
没有 sha 可携带的增量信号 —— 见上面回退的 autoCycles 持久性），而那次裁决把 autoCycles 记为 2 ——
终态，由人决定；当 `reviewAutoFix` 设置为关时该上限被**短路** —— `host/requestReview` 随后以终态记录
裁决（autoCycles 2）而不发送，因此发现就只是等人）。评审者的发现是 reviews 模块里**由 agent 撰写的
评审评论**（`author: "agent"`），绝不是一份平行的存储；编排/发送住在 `host/requestReview.ts` 里。
**宿主重启安全：** 在飞记账只存在于内存，因此一次在宿主上次停止时仍在运行的评审留下的 `pending` 标记
否则永远不会被清除 —— `clearAllPendingReviews(root)` 会扫过某个工作区下每个会话的伴随文件并无条件
丢弃每一条 `pending` 条目；`host/todoReview` 的 `reconcilePendingReviewsOnBoot` 在任何客户端能观察到
那个过期转圈之前，于启动时为每个工作区调用一次（见 host/SPEC.md）。只有那个转圈被清除 —— 底层的评审
记录（若有）原样不动。**评审全部**（`todo.reviewAll`）是在这同一流程之上的纯宿主编排：它在计划的串行
链上启动每个未结算的可评审条目（`host/planReviewQueue.ts`），因此这里不增加任何状态（见
host/SPEC.md）。

**读屏障。** `listTodos` 先等待该工作区在飞的对账（`settleChangeArtifacts` —— 同一条按工作区链）。
一个客户端唯一的刷新信号是一个 `todo_*` 工具结束所发布的 `pi.event`，而对账是*与那次发布同步地*入队
的但更晚才结算（它会提交）—— 因此没有屏障时，一次比客户端的重新获取去抖更慢的提交会交回一个没有变更
集的 `done` 条目，使一个打开的 Plan 页承诺一个它在某个无关事件之前不会展示的功能件。等待让这次读取
**因果地晚于**触发它的那次写入；在没有任何在飞工作时它立即结算，且绝不 reject。该屏障会跟随它等待
期间安装的任何更晚的工作区队列尾，因此一次因计划漂移而被中止的过期趟，无法在已入队的替代趟对账完当前
计划之前放行读者。

## 边界

- **拥有 / Public surface（公开接口，barrel）：** `listTodos({workspaceId, sessionId}) → Promise<TodoPlan>`
  （异步只为上面的读屏障），`countOpenTodos({workspaceId, sessionId}) → number` + 它的纯规则
  `openTodoCount(plan)`（未完成 = 任何不是 `done` 的状态，散落 + 分组—— 即宿主 `session.list` 处理器
  为客户端历史/状态呈现而附上的 `SessionSummary.openTodos` 装饰；一个没有任何 todo 文件的会话计为
  0）、`addTodo(...) → TodoItem`（校验标题非空；打上 `origin: "user"` 标签）、
  `updateTodo(...) → TodoItem`（未知 id 时抛错 → 一个 `{ ok:false }` 的 WS 响应）、
  `approveTodoReview(...)` / `requestTodoFix(...) → { pkg, previous }` / `rollbackTodoFix(...)` +
  纯函数 `renderFixPackage`（那些评审操作；发送本身是 `host` 的组合），以及 `TodoReviewRecord` 类型。
  **仅做映射** —— 没有计划逻辑；`TodoStore` 拥有磁盘。
- **允许的依赖：** `workspaces`（经由 `getWorkspace` 的工作树路径查找，未知时抛错）；`git`
  （`gitStatus` —— 未提交的变更路径集合 + 提交范围的 DTO 装饰；`gitCommitPaths` —— 每完成条目的增量
  提交；`gitHeadSha` —— 基线的 head；`listCommits` —— `adoptedCommits` 背后的 `base..HEAD` 枚举 +
  评审解析器的合成条目重建）；`contracts`（DTO + 用于 `isTodoToolEnd` 的 `PiEvent`）；
  `@thinkrail/shared/paths`（`WORKSPACE_INTERNAL_DIR` —— 被从变更集中过滤掉的应用状态前缀）；
  **`pi-todos/core`**（无 pi 的读/写模型 —— 宿主侧对该扩展包一次被认可的值导入，与 `spec` →
  `pi-spec-graph/core` 同一模式）；`log`。
- **绝不触碰：** `host`；除 `workspaces` + `git` + `log` 之外的兄弟特性；`pi-todos` 的扩展入口或
  `tools/`（与 pi 耦合）；任何 pi 包。
