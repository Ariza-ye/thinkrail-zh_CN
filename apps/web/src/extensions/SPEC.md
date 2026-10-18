---
id: submodule-web-extensions
type: submodule-design
status: draft
title: Web 扩展组合注册表
parent: module-web
depends-on: [module-extension-api, module-ext-visualize]
references: [submodule-web-chat, module-thinkrail-extensions]
---

## 职责

Web 扩展的静态组合点。`registry.ts` 拥有它们的有序列表；`ChatView` 在模块加载时、应用本地工具注册之后调用
注册。每个描述符的工具条目按序供给既有的 chat 注册表，保持其末次注册优先的行为与回退渲染器。重新注册同一份
列表是替换条目，而不是累加条目。

注册会忽略宿主的扩展开/关设置：某个 web 扩展的服务端半边被禁用时，它的渲染器仍保持注册，因此已经包含其工具
调用的对话记录会继续渲染它们。那个开关只决定宿主接下来给 agent 什么。

## 边界

`index.ts` 只导出 `webExtensions` 与 `registerWebExtensions`。导入只触达扩展公开的 `./web` 入口、web SDK
契约，以及 chat 的注册函数；绝不触达 `ChatView`、store、传输层、扩展内部或服务端半边。注册表 Map 仍由 chat
拥有，因此本模块不创建平行的状态所有者，也不创建运行时扩展加载器。像 Markdown 这样的直接组件使用方，独立于
工具注册来使用扩展具名的公开导出。
