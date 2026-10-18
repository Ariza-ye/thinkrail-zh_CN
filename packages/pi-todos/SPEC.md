---
id: module-pi-todos
type: module-design
status: draft
title: pi-todos 扩展 —— 对话 TODO 列表
parent: architecture
depends-on: []
references: [module-spec-graph, submodule-web-chat]
tags: [pi-extension, todos]
---

## 职责

`pi-todos` 是一个可移植的 pi 包，它给 `pi` agent 一份**限定在对话范围内的 TODO 列表** —— 它为这次
对话准备的工作计划，用户也可以往里添加。它是对话 TODO 计划 UX 背后的*引擎*（[[submodule-web-chat]]
的 "Chat TODO plan"），以 [[module-spec-graph]] 为范本：一个技能、六个 `todo_*` 自定义工具，以及一条
`before_agent_start` 规则。

- **`index.ts`** —— 一个 `ExtensionFactory`，注册这六个工具和一条始终启用的 `before_agent_start`
  规则。这条规则刻意**简短且字节稳定** —— 知道存在一份共享列表 + `todo_*` 工具，再加上加载 todos
  技能的门槛：用户明确请求，或至少三个实质性执行步骤（前提是任务已被理解到足以规划）。这个门槛管的是
  创建计划，而不是遵守计划 —— 散项（双方都可以写一条，见下文）在 agent 把它纳入工作的那一刻被晋升成
  一个正式分组，而不是就地推进。杠杆是*理解*，不是提示词篇幅：
  **如何与这份列表打交道住在技能里；每个工具的不变量住在它自己的描述里。**
  （我们试过往每条提示词里注入实时列表，后来又撤了回来 —— 改由工具 + 技能来承载。）这条规则作为
  pi 的 `systemPromptOptions.sections` 中的 `pi-todos` 条目随行，就地修改，绝不作为强制
  `systemPrompt` 返回 —— 机制与理由同 [[module-spec-graph]]。
- **`core/`** —— 不含 pi 的模型（[[submodule-pi-todos-core]]）：`Todo` 类型与按会话的
  `TodoStore`（读-改-写 `.thinkrail/context/todos/<sessionId>.json`）。不导入任何
  `@earendil-works/*`，因此宿主可以值导入 `pi-todos/core` 来驱动计划查看器 —— 既读取计划，也写入
  用户自己的编辑（`spec/` → `spec.graph` 的模式）。
- **`tools/`** —— 六个 `todo_*` 自定义工具（[[submodule-pi-todos-tools]]），`core/` 之上的薄包装。
- **`skills/todos/SKILL.md`** —— 随包附带的技能：对话计划的纪律 —— 分组 = 任务（一次用户请求，
  以结果命名；通常是 3–7 个实质性、可验证的步骤），严格按顺序处理任务，同时只有一个步骤处于
  `in_progress`（被阻塞的任务 = 记下原因、告诉用户、继续往前），并且在选择每个下一条目之前、在用户
  输入之后、以及在完成之前对账用户的实时编辑。被纳入工作的散项会被晋升（新建一个带正规结果标题 +
  已分解步骤的分组，删掉原始的散项）；针对较小任务的“不建计划”规则，只适用于从未进入队列的普通对话
  请求。

## 工具

| 工具 | 目的 |
| --- | --- |
| `todo_list` | 读取当前计划，按**分组优先**渲染（每个分组位于一个派生状态 + 已完成/总数的表头之下），可选地按状态过滤。 |
| `todo_add` | 添加一个条目 —— 加进某个 `group`、加在某个既有条目 `after`，或者作为**散项**（两者都省略）—— 那是 agent 与用户都会写入的共享原始输入队列。对散项使用 `after` 会被拒绝（散项是被晋升进一个分组的，而不是长出同辈条目）。 |
| `todo_update` | 改变一个条目的状态 / 标题 / 备注 / 制品 —— 也就是 agent 如何翻转 `pending → in_progress → done`。报告被自动打回的（`paused`）条目；一次 `done` 翻转会建议该分组的下一个未完成步骤。 |
| `todo_remove` | 丢弃一个条目。 |
| `todo_write` | 用全新的**分组**对账 agent 的计划 —— 每个任务一个分组、步骤放在里面，在任务被理解到足以规划时写入。它保持身份，不是破坏性替换：见下文。 |
| `todo_plan_summary` | 设置/清除计划级的完成摘要（`TodoFile.summary`）—— 整个计划完成时写下的那份整体交接说明。 |

**分组 = 任务。** 计划的模型是两级的：分组是一次用户请求（标题 = 结果），它的条目是步骤。分组自己的
状态是**派生的，从不存储**（`core/` 里的 `groupStatus`：全部完成 → `done`，任一条目 in_progress →
`active`，否则 `pending`），因此它无法与步骤漂移。宿主通过这个辅助函数读取它，并把它随线上协议 DTO
（`TodoGroupItem.status`）出去，于是没有客户端重新推导它 —— 一张真值表，一个家。
有两条不变量是靠结构、而不是靠模型记忆来保持的：**整个计划中恰好一个 `in_progress`**（设置它会把先前的
那个自动打回 `pending` —— 在结果里报告为 “paused”），以及 **`todo_write` 绝不触碰散项队列**
（`WritePlan` 没有 `todos` 字段，因此重做计划无法铸造、编辑或丢弃散项）。散项的写入本身对双方开放 ——
用户从 UI 写，agent 用不带 `group`/`after` 的 `todo_add` 写 —— 所以散项是共享的原始输入队列；技能
承载着“纳入工作即晋升”的纪律（agent 拿起一个散项开始工作时，把它晋升成一个带正规标题 + 已分解步骤的
分组，并删除原始的散项，而不是就地推进那段原始文字）。状态纪律会得到带内反馈：当存在未完成条目但没有
任何一条是 `in_progress` 时，工具结果会追加一条提示；而一次 `done` 翻转会点名该任务的下一个未完成步骤
—— 只建议，绝不自动开始（那样会在 agent 停下时假装“正在处理中”）。

该工具从 `ctx.sessionManager.getSessionId()` 解析它的列表，因此它总是读写它所运行的那次对话的列表。

## 范围与持久化 —— 每个对话一份列表

这份列表**限定在一个对话会话范围内**，而不是工作树：每个会话一个 JSON 文件，
`.thinkrail/context/todos/<sessionId>.json`，位于工作树根之下 —— 在被宿主播种、被 git 忽略的临时
`context/` 暂存目录里，因此这些计划与其他每次对话的工作文件放在一起。它是 agent 为那次对话准备的工作
计划；用户可以往里添加条目（从 UI），而 agent 会在它下一轮次用 `todo_list` 把它们捡起来，并通过
`todo_update` 推进那些确切的条目。文件是事实来源 —— `TodoStore` 在每次操作时重新读它 —— 因此 agent
的会话内写入与用户的 UI 编辑汇合，没有过期窗口；文件缺失或损坏时读成一份空列表。每个对话都是临时的
（被 gitignore），不随仓库提交。

## 状态归属与来源

状态是 **agent 拥有的**：agent 在按计划工作时通过 `todo_update` 翻转
`pending → in_progress → done`（每次新的 `in_progress` 都会让 store 自动打回先前的那个）。当前 UI 从
不切换状态 —— 它的编辑面只有添加 / 删除。（`todo.update` 线上方法存在并接受一个状态，但今天没有任何
UI 路径调用它；它是预留的，不是用户的杠杆。）

每个条目带一个 **`origin`**（`agent` | `user`）—— UI 添加的是 `user`，agent 的工具写 `agent`。
`todo_write` 是**保持身份的对账，不是替换** —— 写入的步骤按
`(group title, step title)` 与既有条目匹配，并保留它们的
id/status/summary/verification/commitSubject/artifacts（只有 `note` 被刷新；匹配上时写入的 status
被忽略 —— 状态只通过 `todo_update` 前进）。未匹配的写入步骤会被创建；分组内被省略的
**agent 未完成**步骤会被丢弃；**散项与任何 `done` 条目始终保留** —— 因此重做计划绝不会丢弃共享的
原始输入队列或已完成的历史，重复运行它是无损的。**散项队列是共享的原始输入**：UI 给 `user` 条目做
标记，好让人仍然看得见哪些是自己的；`WritePlan` 没有 `todos` 字段，因此 `todo_write` 无论来源如何
都无法铸造或编辑散项。完整的对账契约见 [[submodule-pi-todos-core]]（标题匹配是被接受的局限 —— 一次
改名会被读成一个新步骤）。

## 制品

一个条目可以通过 **`artifacts`** 链接到它产出的东西 —— `kind: "file" | "change" | "spec" | "commit"`、
一个可选的 `label`，以及每种 kind 对应的、相对工作树的 `path`（`file`/`change`/`spec`，对 `spec` 另
加一个持久的 `specId`）或一个 `sha`（`commit`）。归属按 kind 划分：**agent** 通过工具附上
`file`/`spec`（`spec` 自然来自 `spec_create` 的 `{path,id}`）；**`change` 与 `commit` 归宿主所有**
—— 当 agent 把一个条目标记为 `done` 时，宿主提交该条目的工作并只记录 `sha`（一条 `commit` 制品 ——
文件列表在读取时从 git 派生，绝不反规范化）；`change` 的路径列表只是宿主的**无提交回退**，见
[[submodule-server-todos]]。不含 pi 的 `core`/`tools` 从不接触 git —— 它们只是存储被交到手上的任何
制品。除制品之外，一个已完成的条目还可以带一个 **`summary`** + 一个 **`verification`**（评审痕迹）
以及一个 **`commitSubject`**（宿主提交时用的、面向 git 的标题）；这三者在条目离开 `done` 时都被清空，
见 [[submodule-pi-todos-core]]。磁盘上的文件 `version` 是 `6`（`3` 加入 artifacts，`4` 加入
`commit` kind，`5` 加入 `summary` 字段，`6` 加入 `commitSubject`）；更旧的文件在下一次写入时升级。

## 边界

- **允许的依赖：** `@earendil-works/pi-coding-agent` + `@earendil-works/pi-ai/compat`（`StringEnum`）
  —— **仅类型/兼容层**，作为 peer 依赖 —— 以及 `typebox`，和 Node 内建模块
  （`node:fs`/`node:path`/`node:crypto`）。`core/` 只用 Node 内建模块。
- **绝不触碰：** 任何 `@thinkrail/*` 包、`apps/web`、`packages/server` 内部 —— 只按工具*名字*
  到达，绝不通过导入。宿主只有一条路到达这个包：
  `pi-todos/core`（值导入，不含 pi）用于查看器，再加经由 `additionalExtensionPaths` 的扩展入口。
- **可移植。** 与 `pi-thinkrail-workflow` 不同，这个包不假设任何 thinkrail 专有的宿主工具；它在原生
  pi（`pi install`）下和在 thinkrail 里都能运行。

## thinkrail 集成

`packages/server/src/agent/extensions.ts` 用与 `pi-spec-graph` 相同的方式加入这个包：
`require.resolve("pi-todos/index.ts")` 放在 `additionalExtensionPaths` 上，它的 `skills/` 目录放在
`additionalSkillPaths` 上；`packages/server/package.json` 带 `"pi-todos": "workspace:*"`；编译后
二进制的生成器（`apps/cli/scripts/build-binary.ts`）把它作为值导入的工厂打包进去以保持一致。

## 测试

`core/core.test.ts` 针对真实的临时目录钉住 store 的契约（add/update/list/remove/replaceAll、按会话
隔离，以及损坏文件与非法条目的降级）。`tools/tools.test.ts` 通过一个假的 `ExtensionAPI`（带一个
stub 的 `sessionManager.getSessionId`）在临时 cwd 上驱动每个工具的 `execute` —— 参数贯通、未知 id
的报错路径，以及有限词表参数从 core 元组派生它们的枚举。
