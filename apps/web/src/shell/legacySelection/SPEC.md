---
id: submodule-web-shell-legacy-selection
type: submodule-design
status: active
title: shell/legacySelection — 临时选择兼容适配器
parent: submodule-web-shell
tags: [layout, legacy, adapter]
---

## 职责

容纳从工作台本地注意到迁移时代活动编辑器、预览与终端镜像的临时桥，那些镜像由功能渲染缓存使用。

## 边界

- **拥有：** 把选中的中心放置解析为匹配的编辑器缓存或终端目录键；原子地清除不兼容的遗留镜像；以及当某个
  缓存身份在稳定的放置之下被修复时重新运行。
- **Public surface（公开接口，`index.ts`）：** 已挂载的兼容 hook，以及工作台回调使用的命令式注意变更适配
  器。
- **外部依赖：** web 本地中心资源类型；store 选择器与唯一的遗留镜像动作；React。
- **绝不触碰：** 改变 frame 或工作区放置、递增导航、传输层调用、面板/会话/终端生命周期、server/shared/pi
  导入，或成为第二个注意权威。

外壳对 `activeTabByWorkspace` / `activeTerminalByWorkspace` 兼容状态的所有写入都经过本模块。移除这些镜像
仍是一次独立的迁移，不属于本次重构。
