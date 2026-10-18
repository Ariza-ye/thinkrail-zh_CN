---
id: submodule-server-workspaces
type: submodule-design
status: active
title: workspaces —— git 工作树
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## 职责

一个工作区是数据目录下、拥有自己分支的一个 `git worktree` —— 文件/git/终端/聊天的锚点。它的
**显示 `name` 与它的 git `branch` 解耦**：`name` 是人类可读的标签（Title Case、带空格），而 `branch`
是由它派生出的 kebab slug —— 它们曾经被设为相等，且对自动的 `workspace-N` 占位符仍然重合，但一个
已命名的工作区把两者各自分明地携带。

有两类是**用户拥有的** —— ThinkRail 使用它们的 cwd，但绝不重命名或回收它们。每个项目都带有**恰好
一个内置的 Default 工作区**（`kind: "default"`），其 `worktreePath` 就是项目文件夹本身（git 的
*主工作树*）—— 那个“就在我的项目文件夹里干活”的锚点，惰性确保，**不可移除且不可重命名**。用户
显式附加的任何**既有工作树**都就地记录为 `kind: "external"` —— 在数据目录之外，绝不在这里创建或
改动。

## 边界

- **拥有：** `listExistingWorktrees(projectId)`（**异步** —— 解析经由 `gitAsync` 读到的
  `git worktree list --porcelain -z`，与 `git/SPEC.md` 为 `gitStatus`/`listCommits` 说明的同一条
  请求路径读取规则：这是 Existing-Worktree 对话框的填充调用，因此一个缓慢/庞大的登记表绝不能冻结
  宿主的事件循环；丢弃项目文件夹、可修剪的登记项，以及每个已由 ThinkRail 表示的路径；由分支支撑的行
  是 `available`，分离 HEAD 的是 `detached`）、`openExistingWorktree(projectId, path)`
  （**异步**，因为同样的工作树列表读取；在改动入口处对着 Git 登记表重新校验，比较规范化后的路径；
  同项目重试是幂等的，跨项目复用 cwd 被拒绝；持久化并以 `kind: "external"`、一个目录基名的显示名、
  `renamed: true`，以及仓库默认值作为其初始评审目标发出 `created` —— **不做任何 Git 或检出改动**）、
  `createWorkspace`（**异步**；给了 `baseRef` 时从它派生 —— 用 `worktree add -b` 建分支，绝不是一个
  分离的远程检出，并且**带 `--no-track`**：否则一个远程跟踪的基线会成为新分支的上游（git 的
  `autoSetupMerge` 默认），把工作区终端的 `git push`/`git pull` 瞄准*基线*分支 —— 工作区分支的上游
  是用户在首次推送时要设定的，绝不是我们的；否则从仓库 `HEAD` 派生；**远程 ref 的新鲜度被预取到这
  条关键路径之外** —— New-Workspace 对话框在后台对基线做 `git.prefetch`，因此 create 只在本地远程
  跟踪 ref 完全缺失时才作为回退去做 `git
  fetch` —— 该回退经由 `gitAsync` 运行（网络绝不能阻塞事件循环；给等待设限并截断 stderr 是运行器的
  工作，不是这个调用点的），且分支在 `--` 之后传入，而**一次没有落地该 ref 的回退 fetch 会让 create
  失败**，点名该 ref 并携带 git 自己的 stderr —— 包括当远程根本没有作答时，以运行器自己的
  `timed out after <n>s …` 替代它。配置的远程是所选 ref 的最长匹配前缀，因为 Git 允许像 `team/upstream`
  这样的名字。守护的是 **ref**，不是退出码：一条收窄的 refspec（`remote add -t`、`--single-branch`，
  或一个被编辑过的 `remote.<name>.fetch`）能让 `git fetch <name> -- <branch>` 以 0 退出却不创建
  期望的 `refs/remotes/<base>`，而以 `!fetched.ok` 为键，恰恰让那种情况漏到派生出来的
  `fatal: invalid reference` 上，而本条声称已经移除了它。**该探测完整点名 `refs/remotes/<base>`**，
  与 `git` 的 `prefetchBranch` 完全一样 —— 像 `origin/<b>` 这样的简写也可能解析出一个字面名为
  `origin/main` 的本地分支；这场竞态的两边必须询问同一个 ref。**`worktree add` 拿到的也是那个完整
  名字**，不是简写：检查一个 ref 却检出另一个，会让 Git 的消歧去选择或拒绝错误的对象。
  `baseBranch` 仍记录用户可见的 `<remote>/<branch>`；只有交给 Git 的那个修订被限定。
  **消息也按同一条区分来分裂**：一次*失败*的 fetch 携带 git 的 stderr，而一次*成功*却没落地 ref 的
  fetch 改为点名 refspec —— 它的 stderr 是一份进度日志（`* branch release -> FETCH_HEAD`），因此把
  它贴在“无法获取”之后，会让用户看到一次成功的 fetch 被当作那次 fetch 失败的原因。知道基线*为什么*
  缺失的正是这一步，而丢弃它的结果让 `worktree add` 去报告派生出来的 `fatal: invalid
  reference: <remote>/<branch>` —— 或者，当 fetch 根本没有返回时，直到客户端请求超时之前什么也没有
  （issue #209）。该 ref 在抛出之前**用 `rev-parse` 重新检查**：一次并发的 `git.prefetch` 可能在
  fetch 在飞时已经落地它，而一次本会成功的 create 不该输掉这场竞态；`Workspace.baseBranch` 记录
  **创建来源** —— 工作树是从哪个 ref 切出来的，此后绝不移动（那个差异是相对*什么*来度量的，是另一个可
  重新指向的 `diffBase`；见 `setWorkspaceDiffBase`）；**分支名对着 ref *与*工作树目录都做唯一化**
  —— 归档会把分支留在原处，重命名会释放一个其工作树目录仍被占用的分支名，因此候选名跳过这两者；
  路径为 `dataDir/worktrees/<project-slug>/<branch>`；**播种临时性的每工作区草稿目录**
  （`WORKSPACE_CONTEXT_DIR`，带一个自我忽略的 `*` `.gitignore` —— 零 git 足迹）于新工作树中，
  那是临时文档（task-spec / 工作文件）的家，它们不进 git 却仍能被规范工具扫描到（路径约定住在
  `@thinkrail/shared/paths`；见 [[submodule-workflow-skills]] 的产物规则）；**用户提供的名字就是
  显示名**（通过 `toDisplayName` 保留大小写 + 标点；分支由它派生）并在 create 时**设置
  `renamed: true`** —— 用户已经选过了，因此自动命名从此绝不碰它；自动 `workspace-N` 让它保持未设置，
  此时 `name === branch`；**在等待过的回退 fetch 之后重新读取登记表**再追加 —— 等待之前的快照到那时
  已经过期，保存它会让一次并发列表的 Default-ensure 被覆盖（与 `renameWorkspace` 在其 git 子进程
  之后重新加载是同一纪律））、
  `renameWorkspace`（**同步**；设置净化后、保留大小写与文字的显示 `name`，并总是设置
  `renamed: true`，因此自动命名再也不碰它。**`opts.branch`** 是 agent 从 `set_title` 来的英文
  slug：当它存在时，分支变成该 slug 的 ASCII kebab 形式，钳制到 60（显示名可以是任何文字，因此分支
  绝不从它派生），对着 ref 与工作树目录唯一化，并用 `git branch -m` 移动，而**工作树目录绝不移动**
  （pi 以那个确切的 cwd 为键索引会话与终端/标签页）；一个净化后为空的 slug 保留当前分支。移动分支
  的路径会重新指向那些 `baseBranch` 或 `diffBase` 点名了旧分支的兄弟记录，在 Git 子进程之后重新
  加载登记表，使一次并发移除不被复活，保存一次，并为每条变更记录发出 `updated`。没有 `opts.branch`
  时 —— 手动线上方法 —— 只有显示标签变化：`branch`、`worktreePath`、`baseBranch` 与 `diffBase`
  保持不变，不运行任何 Git 改动，并发出一次完整快照 `updated`。
  **`name` 与 `branch` 在这样一次重命名之后刻意不同** —— 名字只是显示用且可以重复；其下方显示的分支
  负责消歧（见 [[submodule-web-panels]]）。未知/默认/外部 id 与无效名字仍然抛错；调用方决定呈现）、
  `listWorkspaces(projectId, { includeDiffStats? })`（**异步**；在 Default ensure + 用户拥有文件夹
  的事实核对之后给出完整权威的成员资格/顺序 —— 那个同步序言的加载→改动→保存会在第一个 await 之前
  完成；随后差异统计徽章**经由 `gitAsync` 并行**解析，在事件循环之外，并且**在 await 之后重新读取
  成员资格**（与写入方同样的过期快照纪律）：一个在徽章解析期间被创建的工作区必须出现在本次响应里，
  因为它的 `created` 推送可能先于这个回复播种该客户端列表而到达，而推送进一个未列出的项目被刻意
  不折叠 —— 一个在飞行中途出现的行会不带统计地发出，直到下一次列表。缓存统计**只在其定义差异的
  字段（`worktreePath`、`baseBranch`、`diffBase`）仍与计算它所依据的快照相符时**附加到一个新行上
  —— 一个在徽章解析期间落地的 `setDiffBase` 同样会丢掉该行的徽章，绝不把新 ref 与旧 ref 的合计
  配在一起。`workspaceDiffKey` 是这个身份唯一的公开定义，与 `reviews` 共享，使一次跨同一竞态创建的
  评审对着新目标重试，而不是钉住旧目标。差异统计默认**开**以保持兼容，而 `includeDiffStats: false`
  为冷导航跳过每工作区的扇出 —— 一个共享宿主上的自动重载绝不该对每个工作树都做差异）、
  `listWorkspaceRecords`（原始登记记录，不做 Default ensure、文件夹事实核对或每工作区 git
  diffStats —— 供历史 scope 映射之类绝不能因 git 派生而阻塞的内部只读路径使用）及其不带项目的兄弟
  `listAllWorkspaceRecords`（每条记录，供必须在不知道哪些项目已打开的情况下跨工作区的宿主读取 ——
  全工作区的 `session.stateList` 读取）、`workspaceDiffStats`、
  **`setWorkspaceSubagentsOverride(id, override)`** —— 持久化 `"on"` / `"off"`，或为 `null`
  （继承）删除 `Workspace.subagentsOverride`，然后发出权威的完整 `workspace.updated` 快照。它校验
  封闭值，但绝不读取全局默认值，也不解析有效的 agent 策略；宿主跨兄弟边界组合那件事；
  **`setWorkspaceSubagentMaxConcurrent(id, value | null)`** —— 对数值
  `Workspace.subagentMaxConcurrentOverride` 的同一契约（一个 `SUBAGENT_MAX_CONCURRENT` 整数，
  `null` 删除）；**`setWorkspaceDiffBase(id, ref | null)`** —— 重新指向本工作区差异所相对度量的那个
  ref（`Workspace.diffBase`），`null`（或创建基线本身，那会是一次多余的覆盖）清除它；持久化并
  **广播更新后的记录**，使每个客户端都在推送之上收敛，绝不乐观（完全照 `setWorkspaceSkillOverride`
  建模）。两个 **ref 门** —— 这一个与 `createWorkspace` 的 `baseRef` —— 都在它可能到达一个 git 参数
  之前，通过 `git` 模块的 `assertSafeRef` 校验该 ref 的*形状*（一个选项形状的分支从任何不可信仓库
  都可达；见 [[submodule-server-git]]）。`createWorkspace` *无条件*校验**解析后的**基线，而不只是
  客户端提供的那个：没有选定基线时它来自 `rev-parse --abbrev-ref HEAD`，即来自仓库，而一个不可信的
  检出可能检出了一个选项形状的分支（`git branch` 拒绝这样的名字，`symbolic-ref` 不拒绝）—— 同一扇门
  的两半，由一次检查关闭。**两个基线含义是两个字段，这是刻意的：** `baseBranch` = 分支从何而来
  （对一个用户拥有的工作区，其来源不是我们可认领的：仓库默认值作为它的*初始*评审目标，绝不标记为
  `from`），`diffBase` = 其评审是相对什么度量的；把两者合并会让一个被重新指向的目标在其来源上撒谎
  （`branch · from baseBranch` 回执）。每一次对“基线”的读取都经由 `git` 模块解析，绝不内联 ——
  `diffStats` 组合 git 模块的**分支范围区间**（`resolveDiffRange` +
  `changedFileArgs(…, "--shortstat")`），因此工作区聚合度量的恰好是 Changes 面板所显示的
  （包含 merge-base 语义 —— 基线上的上游提交绝不会让它膨胀），并像本应用传递的每个其他 rev 一样，
  处于 `--end-of-options` … `--` 的包裹之中到达 git。当 git 无法作答时，`diffStats` **完全不给统计**
  （并被记录日志），而不是伪造一个 `+0 −0` —— 一次失败的读取绝不能把一个脏工作树画成干净的；
  `Workspace.diffStats` 字段就是缺席，而 `workspaceDiffStats` 拒绝、
  `getWorkspace`（按 id 查找，未知时抛错 —— 锚定一个聊天会话的 cwd），以及**归档**原语，拆开以使
  快速的记录丢弃与缓慢的 git 回收可分离（宿主在请求的关键路径之外做归档）：`forgetWorkspace(id)`
  （丢弃持久化记录，返回被移除的记录或 `null` —— 立刻从 `listWorkspaces` 消失）、
  `reclaimWorktree(ws)`（缓慢的那一半 —— `git worktree remove --force`，保留分支；加固过：git 失败时
  rm + `prune`；**两种用户拥有的类别都拒绝，并且作为纵深防御，任何 `worktreePath` 解析到项目文件夹的
  记录也拒绝** —— 无论一条损坏/手改的记录是怎么到那里的，rm 回退绝不能看到用户的仓库或一个附加的检出）、
  以及 `removeWorkspace(id)`（两者的同步组合，为想要一次调用完成整个归档的调用方/测试保留）。
- **Default 工作区（`kind: "default"`）：** 每个项目恰好一个。`listWorkspaces` **确保**它 —— 按
  `projectId`+`kind` 查找或创建（id 就是一个朴素的 `randomUUID`；`kind` 字段是那个标记，绝不是一个
  id 约定），在带外状态变动曾经造出两个时防御性地**合并重复项** —— 并把它**钉在最前**返回。列表内的
  ensure 是一次**刻意的 CQS 例外**：该查询执行一次登记表写入 + 生命周期发出，使*任何*调用方都能自愈
  带外状态变动（回填在特性存在之前打开的项目；e2e 重置在运行中途重写 `workspaces.json`）—— 该写入
  落于数据目录下应用自己的登记表，绝不进入用户的仓库。没有 `git worktree add`（该文件夹已经是主工作
  树），且**ensure 时不做草稿目录播种** —— 仅仅列出一个项目绝不能写进用户的仓库（见
  `ensureWorkspaceScratchDir`）。字段是文件夹事实，在漂移时于列表时刻刷新 —— **发出 `updated`**，
  使每个客户端的侧栏都收敛，而不是某个标签页在一次终端里的 `git checkout` 之后停在旧状态
  （`renameWorkspace` 为同样的字段使用同一个通道；store 的合并不会触发重新列表，因此没有反馈环）：
  `branch` = 该文件夹当前的 HEAD（`symbolic-ref --short`，未诞生的 HEAD 也安全；分离 → 字面量
  `HEAD`），`baseBranch` = 经由 `git` 的 `resolveDefaultBranch` 得到仓库的默认分支（未诞生的 HEAD
  也安全 —— 它最后的回退是 `currentBranch`，因此字面量 `"HEAD"` 绝不持久化）—— 于是 Default 的
  Changes 像任何工作区一样度量，当该文件夹本身就停在默认分支上时退化为未提交的工作。漂移**不只是**
  列表时刻的发现：`refreshUserOwnedWorkspace(workspaceId)` 是同一次重新同步，但**不带**差异统计列表
  （一个外部工作区只重新同步它的 `branch`，而一个不可读的检出绝不被持久化成一个假的分离 `HEAD`；
  未知 id / 一个受管工作区 / 无漂移 → 不保存，不发出），宿主把它接到 `watch` 的**仓库元数据提示**
  （宿主中介，`watch` 没有 `workspaces` 边 —— 见 [[submodule-server-watch]]）。因此在 Default 工作区
  终端里的一次 `git switch` 会实时收敛侧栏、顶栏与空置回执，而不是把它们留在旧分支上直到一次手动项目
  重载 —— 包括一次让工作树字节完全不变的切换（`git switch -c`），它在 `.git` 之外什么也不写
  （`gitStatus` 出于同一原因活读它的头部信息分支 —— 见 [[submodule-server-git]]）。
  首次实体化发出 `created`（对 store 幂等）；一次无漂移的列表什么也不发出。每一次 ensure 发出 ——
  `created`、`updated`、合并产生的 `removed` —— 都发生在保存**之后**，与该模块在别处一贯的
  “先持久化后发布”顺序一致。**不可移除 + 不可重命名，在这里强制执行，而不只是藏在 UI 里：**
  `forgetWorkspace` 与 `renameWorkspace` 在 `kind: "default"` 上**抛错** —— forget 会把项目文件夹
  交给归档拆除的 `rm -rf` 回退，rename 会对用户真正的分支做 `git branch -m`；该记录带
  `renamed: true`，使 `set_title` 作为双保险避开它。
- **已结算的生命周期事实（宿主拥有，绝不是分区本身）。** 该记录携带 `lastActiveAt`、
  `settledOverride` / `settledAt`，以及 [[module-contracts]] 中描述的 `review` 快照；哪些行是活跃的、
  哪些待在货架上，是*客户端*在这些事实加上会话状态之上的推导，因此本模块绝不存一个可能与规则相悖的
  “settled”布尔值。写入方：`recordWorkspaceActivity(id, at = now)` —— 盖上 `lastActiveAt`，
  **清除任何 `settledOverride`**（一次显式的搁置或钉住是关于一个安静工作区的声明；其中真实的工作会让
  两者都让位），并把写入**合并**到每个工作区每分钟至多一次，使一个流式 agent 不会按 token 重写
  `workspaces.json` —— 只有在被跳过的那个盖章不可能改变分区时才允许合并：一次覆盖的清除绝不被合并掉，
  一行其已合并/已关闭的评审当前正让它结算时的一次盖章同样不被合并（它之前的盖章不比该评审的
  `changedAt` 更新）。每次观察还推进一个内存高水位：如果工作在存储的评审仍开着时落地，而之后一次刷新
  才首次揭示它其实早已合并，评审写入方会在同一次保存里冲刷那个被合并掉的盖章，因此得知合并这件事本身
  不可能把更新的工作搁上货架；`backfillWorkspaceActivity(id, at)` —— 只在记录没有盖章时设置它，且不
  碰任何覆盖（为早于该字段的记录准备的升级路径）；`recordWorkspaceHead(id)` —— 读取工作树的 `HEAD`
  sha，并在它与本次宿主生命周期中观察到的上一个 sha 不同时调用 `recordWorkspaceActivity`（HEAD 移动
  是提交/拉取/检出的代理信号；原始的 git 目录监视器也会因索引刷新而触发，这就是为什么信号是那个 sha
  而不是事件），配合 `seedWorkspaceHead(id)` **每当一个工作树监视器启动时**观察一次 HEAD：一个宿主
  生命周期中的第一次观察负责播种，而监视器重建则与保留的基线比较，并计入监视器缺席期间所做的工作。
  `settleWorkspace(id)` / `unsettleWorkspace(id)` —— 设置 `"settled"` / `"active"` 与 `settledAt`，
  **在 `kind: "default"` 上抛错**（项目文件夹绝不被搁上货架）；`setWorkspaceReview(id, review |
  null, branch)` —— 持久化该快照，只在它确实变化时发出 `updated`，因此周期性的提供商刷新在什么都没
  动时是静默的，并且**只在记录仍处于那次查找所针对的分支上时**才持久化 —— 提供商的答案是关于某个分支
  的事实，而一个外部工作树可能在那次查找花掉的几秒内被切换；出于同一原因，每一次持久化的分支转换都会
  丢弃 `review` 快照 —— 用户拥有的文件夹事实刷新与受管工作区那一次性的分支重命名都是如此 —— 因为一个
  比其分支活得久的已合并快照会把新分支搁上货架，并且由于它已是合并状态，绝不会被被动刷新。每个写入方
  都发出完整快照的 `updated`。`createWorkspace` 与 `openExistingWorktree` 在创建时盖上
  `lastActiveAt`，因此一个全新的行在构造上就是活跃的。**迁移：** 宿主为没有盖章的记录回填，取自最新
  聊天的文件时间，否则取工作树 `.git` gitfile 的 mtime（≈ `worktree add` 时间），否则取当前时间 ——
  因此在升级之后，一个休眠的积压会自行结算，而任何有近期聊天或一个打开 PR 的东西保持活跃。
- **初始终端供给是一次持久的宿主握手。** 每个由 `createWorkspace`、`openExistingWorktree` 或
  Default ensure 首次持久化的工作区记录，都携带可选的字面量
  `initialTerminalPending: true`。`host` 幂等地预留那个确定性的、无进程的终端标签页，然后调用
  `completeInitialTerminalReservation(id)`，它清除该标记、持久化并发布更新后的工作区。预留失败会让
  它保持挂起，留给宿主的启动/创建恢复遍历；成功则在任何前端放置之前清除。只有当前代码创建的记录才
  收到该标记；没有该标记的记录被视为已完成，且绝不回填，因此一次升级无法复活用户此前关闭过的默认
  终端。没有任何布局修订参与其中。
- **`ensureWorkspaceScratchDir(ws)`** —— 幂等地播种那个被 git 忽略的 `WORKSPACE_CONTEXT_DIR` 草稿
  目录（mkdir + 自我忽略的 `*` `.gitignore`）；宿主**在会话创建时**为每个工作区调用它，因此 Default
  工作区只有在聊天真正在那里开始时才会写进用户的仓库（工作树的创建仍在 create 时即刻播种；这也会自愈
  一个草稿目录被删掉的工作树）。已加固，因为在 Default 工作区里它运行在**仓库控制的内容**之上：它
  **在工作区根缺失时抛错**（一个被外部删除的工作树必须让会话显式失败，而不是被复活成一个空的非 git
  目录）；它**拒绝符号链接的路径分量**（`lstat`，绝不跟随 —— 一个恶意的检出无法把播种重定向到工作区
  之外）；而 `.gitignore` 的写入是**独占创建（`wx`）—— 只在文件缺席时**：在 Default 工作区里那条
  路径位于用户自己的仓库内，那里一个已存在的（可能被跟踪、可能被自定义过的）文件是他们要保留的，而
  `O_EXCL` 绝不跟随一个（可能悬空的）符号链接；播种只填补空缺，绝不覆盖（由回归测试固定）。
- **生命周期事件：** 每一次成员资格改动 —— `createWorkspace`（`created`）、`renameWorkspace`
  （`updated`，agent 的 `set_title` 也算，因为它经由它走）、`forgetWorkspace`（`removed`）—— 都
  通过一个**注入的发布器**（`setWorkspacePublisher`，与 `terminal`/`agent`/`auth` 所用的同一种反转；
  在单元测试 / e2e 重置里为 `null` → 静默 no-op）发出一个 `WorkspaceLifecycleEvent`。本模块对 WS
  频道保持无知：它发出一个领域事件（`created`/`updated` 携带记录，`removed` 携带 `{ projectId, id }`），
  而宿主把 `kind` 映射到 `workspace.*` 频道。这使本模块成为**工作区生命周期推送的唯一来源**（命名
  处理器绝不推送 —— 重命名自行发布），因此登记表成员资格在每个客户端之上保持共享的领域状态
  （架构 #9）。
- **Public surface（公开接口，barrel）：** `createWorkspace`, `listExistingWorktrees`,
  `openExistingWorktree`, `listWorkspaces`, `listWorkspaceRecords`, `listAllWorkspaceRecords`,
  `forgetWorkspace`, `reclaimWorktree`, `removeWorkspace`, `workspaceDiffStats`, `workspaceDiffKey`,
  `getWorkspace`, `renameWorkspace`, `refreshUserOwnedWorkspace`,
  `completeInitialTerminalReservation`, `ensureWorkspaceScratchDir`, `setWorkspacePublisher`,
  `WorkspaceLifecycleEvent`, `setWorkspaceDiffBase`, `setWorkspaceSkillOverride`,
  `setWorkspaceSubagentsOverride`, `setWorkspaceSubagentMaxConcurrent`, `recordWorkspaceActivity`,
  `backfillWorkspaceActivity`, `recordWorkspaceHead`, `seedWorkspaceHead`, `settleWorkspace`,
  `unsettleWorkspace`, `setWorkspaceReview`
- **允许的依赖：** `projects`（仓库查找）、`git`（运行器）、`persistence`、`log`；`contracts`；
  `@thinkrail/shared/paths`（草稿目录的路径约定）；Node。
- **绝不触碰：** `host`；伸手进另一个特性的内部实现（用它的 barrel）。
