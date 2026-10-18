---
id: submodule-server-agent-mcp
type: submodule-design
status: active
title: "agent/mcp —— 宿主自有的 MCP 层：与 pi 对齐的配置加载器、写入器、指纹、按会话的宿主扩展"
parent: submodule-server-agent
depends-on: [module-contracts]
tags: [mcp, pi]
---

## 职责

ThinkRail 围绕 pi 内置 MCP 所拥有的部分：在配置层，按 pi 完全相同的方式读取那两个 `mcp.json`
文件，并在一个长驻的多客户端进程中安全地编辑它们，以及两项只属于宿主的派生 —— 代替 codemode 的
exposure 规范化，和仓库服务器批准背后的按条目指纹；在会话层，守卫调用的按会话宿主扩展，以及防止
同一个服务器的两次登录同时运行的按服务器锁；还有从 pi 的共享 MCP 日志中读取单个服务器的行。
引擎（连接、OAuth、工具）仍是 pi 的；本模块绝不打开连接。

升级时的移除门禁位于 [[pi-compatibility]]；下面的契约拥有实现细节。

## pi 事实（`@earendil-works/pi-coding-agent`，由 catalog 固定的版本）

pi 不导出 `loadMcpConfig` / `validateMcpServerConfig` / 其写入器，而宿主提供的 `loadConfig` 会
整体替换 pi 的加载器 —— 因此 `config.ts` 是 `dist/core/mcp-servers.js` 与
`dist/extensions/mcp/config.js`（MIT）的**移植**。对安全至关重要的规则按构造相同，并由
`config.test.ts` 固定，该测试把同一批夹具同时喂给 pi 已安装的加载器（通过其 dist 路径抵达，因为
包的 `exports` 映射把它隐藏了起来）和我们的加载器：服务器名字符集、exposure 取值与
`codemode-deferred` 别名、`toolExposure` 形状、`type: "sse"` 拒绝、URL/`headers`/`args`/`env`/
`cwd` 类型、OAuth（`callbackUrl` 仅回环、`callbackPort` 一致性、CIMD 约束、
`authServerMetadataUrl`）、`auth.provider` 只能配合 https 或回环且**绝不出现在项目文件中**、
项目覆盖条目（只能是既有全局服务器上的 `enabled` / `exposure` / `toolExposure`，上报时与
`scope: "global"` 和一条 `override` 路径合并），以及 `-`/`_` 命名空间冲突。每次 pi 升级都要重新
验证；对齐失败是移植缺陷，绝不是放宽某条规则的借口。

## 这里有什么

- `summaries.ts` — `summarizeMcpServers()`：每个按书写形式存在的条目产出一条 `McpServerSummary`
  （只含覆盖的项目条目会折入其用户级服务器，连同它的 `approval` 与其校验错误一起；不是对象的条目
  保留其行并带上 pi 的 `must be an object` 错误），包含 scope、定义它的文件、该行自身原始条目的
  `fingerprint`（`fingerprintMcpEntry` 作用于定义文件中按书写形式存在的条目，两个 scope 都如此 ——
  这是改写或删除时必须呈现的身份）、transport、脱敏后的端点（`maskMcpEndpoint`）、此行是否为被准入
  的有效定义、配置值与生效的 exposure 与启用状态（应用记录覆盖与被准入的仓库覆盖）、OAuth 适用性、
  是否替换了某个用户级服务器、批准状态（`approved` / `pending` / `changed`，对照当前指纹）、配置的
  描述，以及与 pi 等价的配置错误（后两者都经过 `redactMcpText`）。`summarizeMcpConfigErrors()` 是
  文件级的剩余问题（无法解析的 JSON、`mcpServers` 不是对象、`autoEnableCodemode` 类型错误），以
  `{ source, message }` 形式返回并脱敏，供 `McpListResult.configErrors` 使用：对前两者 pi 的加载器
  不会列出该文件的任何服务器，因此若没有它，Settings 会显示"没有服务器"。
- `redact.ts` — 宿主唯一的凭据遮罩，作用于离开宿主的文本。pi 在其状态文本中不做任何脱敏：连接
  错误、HTTP 错误响应片段、stdio 服务器的 stderr 尾部（最多 2 000 字符）都会原样到达。
  `redactMcpText` 以确定且幂等的方式遮罩 URL 中的用户信息和名称暗示凭据的查询值（`maskUrl`；其他
  任何 URL 都按书写形式原样返回）、`Bearer` / `Basic` 凭据（任意大小写）、名称暗示凭据的
  `key=value` 与未加引号的 `key: value` 对（如服务器的 stderr 打印它们的样式；`Bearer`/`Basic`
  的值保留其方案），以及带引号的 `"key": value` 对、已知的 token 前缀（`gh[pousr]_`、
  `github_pat_`、`sk-`、`xox[abprs]-`、`glpat-`、`AKIA`），还有 32 个以上字符的连续串，条件是十六
  进制，或为混合大小写且在 base64url 字母表中含数字 —— `/` 与 `.` 会结束一个连续串，因此路径、URL
  和包名得以保留（被 `/` 切成多段短片段的标准 base64 密钥是被接受的漏判）。它在 pi 的文本变成宿主
  DTO 的地方应用：两个状态解析器（每个 `detail` 与解析出的配置错误）、`summarizeMcpServers`
  （`configError`）、`summarizeMcpConfigErrors`、`readMcpServerLog`、旧客户端的启动通知，以及登录
  探测的错误帧。`maskMcpEndpoint` 是命令行形式：URL，或者命令中名称暗示凭据的标志/赋值之后的值、
  形似 URL 的参数（用户信息、名称暗示凭据的查询值）、header 参数（`-H` / `--header` 之后的任何值，
  任意位置名称暗示凭据的 `Name: value`），以及带 token 前缀的参数都会被遮罩；`${VAR}` 引用保留，
  含空格、引号或内容为空的参数会被加上 JSON 引号，使该行没有歧义（批准对话框把它显示为实际运行的
  命令）。
- `status.ts` — pi 两段状态文本的解析器（`formatStatus` 的行 `name: state[, N tools] (exposure)`
  带缩进的错误，以及启动时的注意事项提示）和 `deriveMcpServerStatuses()`；这些格式由夹具固定，并在
  每次 pi 升级时重新检查；多行的配置诊断不会丢弃有效的服务器行，解析出的细节在任何其他代码看到之前
  就已脱敏。
- `log.ts` — `readMcpServerLog(name)` → `McpServerLog`：pi 把服务器发来的每条
  `notifications/message` 追加到 agent 目录中的一个 `mcp.log`（超过 5 MiB 时轮转为 `mcp.log.1`），
  每条消息一条记录，格式为 `<ISO time> [<server>] <level>[ <logger>:] <text>`，续行缩进四个空格
  （`formatMcpLogMessage`，因此服务器无法伪造别人的头部）。`mcpServerLogLines` 保留头部指名该服务器的
  条目及其续行 —— 绝不用子串匹配 —— 以及最新的 200 行；两个文件都会被读取（各自最后 8 MiB，缺失的
  视为空），结果经过 `redactMcpText`。该格式由针对 pi 自身格式化器的测试固定；每次 pi 升级都重新检查。
- `results.ts` — `summarizeMcpResult()`：会话宿主的 `tool_result` 处理器为 `mcp__*` 和三个资源工具
  写进 `details.thinkrail` 的那份 `McpResultSummary`，由 pi 的机器可读结果（`structuredContent` =
  服务器的原始 `CallToolResult`，或资源负载）构建：block 种类、URI、MIME 类型和大小 —— 绝不是图像/
  音频/blob 数据 —— 还要加上服务器自己的 `structuredContent`。一份字节预算（`MCP_SUMMARY_BYTES`，
  64 KiB）约束整个摘要：按顺序保留 block 直到预算耗尽（`omittedBlocks` 统计其余数量，因为一个服务器
  可能返回成千上万条带长 URI 的资源链接），而 `structuredContent` 只有在剩余预算容得下时才保留
  （否则置 `structuredContentTruncated`）；资源读取只保留其内容的 URI 与类型。pi 会从最终消息中丢弃
  `structuredContent`，因此正是它让卡片在实时、重载后以及在另一个客户端上都能渲染同样内容。
- `management.ts` — `effectiveMcpServerConfig` 通过与会话相同的那份加载器读取被准入的定义，因此探测
  绝不从展示行推断它。宿主组合出 `writeMcpServerEntry`（pi 校验加上项目 `auth` 禁令、新增与更新之
  分、项目包含性；返回项目条目的指纹）。
  新增要求该名字在定义文件的 `mcpServers` 中不作为自有属性存在，无论条目是否有效：标量、null 和数组
  值在用户与项目两个 scope 上都占着该名字，即使它们是在客户端读取列表之后才出现的。拒绝既不改变
  任何文件字节，也不改变批准记录。更新则有意仍然要求存在一个对象条目；它不会替换格式非对象的取值。
  其他辅助函数是 `removeMcpServerEntry`、`mcpEntryFingerprint(scope, worktree, name)`（该 scope 文件
  ——全局 `mcp.json` 或工作树的 `.pi/mcp.json`——中当前原始条目的指纹，不存在时为 `undefined`；宿主
  在任何改写或删除之前拿它来比对渲染出的 `expectedFingerprint`），以及
  `shareMcpOverrideWithRepo`（从记录写入 pi 的覆盖条目；当它所覆盖的用户级服务器已不存在时拒绝 ——
  没有定义的覆盖会是一个无效条目 —— 也当项目文件含有任何非覆盖对象的自有取值，或含有未在其当前指纹
  上获批的覆盖时拒绝，因此共享绝不合并进未审阅的仓库内容）。共享独立于有效性检查仓库的原始占用情况；
  拒绝一个格式错误但已被占用的条目会保留文件、批准记录和记录覆盖。它对用户级定义的读取和对已写入覆盖
  的校验，有意仍只是对象检查，而不是"不存在"检查。
- `config.ts` — 移植版加上宿主增补：`loadHostMcpConfig()` 是会话交给 pi 的东西 —— 项目文件条目
  （服务器条目与只含覆盖的条目一视同仁）只有在项目记录的 `mcpApprovals[name]` 等于其当前指纹时才被
  准入（未获批准的覆盖会让全局服务器保持为配置的样子），记录的 `mcpOverrides` 设置用户级服务器的
  `enabled` / `exposure`，可选的聊天本地禁用集合优先于两者，并且 exposure 会被规范化；
  `loadMcpConfigFiles()`（及其所基于的可选 `admitProjectEntry` 谓词）返回 pi 的 `LoadedMcpConfig`
  **和** `entries`（每个具名 `mcpServers` 取值按书写形式 —— 对象与无效值都算 —— 附带文件、scope 与
  它是否为覆盖），因为 pi 的合并结果会丢失项目出处，**还有** `fileErrors`（`errors` 中文件级的那部分，
  拆分为 path 与 message）；`fingerprintMcpEntry(name, raw)` = 对名字与整个原始条目的规范 JSON 求
  SHA-256（键递归排序，但 `toolExposure` 除外，其顺序是有语义的） —— 绝不使用解析后的值；
  `normalizeExposureForHost()` 在 codemode 尚未发布期间，在内存中把未设置和 `codemode` 的 exposure
  （服务器级与按工具级）映射为 `deferred`。`mcpPolicyOf(project)` 从项目记录中读出该策略（缺失字段
  读作空）。
- `sessionHost.ts` — `createMcpSessionHost()`，每个父会话一个（管理器把它存在其条目上；子会话没有）：
  一个 `tool_call` 处理器，对任何工具未声明 `readOnlyHint: true` 的 `mcp__*` 调用先询问 —— 选项为
  **Deny · Allow once · Allow in this chat**，顺序如此，使整聊授权在堆叠的移动布局上绝不与 Deny
  相邻 —— 并且除两个肯定回答之外的任何情况（拒绝、关闭对话框、中止、无 UI）都以一个原因阻断。每个
  待决对话框拥有一个 `AbortController`，与本次运行的 `ctx.signal` 合并；`cancelPendingConfirmations()`
  就是管理器在接收一次 steer 时调用的东西，因为 pi 的 steering 只是把消息排队。"Allow in this chat"
  存放在宿主对象里，因此它能挺过资源重载，并随会话消失；不持久化任何东西。它的 `extensions` 还携带
  引擎（`engine.ts`）以及会话的 `loadConfig`（`loadHostMcpConfig`，作用于 `getAgentDir()`、会话
  `cwd`、`ctx.isProjectTrusted()` 和注入的项目策略）。宿主扩展是一个始终加载的内联工厂，因此它的
  工厂在每次加载开始时都会运行：它会清空 `loaded()`（每个服务器的有效配置，按 pi 收到的样子；只有当
  内置实现启动时才再次设置 —— 若某次加载中另一个扩展拥有 `/mcp`，或者启用 `-builtin:mcp`，则它保持
  `null`），并为 `registered()` 保留那次加载的 `ExtensionAPI`（pi 的 `getMcpServers()`：扩展注册的
  服务器，一旦该次加载过期即为 `[]`）。`shutdownEngine(event, ctx)` 运行引擎捕获的 shutdown。管理器
  在一次受门禁的重载之前记录 `loaded()` 是否为非 null：一次失败的替换可能清空或更新该快照，却没有
  成功应用运行时。结合任何新加载的引擎，这份出处让父级 `mcpSessions` 追踪对象能够为即时、延迟、手动
  和聊天本地覆盖重载保留一次可重试的失败，即使已无任何配置差异。只有成功的重载才清除它；这个宿主
  不拥有第二个失败标记。可选的命令完成回调由会话管理器提供；这个子模块绝不导入状态协调器。
- `engine.ts` — `createMcpEngine({ loadConfig, lockSignIns?, openUrl?, onCommandSettled? })` →
  `{ extensions, shutdown }`：pi 的两个内置描述符（`mcp` = `createMcpExtension`、`tool-search`），
  `replaceable: true, builtin: true`，与 pi 的 CLI 完全一致。可选的宿主回调通过 `openUrl` 传递
  Settings 的授权 URL，并在变更类命令之后使状态失效。普通聊天绝不在宿主上打开浏览器。`mcp` 工厂首先
  注册它自己的 `session_start` / `mcp_servers_change` 处理器，只要 `pi.getMcpServers()` 非空就激活
  `tool_search`，因此它们早于 pi 的可达性检查运行：由扩展注册的服务器绕过了加载器的规范化（pi 默认
  把它们当作 codemode，而 codemode 尚未发布），`tool_search` 也能抵达它们。由于它活在可替换的内置
  实现内部，当另一个扩展拥有 MCP 时这份激活随之一同消失，而在那里处理 `mcp_servers_change` 也不会
  歪曲 pi 的"没有人连接已注册服务器"报告。`mcp` 工厂交给 pi 一个 `ExtensionAPI` 的 `Proxy`；除两个
  成员外都用 `Reflect.get` 转发（pi 的 API 对象绝不被展开，因此没有任何东西被提前读取）。每次工厂加载
  拥有一个 closed 标志和一个清理 promise。`on` 捕获 pi 的 `session_shutdown` 处理器；
  `shutdown(event, ctx)` 与运行器的 shutdown 派发都会同步关闭那次加载，并汇入同一个清理 promise。
  pi 在等待传输层关闭之前就清空其服务器列表（每次升级都重新验证），因此第二次原始派发会提前返回：
  仅靠幂等并不能保住完成顺序。重载必须在准入替代者之前等待真正的清理完成，而不是那个有界的退出等待。
  proxy 保护真正的 `session_start` 与 `mcp_servers_change` 回调（包括 tool-search 激活）不受已关闭
  加载的影响：一个更早的异步处理器可能在 shutdown 已完成之后恢复该次派发。这些守卫只拥有那次加载的
  引擎资源，而非持久的会话生命周期状态。每次 pi 升级都要重新检查这些顺序保证。除非调用方传入
  `lockSignIns: false`（只有 Settings 探测这样做，因为它自己持锁），`registerCommand` 会包装
  `/mcp` 的处理器：`login <name>` / `logout <name>` 按 pi 的解析方式解析，在命令持续期间获取
  `acquireMcpSignInLock(name, "chat")`，并在 `finally` 中释放；当另一个持有者持锁时，该命令会以
  警告形式发布"`<name>` 的登录已在 Settings 中运行。"（或"在聊天中"），并且绝不抵达 pi。状态、
  `reconnect`、裸露的 `login` / `logout` 以及格式错误的参数保留 pi 的派发行为。变更类命令的完成会
  触发所传入的状态失效，失败时也触发；状态读取不会触发，从而防止捕获递归。
- `signInLock.ts` — `acquireMcpSignInLock(serverName, holder)`：进程级锁，以 pi 规范化后的服务器
  命名空间为键（`-` 与 `_` 别名共用同一把锁，匹配 pi 的凭据身份），由 Settings 探测
  （`"settings"`）与聊天（`"chat"`）共享（原因与持有者：[[submodule-server-agent]] › MCP servers）。
  它返回 `{ release }`（只释放自己那次持有，因此迟到的或重复的调用无害）或 `{ heldBy }`，调用方把
  后者变成自己的拒绝。
- `writers.ts` — `add` / `update` / `remove`，遵循 pi 的编辑语义（未知键与缩进保留；全局服务器的
  `enabled: true` / `exposure: "codemode"` 默认值是被删除而不是写入；覆盖条目保留显式取值），并原子地
  替换文件（临时文件 + 重命名），保留其权限位。用户文件的符号链接仍是符号链接：写入器解析并原子地替换
  其真实目标，并使用该目标的权限，绝不用链接的宽松权限。`assertProjectMcpConfigWritable(worktree,
  path)` 是项目文件的包含规则：目标留在工作树内，既有的 `.pi/` 是真实目录，既有的 `mcp.json` 是普通
  文件 —— 绝不是符号链接，因为 pi 的读取器会跟随链接，而一次读-改-写会把外来文件复制进仓库
  （`McpConfigPathUnsafeError`，线上码 `MCP_PATH_UNSAFE`）。写入是同步的，因此一个进程绝不会交错两次
  编辑；原子重命名使并发的 `pi mcp add` 绝不会读到撕裂的文件（两个进程之间丢失更新是可接受的）。
  `add` 会创建缺失的文件，并报告它是否替换了同名条目；`remove` 报告文件是否定义过该服务器；带
  `override` 的 `update` 会补上缺失的覆盖条目。

## 边界

- **Public surface（公开接口，barrel）：** `loadMcpConfigFiles`、`validateMcpServerConfig`、
  `mcpNamespace`、`isOverrideEntry`、`fingerprintMcpEntry`、`normalizeExposureForHost`、
  `globalMcpConfigPath`、`projectMcpConfigPath`、`addMcpServerConfig`、`updateMcpServerConfig`、
  `removeMcpServerConfig`、`assertProjectMcpConfigWritable`、`McpConfigPathUnsafeError`、
  `createMcpSessionHost` + `McpSessionHost` 以及选项标签 `MCP_CONFIRM_DENY` / `MCP_CONFIRM_ONCE` /
  `MCP_CONFIRM_CHAT`，`createMcpEngine`（`{ loadConfig, lockSignIns?, openUrl?, onCommandSettled? }`）、
  `acquireMcpSignInLock`、`loadHostMcpConfig` + `McpProjectPolicy` + `mcpPolicyOf`、
  `summarizeMcpServers`、`maskMcpEndpoint` / `redactMcpText`、`readMcpServerLog`、
  `effectiveMcpServerConfig`、`management.ts` 的变更函数（`writeMcpServerEntry`、
  `removeMcpServerEntry`、`mcpEntryFingerprint`、`shareMcpOverrideWithRepo`）、
  `summarizeMcpConfigErrors`、状态解析器（`parseMcpStatusText`、`parseMcpAttentionNotice`、
  `MCP_ATTENTION_PREFIX`、`deriveMcpServerStatuses`、`ParsedMcpStatus`）、`summarizeMcpResult` /
  `isMcpResultTool` / `MCP_SUMMARY_BYTES`，以及类型 `LoadedMcpFiles`、`McpConfigFileEntry`、
  `McpConfigScope`、`McpServerConfigPatch`。
- **允许的依赖：** `@earendil-works/pi-coding-agent`（类型、`CONFIG_DIR_NAME`、`getAgentDir`，以及
  引擎工厂 `createMcpExtension` / `createToolSearchExtension`）；`@thinkrail/contracts`（类型）；
  `@thinkrail/shared/codedError`；Node 的 `fs`/`path`/`crypto`。
- **绝不触碰：** `host`、`projects`、web；没有任何连接、OAuth 或传输层代码 —— 那些留在 pi。
