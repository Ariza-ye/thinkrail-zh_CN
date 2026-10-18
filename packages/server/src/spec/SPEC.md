---
id: submodule-server-spec
type: submodule-design
status: active
title: spec —— 工作树规范图读取
parent: module-server
depends-on: [module-contracts]
references: [module-spec-graph]
tags: [spec-viewer, public-surface-checked]
---

## 职责

为只读的 Specs 查看器提供服务：把活跃工作树的规范图（`spec.graph`）整体快照映射为线上协议 DTO。
按需读取 —— 每次调用都通过派生索引重新读取（读取时重新校验），因此由 agent、编辑器或 git 编辑过的
规范在下一次获取时就是最新的。（兄弟模块 `watch` 另行提示客户端重新获取 —— 那是失效推送，不是数据
推送；本模块的读取路径保持只拉取。）此外还回答项目级的 **`projectHasSpecs(root)`** —— 某个仓库是否
带有*任何持久*规范（任何 `type` 不是临时性的 `task-spec` 的节点）—— `host` 通过**惰性的
`project.hasSpecs`** 方法暴露它（这是一次全树遍历，因此只为 Welcome 屏幕渲染的那一个项目请求它，
绝不为每个项目提前请求）。

该读取是**同步**的（core 的遍历是同步-文件系统操作，每次调用 O(工作树目录数)）。这是可接受的 ——
获取是按需的（工作区激活 / 一次 `workspace.fsChanged` 提示 / 错误态下的重试，没有轮询），且逐文件
解析缓存会跳过重复读取。如果遍历某天成为瓶颈，升级方向是 core 的**把监视器当作脏标记**（见
`pi-spec-graph` 的 core/SPEC.md），而不是一个异步包装 —— 后者依然会把事件循环整块阻塞。

## 边界

- **拥有：** `specGraph(workspaceId) → SpecGraphSnapshot` —— 通过每个工作区一个的 `SpecIndex` 读取
  该工作区的工作树（在多次调用之间复用，使解析缓存物有所值—— 与 agent 工具同一模式），并把 core 的
  `SpecNode` 映射为 `contracts` 的 DTO（字段集住在那一边；`title` 回退到 `id`，因此线上协议绝不
  携带无标题节点）。**仅做映射** —— 没有遍历逻辑；树由客户端构建。`evictSpecIndex(workspaceId)`
  —— 丢弃缓存的索引；`host` 在 `workspace.remove` 时调用它，使被归档工作区的解析缓存不会比它活
  得更久（之后再读只会重建）。**`projectHasSpecs(root) → boolean`** —— 某个仓库**根**（不是工作树）
  是否带有任何**持久**规范（任何 `type` 不是 `task-spec` 的节点 —— 一个临时性的草稿 task-spec，
  例如位于 `.thinkrail/context/` 下的，绝不可发出“已设置好”的信号），通过每个根一个复用的
  `SpecIndex` 判断；这是 Welcome 屏幕“设置项目”建议背后的项目级信号。在 glob/解析失败时降级为
  `false`，因此它绝不会破坏 `project.open` / `project.list`。
- **Public surface（公开接口，barrel）：** `specGraph`, `evictSpecIndex`, `projectHasSpecs`
- **允许的依赖：** `persistence`（工作区查找）；`contracts`（DTO）；**`pi-spec-graph/core`**（无 pi
  的读取模型 —— 宿主侧对该扩展包唯一的值导入，已由 `module-spec-graph` 认可）。
- **绝不触碰：** `host`；兄弟特性；`pi-spec-graph` 的扩展入口或 `tools/`（与 pi 耦合）；任何 pi 包。
