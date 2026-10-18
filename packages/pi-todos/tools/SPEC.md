---
id: submodule-pi-todos-tools
type: submodule-design
status: draft
title: pi-todos 工具（pi 包装层）
parent: module-pi-todos
depends-on: [submodule-pi-todos-core]
tags: [pi-extension, todos]
---

## 职责

七个把待办清单暴露给 agent 的 `pi` 自定义工具 —— `todo_list`、`todo_add`、`todo_update`、
`todo_promote`、`todo_remove`、`todo_write`、`todo_plan_summary`。每一个都是 `core/` 之上的
**薄包装**：一份 TypeBox `parameters` schema、一个针对 `ctx.cwd` 调用单个 `TodoStore` 方法的
`execute`，以及一个 `textResult`/`errorResult` 返回值。
有限词表的 `status` 参数经由 `StringEnum` 从 `core/` 的元组派生它的枚举，因此 schema 与模型
一起变动（由 `tools.test.ts` 钉住）。

**面向 agent 的约束就住在这一层**（core 保持宽松 —— 用户队列和宿主线上协议都用散项，agent 也可以
自己写散项）：
- **散项写入是草稿本，不是计划的书写面：** `todo_write` 的 schema 只提供 `groups`，因此重做计划
  绝不会铸造或编辑散项。`todo_add` 接受 `group`、`after`，或者**两者都不给** —— 两者都省略时会把
  一条原始的散项丢进用户与 agent 共享的工作前队列。锚定在散项上的 `after` 会被**拒绝**：散项是被
  晋升成一个分组的，而不是长出同辈条目。`TodoStore.add` 保持宽松，因为宿主通过它写用户自己的散项
  队列。
- **晋升是一个原子工具，不是一套来回舞：** `todo_promote` 包装 `TodoStore.promote` —— 一次调用
  消费掉一个散项，并让一个属于它自己的分组浮出来（同样的 id、同样的标题，除非被覆盖），等待
  `todo_add` 追加第一个步骤。对于用户来源的散项请求，这是唯一被支持的晋升路径；工具描述把后续动作
  写成了脚本（`todo_add` 第一个步骤 → 翻成 `in_progress`），而 todos 技能承载着“不要回到
  `todo_add group:` + `todo_remove` 那套来回舞”的规则。`todo_promote` 之后紧随的空分组是一个
  合法的“任务已接下、计划正在成形”状态（空分组见 [[submodule-pi-todos-core]]）—— 不放合成出来的
  占位步骤。
- **`todo_write` 是对账，它绝不破坏性替换：** 该工具把它的 `groups` 转交给 `TodoStore.replaceAll`，
  后者按分组 + 步骤标题把你写的步骤与既有条目匹配起来并保留它们的进度（见
  [[submodule-pi-todos-core]]）。因此任务中途重做计划是安全且无损的 —— **没有任何运行时提示**去
  劝阻它；todos 技能承载着（仅为效率的）偏好：单处改动用 `todo_add`/`todo_update`。
- **带内提示**（状态纪律的反馈）：当存在未完成条目但没有任何一条是 `in_progress` 时，每个变更类/
  列表类结果都会追加 `consistencyNudge`；而一次 `todo_update` → `done` 改为点名该分组的下一个未完成
  步骤（只建议，绝不自动开始）；被自动打回的条目报告为 `(paused: …)`。一次 `done` 如果留下
  **任何地方都没有未完成条目**，还会额外提示 `todo_plan_summary` —— 整体完成摘要恰好在它到期的
  那一刻被要求；当先前某次完成留下的摘要仍然存在于计划上时（添加新工作的路径从不丢弃它），提示会
  **原样带出那段文字并要求 agent 扩展它**，而不是从头改写，因此这条说明保持对整个已完成内容的累积，
  而不会收窄到只剩最后一步。
- **完成摘要（评审痕迹）：** `todo_update` 接受可选的 `summary`（是什么/为什么 —— 差异无法展示的
  决策，再加上任何范围漂移；**结构化 Markdown** —— 引导句 + 项目符号）、**`commitSubject`**
  （该步骤增量的、面向 git 的提交主题行，按宿主仓库自己的提交风格书写 —— “读 `git log` 并照着来”
  这条指令就住在 schema 描述里，因为工具是 agent 接触这个字段的唯一途径）以及 **`verification`**
  （实际运行的检查 + 结果，或“未验证” —— 一个独立字段，好让 UI 用状态字形给它打徽章；**Markdown**，
  因此多个检查渲染为项目符号列表，而不是塞满 `;` 的一行，而含糊或缺失的一行一眼就能看到）—— 三者
  与 `status: done` 一起设置（对改了代码的步骤是技能强制要求，绝不是工具门禁：工具无法知道该步骤是否
  改了代码 —— git 住在宿主侧）。`todo_plan_summary` 设置计划级交接说明
  （`TodoStore.setSummary`）—— 对跨整个计划所做全部内容的一份**累积**回顾（每个任务、每次完成），
  当更早的说明仍然存在时是扩展而不是改写；它接受提前调用，但会标出还有多少条目未完成（UI 只在一切
  都完成之后才显示该说明）。计划级摘要使用 `## Summary`、`## Changes` 和 `## Testing` 小节，因为
  宿主会把它们原样插入 PR 正文。
- **分组优先的输出：** `formatPlan` 把每个分组渲染在 `formatGroupHeader` 之下 —— `▸ <title>
  [<derived status> <done>/<total>]` —— 它的步骤缩进在下面，**然后散项队列（共享的原始输入队列）
  排在最后**，位于 `Loose queue:` 标题之下。散项队列排在最后是有意为之：任务中途添加的条目排在
  *agent 当前工作之后*，因此从上到下阅读会先续跑/先完成手上的任务。这与用户看到的两级顺序一致
  （`TodoList`），也与 `flat()`/`list()` 返回的顺序一致。

`shared.ts` 承载 `storeFor(ctx)`（为活动的 `(ctx.cwd, sessionId)` 新建一个 `TodoStore` —— store 是
无状态的，所以没有缓存）、结果辅助函数、`formatTodo`/`formatGroupHeader`/`formatPlan`
（工具输出里用到的渲染），以及 `consistencyNudge`/`withNudges`。

## Public surface（公开接口）

`index.ts` 这个 barrel：`registerTodoTools(pi)`，唯一的入口点，由扩展入口（`../index.ts`）调用。

## 边界

- **允许的依赖：** `@earendil-works/pi-coding-agent`（类型）、`@earendil-works/pi-ai/compat`
  （`StringEnum`）、`typebox`，以及 `../core`（经由它的 barrel）。
- **绝不触碰：** 深入 `core/` 内部（要通过 barrel 导入）、任何 `@thinkrail/*` 包，以及 `TodoStore`
  之外的任何文件系统访问 —— 磁盘归 store 所有。
