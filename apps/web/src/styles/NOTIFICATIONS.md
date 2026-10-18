---
id: web-notices
type: submodule-design
status: active
title: ThinkRail 应用内提示 — toast 与内联横幅的统一外观
parent: module-web
references: [web-color, web-spacing, web-typography]
---

# 应用内提示

为应用在自己窗口内展示的每条临时或内联消息提供统一视觉语言：toast（`packages/ui/toast.tsx`，由
`panels/Toaster` 组合）以及内联提示，例如 `ProjectTrustNotice`、`ProviderWarningBanner`、`SkillsDialog` /
`NewWorkspaceDialog` 中的信任提示，以及聊天的 `ErrorTurn` / `CompactionNotice`。OS 级通知是另一回事，由
`notifications` 模块拥有。

## 触发 toast

使用 store 助手：来自 `@/store` 的 `toast.info|success|warning|error(message, title?)`。当需要一个 `action`
（`{ label, onClick }`）或自定义 `durationMs` 时使用 `pushToast`。错误 toast 会一直保留到被关闭。其他每个
toast 都会自动消失。

## 外观

- 中性填充：每个严重级别都用 `bg-container-elevated-bg`。不使用带色调的 `bg-feedback-*-subtle` 填充，也没有
  左侧强调条。
- 严重级别仅由 1px 边框（`border-feedback-<severity>-muted`）与图标颜色（`text-feedback-<severity>`）表达。
  正文保持 `text-text-default`。
- 几何：`rounded-sm`。内联提示使用 `px-12 py-8`，在资源检查器这类密集侧边面板内使用 `px-8 py-4`。toast 使用
  `p-12`。
- 文字：消息用 `tr-text-ui text-text-default`，次要行用 `tr-text-metadata text-text-muted`。

## 图标

每一处都按严重级别使用同一个 Line 字形，用匹配的 `text-feedback-*` 上色并标记 `aria-hidden`：

| 严重级别 | 字形 |
|---|---|
| info | `RiInformationLine` |
| success | `RiCheckboxCircleLine` |
| warning | `RiAlertLine`（三角形） |
| error | `RiErrorWarningLine`（带圈的 `!`） |

一个含义比其严重级别更具体的提示可以使用领域字形，例如受信任项目提示上的 `RiShieldCheckLine`。

## 布局

根据内容在两种布局中择一：

- **单行**（一条短消息，无次要行）：`flex items-center gap-8`。图标、消息（`flex-1`）与动作同处一行。用
  `-mt-2` 轻推 14px 图标，让它在视觉上与文字对齐。
- **多行**（有次要行，或消息可能换行）：`flex flex-col gap-8`。把图标与文字放进内容行（`flex items-start
  gap-8`，图标用 `mt-2` 对齐首行）。把动作放进页脚行（`flex justify-end gap-8`）。绝不把动作放在会换行的
  文字右侧。

toast 始终使用多行布局。`ToastClose` 位于内容行，可选动作放入 `mt-12` 的页脚。

## 动作

- 使用 `size="sm"` 按钮。主作用 `variant="outline"`。紧挨它的次要动作用 `variant="ghost"`。
- 绝不在提示内使用填充（`default`）或彩色按钮。边框已经承载了严重级别，填充按钮会与页面的主操作竞争。
- toast 动作经由 `ToastAction asChild` 包住一个 `Button` 渲染。这样 Radix 仍会关闭 toast 并播报该动作的
  `altText`。

## 尚未迁移

少数较旧的错误表面仍在使用带色调的样式，例如 `ExistingWorktreeDialog` 和 `SpecsPanel` 的加载错误。下次接触
它们时迁移，不要把它们的样式复制进新的提示。Markdown 警告标注（`panels/markdownAlerts`）不是提示：它们刻意
镜像 GitHub 的警告样式。
