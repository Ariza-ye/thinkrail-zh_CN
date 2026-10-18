---
id: submodule-web-updates
type: submodule-design
status: active
title: updates — 可选的应用更新能力
parent: module-web
depends-on: [module-contracts]
tags: [ui, updates]
---

## 职责

在本地原生更新权威或宿主拥有的 CLI 更新生命周期之上，拥有唯一一套应用更新呈现。本模块把这些能力归一为一个
外壳 hook、一个软件更新设置界面，以及一个持久状态可供性，而不让 UI 知道运行的是哪个启动器。

## 边界

- **Public surface（公开接口，`index.ts`）：** `useUpdates`、`UpdateSettings` 和 `UpdateReadyButton`。
- **外部依赖：** React、Remix Icon、`@thinkrail/contracts` 类型、同级的 store barrel，以及
  `@thinkrail/ui/button`。
- **绝不触碰：** Electron/Electrobun 导入；server/shared/transport 导入；启动器名称检查；渲染进程选定的
  feed URL；更新检查/下载/安装逻辑；浏览器提供的 shell 命令、路径、频道、版本或 URL；草稿保存、输入保护、
  渲染进程准备，或任何第二个原生重启同意步骤。

可选且冻结的 `__THINKRAIL_NATIVE_UPDATES__` 桥仍是原生权威。它的适配器在初次读取之前先订阅，在一个摄取点
接受单调递增的修订号，并用失败的那个阶段包装被拒绝的请求。原生快照保持外壳本地，绝不进入 Zustand。
检查会为可用版本暴露 **Download**；传输进度在就绪状态暴露 **Install & Restart** 之前成为独立的
**Preparing update** 阶段。关闭 Settings 就是推迟动作。禁用/来源的原生状态不暴露任何分区。UI 把打包的
`canary` 身份称作 **nightly**，而不改变 feed 选择。

可选宿主快照经由带版本的线上协议到达，并在 store 中同步。它在临时断连期间保持可见，下一次 welcome 会替换
或清除它。当前的宿主暴露 available/running/succeeded/failed 状态和一个 **Run Update** 动作；该动作发送一个
空的、受版本门控的请求，由宿主独自选择并运行它的更新命令。成功之后仍要求手动重启宿主。较旧的宿主保留固定
的 `thinkrail update` 指引。任何命令文本或任意诊断信息都不跨越线上协议。

只要存在原生桥，它就始终胜过宿主状态，包括其能力仍在解析或已禁用之时。两种能力都不可用时，Updates 设置
分区与可供性都不出现。在整个可操作的原生与宿主阶段，顶栏始终是回到 Settings 的路径，而不只是在安装包
就绪之后。
