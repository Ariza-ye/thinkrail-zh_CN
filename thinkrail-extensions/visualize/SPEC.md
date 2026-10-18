---
id: module-ext-visualize
type: module-design
status: active
title: visualize 扩展
parent: module-thinkrail-extensions
depends-on: [module-ui, module-extension-api, module-pi-visualize]
references: [submodule-web-chat, submodule-server-extensions]
---

## 职责

`visualize` 工具的 ThinkRail 半边。`./server` 把可移植能力（[[module-pi-visualize]]）与浏览器渲染器所认同的
**严格** mermaid 校验器组合起来；`./web` 是 props 驱动的呈现。工具名把两者接在一起，无需改动线上协议。

## 边界

两个入口点，没有根 barrel。`@thinkrail/ext-visualize/server` 默认导出
`defineServerExtension({ name: "visualize", title, description, extensions: [createVisualizeExtension({ validateMermaid })] })`
—— 没有子扩展，没有技能包 —— 并可以 import `extension-api/server`、`@thinkrail/pi-visualize`、`mermaid`、
`linkedom`。`@thinkrail/ext-visualize/web` 默认导出 `defineWebExtension` 描述符，外加具名的 `MermaidView`（用于
聊天 markdown 中的围栏 mermaid），并消费 `extension-api/web`、逐文件的 UI 原语、contracts、React 与 Remix
Icon。两半都不 import 另一半、应用/宿主内部实现，也不（web 半边）import 任何 pi 包；浏览器在渲染器内部惰性
加载 `mermaid`，绝不在急切的入口 chunk 里加载。

## 严格校验（服务端）

该校验器就是通过 pi 包的 `validateMermaid` 接缝注入的那一个，它**替换**该包尽力而为的 `lovely-mermaid` 探针；
包本身仍拥有形状检查、空源码拒绝、源码枚举与按字段定位的诊断。保证的是**由 web 渲染器所用的确切 `mermaid`
版本（catalog 锁定）完成语法解析**，而不是 SVG/布局成功 —— 渲染器保留它的防御性回退。

- `mermaid` 在解析器初始化期间需要浏览器全局量，而 DOMPurify 对 flowchart/class/state/gantt/mindmap 需要真实的
  `document`（已在 Bun 下验证），所以 `linkedom` 是必需的、不是可选的：轻量 DOM 只在惰性的 `import("mermaid")`
  期间存在，而先前的 `window`/`document` 描述符在 `finally` 中恢复。
- `mermaid.parse` 调用通过存放在 mermaid 实例上的 promise 尾部串行化（因此每个已加载的本模块副本都共享它），
  因为 mermaid 每次解析都会重置共享配置。
- 非法语法表现为该包的 `isError` 工具结果，要求模型改正并重试；扩展不注入任何提示词，也不强制重试。

宿主从 server 注册表组合这个描述符（[[submodule-server-extensions]]）；通过该组合发起的一次严格校验调用被固定在
`packages/server`（dev）与产物探针（CLI 二进制与桌面）中，因此原版探针绝不可能是 ThinkRail 中实际运行的那个。

## 渲染契约（web）

图、对比选项与推荐选择保持既有的聊天呈现。该注册是主渲染且默认展开；它的标题或 diagram/comparison 摘要无需渲染
即可获取。非法或流式参数保持防御性，工具错误保留可读的结果文本。

`MermaidView` 从宿主的 CSS 变量推导 mermaid 的严格模式主题，并在一次完成的 `data-theme` 切换之后重新渲染。它
支持调用方提供的加载回退、全屏 Dialog 以及平移/缩放控件。全屏画布从它本地的起始手势基线掌控修饰键滚轮缩放与
WebKit 手势捏合，这样桌面页面缩放就不会抢占该手势。渲染器失败时显示错误，并给出一个与应用的 CodeBlock 无高亮
分支相匹配的纯源码块；它绝不 import 应用的 shiki 高亮器。`args` 与平移/缩放运算保留聚焦的单元测试覆盖。
