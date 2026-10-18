---
id: submodule-server-log
type: submodule-design
status: active
title: log —— 写往 stderr 与轮转支持文件的分级诊断
parent: module-server
depends-on: [submodule-server-persistence]
tags: [public-surface-checked]
---

## 职责

宿主的诊断记录：每个模块都通过 `logger(scope)` 而不是 `console.*` 记录日志。操作者看到可读的 stderr，
而同一批应用记录以结构化 JSONL 落到 `<dataDir>/logs/` 下，使用户能把它们发给 ThinkRail，供 agent
主导的复现与调查使用。只有通过本模块显式 logger 的调用才会写进持久文件；pi / 扩展任意
`console.*` 的参数只留在终端，因为它们可能含有提示词、工具数据或凭据。

## 目的地与轮转

- Pino 负责记录序列化。每一行 JSONL 都是一条独立的、带 schema 版本的记录，含 ISO 时间戳、数值 + 文本
  两种严重级别、scope、消息，以及在被提供时的结构化错误。仅追加的 JSONL 可流式传输，且一次被截断的
  末尾写入不会让更早的记录失效。
- `pino-pretty` 只把应用日志渲染到 stderr。持久文件保持为 Pino 的 NDJSON，而不是经过人类文本格式化器。
- `pino-roll` 拥有完整的文件生命周期：每日加 10 MB 大小轮转、生成的扩展名、大小核算、重启续接与
  清理。基名是 `thinkrail.jsonl`；生成的名字遵循所安装传输层的约定。保留十四个轮转文件加上活跃文件，
  这把通常的诊断存储量限制在约 150 MB 附近。适配器在打开之后调用一次所锁定传输层自己的清理例程，
  因为 `pino-roll@4.0.0` 否则只在一次进程内轮转之后才运行它；这样就在不复制其保留算法的前提下，为
  重启频繁、量小的宿主保住了这一上限。轮转跟随宿主的本地日历边界；记录时间戳仍为 UTC ISO 字符串。
- 滚动目的地同步写入，因此被接受的记录不会滞留在 worker 队列里。`crash.log` 仍是由
  `host/crashLog.ts` 拥有的、独立的同步纯文本致命报告，不在 pino-roll 的文件名集合之内。

## 级别与初始化

- `debug | info | warn | error`；默认阈值 **info**。该阈值同时门控 stderr 与文件。解析顺序：显式的
  `initLogging({ level })`（CLI 的 `--verbose` → debug）> `THINKRAIL_LOG_LEVEL`（本模块是该变量的
  唯一读取者；无效值会警告而不回显该环境变量的值，并回退到 info）> info。
- 在 `initLogging` 之前，`logger(...)` 调用只回显到 stderr 且不写任何文件，因此单元测试与库嵌入方
  绝不会隐含地长出支持文件。
- `initLogging` 异步打开 pino-roll，并首先被 `host` 的 `bootHost` 等待（绝不由 `createServer`
  等待；进程级日志属于进程所有者）。重复调用会重新解析级别，并发调用则等待同一个一次性打开器。直接
  的进程内流刻意避开 `pino.transport()` 的 worker 线程及其额外文件的二进制打包契约。

## console 边界

`console.debug/log/info/warn/error` 绝不被补丁或复制进持久文件。Pi、扩展与第三方包可能把敏感项目
数据放进任意的 console 参数里；没有任何结构化脱敏器能让它们的自由文本变安全。属于支持文件的宿主
诊断必须改为经过一次经过评审的 `logger(scope)` 调用，并配上刻意有界的消息。

## 失败与隐私边界

- 日志绝不能把宿主拖垮。初始化与日志调用在失败时降级为直接写 stderr；每个目的地的错误通道都被消费
  掉，而不经由 logger 回灌。
- 支持文件绝不刻意包含凭据、认证头、cookie、环境变量值、提示词/消息内容、文件内容、工具参数/结果，
  或 WS/协议负载。已知的结构化密钥字段作为纵深防御用 Pino 脱敏移除；调用点仍必须遵守封闭诊断规则，
  因为嵌在自由文本消息里的秘密无法从结构上脱敏。持久消息只可插值封闭的方法名、计数、生成的 id 与
  等价的有界元数据 —— 绝不是原始错误文本或由请求推导出的路径。一个显式批准结构化错误的调用点，只
  得到类型/消息/调用栈，绝得不到任意可枚举字段。

## 边界

- **拥有：** 进程级 Pino 适配器、级别/环境解析、带 scope 的门面、JSONL schema 与隐私策略、pino-roll
  配置与启动清理调用、漂亮的 stderr，以及独立崩溃报告所用的共享 `describeError`。
- **Public surface（公开接口，barrel）：** `logger`, `Logger`, `LogLevel`, `initLogging`,
  `InitLoggingOptions`, `setLogLevel`, `logsDir`, `describeError`
- **允许的依赖：** `persistence`（`dataDir`）；`pino`、`pino-pretty`、`pino-roll`；Node 的
  path/streams。
- **绝不触碰：** 导入任何其他兄弟模块或 `host`；被 `persistence` 导入（它是下面唯一的模块 —— 一条
  `persistence → log` 的边会形成环）。
