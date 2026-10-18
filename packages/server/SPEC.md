---
id: module-server
type: module-design
status: active
title: 引擎宿主（服务端库）
parent: architecture
depends-on: [module-contracts, module-shared]
tags: [host]
references: [module-artifact-tests]
---

## 职责

作为可嵌入库的引擎宿主。它提供浏览器↔宿主之间的线上协议（`Bun.serve` HTTP+WS、静态 SPA），并通过
`createAgentSession` 在进程内运行 `pi` agent。由 `apps/cli` 与 Electrobun 的 `apps/desktop` 在进程内
启动；它自身没有独立的入口点（有一个 `dev.ts` 用于开发 / e2e 时启动它）。

## 边界

- **拥有：** HTTP+WS 服务器、静态服务、WS 派发注册表、服务端特性服务（project/workspace/git/fs/
  terminal + 进程内的 `AgentSession` 管理器），以及 `~/.thinkrail` 持久化。
- **Public surface（公开接口）：** `createServer(options) → Promise<RunningServer>`
  （`{ port, startAttributionClaim, stop, shutdown }`）—— 已保存选择的归因等待启动器显式发出 UI 就绪
  调用；`stop()` 是供底层测试使用的同步资源释放，而 `shutdown()` 是每个启动器都必须等待的幂等、有界
  生产生命周期（结算会话 + 排空轮次回执/分析并释放 sockets/PTYS/watchers）—— 公开工厂在绑定 socket
  或暴露处理器之前就启动 Central 产物监视并应用初始的当前 PI 运行时 —— 当配置的 Central 扩展失败时
  回退为普通运行时并处于封闭的 `load-failed` 状态 —— 因此每个嵌入方都得到同一个引导不变量 —— 还有
  `bootHost(options) → BootedHost`（进程启动包装器：安装崩溃日志、仅当启动器以 `resolveShellEnv: true`
  选择加入时才解析登录 shell 环境、在选择端口之前预热同一初始化、等待 `createServer`，并安装
  SIGINT/SIGTERM 优雅关闭处理器），两者都从 `host/` 重新导出；此外还有 `registerBundledRuntime`
  （及其类型，从 `agent/` 重新导出）—— 编译后二进制的接缝：无法按路径加载打包 pi 扩展的启动器
  （`bun build --compile` 二进制或打包后的 Electrobun 服务端运行时内没有 `node_modules`）通过它以值
  导入的工厂 + 一个暂存的 skills 目录注入这些扩展（registry 扩展无需注入 —— 它们的工厂经由静态导入图
  抵达），注入暂存的 macOS/Windows 系统回收站辅助程序路径，并注册 pi 静态打包的提供商流程（OAuth
  流程 + Bedrock 模块），否则 pi 会通过二进制不友好的变量说明符动态导入来抵达它们（见 agent 规范）。
  仅构建期的 **`@thinkrail/server/build-support`** 是打包扩展条目、技能根、各平台 `bun-pty` 库与系统
  回收站辅助程序的唯一清单，由两个启动器打包器共同消费。产物夹具/断言运行器位于
  [[module-artifact-tests]]，不在本库中。该包还暴露 **`@thinkrail/server/agent` 子路径导出**（即
  `agent` barrel）：面向**无头工作流测试装置**（`e2e/workflows/`）的服务端会话接口，该装置在生产接线
  之上驱动真实的进程内会话而无需启动 HTTP 宿主 —— 这是有意设置的第二个入口，用以避免在 node 上运行的
  e2e worker 中求值 `host`（仅 Bun：`Bun.serve`、`bun-pty`）。不供 `apps/*` 使用 —— web/CLI 边界
  规则保持不变。
- **允许的依赖：** `contracts`（类型 + WS 常量）、`shared`（`shellEnv` 与 Central 适配器）、`bun-pty`、
  `@earendil-works/pi-coding-agent` + `@earendil-works/pi-ai`（运行时）、`extension-api`（`./server`
  类型）+ 每个 `thinkrail-extensions/*` **仅限 server 子路径**（registry 的组合边；宿主不再直接依赖某个
  扩展所拥有的 pi 包）、`pino` + 其 pretty/rolling 目标（宿主诊断）、`jsonc-parser`（针对性的共享 Pi
  配置编辑）、Bun/Node。
- **部署义务：** 产品行为住在拥有它的服务端特性模块中，并由 `host` 组合；启动器只提供启动选项与打包
  资源。当某个已被证明需要的第二环境需要不同的实现时，拥有该特性的模块定义一个有明确范围的注入端口，
  而不是一个覆盖全宿主的平台适配器。
- **绝不触碰：** 导入 `web`/`cli`/`desktop`；被捆绑进浏览器；依据启动器身份分支产品行为。

## 内部模块

每个模块住在 `src/<name>/` 下，作为一个有界子模块：一个 `SPEC.md`（它自己的边界）+ 一个 `index.ts`
**barrel**，后者是它唯一的公开接口。兄弟模块**通过其 barrel 导入，绝不导入其内部实现**。它们之间的
边在这里拥有（见依赖图），不在叶子规范里。

| 模块 | 拥有 | 规范 |
| --- | --- | --- |
| `host` | `Bun.serve` HTTP+WS、静态 SPA、WS 派发注册表、频道发布 | [host/SPEC.md](src/host/SPEC.md) |
| `persistence` | 数据目录下的 JSON 领域/配置状态 | [persistence/SPEC.md](src/persistence/SPEC.md) |
| `log` | 显式分级诊断 → 美化后的 stderr + `<dataDir>/logs` 下面向 agent 的 JSONL（pino-roll 每日/10 MB 轮转，14 个轮转文件 + 活动文件）；任意 console 输出只留在终端 | [log/SPEC.md](src/log/SPEC.md) |
| `settings` | 服务端同步的应用配置，包括共享的自定义布局预设目录与 Central 配额偏好（绝不是当前/默认布局） | [settings/SPEC.md](src/settings/SPEC.md) |
| `projects` | 稳定的已知仓库注册表：open/recent 视图 + 无损的关闭/重开（校验、去重、slug） | [projects/SPEC.md](src/projects/SPEC.md) |
| `workspaces` | 工作区 = 各自分支上的 `git worktree` | [workspaces/SPEC.md](src/workspaces/SPEC.md) |
| `git` | `git(cwd, args)` 运行器 + 相对基线的 worktree 状态/差异（diff）+ 分支列表 | [git/SPEC.md](src/git/SPEC.md) |
| `subprocess` | `runBounded(argv, …)`：一个子进程、一份预算，到期时按进程组杀掉 | [subprocess/SPEC.md](src/subprocess/SPEC.md) |
| `github` | 为 New-Workspace 界面提供只读的本地 `gh` 认证状态（shell-out） | [github/SPEC.md](src/github/SPEC.md) |
| `branch-review` | 尽力而为地为工作区分支查出打开的 GitHub PR / GitLab MR 编号 | [branch-review/SPEC.md](src/branch-review/SPEC.md) |
| `pr` | `pr.open`：推送工作区分支 + 打开/更新其 GitHub PR，正文由计划渲染 | [pr/SPEC.md](src/pr/SPEC.md) |
| `fs` | 读取 worktree 内的目录/文件（路径受限）+ 唯一的一份字节分类（text/mime/sha-256） | [fs/SPEC.md](src/fs/SPEC.md) |
| `changes` | 宿主自有的回退：回退 worktree 中某个 hunk 或某个文件的整段改动，带撤销回执 | [changes/SPEC.md](src/changes/SPEC.md) |
| `turns` | 按 agent 运行的 worktree 快照 → 每次运行产生的变更集（`workspace.turns`、`turn.changed`） | [turns/SPEC.md](src/turns/SPEC.md) |
| `trash` | 通过打包的辅助程序把路径移入系统回收站（绝不用 `unlink`） | [trash/SPEC.md](src/trash/SPEC.md) |
| `spec` | 工作树的规范图快照（`spec.graph`）+ 项目级 `projectHasSpecs`，经由 `pi-spec-graph/core` | [spec/SPEC.md](src/spec/SPEC.md) |
| `todos` | 聊天的按会话 TODO 计划读写（`todo.*`），经由 `pi-todos/core` | [todos/SPEC.md](src/todos/SPEC.md) |
| `reviews` | 针对文件/差异（diff）的评审草稿评论：存储 + 锚定 + 上下文包渲染 | [reviews/SPEC.md](src/reviews/SPEC.md) |
| `watch` | 按 worktree 的 fs 监视器 → 去抖的 `workspace.fsChanged` 失效推送 | [watch/SPEC.md](src/watch/SPEC.md) |
| `terminal` | 工作区范围的 `bun-pty` 终端 | [terminal/SPEC.md](src/terminal/SPEC.md) |
| `agent` | 进程内 pi 会话 + 当前/保留的运行时代次 + 一次性补全 | [agent/SPEC.md](src/agent/SPEC.md) |
| `extensions` | ThinkRail 扩展（`@thinkrail/ext-*/server`）的服务端 registry：有序描述符 + 公开说明符、内联展平、按属主解析技能 | [extensions/SPEC.md](src/extensions/SPEC.md) |
| `auth` | 提供商状态/登录，外加原生的 JetBrains Central 生命周期与配额编排 | [auth/SPEC.md](src/auth/SPEC.md) |
| `assist` | 在廉价模型上运行的临时性一次性任务（计划摘要，……），尽力而为 | [assist/SPEC.md](src/assist/SPEC.md) |
| `analytics` | 始终开启的基础事件 + 受偏好控制的可选洞察 → PostHog sink（隐私契约在其规范中） | [analytics/SPEC.md](src/analytics/SPEC.md) |
| `feedback` | 宿主范围的使用计数 + 定向的产品访谈邀请生命周期 | [feedback/SPEC.md](src/feedback/SPEC.md) |
| `dialog` | 宿主的原生文件夹选择器 | [dialog/SPEC.md](src/dialog/SPEC.md) |
| `editors` | 检测已安装的编辑器/IDE、在某个 worktree 上启动其一、在文件管理器中显示某个 worktree | [editors/SPEC.md](src/editors/SPEC.md) |
| `history` | 提示词召回 + 在 pi 的会话文件上做对话搜索 | [history/SPEC.md](src/history/SPEC.md) |
| `templates` | 对 pi 的提示词模板目录（全局 + 项目范围）做文件 CRUD | [templates/SPEC.md](src/templates/SPEC.md) |

`src/index.ts` 重新导出 `host` 以及 `agent` barrel 的 `registerBundledRuntime` 接缝；显式声明的包子路径
暴露构建支持与获准的历史夹具，而不加宽运行时 barrel。`src/dev.ts` 通过 `bootHost` 从环境启动宿主，
用于 dev/e2e。

## 内部依赖图

`host` 是**唯一的组合根** —— 它把每个特性的处理器接入 WS 注册表。

- `host` → `projects`、`workspaces`、`git`、`github`、`branch-review`、`pr`、`fs`、`spec`、`todos`、`reviews`、`changes`、`turns`、`watch`、`terminal`、`dialog`、`editors`、`agent`、`auth`、`assist`、`settings`、`history`、`templates`、`analytics`、`feedback`、`log`、`persistence`（`dataDir`，用于崩溃报告）
- `workspaces` → `projects`、`git`、`persistence`
- `branch-review` → `git`、`subprocess`
- `pr` → `workspaces`、`git`、`todos`、`branch-review`（提供商检测 + gh 输出解析 + 共享的 CLI 运行器）、`github`（`ghSetupProblem` —— 具名的对比回退原因）
- `projects` → `git`（共享运行器）、`persistence`
- `git` → `subprocess`（每个与网络或另一个 CLI 交谈的子进程）、`fs`（`resourceMeta`/`decodeText` —— 差异（diff）某一侧的内容分类与 `fs.readFile` 报告的是同一份）
- `changes` → `git`（scope→range 解析器 + 原始侧在其解析后 oid 处的 blob）、`fs`（路径包含性 + 字节同一性）、`persistence`（工作区查找）、`trash`（会删除文件的回退）
- `turns` → `git`（`snapshotWorktree` + `turn` scope 的 `gitStatus`）、`persistence`（`turns.json`）、`log`；它绝不导入 `agent` —— `host` 把会话事件流喂给它，并把会话解析到其工作区，这与运行分析观察者用的是同一套组合
- `github` → `subprocess`（两个 `gh auth status` 探测都与 `git`/`branch-review` 跑在同一个有界运行器下）
- `git`、`fs`、`spec`、`watch`、`terminal`、`settings`、`analytics`、`feedback` → `persistence`（`spec` 还 → `pi-spec-graph/core`，外部；`analytics` 还 → pi-ai 内置的提供商/模型目录 + `posthog-node`，外部 —— 身份分桶词汇表与投递 SDK）
- `log` → `persistence`（`dataDir`）—— 并且**任何特性模块（+ `host`）都可以 → `log`**：它是唯一一条
  横切边，与 `persistence` 一样，豁免于"特性之间互不导入"的规则（目前有：`host`、`agent`、
  `workspaces`、`watch`、`git`、`todos`、`reviews`、`analytics`）。`persistence` 绝不导入 `log`
  （否则会成环）；`initLogging` 只从 `host` 的 `bootHost` 调用
- `todos` → `workspaces`（worktree 路径查找）+ `pi-todos/core`（外部、以值导入、不含 pi）
- `reviews` → `workspaces`（worktree 路径查找）、`persistence`（数据目录）、`git`（解析评审的
  baseSha，以及基线侧锚点背后的差异（diff）范围 + blob 读取）、`fs`（共享的字节分类 + 锚点
  `contentHash` 所是的那份 sha-256）。`review.send*` 流程**在 `host` 的处理器中组合**（reviews 构建
  数据包，`agent` 运行会话 —— 没有 `reviews`→`agent` 边；`host` 通过 `reviewLock` 按工作区串行化发送
  *以及* 评审变更，并通过 `agent.ensureSessionAttached` 重新挂接评审持久化的聊天），而 agent 侧的
  `resolve_comment` 工具经由 `host` 安装的一个接缝回调
  （`agent.setReviewCommentHandler` → `reviews.resolveCommentFromAgent`）
- `assist` → `agent`（一次性补全原语）
- `auth` → `agent`（当前运行时/auth 门面外加候选的准备/激活；单向，`agent` 绝不导入 `auth`）
- `agent` → `log`、`persistence`（用于委派的 `dataDir`，以及会话生命周期/回执的载入-保存操作）、
  `trash`（聊天删除时可恢复的对话记录移动）、`extensions`（registry 展平后的父级与子级内联扩展，
  外加在未打包的 dev 下它的技能根）—— 除此之外只有 pi 运行时；auth 通过其公开的代次接缝传递期望的
  不透明 Central 路径
- `extensions` → `@thinkrail/ext-*/server` + `@thinkrail/extension-api/server`（外部）；
  `buildSupport.ts`（仅构建期）也读取它，用于暂存这些扩展的技能根
- `persistence`、`dialog`、`history`、`templates`、`subprocess`、`trash` →（叶子）

规则：特性绝不导入 `host`，除上述边之外也绝不互相导入。该图是无环的。`agent` 的 WS 接口
（`session.*` + `pi.event` 转发）挂接到 `host`。自己负责推送的特性同样绝不导入 `host`：它们暴露一个
**发布者注入接缝**（`setTerminalPublisher`、`setSessionPublisher` + `setSessionCreatedPublisher` +
`setSessionDeletedPublisher` + `setSessionStatePublisher`、`setLoginPublisher`、`projects` 的
`setProjectPublisher`（用于全快照的 `project.updated` 生命周期）、`workspaces` 的
`setWorkspacePublisher`（用于 `workspace.created`/`updated`/`removed` 三者组成的生命周期）、
`settings` 的 `setSettingsPublisher`（用于 `settings.changed`，即完整合并配置以及成功的已应用更新，
供宿主侧显式字段效应使用）、`feedback` 的定向邀请发布者，以及 auth 的 Central 动作分析与
`provider.changed` 失效发布者），由 `host` 在 `createServer` 时安装 —— 因此频道/分析接线只存在于
`host`。当前布局没有宿主模块、持久化、方法或发布者。

`settings` 校验它拥有的有界、无资源的自定义布局预设目录。当前/默认预设、组上限、框架、工作区资源
放置、选择与几何参数绝不抵达宿主。工作区创建与启动恢复两条路径把 `workspaces` 与 `terminal` 组合起来：
先预留确定性的、无进程的默认终端，然后只在目录持久化成功之后才清除该工作区的待处理标记。没有任何兄弟
为此握手导入另一个兄弟。
`history` 保持不依赖注册表（绝不导入 `projects`/`workspaces`）；`host` 在处理层
（`history.search` 处理器）从注册表注入范围过滤器 + 标签。`templates` 同样保持不依赖注册表 —— 它接受
一个普通的 `cwd`，绝不是 `workspaceId`；`template.*` 处理器在调用 `templates` 之前通过 `workspaces`
把 `workspaceId` 解析为 `cwd`。

分析同样由宿主居中调解：**每个捕获调用点都在 `host` 中**。宿主把既有的启动、会话、设置、任务、评审与
PR 观察转换成封闭的事件词汇表，并从显式包含 `analyticsEnabled` 的已应用更新同步附加数据投递门禁；
无关的设置广播保留当前偏好。关联保持宿主本地，并在共享被禁用时清除。`analytics` 没有 `settings` 边，
也没有任何特性模块知道 analytics 的存在。

Chat Resources 集成把 `agent` → `pi-background-commands` 作为一条外部包边加入，与它既有的委派包并列。
`host` 继续通过 `agent` barrel 组合线上协议；没有新的资源管理器兄弟，也没有 `agent` → `terminal` /
`subprocess` / `settings` 边。命令生命周期与有界输出属于那个可移植包，而管理器拥有它与某个真实父会话的
关联。

子代理可用性同样由宿主居中调解：`settings` 拥有全局默认值，`workspaces` 拥有可选的本地覆盖，`host`
把二者的生效值注入 `agent`，并在任一处变更后请求对活跃会话重新求值。没有任何特性为了推导该策略而导入
兄弟。

扩展的开/关同样由宿主居中调解：`settings` 拥有 `disabledExtensions`，`extensions` 拥有 registry 及其
目录派生，`host` 通过 `setDisabledExtensionsResolver` 把该集合注入 `agent`，通过把 registry 目录与
该设置合并来回答 `extension.list`，并在一次包含 `disabledExtensions` 的已应用更新之后调用
`refreshExtensionTools()`。没有 `agent` → `settings` 或 `extensions` → `settings` 边。

## 必须做对的事

- **没有进程隔离** —— 一次致命的 agent/提供商故障会把整个宿主拖垮（已被接受的权衡）。
- **没有通用的跨进程状态协调** —— `bootHost` 允许多个宿主使用同一个数据目录。安装身份、其一次性事件
  认领以及浏览器归因尝试使用范围很窄的独占文件系统操作；其他共享持久化没有通用锁、事务或收敛保证，
  因此并发写入可能是后写者获胜。
- **每个宿主只有一次优雅关闭** —— 启动器等待 `RunningServer.shutdown()`；重复调用共享同一个 promise，
  而突然死亡依赖操作系统的进程清理。
- **WS 命令直接返回值**；只有事件 + 扩展 UI 使用推送频道。
- 通过 `host` 选项绑定到 localhost 之外（Tailscale 接缝）。

## 后续

把持久化放到数据层之后，`owner` 穿线。
