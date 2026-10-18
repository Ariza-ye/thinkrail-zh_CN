---
id: module-pi-visualize
type: module-design
status: draft
title: "@thinkrail/pi-visualize —— 用于原版 pi 的 visualize 工具"
parent: module-pi-extensions
tags: [pi-extension, visualization, mermaid]
---

## 职责

可视化能力已发布的可移植半边：一个工具 `visualize`，它校验 diagram 或 comparison 请求，返回一段 markdown
回退作为面向模型的结果，并把结果画在 pi 的终端 UI 里。它对 ThinkRail 一无所知。ThinkRail 通过
[[module-ext-visualize]] 的 server 半边（已删除的 `packages/pi-visualize` 的后继）组合它，并注入自己的严格
校验器。

## Public surface（公开接口）

- **默认导出** —— 带默认配置的 pi `ExtensionFactory`；也就是 `pi install` 通过 `pi` manifest 加载的东西。
- **`createVisualizeExtension({ validateMermaid? })`** —— 返回一个 `ExtensionFactory`，其中注入
  `MermaidValidator: (source) => void | Promise<void>`。该校验器**替换**默认检查（绝不补充它，因此更严格的
  引擎可以接受探针会拒绝的语法）。本包保留形状检查、空源码拒绝、源码枚举、等待回调，并把任何抛出包装成按
  字段定位的诊断（`` `mermaid` `` / `` `options[N].mermaid` ``），要求模型改正后重试。
- **工具契约**，各渲染器据此定位：名字 `"visualize"`、它的参数形状（`type: "diagram" | "comparison"`、
  `title?`、`mermaid?`、`options?[]`），以及 `details` = 校验后的参数。改动这个形状对每个渲染器都是破坏性
  改动，包括 ThinkRail 的。

## 决策

- **对原版用户而言依赖极轻：`lovely-mermaid`。** 本包只依赖 `lovely-mermaid`（零依赖、约 1 MB、同步、
  Apache-2.0）。它是 `grok-mermaid` 的维护中的后继者 —— 也就是 pi 自己在聊天消息里画 ```` ```mermaid ````
  围栏所用的引擎，但 pi 从不把它用于工具结果，所以才有了本包自己的渲染器 —— 因此 `visualize` 画出的图看起来
  就像模型内联写出的那张。`mermaid`（连同它的依赖树约 83 MB）以及它在 Node/Bun 下需要的 `linkedom` DOM 垫片
  在这里被否决了：它们换来严格解析却换不来终端渲染，而用 mermaid 渲染的宿主可以通过接缝注入那个解析器。
- **复盘：`beautiful-mermaid` 已被替换。** 它的 ASCII 引擎（由 `@vercel` 与 `@ktrysmt` 两个 fork 共用）把一对
  节点之间的每条边都沿单一路径布线，于是一个往返或并行的节点对 —— 即常见的请求/响应或 `Idle ⇄ Running` 形状
  —— 会重叠标签、丢掉其中一个，或者丢失每条边的走向，而折叠后的 TUI 就那样展示这张图、毫无提示。是在一次针对
  OAuth 流程的原版 pi 实机检查中发现的；它连同 `elkjs` 还带来约 10 MB 的体积。
- **默认校验就是渲染器自己的解析，尽力而为。** 对于 `lovely-mermaid` 能画的种类（flowchart/graph、state、
  sequence、class、ER、pie、mindmap、timeline、gitGraph —— 即它的 `diagramKind`，它会跳过 frontmatter、
  指令与注释），探针会拒绝未知的流程图方向（`lovely-mermaid` 会静默接受 `flowchart XX`；mermaid 不会）、
  什么都解析不出来的源码（`render` → `null`），以及解析**丢掉**的任何片段（`warnings`：悬空链接、未闭合
  标签、无法读取的语句）。尺寸上限警告（`diagram truncated`）是渲染器的限制，而不是源码错误，绝不算拒绝。
  该库建议不要用警告来给*渲染*设门禁，因为流式源码在编辑中途会告警；而工具调用是完整的，所以那里丢掉的片段
  就是值得重试的真实缺陷。接受的代价是：语法宽松（未闭合的 class 体也能通过），并且存在罕见的误报
  （`accTitle`/`accDescr`）；有严格解析器的宿主可以通过接缝替换探针。其他家族（gantt、xychart …）**不经
  校验直接通过**，以免冒着拒绝渲染器恰好不认识的图表类型的风险。探针与 TUI 共用同一个 render 调用，该调用先
  剥掉开头的空行与 `%%` 行：`lovely-mermaid` 0.3.3 对于注释或 `%%{init}%%` 指令之后的 mindmap 会返回 `null`
  （其他种类不受影响）。
- **终端渲染分层。** `renderCall` 是一行摘要（`visualize <title | diagram | comparison — N options>`）。
  `renderResult` 返回一个宽度感知的组件：在 `render(width)` 中，只有当图画是**完整的**（没有警告）且每一行都
  符合 pi-tui `visibleWidth` 的宽度（它与渲染器的字素级正确宽度一致，所以 CJK 与 emoji 标签都能画）时才画图；
  否则，以及对于渲染器不画的种类，显示源码的 pi-tui `Markdown` 围栏。跨度角色与 pi 原生渲染器一样精确映射到
  pi 的主题（`border` → `borderMuted`、`text` → `text`、`edge` → `accent`、`edgeLabel` → `muted`）。图绝不做
  单词折行。折叠 = 只有图画；展开 = 图画 + 源码围栏。图从经过防御性检查的 `result.details` 渲染；对比、错误
  （`context.isError`）与缺失 details 的情况从 `result.content` 渲染；部分结果显示占位符。图像级渲染
  （Kitty/iTerm2）被推迟：它需要不依赖浏览器的 SVG 光栅化，并且在 tmux/SSH 下会退化。
- **双运行时。** 发布的代码只使用不依赖 `node:` 的标准 ESM 与 pi 宿主提供的包，所以它能在 Node（原版 pi、
  jiti）与 Bun（ThinkRail）下运行。对 `@earendil-works/pi-coding-agent` 的运行时 import 仅限于
  `getMarkdownTheme`；`@earendil-works/pi-tui` 提供 `Text`、`Markdown`、`visibleWidth`。

## 边界

- **允许的依赖：** `lovely-mermaid`（精确锁定）；peer 包 `@earendil-works/pi-ai`（`StringEnum`）、
  `@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`。
- **绝不触碰：** 任何来自 ThinkRail 的东西（`@thinkrail/*`、`apps/*`、`packages/server`）、`mermaid`、
  `linkedom`、Bun 特有 API。

## 结构

`index.ts`（导出 + 默认导出）、`src/extension.ts`（factory、工具注册、校验器包装）、`src/schema.ts`、
`src/validate.ts`（形状 + 源码枚举）、`src/markdown.ts`（第一层回退）、`src/probe.ts`（共享的 render 调用 +
默认校验器）、`src/tui.ts`（渲染器 + `DiagramComponent`）。`bun test` 覆盖它们每一个；[[module-pi-extensions]]
中的原版对等门禁会检验打包后的产物。
