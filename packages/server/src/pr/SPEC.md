---
id: submodule-server-pr
type: submodule-design
status: draft
title: pr —— 推送工作区分支并打开/更新其 GitHub PR
parent: module-server
depends-on: [submodule-server-branch-review, submodule-server-todos, submodule-server-github]
implements: [task-open-pr]
tags: [github, pull-request, public-surface-checked]
---

## 职责

"计划完成 → PR 打开"（`pr.open`）的确定性宿主侧：把工作区分支推到 `origin`，并打开 —— 或更新
—— 该分支的 GitHub PR，PR 正文由会话的 TODO 计划渲染而成（已核实计划的叙述：摘要、带 sha 与
验证的步骤、评审轨迹）。正文还携带一个 **`## Committed outside the plan`** 小节，对应
`TodoPlan.adoptedCommits`（没有任何步骤拥有的分支提交 —— 见 [[submodule-server-todos]]），而
评审轨迹覆盖计划内步骤**以及**被采纳的提交，于是一个工作从未进入计划的支仍然能送出非空、诚实
的描述，而不是空白正文。按钮从不经由 agent（提示词驱动的 PR 按钮很脆弱 —— 见 task-open-pr）；
未来的 pi 扩展会把同一个库暴露给 agent。

## 行为

`previewPr({ workspaceId, sessionId, title? })` → `{ title, body }`（`pr.preview`）：`openPr`
将会使用的确切标题/正文（聊天标题回退到分支；`renderPrBody` 作用于线上协议的计划），这样客户端
的撰写对话框可以在推送任何东西之前把它们提供出来供编辑。

`openPr({ workspaceId, sessionId, title?, body?, draft? })`，一次调用 = 一次幂等尝试
（`body` —— 来自该对话框的用户编辑过的描述 —— 存在时逐字替换渲染出的计划正文；标题/正文的
默认值来自同一个地方 —— openPr 消费 `previewPr`，所以预览的草稿与被推送的 PR 绝不会分叉）。
该调用以 **`assertSafeRef(ws.branch)`** 开场：被采纳的/外部工作树的分支是从 git 逐字存下的
（只有创建的工作区会经过 `toBranch`），所以来自不可信仓库的选项形状分支（`--repo=x` 可通过
`git update-ref` 创建）必须在进入任何 git/gh argv 之前被拒绝。随后它在脏文件读取或推送之前
拒绝**非 origin 的远端基线**：它只对 `origin` 推送和打开；静默地把 `upstream/main` 当作该
仓库内的一个分支，会先发布工作区分支，然后才在识别它的 PR 目标时失败。一个活得比其远端配置
更久的远端跟踪 ref 在同一侧被拒绝。错误会引导用户手动打开，或从本地/`origin` 基线创建；
跨仓库的 fork PR 创建属于未来范围，不从字符串前缀去猜。
下一道守卫在该分支**就是它自己的基线**时拒绝（`ws.branch === baseRef(ws.baseBranch)`，仍然在
origin 检查或任何推送之前）：Default 工作区的 cwd 就是项目自己的检出，所以只要用户在仓库的
默认分支上，`branch`/`baseBranch` 通常就彼此重合（`workspaces` 的 `folderTruth` 从实时的
`git symbolic-ref` 跟踪二者），而一个外部（被采纳的）工作区同样可能停在它的基线上 —— 没有这道
守卫，Open PR 会直接 `git push origin <default-branch>` 到未受保护远端的共享分支上，在任何 PR
能提供其评审边界之前就把提交发布出去。客户端镜像了普通的本地/`origin` 同分支情形；对不受支持
的远端基线，宿主始终是权威。**`refreshUserOwnedWorkspace(workspaceId)` 为 Default/外部工作区
解析实时分支**（`workspaces` 中 fs 监视接缝使用的同一个同步函数）并持久化它 —— 对创建的工作区
是空操作，因为只有 ThinkRail 会移动它们的分支。Open PR 在其异步脏文件读取之前校验一次（保留
安全的分支即基线快速失败），随后在那一 await 之后立即刷新、重载并重新校验。若两者皆无，一个
在终端里于 Git 读取在途期间、或按下 Open PR 前一刻被切换的分支，会对着过期的持久化分支去
推送/打开/比较，直到异步监视器下次追上：分支敏感的 `ws` 是新鲜的，所以基线守卫、推送、`gh`
查找/创建以及比较 URL 全都派生自那个刷新后的值。然后：
1. 没有 `origin` 远端 → 抛出（客户端以 toast 提示）。推送失败 → 带 git 的 stderr 抛出；
   若 stderr 匹配非交互式认证的特征（`Permission denied (publickey)`、
   `could not read Username/Password`、`Authentication failed`、`terminal prompts disabled`、
   `Host key verification failed` —— `isPushAuthFailure`），则改为抛出
   `CodedError("PUSH_AUTH_FAILED")`：宿主在没有终端的情况下推送，所以 git 的凭据提示绝不会
   出现，客户端用设置指引作答，而不是原始的 stderr toast。
2. 总是先推 `--set-upstream origin <branch>` —— 该分支归工作区所有，所以普通推送就是对的；
   重复调用会把后续提交推到**同一个**分支（绝不产生第二个 PR）。推送在**非交互式环境**
   （`pushGitEnv`）中运行：`GIT_TERMINAL_PROMPT=0`；
   **`LC_MESSAGES=C`，并把 `LC_ALL` 降级为 `LC_CTYPE`**（丢弃它，其值在原本未设置时保留为
   `LC_CTYPE`），这样在任何宿主区域设置下 git 的 stderr 对 PUSH_AUTH_FAILED 的模式都保持英文
   —— 同时推送派生的钩子与辅助程序仍保持自己的字符编码
   （`LC_ALL=C` 会把基于 Python 的 pre-push 钩子翻成 ASCII 模式；完全丢掉一个仅设 LC_ALL 的
   区域设置，会经由 POSIX 的 `LC_CTYPE` 造成同样后果）；以及
   `GIT_SSH_COMMAND=ssh -oBatchMode=yes` —— 但**仅当**用户没有自己的 ssh 命令时
   （`GIT_SSH_COMMAND`/`GIT_SSH` 环境变量或 **`core.sshCommand` git 配置** —— 环境变量会覆盖
   配置，所以盲目设置它会破坏一个能用的自定义密钥/1Password 设置，并把误报为认证失败）。当
   宿主有控制终端时，ssh 否则会在 `/dev/tty` 上索要密钥口令，把整个调用挂住直到客户端超时
   —— 批处理模式把这种挂起变成分类逻辑正是为之而建的即时 `Permission denied`。
3. 非 GitHub 的 origin（含本地/裸测试远端）→ `action: "pushed"` —— 诚实的地板。
4. GitHub 的 origin：已存在打开的 PR（`gh pr list --head <branch> --base <input.base>`，由
   `branch-review` 的 `reviewNumber` 解析）→ `gh pr edit <NUMBER> --title --body` 刷新 →
   `action: "updated"` + **`bodyRefreshed`**（编辑失败会被上报，绝不声称为成功）。编辑的选择器
   是列表步骤刚返回的 NUMBER，绝不是分支位置参数 —— gh 会把数字分支名（"1234"）解析成 PR
   编号，那会改写陌生人的 PR —— 而 `--title` 只**在客户端把它标记为已编辑**（`titleEdited`）
   时随行：撰写预填是从计划重新生成的，不是从活的 PR 读来的，所以未被触碰的标题绝不能覆盖在
   github.com 上做的重命名。列表步骤按 **`--head` 与 `--base` 两者**过滤 —— 只给 `--head`
   会匹配来自该分支的任何打开 PR，不问目标（同一个 head 可以有两个朝向不同基线的打开 PR），
   于是会去编辑/上报一个与这个工作区毫无关系的 PR；没有则
   `gh pr create --base <ws.baseBranch minus origin/>` → `action: "created"`
   + 从 gh 输出解析出的 `{ review, url }`。**`--base` 始终显式给出**（`baseRef`，与比较 URL 使用的同一个归一化）：
   没有它，gh 会以分支配置或仓库默认分支为目标，于是一个从 `release/x` 创建的工作区会对着
   `main` 打开它的 PR。**变更性的 gh 调用以 60s 超时运行**（共享运行器的 8s 默认只适合只读查找
   —— 把一个变更操作在半途杀掉正是重复 PR 的产生方式），而失败/歧义的 `create` 之后会跟一次
   **复查**（再跑一次 `gh pr list`）：如果尽管报错 PR 已在服务端存在，就以 `created` 返回它
   —— 绝不用比较回退，那会招来一个重复 PR。
5. `gh` 缺失/未认证/失败，或 `THINKRAIL_GH_OFFLINE=1`（与 `github` 模块共享的 e2e 接缝）→
   `action: "compare"` + 一个预填的 `quick_pull` 比较 URL（标题 + 正文，正文按 URL 长度安全
   封顶在 4k）—— 客户端在浏览器里打开的零认证回退。当 `github` 的 `ghSetupProblem()` 能说出
   原因（`missing` / `unauthenticated`）时，结果把它作为 **`ghProblem`** 携带，这样客户端会
   显示设置指引，而不是光秃秃的比较交接。探测**只在 gh 流程确实失败之后**运行（绝不在顺利
   路径上 —— `gh auth status` 是一次网络往返，而一个*能用*但报告怪异的 gh，例如带有陈旧的
   第二主机 token，绝不能被跳过它的一键路径），并且它是**异步的、带 8s 杀时** —— 进程内宿主
   共享一个事件循环，同步探测会冻结每个会话。探测若发现 gh 已安装 + 已认证（一次瞬态流程失败）
   以及离线接缝，都保持不命名 —— 静默的比较回退保留。
6. 每个结果都携带 `dirtyFiles`（未提交改动的数量），这样客户端可以警告那些不会进入 PR 的改动。
   脏状态从不阻塞。服务端的 `openPr` 结果还携带用于 push/gh/compare 的确切刷新后 `branch`；
   宿主对着那个分支对评审快照做 CAS，并在线上响应之前把它剥掉。对用户所有的检出而言，在脏
   读取 await 之前捕获分支是不可靠的，因为 `openPr` 有意在那一 await 之后刷新。

开放 PR 的*读取*侧仍由 `workspace.openReview`（`branch-review`）负责 —— 本模块不持久化任何
东西；客户端从那次查找加上本次调用的结果重新推导按钮/标签状态。那次查找是有缓存的，所以每次
成功推送都会丢掉工作树先前的答案：即使远端不是 GitHub 或动作回退到比较，推送也可能改变分支的
远端配置。一次 GitHub 变更尝试在尘埃落定后再丢一次，这样一次并发的"没有 PR"读取不会在一次
更新、一次创建或一个歧义的创建结果之后存活下来。

## 边界

- **拥有：** 推送 + PR 动作、从线上协议计划渲染 PR 正文、GitHub slug/比较 URL 的推导。
- **Public surface（公开接口，barrel）：** `openPr`, `previewPr`.
- **允许的依赖：** `workspaces`（工作区记录、`refreshUserOwnedWorkspace`）、`git`（exec + 状态）、
  `todos`（正文用的 `listTodos`）、`branch-review`（提供商探测、已有 PR 查找、共享命令运行器、
  `forgetOpenBranchReview`）、
  `github`（`ghSetupProblem` —— 命名的比较回退原因）；`contracts` 类型；
  `shared/codedError`（`PUSH_AUTH_FAILED`）。
- **绝不触碰：** `host`；提供商 HTTP API 或存储的 token（认证保持外部 —— 只有用户的 `gh`）；
  持久化 PR 状态（那会复制 `workspace.openReview` 的推导）。
- 所有 `gh` 流量都经一个注入的 `PrCommandRunner`，所以单元测试绝不启动真实的 CLI。
