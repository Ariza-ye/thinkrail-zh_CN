---
id: submodule-pi-todos-core
type: submodule-design
status: draft
title: pi-todos 核心（不含 pi 的模型）
parent: module-pi-todos
tags: [pi-extension, todos]
---

## 职责

不含 pi 的 TODO 模型：`Todo` 类型（状态词表）与 `TodoStore` —— 一份**按会话**的列表，存成一个文件
`.thinkrail/context/todos/<sessionId>.json`（位于临时 context 暂存目录之下），以读-改-写方式读写。
文件是事实来源；store 不持有可变状态，因此每个方法都重新读取，过期的读不可能发生（agent 的会话内写入
与 UI 的编辑汇合在同一个文件上）。构造上就稳固：文件缺失或损坏时读成一份空列表，未知/非法字段在读取时
被丢弃（`sanitize`），因此一个手改过的文件绝不会让会话崩溃。

**制品。** 一个条目可以带 `artifacts` —— 指向工作所产出之物的链接：
`kind: "file" | "change" | "spec" | "commit"`、一个可选的 `label`，以及每种 kind 对应的、相对工作树
的 `path`（`file`/`change`/`spec`，对 `spec` 另加一个持久的图内 `specId`）或一个 `sha`（`commit`）。
模型只是存储它们；它不解析路径、不算差异，也不接触 git。`file`/`spec` 由 agent 附上（`spec` 自然来自
`spec_create` 的 `{path,id}`）；`change` **与** `commit` 由宿主在一个条目到达 `done` 时附上 —— 宿主
提交该条目的工作并只记录 sha，或者在无法提交时回退到一份 `change` 路径列表（见 `server/src/todos`
—— store 保持与 git 无关）。`sanitize` 会丢弃缺少其键的条目（没有 `sha` 的 `commit`，或任何其他
kind 没有 `path` 的条目）。磁盘上的 `version` 是 `6`（`3` 加入 `artifacts`，`4` 加入 `commit`
kind，`5` 加入 `summary` 字段，`6` 加入 `commitSubject`）；更旧的文件能干净地读出，并在下一次写入时
升级。

**摘要（评审痕迹）。** 一个条目可以带 `summary` —— agent 的完成说明（改了什么/为什么，差异展示不了
的那些决策，以结构化 Markdown 写成）—— 以及 **`verification`**，一个独立字段，放实际运行的检查 +
结果（或诚实的“未验证”），与散文分开，好让 UI 用状态字形给它打徽章；两者都是 **Markdown**（多个检查
读起来像一份项目符号列表，而不是一行不间断的长句），而缺失的验证行一眼就能看到；两者在条目翻成
`done` 时经由 `TodoPatch` 设置；计划本身可以带一份计划级的 `summary`（`TodoFile.summary`，由
`TodoStore.setSummary` 写入）—— 整个计划完成时 agent 写下的那份整体交接说明；它是**累积的**
（覆盖整个计划里做过的全部内容，当先前的一份说明在一次重新完成中仍然存活时是扩展而不是改写 —— 工具层
会把这段存活的文字带出来，好让 agent 在它之上继续），绝不是只对最后一步的回顾。两者在之后的编辑中都
被原样保存，只有一条失效规则：某个条目自己的 `summary`/`verification` 在该条目 `status` 离开 `done`
的那一刻被 `update` 清空 —— 除非同一个 patch 也提供了新的值，那样以新值为准。**计划级 `summary` 在
重新打开时存活**（它不会随条目的字段一起被丢弃）：它保持陈旧，好让读取方能在计划被重做期间把它显示为
“Updating…”，而下一次完成会**扩展**它而不是从空白开始（即累积契约）。把陈旧的说明挡在某个显示或
导出之外，是读取方的职责。

**`commitSubject`（面向 git 的标题）。** 第三个完成时字段，同一族、同一条失效规则：宿主在提交该条目
的增量时原样使用的主题行（见 [[submodule-server-todos]]）。它之所以存在，是因为 `title` 与提交主题是
**给不同读者看的两种不同文本** —— `title` 是用户在状态面板里看到的计划步骤（"Newest-first chat
order"），而主题落在仓库的永久历史里、与人的提交相邻，必须匹配那段历史自己的惯例
（"feat(web): add newest-first chat order"）。从一个推导出另一个是不可能的（改动的类型/范围只有从
改动本身才能知道），因此 agent 两者都写，而 store 只是承载它们。模型保持与 git 无关：它从不校验风格，
也从不读 `git log` —— 工具描述与 todos 技能承载着“匹配本仓库历史”的指令，而字段缺失时宿主回退到
`title`。读取方把计划级摘要门禁在“一切都已完成”上（UI 实时显示它，在重新打开期间标记为陈旧；不做
门禁的使用方，比如 PR 正文 / 工作报告，只在每个条目都 `done` 时才渲染它），因此一段陈旧的全完成叙述
尽管在磁盘上存活，也绝不会泄漏出去。`replaceAll` 刻意**不**把计划摘要带过去 —— 一份全新的计划是新
工作。评审*状态*从不存放在这里：它归用户所有，住在宿主的 sidecar 里（见 `server/src/todos`），因此
agent 重做计划无法翻转一个评审决定。

**分组 = 任务。** 一个分组建模一次用户请求；它的条目是步骤。分组的生命周期是**派生的，从不存储**：
`groupStatus(group)` —— 全部完成 → `done`，任一条目 in_progress → `active`，否则 `pending` —— 因此
它无法与步骤漂移。它**只有一个家**：宿主通过这个辅助函数读取它，并把结果随线上协议 DTO
（`TodoGroupItem.status`，见 [[submodule-server-todos]]）出去，因此 `apps/web` —— 它可能只导入
`contracts` —— 渲染它，而不是保留第二份真值表。

**`replaceAll` 是保持身份的对账，不是替换。** `todo_write` 送来的是一份*期望的*计划；模型用它来表达
“让计划看起来是这样，保留进度”，因此 `replaceAll(plan)` 是对账而不是从头重建：

- 每个写入的分组内条目按键 `(group title, item title)` **匹配**到一个既有的 **agent** 条目 —— 两个
  键都*解码并压平成一行*后比较（见下文）；第一个尚未被消费的匹配胜出（重复标题按位置对账）。**匹配
  命中的条目会被复用**：它的 `id`、`createdAt`、`status`、`summary`、`verification`、
  `commitSubject` 与 `artifacts` 都保留；只有 `note` 会按写入的值更新。写入里的 `status` **对匹配
  命中的条目被忽略** —— 状态只通过 `update` 前进，因此一个被重新列出的 `in_progress`/`done` 步骤
  绝不会被打回 `pending`。**未匹配**的写入条目会被全新创建。
- **遗留项**（没有被任何写入条目匹配上的既有条目）：散项队列完整存活 —— `origin: "user"` 的条目
  *以及*不是 `done` 的 `origin: "agent"` 条目都被带过去（散项是共享的原始输入草稿本，见下文）；
  分组内的 `done` 条目被保留（重新并入同标题的新分组，否则按它们原来的分组带过去，追加在全新分组
  之后）；**分组内的 agent + 未完成条目**会被**丢弃** —— 那正是合法的“删掉了一个步骤”。**晋升诞生
  的空分组**（`todos[]` 为空的分组 —— 见下文的一等规则）在全新计划没有重新发出同一标题时，以它们
  原来的 id 被保留下来；丢弃它们会静默丢掉一次被搁置的用户请求，而晋升契约承诺要保住它。散项队列里
  一个遗留的 **agent `done` 条目**（超出契约 —— 散项是工作前的备注，agent 本应晋升或删除它，而不是
  就地完成）会被带进一个 `"Completed"` 分组，而不是留在散项队列里，因此一个 `done` 的散项绝不会被
  静默丢失。结果：重写同一份计划在进度上是**空操作**（没有状态重置、没有重复、没有孤儿）。

**散项队列 = 共享的原始输入草稿本。** `TodoPlan.todos`（UI 渲染为 "Other" 的那条队列）承载**两种**
来源的未处理条目：人从 UI 敲入的 `user` 条目，以及 agent 用不带 `group`/`after` 的 `todo_add` 丢进
来的 `agent` 条目。散项刻意是*工作前*的 —— 原始备注、种子、半成形的请求。当 agent 把一个散项纳入
工作时，它用 `TodoStore.promote(id, titleOverride?)` 在一次原子步骤里**晋升**它：散项从队列里被切
出，一个带**同样 id**（以及该条目的标题，除非被覆盖）的分组出现在分组列表里，等待 `add` 追加分解。
一次写入，没有重复窗口 —— 一个在晋升之后立刻挂掉的会话仍然留下一份一致的计划（用户的请求显示为它自己
的分组）。该分组被刻意创建为空（空分组状态是一等的，见下文）。

`promote` 返回一个**可判别的结果**（`TodoPromoteResult`）：成功时 `{ ok: true, group }`，失败时
`{ ok: false, reason }`，其中的 reason 是四个 `TodoPromoteFailure` 成员之一。这个结果形态之所以
存在，恰恰是因为 agent 的恢复方式随失败而异 —— `title-collision` 可以用一个消歧的 `title:` 重试，
`grouped-step` 根本不可晋升，`unknown-id` 指向一个陈旧的 id，`empty-title` 需要一个非空的覆盖值。
在每一种失败情形下，散项都被留在原处，好让重试能够成功；而 `todo_promote` 工具包装层针对每个 reason
发出各自定制的错误，因此 agent 绝不会退回到已弃用的 `todo_add group:` + `todo_remove` 那套来回舞。
这四个 reason：

1. `unknown-id` —— 该 id 在计划里哪儿都找不到；
2. `grouped-step` —— 该 id 是既有分组里的一个步骤（晋升只适用于散项队列的条目）；
3. `empty-title` —— 归一化后的标题为空（在 `decodeUnicode` + `flattenTitle` 之后 —— 一个空标题的
   分组没有可供 `todo_add group:` 定位的可寻址任务）；
4. `title-collision` —— 归一化后的标题与一个既有分组冲突；把散项静默并入那个既有分组不会添加任何
   步骤，因此第二次相同的请求只会凭空消失；改为拒绝，让调用方提供一个唯一的覆盖值。

依然成立的结构性守卫：`WritePlan` 没有 `todos` 字段（`todo_write` 只对账 `groups`，因此重做计划
绝不会铸造或编辑散项）；一个在重做计划中到达 `done` 的散项会被带出散项队列进入 `"Completed"`，因此
该队列绝不会保留一个已完成的条目。

**空分组是一等的 —— 为晋升而存在，而不是作为 `remove` 之后的落脚点。** `sanitizeGroup` 与 `write`
保留 `todos[]` 为空的分组 —— 一个刚被晋升的请求以空分组的形式存在，直到 agent 分解它，而在读或写时
丢弃它会静默撤销 `promote`。`groupStatus` 对空分组返回 `pending`；技能要求 agent 立刻添加第一个
实质性步骤并把它翻成 `in_progress`，因此空分组只是 `promote` 与第一次 `add` 之间的一段过渡状态。
宿主 UI 把这段过渡状态渲染成分组标题之下一条可见的 "planning…" 行
（`apps/web/src/panels/PlanPane.tsx` 与 `apps/web/src/chat/TodoList.tsx` 里的 `plan-group-planning` /
`todo-group-planning`），而不是一个空表头，因此读者绝不会把这个分组看成一行坏掉的、渲染不全的行。

`remove` 在不留下 `remove` 出生的鬼影的前提下保持那条“只属于晋升”的不变量：它在删除之前对每个分组
的条目数拍一份快照，并仅当某个分组的计数在这一次调用里从 `>0` 变成 `0` 时才剪除它。一个在 `remove`
之前**本来就已经**为空的、晋升出生的分组会被保留（搁置用户请求的不变量）；一个在 `remove` 里**失去**
最后一个条目的分组会被剪除，因此用户绝不会被卡在一条永久的 "planning…" 行上、且没有工具能删掉它。

**标题只有一行，在写入边界处归一化。** 条目标题与分组标题就是 markdown 导出里的条目项目符号与 `##`
分组标题，而那份导出是一份随产品交付的制品（计划页面的导出与 PR 正文）。一个换行 —— 来自计划的多行
添加输入或 agent 的一次转义 —— 会破坏那个列表，因此 `flattenTitle` 在每条写入路径上把任何连续空白
折叠成单个空格（宽容处理，而不是拒绝）：`add`、`update`、`replaceAll`（包括它的对账键），以及加载
时的 `sanitize`。调用方与读取方可以假定标题绝不含换行；不存在逐次渲染的清洗。

**匹配基于标题，这是设计当前增量的选择。** 因为键是 `(group title, item title)`，一次**分组改名**或
一次**步骤改名**不会被跟随：旧条目已完成的工作被保留（按旧名字带过去），它未完成的工作被丢弃，而
改名后的条目以全新面貌出现。这是标题匹配被接受的代价；`todo_write` schema 里可选的逐条目 `id` 是
计划中的下一个增量，它让匹配对改名免疫。

**线性不变量**（靠结构保持）：`update` 设置 `in_progress` 时会在同一次写入里把其他每个 `in_progress`
条目自动打回 `pending` 并返回它们（`TodoUpdateResult.paused`），因此这次变化保持可见；`replaceAll`
在它的**合并**结果（全新计划 + 被保留的用户/已完成条目）之上、按显示顺序重建它 —— 只归一化全新的那
一半，会在一个全新的 `in_progress` 步骤旁边留下一个 `in_progress` 的既有用户条目，也就是同时有两个。
`add` 接受 `after`（一个既有条目 id），把新条目插在那个条目之后，**继承它的队列** —— 即外科式的中途
插入（`after` 胜过 `group`；未知 id 会抛错）。

## Public surface（公开接口）

`index.ts` 这个 barrel：
- `TodoStore`（按 `(root, sessionId)` 构造，包括 `setSummary` —— 计划级的完成
  摘要）、`STORE_DIR` / `storeRel`，以及 `countItems(plan)`
  + `flatItems(plan)`（按显示顺序的每个条目：分组在前，用户的散项队列最后 —— 那份被读取/更新/渲染
  复用的唯一压平结果）+ `groupStatus(group)` 辅助函数。
- 模型类型：`Todo`、`TodoGroup`、`TodoPlan`、`TodoFile`、`TodoInput`、`TodoPatch`、
  `TodoUpdateResult`、`WriteItem`、`WritePlan`、`TodoArtifact`，以及 `TodoStatus` / `TodoOrigin` /
  `TodoGroupStatus` / `TodoArtifactKind` 别名。
- `TODO_STATUSES`（`pending | in_progress | done`）、`TODO_ORIGINS`（`agent | user`）与
  `TODO_GROUP_STATUSES`（`pending | active | done`，仅派生）元组 —— 各工具参数枚举的唯一来源。
  （**没有**优先级概念；优先级已被去掉。）

写入是原子的（临时文件 + `rename`）；会话 id 在变成文件名之前会被校验为安全的路径段。

**转义解码是一次窄口径的写入时救援，按字段类别分隔，并且在 Markdown 字段内部按语法分隔。**
`\uXXXX` 是无歧义的（没有 Windows 路径、正则或源码片段会字面写出 `\u`），因此它在每个由 agent 写入
的、跨每个文本字段的写入上都被解码；一个 `(?<!\\)` 后向断言让 `\\u` 保持原样。`\n` 是**有歧义**的
—— 一个 LLM 可能把它作为 Markdown 换行替代品发出（`summary = "a\\n\\nb"`、
`verification = "- a\\n- b"`），或者作为一个合法的反斜杠前缀标识符（Windows 路径
`C:\\new file`、正则模式 `/\\n/g`、代码片段）。即使在 Markdown 渲染的字段内部，我们也不能在不破坏
路径的前提下救援每一个 `\n`，因此这项救援是*结构性的*：只有当 `\n` 出现在一个 Markdown 分隔符之前时
它才被解码 —— 另一个 `\n`（段落分隔）、项目符号 / 有序列表 / 标题 / 引用块 / 围栏块 / 分隔线标记。
任何其他 `\n`（短散文、路径、模式）保持原样。`\r` 与 `\t` 不被救援（作为有意为之的 Markdown 分隔符
太罕见，又太接近 Windows 行尾与硬制表符缩进）。这项救援**只**适用于计划级 `summary`、逐条目
`summary`，以及逐条目 `verification`（被 UI 与 `renderPrBody` 渲染为 Markdown 的那三个字段）；
每一个其他由 agent 写入的字段（标题、分组名、备注、提交主题、制品标签）只跑 `decodeUnicode`。
所有解码都按来源门禁：用户编写的文字从不被救援。`\\n`（转义的反斜杠 + n）经由一个负向后向断言
被放过。读取是透传的：存储的文字原样呈现，因此旧的磁盘数据在重新加载时绝不会被静默改写。

## 边界

- **允许的依赖：** 只有 Node 内建模块（`node:fs`、`node:path`、`node:crypto`）。
- **绝不触碰：** 任何 `@earendil-works/*` **以及任何 `@thinkrail/*`** 导入 —— 这是不含 pi、不含
  thinkrail 的那一层，宿主可以值导入它而不把 pi 拉进它的产物，且它在原生 `pi` 下始终可安装。
  后果：`STORE_DIR`（`.thinkrail/context/todos`）携带 `@thinkrail/shared` 的
  `WORKSPACE_CONTEXT_DIR` 的一份**本地镜像**，而不是导入它 —— 共享常量是宿主侧的事实来源；要让
  两者保持同步。`tools/` 经由 barrel 导入本层；本层不导入 `tools/`。
