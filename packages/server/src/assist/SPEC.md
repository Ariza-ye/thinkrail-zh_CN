---
id: submodule-server-assist
type: submodule-design
status: active
title: assist —— 临时性一次性任务
parent: module-server
depends-on: [submodule-server-agent]
tags: [pi, oneshot, public-surface-checked]
---

## 职责

小而**尽力而为**的 agent 助手，运行单次廉价模型补全 —— 即"临时性一次性任务服务"。
每个任务自带提示词、输出解析/护栏与优雅降级回退；它绝不阻塞或拖垮调用方。
当前的任务是当 agent 没有写出摘要时，为一个已完成的计划起草摘要。给聊天和工作区命名**不**属于
assist 任务：主 agent 通过 `set_title` 为其命名（见 [[submodule-server-agent]]），因为每一种
辅助模型命名方案都产生了用户想改的名字。PR 草稿（标题/正文）及类似任务接下来会落在这里。
这些任务是**库级接口**——没有线上方法；使用方是宿主侧的流程。

## 边界

- **拥有：**
  - 任务清单及其提示词、输出护栏与回退。始终限时（`AbortSignal.timeout`）且限量（`maxTokens`）。
  - `setOneShotRunner(fn)` —— 一个测试接缝，用于替换一次性运行器（默认 = `agent.completeOnce`），
    使任务能对着假实现做单元测试，无需 pi/auth/网络。
  - `suggestPlanSummary(steps)` → 为 COMPLETED 计划起草的简短 **Markdown** 交接说明，由其已完成的
    步骤（`{ title, summary?, verification? }[]`，由调用方构建——assist 不读任何存储）经同一条
    无工具的廉价模型路径产出，或者产出 `null`（尽力而为：无 auth / 超时 / 无可用步骤 / 空输出时
    返回 `null`，绝不抛错）。`toPlanSummary(raw)` 是纯函数输出护栏（剥掉代码围栏与前导的
    `Summary:` 标签，限制长度，然后重排为 `## Summary` / `## Changes` / `## Testing`——缺失的小节
    获得占位符，缺失 Summary 时取第一个标题之前的文本；为空时返回 `null`）。宿主仅在结果非空时才
    持久化；绝不覆盖 agent 自己写的 `plan.summary`。
- **Public surface（公开接口，barrel）：** `setOneShotRunner`, `suggestPlanSummary`, `toPlanSummary`,
  `OneShotRunner`, `PlanSummaryStep`.
- **允许的依赖：** `agent`（`completeOnce`/`OneShotRequest`/`OneShotResult` 原语，经由其
  barrel）；Node。
- **绝不触碰：** `host`；**直接依赖 `@earendil-works/pi-ai` / `pi-coding-agent`**（模型访问 + 调度
  属于 `agent`）；深入其他特性的内部实现。

## 必须做对的事

- 每个任务都**降级为 `null`** —— 失败绝不能阻塞其调用方，也绝不能表现为错误。包住
  运行器调用；由调用方决定（若有）改写什么。
- 绝不信任模型格式：先限制 `maxTokens`，然后自己规范化/截断文本。
- 这些是共享事件循环上的无状态、无副作用的 `fetch`（不碰磁盘、不用工具）——可安全并行运行；
  不需要管理器/注册表。
