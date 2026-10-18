---
id: module-extension-api
type: module-design
status: draft
title: 宿主扩展契约与纯渲染器辅助函数
parent: architecture
depends-on: [module-contracts]
references: [module-thinkrail-extensions]
---

## 职责

仅源码的宿主扩展契约，独立于呈现组件与宿主状态。浏览器与服务端的
描述符在组合能力时，不导入任何一方的应用内部。宿主保留注册、生命周期与顺序；`define*`
辅助函数保留所提供的描述符。

## 边界

- `./web` 暴露 `ToolStatus`、`ToolRenderProps`、`ToolRenderer`、`ToolSummary`、`ToolChrome`、
  `ToolProminence`、`ToolRegistrationOptions`、`WebExtension`、`defineWebExtension`，以及来自
  `toolHelpers` 与 `toolResultContent` 的纯参数/结果读取器。
- `WebExtension` 是 `{ name, toolRenderers }`，其中每个工具名条目携带一个 `renderer` 和
  位于 `options` 下的可选 `ToolRegistrationOptions`。`defineWebExtension` 是一个类型化的恒等辅助函数：
  它保留该描述符及其推断出的工具键，而不做注册或默认值注入。
- `./server` 暴露 `ServerExtension` 与 `defineServerExtension`，只含 pi 的 `ExtensionFactory` 类型。
  描述符携带 `name`（即身份——Settings 的开关与 `disabledExtensions` 都以它为键）、
  可选的、供 Settings 目录使用的展示文案 `title` / `description`、`extensions`、可选的
  `childExtensions` 和可选的 `skillPackages` 说明符。它的恒等辅助函数保留工厂、顺序与可选字段的缺失；
  加载与技能解析仍是宿主的职责。
- 根入口是浏览器安全的，只暴露 web 契约；它绝不再次导出服务端那一半。
- 唯一的工作区依赖是 `contracts`。React 与 pi 是仅类型的契约依赖；
  这里没有 React 组件、注册表、DOM 访问、宿主导入或 pi 运行时值。

规范的（canonical）工具结果解析仍由渲染器文本提取与宿主的通用图像
层共用：只接受形态良好的受支持图像块，保留文本块的顺序，并对非规范结果回退到
可读的值。由 props 驱动的渲染器从宿主接收可选的文件导航，
绝不从某个 store 或传输层获取它。扩展的组合规则见
[[module-thinkrail-extensions]]。

## 验证

包测试通过各描述符的公开入口、纯参数/结果辅助函数，以及根入口与 `./web` 两者的
浏览器打包来检验它们。浏览器 bundle 在运行时只允许 contracts，并
拒绝 React、pi、宿主与服务端导入；`./server` 另行验证其 pi 依赖被擦除。
应用的注册表与通用图像层测试保留对宿主拥有的渲染行为的覆盖。
