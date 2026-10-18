---
id: submodule-server-persistence
type: submodule-design
status: active
title: persistence —— JSON 应用状态
parent: module-server
depends-on: [module-contracts]
---

## 职责

宿主侧的持久状态——项目、工作区、跨前端的应用配置、终端目录、会话完成回执、安装身份，以及仅在服务端
存在的获取状态——以 JSON 形式存放在数据目录下。当前工作台框架与工作区放置是前端本地的，没有宿主
持久化。

## 边界

- **拥有：** `dataDir()`（开发/e2e 隔离时用 `THINKRAIL_DATA_DIR`，否则 `~/.thinkrail`）；项目/
  工作区/配置的加载-保存操作，以及基于 `DEFAULT_CONFIG` 的逐字段校验，同时保留未知的顶层扩展字段；
  带版本的原子 `session-lifecycle.json`（最近一次观察到的已结算完成 + 显式取消的运行 id）、
  `session-receipts.json`（首次安装基线完成 + 会话→已处理的完成 id）与 `turns.json`（每个工作区的
  agent 运行变更集，由 `turns` 拥有）；仅服务端使用的 `installation.json`（`{ id, appInstalled?:
  true }`）与仅用于 campaign 的 `attribution.json`。不轮转的安装 UUID 绝不跨线上协议传输。
- **Public surface（公开接口，barrel）：** `dataDir`、项目/工作区/配置与终端目录的加载-保存操作、
  会话回执的加载-保存操作、只返回 `{ id }` 的 `ensureInstallation()`、范围很窄的安装/浏览器认领
  操作，以及严格的获取信息读取/保存。初始 ID 的创建通过原子的不覆盖硬链接发布一个完整的同级临时
  条目，并重读并发产生的胜者；格式错误的既有记录会被保留。一个独占的安装认领标记在多个进程之间选出
  一个打包宿主。完整的安装 JSON 被原子替换；捕获到的替换失败会移除该标记与临时条目以便重试，而在
  认领之后崩溃可能消耗掉该事件却不发出。旧版已安装记录保持已被认领。
- **浏览器尝试：** `attribution.json` 用 `wx` 独占创建其首个 `{ browserClaimAttempted: true }`
  标记。兑换会以严格的首次/末次触点字段（有界的 UTM 值、来源分类、时间戳与策略版本）原子替换它；
  网络或替换工作失败会让该尝试成为终态。保留期为 `last_touch` 之后 30 天：过期或无效记录成为终态。
  持久化的 schema 拒绝认领/校验器/挑战/URL、journey/bridge id、IP 与 user agent。其他状态没有
  跨进程锁。
- **允许的依赖：** `contracts`（`Project`、`Workspace`、`AppConfig`、`LayoutPreset`、
  `DEFAULT_CONFIG`、`isTerminalWindowsShell`）；Node 的 `fs`/`os`/`path`。
- **绝不触碰：** 导入特性兄弟或 `host`；推导会话状态；存储对话记录内容、缓存的运行/输入状态或本地
  激活；把生命周期元数据与已读回执合并；持久化当前框架/视图、选中/焦点或前端界面身份；读取备用的
  配置键或旧 schema；读取、重写或删除旧的宿主布局快照。

会话元数据的写入是整份拷贝的临时文件替换。生命周期只持久化对话记录无法证明的事实——`agent_settled`
结果与显式 Stop——并以活跃的运行/完成 id 为键；过期记录绝不适用于更新的轮次。加载会报告每个文件是
已加载、缺失还是被搁置。除非两个文件都加载成功，否则属主会先跑一次针对既有完成 id 的预服务基线，
使历史不会点亮；未解析的输入绝不进入基线。不可读的文件（I/O、解析或 schema 失败）绝不阻塞宿主
启动：它会被重命名为 `<file>.corrupt-<epoch-ms>` 以便诊断（尽力而为）并当作缺失处理，因此重新
建基线会把既有完成标记为已读。用可能未被看到的注意换一个能启动的宿主是刻意的：一个
v0.2.0-nightly.16 的宿主曾因一个坏的 `session-receipts.json` 而拒绝启动，直到用户把它删掉。
写入失败保持保守：它们可能让注意重新浮现或保留它，但绝不把未被看到的工作记录为已读。

分析（analytics）配置独立地保留一个已保存的布尔偏好，以及一个有效的 `analyticsConsentConfirmed`
布尔值；缺失/格式错误的值默认为 false。仅写偏好绝不意味着完成。设置负责初始偏好的预热，以及
偏好加确认的写入。

配置校验会把封闭的主题模式加上完整的、不透明的系统配对、封闭的输入框增长偏好、封闭的 Windows
终端 shell 偏好（无效/缺失 → `DEFAULT_CONFIG.terminalWindowsShell`）、聊天/文件行宽及其分栏绑定
开关，以及 JetBrains 配额布尔值 + 完整的 `1–3600` 秒节奏规范化到各自的默认值之上；它只接受当前
有界的 `customLayoutPresets` 目录作为同步的布局数据。当前/默认预设 id、分组上限与会话消息顺序不是
配置字段；已退役的配置形态被剥除，而不是被升级或作为扩展保留。历史 `layouts/` 文件保持原样且
惰性无害。
