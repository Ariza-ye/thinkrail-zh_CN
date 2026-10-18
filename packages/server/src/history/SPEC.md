---
id: submodule-server-history
type: submodule-design
status: active
title: history —— 聊天历史搜索索引
parent: module-server
depends-on: [module-contracts]
tags: [history]
---

## 职责
`history.search` 的后端：一个覆盖 pi 会话 JSONL 文件的**惰性内存索引**（提示词召回 + 整段对话
匹配）。它**自己**枚举并读取会话文件（异步 `readdir`/`stat`/`readFile`，复刻下面钉定的 pi 发现
布局）—— 在任何搜索/刷新路径上都**绝不调用 `SessionManager.listAll()`**：`listAll` 会把*每个会话
文件整体读出并 JSON 解析*，只为构建它的 `SessionInfo`（其中的 `messageCount`/`allMessagesText`
我们从不使用），所以通过它做一次索引刷新，即使什么都没变也要付出整个语料的代价，而且是在每个
活会话共享的事件循环上。它**绝不写入**会话文件。因为发现逻辑会遍历磁盘上的每个 pi 会话，宿主
处理器的 `all` 范围（`host/historyScope.ts` 的 `filter = () => true`）有意也暴露任何已注册
ThinkRail 工作区之外的 pi-CLI 会话 —— 比 `session.getMessages` 自己为单个会话所能暴露的略多
一点，但与一个按所有者划分范围的宿主一致（没有多租户隔离需要维护）。

## 设计
- `extract.ts` —— 纯函数 JSONL→`ExtractedSession | null`（`extractSession`）：会话的身份
  （`id`/`cwd` 取自头部，遵循 pi 自己的拒绝规则 —— 第一个可解析条目必须是 `type: "session"`
  的头部且带字符串 `id`，否则为 `null`）、它的 `title`（**最新**一条 `session_info` 条目的
  名字，包含显式清空 —— 与 pi 的 `buildSessionInfo` 相同的"最新者胜"规则），以及它的
  `HistoryEntry[]` —— 全部来自**一次解析**，所以索引从不需要第二个来源（`listAll`）去取元数据。
  Pi 会话文件是**树**（被弃用的分支），压缩（compaction）会重写它们，所以它按 pi 的方式解析
  该文件，之后再交给客户端渲染 —— `parseSessionEntries` → `migrateSessionEntries` →
  `buildSessionContext`（跟随当前叶子、应用最新的压缩、丢弃被摘要/被弃用的条目）—— 然后为
  解析出的消息建索引，经 contracts 的 **`isTranscriptMessageRole`** 过滤，也就是
  `getSessionMessages` 发送时所用的同一个守卫（一份策略，不是它的本地副本）。于是
  `messageIndex` 与客户端的 `turnIdByMessageIndex` 精确吻合（没有原始文件顺序的漂移），被弃用
  /被摘要的文本也绝不会变成命中 —— 压缩摘要会被发送（它渲染客户端的压缩标记），所以它占掉一个
  索引槽位但不可搜索。内部的 `TODO_NUDGE_PREFIX` 控制消息（在 hydrate 时对对话记录隐藏）在其
  索引槽位被占用之后被跳过，从而保持对齐；一个**被取代的自动重试尝试**（contracts 中共享的
  `isRetriedAttempt` —— 一个出错的 assistant 紧跟另一个 assistant，即 pi 的 `_prepareRetry`
  产生的相邻形状，hydrate 会把它渲染为没有轮次 / 空锚点）也以同样方式跳过，所以失败的部分输出
  的文本绝不会变成只能解析为"找不到该消息"的命中。条目文本是**完整的，绝不截断** —— 一次命中的
  `text` 就是召回所插入的内容，也是浮层预览作为整个提示词呈现的内容，所以加上限会静默损坏对
  很长的粘贴日志提示词的召回，并使超出截断点的词无法搜索（先例是 pi 自己：
  `SessionInfo.allMessagesText` 把每个会话的完整文本都放在内存里）。工具结果/思考不建索引。
- `historyIndex.ts` —— `HistoryIndex`：首次搜索时冷构建（逐文件异步 IO 让出事件循环；阻塞搜索
  到一个预算为止，然后返回部分结果并带 `indexing: true`）。发现过程是它自己的异步枚举（钉定的
  布局见下面"pi 文件格式"）：自定义 `sessionDir` 是一个扁平的、非递归的 `.jsonl` 文件目录；默认
  根是 `<agentDir>/sessions` —— agent 目录**每次刷新**都通过 pi 导出的 `getAgentDir()` 解析，
  它实时读取 `PI_CODING_AGENT_DIR` —— 持有一层按 cwd 分的目录，包括 Pi 视为候选目录的顶层
  符号链接。损坏的或非目录的符号链接退化为与 Pi 相同的"目录不可读即空"结果。新鲜度 =
  `(mtime, size)` 重新校验，节流到约 2 s（pi 会向文件追加实时消息，所以文件*本身*就是实时馈源
  —— 不需要 agent 模块钩子；size 与 mtime 一起比较，这样落在同一粗糙 mtime tick 里的追加仍会
  触发重载）；只有**新增或变化**的文件会被读取（读一次，`readFile`）并重新解析 —— 未变的语料
  只花一次 `readdir` 遍历 + 每个文件一次 `stat`，没有读取，没有解析。热态重新校验在**后台**
  运行 —— 批量变化（重启后的首次刷新、一次 git checkout）仍可能意味着大量解析，所以搜索绝不
  阻塞在它上面；结果最多有一个周期的陈旧，而后台刷新自己吞掉自己的错误（未处理的 rejection
  可能让进程内宿主崩溃）。只要有构建在进行（冷的或后台重新校验），就上报 `indexing`，这样客户
  端的重试循环会一直轮询，直到刚写入的会话落地 —— 读你所写，且不阻塞搜索。匹配：对按空白切分
  的词做大小写不敏感的子串 AND（查询长度与结果 `limit` 在处理器和 `search()` 两处都被夹到协议
  上限 `MAX_HISTORY_QUERY_LENGTH`/`MAX_HISTORY_LIMIT`）；严格按新近排序；提示词按归一化文本
  去重、保留最新；带上限与真实总数。消息段（以及 `messageTotal`）只过滤 `role === "assistant"`
  —— 一个 user 角色的命中必然与它自己的提示词条目文本重复（在这次提取里用户文本*就是*提示词），
  所以它不会增加文本，只会增加一个位置；那个位置改为通过下面两个字段移到提示词命中上。
- 跳转锚点是抗漂移的：命中携带客户端会校验的 `anchorText`（消息文本前缀）。
  现在每个提示词命中还携带其保留的最新一次出现的 `messageIndex`/`anchorText` ——
  也就是 `MessageHit` 一直拥有的同样两个字段 —— 从而使提示词行本身也可跳转。这两个字段在
  `PromptHit` 上都是可选的（仅当宿主早于本特性时才缺失）。
- `testFixtures.ts` —— 仅测试用的会话文件构建器（由 A5 钉定）：`writeFixtureSession` 写出一个
  最小但真实的 pi 形状 JSONL，每个会话一个扁平文件，供 `historyIndex` 测试、e2e 夹具播种器，
  以及它自己的格式钉定测试（`testFixtures.test.ts`）驱动；`defaultSessionDirFor` 复刻 pi 私有的
  默认布局目录编码（不可导入 —— 见下面"pi 文件格式"），这样夹具可以落在真实的、无参
  `listAll()` 实际会去找的地方。

## 磁盘上的 JSONL 结构（观察自 pi 会话文件）
- **`message` 条目：** `{ type: "message", ..., message: { role: "system"|"user"|"assistant"|"toolResult", content: string|array, timestamp: ms-number } }`。
  System 消息携带提示词 `sections` 和/或 `toolsAdded`/`toolsRemoved`；首个请求持久化完整的 system
  消息，之后的提示词/工具变化持久化为补丁。`isTranscriptMessageRole` 排除 system，
  所以它不渲染对话记录行，也不占用 `messageIndex` 槽位。一个 `toolResult` 若其工具跑过嵌套
  调用（`ctx.executeTool`），会携带一份有界的 `nestedCalls` 记录；它本身不是对话记录行。
- **`usage` 条目：** `{ type: "usage", ..., kind, provider, model, usage, note? }`；它们对对话树
  和上下文隐藏，但 pi 把其中的 token/成本数据计入会话总计。压缩条目可在其摘要之外携带一份
  `systemMessage` 快照。
- **`custom_message` 条目：** `{ type: "custom_message", customType: string, content: string|array, timestamp: ISO-string, display: boolean, ... }`。
  它们没有 `message` 包装，会成为角色为 `custom` 的上下文消息。

## pi 文件格式（`@earendil-works/pi-coding-agent`，目录钉定的版本）
已对照已安装的 `dist/core/session-manager.{js,d.ts}` 核实。pi 升版时请重新核实这些事实；
`testFixtures.ts` 与 `historyIndex.ts` 都依赖该发现布局。
- **头部：** pi 写出 `{ type: "session", version: 3, id, timestamp, cwd, parentSession? }`；`CURRENT_SESSION_VERSION = 3`。
  读取方要求第一个*可解析*条目是带字符串 `id` 的会话头部（不一定是物理第 1 行）。
  `cwd` 从该头部恢复；头部缺失/非法则拒绝该文件。
- **命名与自定义目录：** 发现过程只考虑名字以 `.jsonl` 结尾的直接子项；pi 写出
  `<ISO timestamp with ':' and '.' replaced by '-'>_<sessionId>.jsonl`，但文件名除此以外没有含义。
  `list(cwd, sessionDir)` 与 `listAll(sessionDir)` 使用扁平、非递归的自定义目录；自定义列表过滤
  仍然把头部 `cwd` 与 `cwd` 比较。放在子目录里是不可见的。
- **默认布局：** 无参 `listAll()` 扫描 `<agentDir>/sessions/` 一层深，先考虑子目录与符号链接，
  再考虑它们的直接 `.jsonl` 子项。不可读或断链的目标不贡献文件。每个 cwd 目录是
  `--<resolved cwd with a leading slash removed and slash/backslash/colon replaced by `-`>--`；
  `getDefaultSessionDirPath` 是私有的，
  而 `getDefaultSessionDir` 未从包根导出。`defaultSessionDirFor` 复刻它。
- **文件何时出现：** 一个新会话的文件在它持有 user 或 assistant 消息后才首次写出（仅安装用的会话
  不留文件），所以首轮永不完成的提示词仍然在磁盘上。
- **环境：** `getAgentDir()` 在被调用时读取 `PI_CODING_AGENT_DIR`，所以在 SessionManager 发现
  调用前改变该变量会改变 pi 使用的根。

## 边界
- **Public surface（`index.ts`）：** `HistoryIndex`, `getHistoryIndex()`, `matchesTerms`, `makeSnippet`,
  `clampLimit`, `extractSession`, types. **没有测试辅助函数** —— `writeFixtureSession`/`defaultSessionDirFor`
  是写磁盘的仅测试构建器，绝不能进入运行时模块图；它们只能通过 server 包专门的
  **`@thinkrail/server/history-test-fixtures`** 子路径导出（package.json）到达，这是被批准的测试
  边界 —— 与 `@thinkrail/server/agent` 相同的模式。包内测试相对导入它们（`./testFixtures`）；
  e2e 播种器导入该子路径。
- **允许的依赖：** `@earendil-works/pi-coding-agent`（`getAgentDir` —— 默认会话根 —— 加上
  `extract.ts` 使用的导出会话树辅助函数
  `parseSessionEntries`/`migrateSessionEntries`/`buildSessionContext`；生产代码里**不用
  `SessionManager`** —— 见职责。测试可以用 `SessionManager` 对着真家伙*钉定*布局/格式事实）、
  `@thinkrail/contracts`、`node:fs`、`node:fs/promises`、`node:path`。
- **绝不触碰：** 导入 `agent`/`workspaces`/`projects`（范围映射由宿主处理器通过传入 `search()`
  的 `filter`/`labels` 回调注入）；向磁盘写任何东西（`writeFixtureSession` 仅测试用，绝不从
  生产代码路径调用）。
