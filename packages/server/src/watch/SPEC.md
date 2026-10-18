---
id: submodule-server-watch
type: submodule-design
status: active
title: watch —— 工作树变更通知器
parent: module-server
depends-on: [module-contracts]
tags: [live-refresh, public-surface-checked]
---

## 职责

UI 实时刷新背后的文件系统变更通知器：每个被监视的工作区工作树一个递归监视器（Bun 原生的
`fs.watch(root, { recursive: true })` —— 没有监视器依赖），把事件合并成一次去抖的
**`workspace.fsChanged`** 发布（`WorkspaceFsChangedPayload`：`{ workspaceId, paths, truncated,
skillChange }`）。该帧是**失效提示，不是数据** —— 客户端通过既有的读取方法（`fs.*` / `git.*` /
`spec.graph`）重新读取，因此读取仍是唯一的真相来源，而重复/重放的帧是无害的（多一次重新获取，绝不
会得到错误状态）。之所以这样选，而不是逐路径的客户端侧树补丁（会让客户端成为第二个真相来源）或可见
面板轮询（滞后，在 Tailscale 上又浪费）。

## 边界

- **拥有：** 监视器登记表及其生命周期：`ensureWatch(workspaceId)`（幂等且**自愈**；返回活监视器共享
  的就绪 promise；由 `host` 在一次工作区读取或 `workspace.watchReady` 预检落地时惰性启动 —— 那次
  读取就是“有客户端在看”的信号；就绪结果报告该监视器是否早已是已知就绪的）、
  `stopWatch(workspaceId)`（在 `workspace.remove` 的快路径中调用）、`stopAllWatches()`（在
  `server.stop()` 中调用）；忽略过滤器（任何路径段为 `.git` 或 `node_modules`，加上 `.DS_Store`）；
  逐工作区合并（去重后的相对路径，在 300ms 静默 / 1s 最长等待之后冲刷，上限 100 条路径 →
  `truncated: true` = 一个通用通配 —— 约 ≤ 1 帧/秒的界由 `live-refresh.spec.ts` 里的 **e2e 高频
  变更哨兵**固定：约 3s 内约 200 次写入必须以 ≤ 8 帧到达客户端，同时风暴中段的 `/health` 往返仍然
  很快）。技能相关性在该上限**之前且独立于它**被累积为
  `skillChange: "none" | "detected" | "unknown"`：`host` 注入 `agent` 的项目技能路径判定器；每个
  具体事件都贡献 `detected`/`none`，即使其路径无法被保留，而 null 文件名贡献 `unknown`
  （`detected` 优先）。一个已存在于保留集合中的重复项不会使该批次成为截断。因此一次 100+ 文件的
  构建不可能冒充为一次技能编辑，而上限之后的技能路径仍会被检测到。**启动提示** —— 新监视器在平台流
  注册窗口（约 750ms）之后发布一次合成的**截断 / 技能未知通配**，因为落在那窗口内的写入可能永远
  丢失其事件。它的就绪 promise 只在那次发布之后才结算。web 的技能加载流程在捕获其加载起点新鲜度刻度
  *之前*等待带类型的 `workspace.watchReady` 宿主预检，因此启动期的不确定性被吸收进新会话的基线，
  而不是错误地把它标记为过期；就绪之后的真实编辑仍然比该基线更新。除非监视器早已是已知就绪的，
  否则结果会告诉 web：若广播随其 socket 一起死了而请求响应经重放存活 —— 或者在发布之前启动就失败
  了 —— 就折叠一份重复的 `skillChange: "unknown"` 回退。普通的工作区读取不等待就绪，也绝不增加
  启动延迟。停止一个监视器会结算其挂起的就绪并取消该提示，因此调用方不会挂住，被拆除的监视器也无法
  发布。失效提示保持幂等，因此该回退可能带来的重复只是一次廉价的 no-op 重新获取。
- **预热层（全局有界）：** `ensureWatch(workspaceId, { prewarm: true })` —— 经由
  `workspace.watchReady` 的可选 `prewarm` 标志到达，即 web 的预选预热 —— 启动同一个监视器，但把它
  的条目标记为**仅预热**。仅预热的条目住在同一个全局池里，上限为 **8**：超过上限再创建一个，会通过
  `stopWatch` 逐出最近最少预热的仅预热条目（包含其保守的就绪结算），因此点击浏览许多项目只会复用一个
  有界池，而不是为一个宿主的生命周期不断累积监视器。任何**真实**调用都会把该条目永久提升出这一层
  —— 由真实工作区读取或技能加载预检激活的监视器绝不被逐出 —— 而一次对活跃仅预热条目的预热命中只
  刷新其逐出新近度，且一次预热绝不能降级一个真实监视器（包括跨一次 inode 变更后的重建）。逐出之下的
  正确性依赖既有的恢复路径：下一次真实调用会重建监视器，而它那份全新的保守启动提示覆盖盲窗。
- **仓库元数据提示（第二个接缝）：** 一次 git 元数据写入是*元数据，不是内容*，因此它绝不成为
  `fsChanged` 路径（`.git` 屏蔽照旧 —— 管道风暴不可变成帧）。它改为武装一次单独去抖（300ms）、
  **无路径**的 `setRepoMetaPublisher(workspaceId)` 提示。这是“一次让工作树字节完全不变”的变更的
  唯一信号：`git switch -c <new-branch>` 在 git 目录之外什么也不写，而 `git commit` 移动 `HEAD`
  而不碰任何工作树文件。它刻意**不**按具体路径（`.git/HEAD`、`.git/logs/HEAD`、…）匹配：平台流会
  合并并在每次突发时报告*一个*代表性路径，因此会浮现哪个 git 内部路径并不可靠。一个通配事件
  （null 文件名）也会提示它。有两个来源喂这同一次提示：
  - 递归**根**监视器看到的、以 `.git` 为前缀的事件 —— 覆盖**仓库根**工作区，其 `.git` 目录住在被
    监视的树内；
  - 当工作树的 git 目录**位于根之外**时，对它另开一个**非递归**监视器（仓库根树内的 `.git` 目录已
    被上面覆盖，因此它绝不会被监视两次）：对于一个*链接工作树*（本应用创建的每个工作区都是）
    `.git` 是一个*文件*（`gitdir: <path>`），指向 `<repo>/.git/worktrees/<name>`，即在**被监视的
    根之外**，因此在该工作树终端里做的一次提交否则完全不会产生信号。用普通 fs 解析（stat + 解析
    gitfile 那一行），绝不通过 shell 调用 —— 本模块没有 `git` 兄弟边。非递归，因为只有该目录的顶层
    持有会移动的 ref（`HEAD`、`index`、`ORIG_HEAD`），而 `objects/`/`logs/` 是纯粹的风暴；缺失/
    不可读的 git 目录（非 git 文件夹）或一次失败的启动会静默降级。

  `host` 把该提示扇出到两个收敛点：`refreshUserOwnedWorkspace`（用户拥有工作区的 folder-truth
  分支标签）**以及**一个无路径、技能中立的 `fsChanged` 帧（`paths: []`、`truncated: false`、
  `skillChange: "none"`），使客户端那些从 git 派生的读取重新读取 —— `git.status` 与一个打开的
  `uncommitted` 范围差异标签页都相对 `HEAD`，否则会一直把一次已提交的变更报告为未提交，直到下一次
  文件编辑。
- **组合接缝：** 绝不导入 `host` 或 `agent` —— `host` 在装配时同时注入发布回调与 `agent` 的纯项目
  技能路径分类器（发布者 tee 模式）。缺少分类器会把具体事件降级为 `skillChange: "unknown"`，绝不
  假装干净。
- **每次读取都自愈（带外的工作树变动是常态 —— e2e 重置、终端里的 `rm -rf`）：** 每次
  `ensureWatch` 都重新 stat 根，并**在 inode 变化时重建监视器**（一个被删除后重建的路径会让旧流静默
  地跟在一个死 inode 之后）、**清理僵尸监视器**（其工作区记录已不存在 —— 一条复活的基于路径的流会
  继续为一个已被遗忘的 id 发布），并**在下一次读取时重试一次失败的启动**（没有粘性的失败标记）。
  一个中途出错的监视器（ENOSPC、根被删除）会被警告记录并丢弃 —— 面板回退到按需读取，直到之后某次
  读取把它重建。没有空闲停止（界限由实际被访问的工作区加上有界的预热层组成）。
- **监视器启动提示（第三个接缝）：** 监视器条目创建的瞬间（真实的或预热的），在任何事件能到达仓库
  元数据提示之前，`setWatchStartedPublisher(workspaceId)` 触发一次 —— 宿主用它取得工作树的 HEAD
  基线，使一个监视器的第一次 git 元数据事件是相对一个已知 sha 来判定，而不是被花在播种上。一个被
  重建的监视器（inode 变化、预热重新准入）会再次触发它；消费者与其保留的基线比较，因此一次在未被
  监视期间做出的 HEAD 移动仍会记录活动，而未变的 HEAD 是 no-op。它运行在注册的受守护区域内，那里
  的一次抛错 —— 来自它或来自 `entries.set` 之后的任何东西 —— 会拆掉这个新条目（`stopWatch`），
  而不是留下一个已注册但就绪永不结算的监视器。
- **Public surface（公开接口，barrel）：** `ensureWatch`, `stopWatch`, `stopAllWatches`,
  `setWatchPublisher`, `setRepoMetaPublisher`, `setWatchStartedPublisher`, `setSkillPathClassifier`
- **允许的依赖：** `persistence`（工作区查找）、`log`；`contracts`（负载类型）；Bun/Node。
- **绝不触碰：** `host`；兄弟特性；任何 pi 包。
