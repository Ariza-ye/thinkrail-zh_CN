---
id: submodule-desktop-updates
type: submodule-design
status: active
title: 原生桌面更新
parent: module-desktop
tags: [desktop, updates]
---

## 职责

以一个控制器的形式拥有原生桌面更新器：仅向前的资格判定、显式的更新检查与完整包下载、状态快照，以及显式的
安装/重启交接。该控制器是 Electrobun 状态回调的唯一拥有者，并把它投射为 available、
transfer、preparation、ready 与 installation 阶段。Electrobun 对每个 SDK 操作做单飞（single-flight），
而控制器只保留防止重叠所需的跨操作排序。

## 边界

- **Public surface（公开接口）：** Electrobun 更新控制器与退出协调器的构造只经由 `index.ts` 导出；
  纯控制器、启用策略、依赖形状与生命周期实现保持在内部。
- **允许的依赖：** 来自 `@thinkrail/contracts` 的仅类型原生更新契约、SDK 适配器中的 `electrobun/main`，
  以及纯控制器中注入的生命周期回调。
- **绝不触碰：** web 或 server 导入；渲染进程选定的 feed URL；宿主线上协议方法；发布、签名或认证；
  草稿持久化；关闭（shutdown）所有权；第二个 SDK 订阅。

只有打包的、受支持的 stable/canary 构建——其发布元数据提供非空的 HTTPS 更新器基础 URL——才启用生产
适配器。打包元数据是唯一的 feed 权威；渲染进程输入与重复的应用 feed 常量都是被禁止的。开发与普通
artifact 接缝保持禁用。测试向控制器注入更新器依赖，而不是改动生产 feed 选择。

手动动作立即确认，而工作通过状态修订继续推进。更新检查只由用户显式触发；启动、窗口就绪、空闲与操作失败
都不触发检查，不保留定时轮询或自动重试。较新的未准备 offer 变为 `available`，
**Download** 拥有传输与准备，且只有匹配的较新 `updateReady` 结果才变为 `ready`。传输到达 100% 并不是
就绪：Electrobun 的解压/准备阶段仍然单独可见。Electrobun 2.0.1 不暴露任何取消进行中下载或丢弃已准备包的
操作，因此在应用持续运行期间，传输与准备会继续到完成或出错；关闭 Settings 只会推迟安装。UI 不得在原生
工作仍在继续时声称已取消。错误保留失败的那个阶段，因此重试会重复原本想做的操作，而已准备的包在无关的
检查失败后仍然存活。**Install & Restart** 应用那个包而不重新拉取 feed；Electrobun 的原生 helper 在交接
期间拥有最终的载荷校验。
