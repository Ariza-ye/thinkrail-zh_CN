---
id: submodule-spec-graph-tools
type: submodule-design
status: active
title: Spec-graph 工具（pi 包装）
parent: module-spec-graph
depends-on: [submodule-spec-graph-core]
tags: [spec-graph, pi-extension]
---

## 职责

把规范模型暴露给 agent 的七个 `pi` 自定义工具——`spec_grep`、`spec_get`、
`spec_graph`、`spec_create`、`spec_update`、`spec_delete`、`spec_validate`。每一个都是 `core/` 之上的
**薄包装**：解析 typebox 参数、调用一个 `core/` 函数、格式化一个文本结果 + 结构化的 `details`。
它们都不编辑散文。

## 边界

- **拥有：** 工具注册、参数 schema 与结果格式化；按根的 `SpecIndex` 缓存以及
  `spec_create` 的脚手架标题（`shared.ts`）。
- **Public surface（公开接口）：** 导出 `registerSpecTools(pi)` 的 `index.ts` **barrel**；扩展入口
  （`../index.ts`）是唯一的调用方。
- **允许的依赖：** `core/`（经由其 barrel）、`@earendil-works/pi-coding-agent`（类型 + `registerTool`）、
  `@earendil-works/pi-ai`（`StringEnum`，来自包根）、`typebox`、Node 内建模块
  （`node:fs`/`node:path`，仅写入工具）。
- **绝不触碰：** 深入 `core/` 的叶子文件（只导入 barrel）；任何 `@thinkrail/*` 包。

## 叶子

每个工具一个叶子（`grep.ts` → `spec_grep`，依此类推），各自包装对应的 `core/` 函数
并依赖 `shared.ts`（索引缓存 + 结果/脚手架辅助函数），而它依赖 `core/`。叶子
之间互不依赖；`index.ts` 组合它们。`spec_create`/`spec_update`/`spec_delete` 写
文件；其他四个是只读的。

## 不变量

- 工具绝不编辑散文；`spec_update` 仅改 frontmatter，且绝不把一个文件变成非规范——它不会移除或
  清空 `id`/`type`，也不会重命名 `id`。它通过 `addList`/`removeList` 设置/移除标量字段，并在
  每个列表字段（`depends-on`/`references`/`implements` + `covers`/`tags`）上增删条目；
  `set` 拒绝列表字段（那会把一个标量按列表强制成一个错误条目）。该编辑由
  `core` 的 `updateFrontmatterText` 就地应用，因此注释、嵌套/未知字段、字段顺序以及
  文件的行尾符都被保留。
- 这些工具读写的 frontmatter 字段键来自 `core` 的 `FIELDS` 注册表，而建立在有限词表之上的参数
  使用由 `core/` 元组播种的 `StringEnum`（`spec_create.type` ← `SPEC_TYPES`、
  `spec_create.status` ← `SPEC_STATUSES`、`spec_graph.direction` ← `SLICE_DIRECTIONS`、
  `spec_graph.edge` ← `LINK_KINDS`）——绝不是重新手写的字面量，因此 `core` 的一次重命名会随之流到这里而无需改动
  （由 `tools/tools.test.ts` 钉住）。
- `spec_create` 只写索引日后能读回的内容，并在三处检查这一点：目标路径经过 `core` 的
  `resolveSpecPath`（它还会产出该工具所报告的规范相对路径，因此其 `Created <path>` 永不与
  `spec_get` 会说的内容不一致）、组装出的字节在写入任何内容之前必须能解析回一个规范，以及写入本身是排他的
  （`flag: "wx"`），因此存在性检查既无法被竞争绕过，也无法被一个链接满足。
- 规范根是 `ctx.cwd`；每个根复用同一个 `SpecIndex`（新鲜度在 `core/` 中处理——见
  `module-spec-graph`）。`spec_update` 通过 `recordForId` 读取，以复用扫描的缓存读取；写入工具
  只负责写，下一次读取会拾取该变更。
