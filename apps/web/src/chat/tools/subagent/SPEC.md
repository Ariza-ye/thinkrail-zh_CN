---
id: submodule-web-chat-tools-subagent
type: submodule-design
status: active
title: subagent 渲染器（Agent / get_subagent_result / 完成卡片）
parent: submodule-web-chat-tools
depends-on: [module-contracts]
references: [module-pi-subagents]
tags: [chat, subagents]
---

## 职责

为 **`pi-subagents`** 能力提供展示型渲染器，按工具名 / 自定义消息类型接合：`AgentCard`（`Agent` 工具——也为
`get_subagent_result` 注册，其结果携带同样的 `DelegationRunDetails`）、`SubagentCompletionCard`（分离式运行
注入的 `subagent-completion` 自定义消息——由 `turns.tsx` 渲染为它自己的 `subagentCompletion` 行，不经过工具
注册表），以及纯模块 `runDetails`（防御式 `DelegationRunDetails` 读取器、token/成本/时长格式化器，以及折叠
头部摘要行）。运行的*存活性*刻意不在这里推导：对话记录对话框从每个 `subagent.getTranscript` 响应上读取宿主的
注册表 `status`（理由见父级 chat 规范的对话记录视图接缝）。

## 渲染约定（用户已定，2026-08，有调研支撑）

调研过：Claude Code（折叠的一行摘要，其行实时跳动——`Running… 45s · 12 tool uses · 30k tokens` →
`Done (…)`；细节需要主动展开）、Codex（固定的实时运行时面板 + 简短的完成通知）、OpenCode（紧凑的可点击框 →
打开子会话；单行的后台完成通知）。已采纳：

- **`Agent` 是一张主要的、标准 `ToolCard`——默认折叠，但它的头部摘要正是实时行**：
  `role · N turns · X tok · $c · elapsed · current-step`，从每个 `partialResult.details` 的 REPLACE 快照
  重新推导。展开后：任务、实时活动行、模型/用量细节、Open-transcript 动作，以及进入终态后折叠在其中的最终
  报告。错误会自动展开（既有 chrome）。**失败的运行保留对话记录动作**：错误结果中被抛出的工具结果依然携带
  该运行的最终 details——`pi-subagents` 通过其 `tool_result` 覆盖重新注入它们（见其 SPEC，PR #304 复查
  发现）——因此 `details.childSessionId` 门控在实时与已水合两条路径上都会点亮（以水合为准）。
- **完成卡片的图标是三态**：只有 `completed` 是绿色对勾，`error` 是红色 X，`aborted` 是警示三角——被中止
  （例如达到轮次上限）的运行绝不能被读成成功（PR #304 复查发现）；`data-status` 为测试携带原始状态。
- **后台运行的工具卡片在它的 ack 处冻结**（工具 promise 落定后 pi 忽略 `onUpdate`）——这是有意的：卡片说
  “started in the background”，而**完成卡片**才是终态信号（OpenCode 的通知模式），携带最终 details + 报告
  折叠 + 对话记录链接。
- `get_subagent_result` 保持**常规**（折叠进活动组），主体与摘要相同。

## 边界

- **拥有：** `AgentCard`、`SubagentCompletionCard`、`runDetails`（纯的、有单元测试），以及它们的注册
  （`register.ts`，由父级 `tools/register` 以副作用方式导入）。
- **Public surface（公开接口）：** 副作用 `register`；`SubagentCompletionCard`（由父级 chat 的 `turns.tsx`
  导入）；`runDetails` 的纯辅助函数。
- **允许的依赖：** 父级 chat 原语（`toolRegistry`、`ChatActions`、`Markdown`、`foldState`）；兄弟
  `Collapsible`；`@thinkrail/extension-api/web`（渲染契约 + 纯辅助函数）；`contracts`（仅类型 + 那个
  `SUBAGENT_COMPLETION_CUSTOM_TYPE` 守卫家族）；`@remixicon/react`；`lib`。
- **绝不触碰：** 值导入任何 `pi` 包、`pi-subagents` 或 `pi-delegation`；`store`/`transport`（渲染器保持
  展示型——对话记录对话框作为集成文件住在 `chat/` 里，只通过 `ChatActions.openSubagentTranscript` 触达）。

## 必须做对的事

- **防御式渲染：** `DelegationRunDetails` 以无类型的 `result.details` 到达——用 `readRunDetails` 做窄化
  （childSessionId/status/task 齐全），绝不相信该形状；在第一个更新落地之前回退到 `args`
  （`subagent_type`、`task`）。
- `partialResult` 是 **REPLACE**——每个快照都是完整的；渲染器侧不做任何累积。
- 工具名 `Agent` / `get_subagent_result` 与 `subagent-completion` customType 必须与 `pi-subagents` 能力
  完全一致——名字就是接合键。
- 只用 token 工具类样式（不用裸十六进制 / 内联 `style`）。
