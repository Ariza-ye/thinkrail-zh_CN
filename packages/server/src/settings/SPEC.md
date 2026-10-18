---
id: submodule-server-settings
type: submodule-design
status: active
title: settings —— 服务端同步的应用配置
parent: module-server
depends-on: [module-contracts]
---

## 职责

服务端同步的应用配置：不透明的固定主题选择、fixed/system 模式与可选的浅色/深色配对、附加分析
（analytics）偏好与首次运行对话框完成标记、宿主拥有的新聊天模型与努力度默认值、终端回放预算与
Windows shell 偏好、聊天输入框增长预设、聊天/文件视觉行宽及各自独立的分栏上限、有界的自定义布局
预设目录、JetBrains 配额显示/节奏、宿主范围的子代理默认值、计划评审策略，以及用户关掉的宿主注册表
扩展。`defaultModel` / `defaultEffort` 选择每个新聊天收到的默认值（未设置的模型意味着首个可用；
未设置的努力度意味着 medium）；`reviewModel` / `reviewEffort` 选择评审者运行时（未设置意味着同样的
新聊天默认值）；`reviewAutoFix: false` 记录 `request_changes` 裁决并等待，而不是自动发送修复。
**`favoriteModels`** 是选择器里按显示顺序排列的星标列表 —— 一次整列表的客户端写入，按模型形状的
条目校验并用 `sameModel` 去重；**`recentModels`** 由宿主拥有：`noteRecentModel(model)`（由 `host`
在一次显式的 `session.create` 模型与每一次 `session.setModel` 时调用）把该模型放到最前、去重、上限
为 `RECENT_MODELS_LIMIT`、持久化并发布，而 `settings.update` 中客户端提供的 `recentModels` 会在
校验之前被丢弃，因此没有任何客户端能改写宿主关于“选了什么”的记录。
本模块读取、规范化、持久化、缓存并广播那些刻意跨前端跟随属主的值。

当前工作台框架、工作区资源放置、当前/默认预设选择、侧栏/底部分组上限、选中与焦点被明确地排除在外。
它们是 [[submodule-web-shell-layout-state]] 之下的前端界面本地视图状态。内置布局预设仍由 web 拥有。

当一个领域拥有安全上限时，数值型设置由该使用方设定边界 —— 例如 `terminal` 会钳制 `terminalReplayKb`，
因此手工改过的配置无法耗尽内存。设置校验共享的 40–240 行宽契约与自定义布局预设，因为它拥有它们的
跨前端存储契约。它还校验全局的 `jbcentralQuotaEnabled` 布尔值与完整的 `jbcentralQuotaRefreshSeconds`
间隔（`1–3600`，默认 30），因为这些值在每一个前端之上支配宿主进程的节奏。

## 边界

- `settleIdleDays` —— Settled 货架的空闲窗口：一个正整数天数（钳制在 1…365）或 `null` 表示永不；
  默认 `7`。像其他每个已知字段一样校验；手工改成的非数字回退到默认值，而不是禁用结算。
- **拥有：** 缓存的当前 `AppConfig`；`getConfig()`；`updateConfig(partial)`（拒绝非对象或未知键 →
  合并 → 校验已知字段 → 持久化 → 发布合并后的 `AppConfig` 与成功应用的 `AppConfigUpdate`）；行宽
  与不含资源的自定义预设校验/规范化；自定义预设的安全上限；`setSettingsPublisher`；以及供测试使用的
  `resetConfigCache`。
- **Public surface（公开接口，barrel）：** `getConfig`、`updateConfig`、`noteRecentModel`、
  `setSettingsPublisher`、`SettingsPublisher`、`resetConfigCache`，外加持久化加载之后宿主启动所用的
  纯函数自定义预设规范化。
- **允许的依赖：** `persistence`（`loadConfig`/`saveConfig`）；`contracts`（`AppConfig`、
  `LayoutPreset`、`isTerminalWindowsShell`）。
- **绝不触碰：** host 或另一个特性兄弟；当前布局文档/快照类型；工作区 id/资源；当前框架校验；拥有
  WS 频道；或导入 web 的预设定义。

## 必须做对的事

- **靠广播收敛，客户端不乐观更新。** `updateConfig` 在替换活缓存或发布之前持久化；写入失败既不改动
  运行时读取，也不改动前端。发布器收到用于广播的完整合并配置，以及已被应用的局部更新，使宿主使用方
  能区分一次显式的字段写入与一次无关的合并。每个前端（包括发起者）都采纳 `settings.changed`。
  `server.welcome` 播种同一个缓存值。
- `terminalWindowsShell` 默认为 `"auto"`；持久化值通过 persistence 的共享 `isTerminalWindowsShell`
  护栏回退，而一次落在封闭 shell 联合之外的线上改动会在缓存、持久化或广播发生任何变化之前拒绝整次
  更新。设置拥有校验与同步；`terminal` 拥有可执行文件解析与派生进程。
- `chatLineWidth` / `fileLineWidth` 各自独立默认为 120，且只接受 40 到 240 之间的有限整数；它们的
  `Bounded` 开关各自独立默认为 `true`。格式错误的存储字段会回退而不会丢弃合法的兄弟字段；任何被
  提供但无效的字段都会在缓存、持久化或广播发生任何变化之前拒绝整次改动。
- `subagentsEnabled` 缺失时默认为 `true`，使旧配置保持当前行为；一个存在但非布尔的更新会在缓存、
  持久化或广播发生任何变化之前被拒绝。设置只拥有那个全局默认值；工作区覆盖与有效值解析留在本模块
  之外。
- `subagentMaxConcurrent`（每个聊天的并发子代理数）在磁盘上缺失或格式错误时默认为 4；一次落在
  `isSubagentMaxConcurrent`（完整 1–16）之外的线上更新会拒绝整次改动 —— 绝不钳制。与
  `subagentsEnabled` 一样，settings 只拥有全局值。
- `disabledExtensions` 列出用户关掉的宿主注册表扩展 `name`；缺失意味着 `[]`（每个扩展都开）。线上
  更新必须是非空白字符串的列表，否则整次改动被拒绝；重复项被去重，而**未知名字被保留** —— 决定一个
  名字含义的是注册表，不是设置，因此一条为已移除扩展留下的过期条目绝不会破坏启动或之后的更新。
  格式错误的存储列表保留其合法名字。设置只拥有该列表；`host` 把它变成 agent 的解析器与活的工具刷新
  （[[module-server]] § 宿主中介的策略）。
- JetBrains 配额显示默认开启，且当任一存储字段缺失/无效时其间隔默认为 30 秒。线上更新以原子方式拒绝
  非布尔的标志或非整数/越界的间隔；它们绝不把调用方的值钳制进另一个持久化选择。
- 主题的可用性/标签/调色板、操作系统外观，以及有效主题都不是服务端的关切。`theme` 仍是不透明的固定
  选择；`themeMode` 默认为 `"fixed"`，而 `systemThemePair` 在首次使用之前保持缺失。持久化的配对只有
  在两个槽位都是字符串时才被保留；格式错误的配对会被丢弃，而没有保留配对的 system 模式会规范化为
  fixed，且不会替换一个有效的 fixed id。缺失/无效的模式同样规范化为 fixed，而一个独立有效的休眠配对
  可能存活下来。进入 system 模式需要一个完整的、形状合法的既有或传入配对；一次配对改动会原子地替换
  两个槽位。未知 id 仍被持久化，供每个独立发布的前端按所需外观自行解析。
- 一次携带 `theme` 但没有显式 `themeMode` 的 `settings.update` 是向后兼容的固定主题动作，并把模式设为
  `"fixed"`。因此一个连接到 system 配置宿主的旧客户端，绝不可能表现得只改变了自己：它那个刻意的主题
  选择会经由常规的“先持久化后广播”路径退出 system 模式。
- 已退役的宿主布局与会话消息顺序字段，以及宿主拥有的 `recentModels`，会从更新中丢弃而不报错，而不是
  被持久化或广播，因此仍在发送它们的旧客户端继续可用。布局实例化与对话记录顺序是前端本地的偏好。
- **更新键是封闭集合；存储键则不是。** `updateConfig` 在缓存、持久化或广播发生任何变化之前，拒绝非
  对象的负载以及任何不在 `AppConfigUpdate` 加上已退役键之内的键。被接受的集合对着 `AppConfigUpdate`
  做编译期检查，因此增删键的契约变更会让构建失败，直到集合与之一致。磁盘上已有的未知键仍会加载，并在
  之后的有效更新中存活，因此较旧的宿主能保住较新宿主的设置。较新的客户端必须按宿主协议版本给任何新键
  加门控，就像 `THEME_SYSTEM_PROTOCOL_VERSION` 给外观设置加门控那样；较旧的宿主会拒绝整次更新，而
  不是持久化一个未知键。
- **一个被接受的键在进入合并之前会做值检查；只有努力度级别是被信任的。**
  `terminalReplayKb` 必须是有限数字（其范围留在 `terminal`，它在读取时钳制），`composerGrowthLimit`
  必须是封闭增长预设之一，`defaultModel` / `reviewModel` 必须为 `null` 或形如 `favoriteModels` 条目
  的模型，此外还有其他字段已有的类型化检查。一个格式错误的值会在缓存、持久化或广播发生任何变化之前
  拒绝整次更新，与未知键完全一致。`defaultEffort` / `reviewEffort` 携带 pi 的 `ThinkingLevel`，
  而 `contracts` 没有它的运行时列表，因此它们只靠线上类型通过，新聊天解析器会经由 pi 钳制一个未知
  级别；把级别列表加进 `contracts` 才是关闭这个口子的办法，而不是设置模块本地的一份副本。
- 自定义布局预设是一次完整的顶层目录替换，而不是逐项的嵌套补丁。每个值都是有界的、不含资源的、唯一
  标识的、只使用当前预设 schema，且不含任何工作区/标签页/会话/终端身份。一个格式错误的持久成员会在
  配置校验期间被隔离；一次含任何格式错误成员的线上改动会被整体拒绝。不读取也不升级任何备用配置键或
  旧预设 schema。
- 删除或编辑自定义预设只改变共享定义。它不能改动任何前端已实例化的框架或本地默认选择。
- 分析（analytics）偏好与首次运行对话框完成是被校验的布尔值。该对话框可以只持久化默认开启的偏好；
  仅写偏好绝不推断完成。没有偏好的确认会被拒绝，而改变一个已确认的决策会写入两个字段。投递门控属于
  [[submodule-server-analytics]]；对话框生命周期属于 [[submodule-web-panels]]。
- `null` 清除可选的 `defaultModel`/`defaultEffort` 与 `reviewModel`/`reviewEffort` 覆盖；它是仅存于
  线上协议的哨兵值，绝不持久化。
- 存储的 `favoriteModels` / `recentModels` 若不是数组，会在加载时回退为 `[]` 而不丢弃合法的兄弟字段；
  一个含任何非模型成员的线上 `favoriteModels` 会拒绝整次更新。
