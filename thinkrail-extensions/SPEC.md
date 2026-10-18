---
id: module-thinkrail-extensions
type: module-design
status: draft
title: ThinkRail 扩展（thinkrail-extensions/）
parent: architecture
depends-on: [module-pi-extensions, module-contracts]
tags: [extensions, ui-sdk]
---

## 职责

一个 **ThinkRail 扩展**是一个工作区包 `thinkrail-extensions/<name>/`（`@thinkrail/ext-<name>`，私有），它把一项
pi 能力 —— 通常是一个 [[module-pi-extensions]] 包，也可能是第三方 pi 包 —— 与它的 ThinkRail 专属半边组合起来：
宿主把什么打包进会话，以及 web 客户端如何呈现该能力的工具。宿主从**每侧一个注册表文件**组合扩展。用户在
Settings → Extensions 里能看到 server 注册表，并可以逐个关掉扩展（一个以描述符 `name` 为键的宿主级设置；扩展
本身不为此声明任何东西）；用户如何安装或发现新扩展是刻意不做设计的。

第一个扩展（`visualize`，[[module-ext-visualize]]）同时交付两半；宿主从下面两个注册表文件组合它们
（[[submodule-server-extensions]]、[[submodule-web-extensions]]）。安装体验、市场、按扩展的设置、按工作区的
开关覆盖、扩展提供的线上协议方法、面板与 `store` 贡献都是明确的推迟项，而不是缺口。这个开关目前还不覆盖扩展
的 `skillPackages` —— 它们会继续暂存与加载，直到出现带技能的扩展。

## 形态 —— 两个入口点，没有根 barrel

- `./server` — 默认导出 `defineServerExtension({ name, title?, description?, extensions, childExtensions?, skillPackages? })`
  （`title` / `description` 是 Settings 的展示文案）。`extensions` / `childExtensions` 是 pi
  `ExtensionFactory`，宿主把它们组合进每个父会话 / 精选子集合，注册为具名 `InlineExtension`，这样 pi 的诊断
  仍保有身份。`skillPackages` 是**包说明符**，宿主会暂存其中 `pi.skills` 目录 —— 这是给构建步骤的显式模块
  身份，绝不从函数推断。仅服务端；可以以值的形式 import pi。
- `./web` — 默认导出 `defineWebExtension({ name, toolRenderers })`，以工具名为键，**外加具名导出**供宿主直接
  使用的组件（visualize 导出 `MermaidView`，用于聊天 markdown 中的围栏 mermaid）。仅浏览器；绝不以值的形式
  import pi；重型渲染器保持惰性加载。

`define*` 对象与具名 web 导出就是整个契约。未来的能力（线上协议方法、面板、设置）在有真实使用方需要时才加到这些
对象上。

**现在固定下来、以免后来的扩展被迫重写的性质 —— 运行时/生命周期归属：** server 入口点与浏览器入口点分离；
不 import 宿主内部实现；宿主拥有的作用域状态（按会话的拥有者，例如 subagents 与后台命令；按工作区的服务）
通过显式接缝提供，绝不由扩展创建。因此按会话的拥有者留在宿主的会话管理器里，位于静态注册表之外。

## 宿主 UI SDK

`./web` 半边可以 import 什么：

- `@thinkrail/extension-api`（[[module-extension-api]]）—— 只有类型与 `define*` 辅助函数，没有 React 组件。
  `./web`：`ToolRenderProps`、`ToolRenderer`、`ToolRegistrationOptions`、`ToolStatus`、`WebExtension`、
  `defineWebExtension`，以及纯渲染辅助函数（`toolHelpers`、`toolResultContent`）。`./server`：
  `ServerExtension`、`defineServerExtension`。它自成一个包，因为 server 的 pi 类型会污染 `contracts` 中的线上
  协议边界，而 `ui` 里的 server 契约会给宿主带来一个表现层依赖。
- `@thinkrail/ui`（[[module-ui]]）—— 整体搬过来的自有 shadcn/Radix 原语、`cn`，以及只含 `onThemeSwap` 函数
  （不含主题目录/偏好运行时）。为了代码分割，保留逐文件 import（`@thinkrail/ui/dialog`）。设计 token 留在
  `apps/web/src/styles`；SDK 与扩展 web 半边只使用 token 工具类，而应用的 CSS `@source` 与颜色/间距/字体检查
  覆盖 `packages/ui` 与 `thinkrail-extensions/*/web`。
- **不在 SDK 里（目前）：** 带高亮的 `CodeBlock` 与 shiki 高亮器 —— 未做到依赖闭合（高亮器 → 主题 barrel）。
  当第二个扩展需要高亮时，它们会随通用的 CSS 变量 shiki 映射一起搬过去。

## 组合 —— 注册表文件

- **服务端：** `packages/server/src/extensions/registry.ts` 静态 import 每个 `@thinkrail/ext-*/server`，并导出
  条目 `{ specifier, extension }` —— 描述符**及其作为字符串的公开 server 说明符**。静态 import 让这些 factory
  通过正常的 server 图进入编译后的 CLI 二进制与桌面 bundle，因此打包器不会为它们生成 factory 列表（生成的列表
  只留给尚未包装成扩展的 pi 包）。资源加载器在 dev 与打包模式下同样把 `extensions` / `childExtensions` 摊平成
  具名内联扩展 —— 只有一种组合模式，没有基于路径的 dev 加载。**技能解析是按拥有者划分作用域的：** 一个共享
  解析器先从 `specifier` 解析扩展入口，然后通过 `createRequire(extensionEntry)` 解析每个 `skillPackages`
  manifest —— 构建支持会暂存摊平后的根，未打包的 dev 在运行时解析，打包后的运行时只用注入的暂存根。启动器
  基础设施（桌面打包的 server 运行时、`startDesktopHost`、`registerBundledRuntime` 的 OAuth/Bedrock/trash
  注册、`pi-web-access` 的生成模块隔离）不因此改变。
- **Web：** `apps/web/src/extensions/registry.ts` 导出有序的 web 扩展；`registerWebExtensions()` 把它们的
  `toolRenderers` 喂给聊天工具注册表。应用本地的工具注册保留它们的副作用 import；扩展描述符则不需要。

## 边界规则（由 `scripts/check-module-boundaries.ts` 强制，带负向测试）

- 把 `pi-extensions/*` 与 `thinkrail-extensions/*` 发现为工作区根。
- **源码半边：** 在每个扩展内部，`web/**` 与 `server/**` 绝不互相 import，包括通过相对路径。
- **公开子路径：** `apps/web` 只能 import `@thinkrail/ext-*/web`；`packages/server` 只能 import
  `@thinkrail/ext-*/server`。
- 边：`extension-api → contracts`；`ui → contracts`；`ext-*/web → ui, extension-api, contracts`；
  `ext-*/server → extension-api, 它的 pi 包`；`apps/web → contracts, ui, extension-api, ext-*/web`；
  `packages/server → extension-api, ext-*/server`（且不再直接依赖扩展所拥有的 pi 包）。

## 交付模板（每个扩展、每个 PR 对用户都不可见）

1. **在旧包旁边新建 pi 包**，发布；旧包与宿主接线保持不动。
2. **web 半边迁移**到 `thinkrail-extensions/<name>/web`，由 web 注册表注册；server 仍运行旧包 —— 两边注册同一个
   工具名，所以渲染不变。
3. **server 半边 + 接线**：`./server` 组合新包，server 注册表拾取它，旧包被删除。

PR 1 与 PR 2 相互独立；PR 3 依赖两者。一个没有 web 半边的*新*扩展在第 2 步之前通过默认工具渲染器渲染 —— 绝不是
visualize，它的渲染器在第 2 步前后都存在。

## 成员

| 扩展 | pi 能力 | 备注 |
| --- | --- | --- |
| `visualize` | `@thinkrail/pi-visualize` | 已交付。`./server` 注入**严格**的 mermaid 校验器（`mermaid` 用 web 渲染器所在的 catalog 版本，通过 `linkedom` 初始化 —— 必需：DOMPurify 需要真实的 `document` 来处理 flowchart/class/state/gantt/mindmap，已在 Bun 下验证）。`./web` 承载 diagram/comparison 卡片并导出 `MermaidView`。保证的是语法解析，而不是 SVG/布局成功；浏览器渲染器保留它的回退。 |
| `web-access` | 第三方 `pi-web-access` | 计划中的下一步：用现有的渲染器与 `headlessSearchPolicy` 包装这个 npm 包，去掉打包器最后一处特例。 |
