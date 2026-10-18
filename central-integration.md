---
id: central-integration
type: architecture-design
status: active
title: 通过 Central CLI 使用 JetBrains AI——跨模块生命周期
parent: architecture
depends-on: [module-shared, submodule-server-auth, submodule-server-agent, module-contracts, submodule-web-panels, submodule-server-settings, submodule-web-shell, submodule-web-store]
covers: [central-lifecycle, central-liveness, central-trust-boundary, central-artifact, central-quota]
tags: [providers, central]
---

## 驱动因素

JetBrains AI 模型通过用户自己的 `central` CLI 到达 ThinkRail，该 CLI 会把一个 `pi` 扩展写到一个全局路径，并报告
账号周期性的 AI 额度。因此 Central 表现为一条跨模块的链，而不是一个模块边界。它的端到端生命周期映射、存活性与
配额读取组合只存在于那条链里。

**边界：本节点拥有组合，除此之外没有别的。** 每个模块的规范对自己的接口保持权威，这里不复述——适配器的
argv/版本/配额解析契约是 [[module-shared]]，状态/动作/配额编排是 [[submodule-server-auth]]，运行时生成是
[[submodule-server-agent]]，同步的配额偏好是 [[submodule-server-settings]]，线上协议形状是 [[module-contracts]]，
提供商控件是 [[submodule-web-panels]]，全局读数是 [[submodule-web-shell]]。只影响一个接口的改动更新那个叶子，
而不是本文件。

## 这条链

唯一的端到端映射。每一列由表头中的模块拥有；这张表是唯一陈述它们之间*对应关系*的地方。

| 磁盘 / CLI 真相 | `inspectJbcentral` (`shared`) | 线上协议 `JbcentralStatus` (`contracts`) | 卡片 (`panels`) |
| --- | --- | --- | --- |
| 无法解析到 `central` | `absent` | `absent` | 宿主 OS 安装命令 + 重新检查 |
| 版本低于 `MINIMUM_CENTRAL_VERSION` | `outdated` | `outdated` | 引导式更新 |
| `--version` 无法解析 | `malformed-version` | `malformed-version` | 重装指引，无原生动作 |
| 探针启动/超时/退出失败 | `probe-failed` | `probe-failed` | 重新检查指引 |
| 二进制存在，产物缺失 | `supported` | `supported` | 连接 |
| 二进制 + 产物都存在 | `supported` + `configured` | `configured` | 已连接 / 断开连接 |
| ……且 `Auth` 行为 `not connected` | —（观察） | `signedOut` 标志 | 登录*替换*主操作 |
| ……且 `Proxy` 行已停止 | —（观察） | `proxyStopped` 标志 | 启动代理*替换*断开连接 |
| 有待完成的重建或动作进行中 | — | `configuring` | 旋转指示，不提供任何动作 |
| 候选运行时加载失败 | — | `load-failed` | 重试 / 断开连接 |

### 配额链

当配额显示被启用时，可见的 web 外壳按配置的 `1–3600` 秒节奏（默认 30 秒）请求一份封闭的配额快照。宿主先施加
同步的设置，以及提供商卡片标记为已连接时所使用的同一条健康 Central 谓词，然后服务端 `auth` 通过一个仅内存的
缓存/单飞去重读取者，并要求 `shared` 以 `central quota --json` 运行那个绝对二进制。`shared` 只接受周期性的
`remaining` + `total` 数字；`contracts` 只承载隐藏/可用/陈旧/不可用这些状态；`shell` 把它们立即渲染在宿主连接
状态的左侧。隐藏的前端不做轮询，被禁用/不健康的状态不执行任何配额读取，且不持久化任何配额值。生命周期边会清除
最后一次成功的回退值，使后续账号无法继承前一个账号的陈旧数字。

这张生命周期表编码了两件没有任何单个模块会陈述的事实：

- **`configuring` 与 `load-failed` 没有对应的探查项。** 它们是宿主重建机制的性质，而不是宿主文件系统的性质，因此
  只跟随 `shared` 的读者无法推导出它们。
- **登出与代理已停止这两个标志是单向的。** 只有被正面观察到的否定才会设置它们；未知永远不会。卡片把每一个都变成
  对主操作的*替换*，而不是一条注解，因为它绝不能宣传一个无法成功的动作。

## 决策

1. **一个被审查的产物把探查与运行时加载连接起来。** 适配器拥有它的位置、存在性判定与监视器；运行时只接收它那个
   不透明路径。因为已配置真相只使用存在性，就地替换依赖监视器而不是存在性轮询。本地机制在 [[module-shared]] 与
   [[submodule-server-agent]] 中保持权威。
2. **没有任何源自 Central 的文本到达客户端。** 进程适配器、扩展前的提供商允许列表，以及封闭的线上协议状态各自
   强制这条保证的一部分；它们的本地契约仍留在 [[module-shared]]、[[submodule-server-agent]]、
   [[submodule-server-auth]] 与 [[module-contracts]]。产物重新注册的内置提供商（`anthropic`、`openai`、
   `google-vertex`）是 Central 在卡片之外*变得*可见的唯一地方：它们仍是普通的提供商行，标记为
   `kind: "central"`（“JetBrains AI”），按注册身份归因，使用户能看到哪些提供商通过 Central 到达他们，而 Central
   的配置不需要任何一部分跨越线上协议。配额用一份结构化数字允许列表扩展这条规则：账号、套餐、用量、充值、补足、
   诊断与原始输出都留在宿主本地并被丢弃。
3. **配额是一次单独的读取，不是提供商状态，也不是宿主定时器。** 提供商生命周期与配额有不同的延迟/失败语义，而
   宿主拥有的定时器会在没有可见消费者的情况下运行。可见客户端拥有节奏；一个宿主缓存/单飞阻止它们成倍放大 CLI
   工作量。

## 不变量

1. **监视器的失效代表被审查产物上可能的边，而不是目录活动。** 平台事件分类与替换恢复机制只属于
   [[module-shared]]。
2. **每条进入 `configuring` 的路径都有有界的出口。** 动作受适配器超时约束；一个未完成的重建在排空过程收敛时退出。
   线上协议状态自身不携带任何截止时间。
3. **重建排空在有限时间内收敛所请求的状态，且与入站事件速率无关。** 防抖限制的是突发宽度，不是流的长度，因此它
   无法提供这条保证。

**不变量 3 目前被违反，由 issue #287 跟踪。** `runRebuildDrain` 会在准备期间 `requestedSequence` 发生变化时丢弃
已完成的候选，因此推进仍需要一个安静窗口，激活可能无限期地饿死。按产物划定范围的失效移除了已知的无关事件来源，
但不改变那个算法。

**复盘。** 当产物目录缺失时，监视器回退到 `pi` 的状态目录，并把无关的状态写入变成重建请求。排空的安静窗口假设
使 `configuring` 在反复准备运行时期间保持活跃。每个叶子契约在本地都是自洽的，但没有任何规范拥有它们在组合中的
存活性。

## 范围之外

适配器确切的 argv/模式/超时；提供商卡片与顶栏的交互/文案；设置校验；候选准备与生成激活；线上协议字段形状；引导
顺序；e2e 夹具（fixture）。每一项都留在自己的模块规范里——在这里列出只是为了让读者知道本文件不是改它们的地方。

## 使用方

[[module-shared]] · [[submodule-server-auth]] · [[submodule-server-agent]] ·
[[submodule-server-settings]] · [[module-contracts]] · [[submodule-web-store]] ·
[[submodule-web-panels]] · [[submodule-web-shell]] · [[module-cli]]（引导顺序） ·
[[module-browser-e2e]]（`00-jbcentral*`）
