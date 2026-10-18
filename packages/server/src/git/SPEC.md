---
id: submodule-server-git
type: submodule-design
status: active
title: git —— 运行器 + 工作树状态/差异
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## 职责

Git 管道：底层 `git` 运行器（同步 + 异步），加上一个工作树在某个**差异范围**之上的改动文件
与差异、那个范围的唯一定义（范围解析器）、供分支选择器使用的项目仓库分支列表、工作区分支自己的
提交列表，以及一个把远端基线 ref 挪出工作区创建关键路径的后台预取。

## 边界

- **拥有：** `git(cwd, args)`（*同步* spawn git，捕获修剪后的 stdout/stderr + ok；`opts.raw` 保留
  未修剪的解码 stdout）及其模块内部的 `gitBytes(cwd, args, opts?)` 双胞胎（同步、保字节，为
  `reviews` 的同步快照过程保留）。`gitAsync(cwd, args, opts?)` 与
  **`gitAsyncBytes(cwd, args, opts?)`** 是架在 `subprocess.runBounded` 之上的有界异步双胞胎；
  后者把 stdout 保留为 `Uint8Array`，而 stderr 仍是解码后的诊断。它们把 `fetch` 这类网络受限操作
  **以及请求路径上的历史读取**挡在事件循环之外：本模块只拥有 git 形状的 55s 预算与 停滞/stderr
  措辞，绝不拥有子进程生命期机制。`opts.env` 让调用方用自己的环境免提示地运行，并把 blob 诊断
  钉成英文；`opts.network` 单纯标记 fetch/push，好让一次无输出的超时能点名远端。**超时会保留 git
  在被杀之前写下的全部内容**：运行器持续排空，所以在到期时它的 `err` 已经握着真正的诊断 ——
  一次 publickey 拒绝、一个代理的拒绝、`remote:` 进度证明一次大传输只是还在跑。当 git *什么都没*
  写时，一个被显式标记为网络的操作会得到那个有条件的 ssh-key 提示；一次本地 `diff`/`log`/ref
  读取只会得到观察到的事实：git 没有退出 —— 绝不编造一个远端原因。两个异步运行器都为那些执行
  失败携带 `failure: "timeout" | "launch"`；一次正常的非零 Git 退出不携带执行失败，所以语义探测
  能区分"ref 不存在"与"Git 从未作答"。这些读取沿用同一个 55s 默认值（`opts.timeoutMs` 可覆盖
  它）：一次本地读取若到了必须*有界*的地步，那就是 git 卡死了，而在它被移出事件循环之前，每一次
  这样的读取都是无界的；
  **`remoteTrackingRef(ref, remotes)`** → 当 ref 以该仓库某个已配置的远端名开头时为
  `refs/remotes/<ref>`（`remoteNameOf`，由 `listRemotes` 喂），否则 `null` —— **那个拼法被构造的
  唯一地方**，所以下面的探测与 `workspaces` 的 `worktree add` 无法彼此漂移。匹配选择最长的远端
  前缀，因为 Git 允许远端名里出现 `/`（`team/upstream`）；按第一段解析会取到错误的远端。是否是
  远端是对照实际的远端列表决定的，绝不是对照字符串的形状：`upstream/main` 与一个本地的
  `feature/main` 形状相同。于是 `listBranches` 枚举整个 `refs/remotes`（每个符号别名，包括每个
  远端的 `HEAD`，都被跳过），并在同一个异步扇出里读取 `git remote`，以可选的
  `BranchList.remoteGroups` 附加权威归属。一次归属读取失败会拒绝整个目录，而不是让浏览器去猜；
  一个没有已配置所有者的跟踪 ref 会保留在一个 `null` 分组下。`prefetchBranch` 从 ref 点名的任何
  已配置远端取回，而 `workspaces` 取回并检出同一个完整限定的跟踪 ref。
  **`resolveDefaultBranch` 保留它的同步 spawn 预算** —— 每一个 Default 工作区的 `folderTruth` 都会
  调用它，所以多一次 spawn 就是每次工作区列表都要付的共享事件循环时间。Origin 的 HEAD 仍是一条
  单独的 `symbolic-ref`（在它悬空时唯一能看见它的读取），随后是一次覆盖完整 `refs/remotes/…`
  名字的 `for-each-ref`。只有全名以 `/HEAD` 结尾的 ref 可以供给另一个远端的默认分支；任意的符号
  别名都被忽略，而对 `refs/remotes/origin/main` 的精确全名检查，不会被一个字面就叫
  `origin/main` 的本地分支混淆。一个悬空的非 origin HEAD 对 `for-each-ref` 依旧不可见，并退化到
  既有的猜测。它的作用范围**只在创建时**，而 `resolveDiffRange` 是指名道姓的幸存者：`diffBaseRef`
  把记录在 `baseBranch` 里的 `origin/<b>` 简写交给 git，所以在创建如今要防的那种设置里 —— 一个字面
  就叫 `origin/main` 的本地分支 —— 工作树从 `refs/remotes/origin/main` 切出，而差异却是对着那个
  诱饵量出来的。之所以留着不动，是因为 `diffBase` 由用户单独设置、可以点名任何 ref，所以给它加
  限定是改变*钉定*基线的含义，而不是修一个拼法；
  **`remoteRefOid(repoPath, ref)`** → `refs/remotes/<ref>` 解析出的 oid，或 `null` —— **问一个
  远端跟踪 ref 是否存在的那唯一一种方式**，由 `prefetchBranch`（比较 oid 以报告 `moved`）与
  `workspaces` 的创建回退共享。它按 `isSafeRef` 门禁，而不是按远端列表，因为该跟踪 ref *能否
  解析*就是它回答的全部内容，而这样的 ref 会活得比远端的配置更久。它隔着 `--end-of-options`
  探测**完整的** `refs/remotes/` 路径：`origin/<b>` 简写会走 git 的消歧，可能解析成一个同名 tag
  或一个该名字的本地分支，那样各调用点就会在不同的对象上竞速。"唯一一种方式"是字面意思 ——
  没有调用方手工重拼那个 `rev-parse`；
  **`nonInteractiveGitEnv()`** —— 两个运行器 spawn 时都在其下的默认环境（`git` 唯一的选项是
  `raw`；只有 `gitAsync` 接受 `opts.env` 覆盖，例如 `pr` 的非交互式推送，它叠加自己的 SSH 批处理
  模式设置）：`process.env` 加上 `GIT_TERMINAL_PROMPT=0`，默认**别无其他**。它不读任何配置，也不
  自行改写用户的任何 ssh 设置；
  **请求路径上的读取走 `gitAsync`** —— `resolveDiffRange`、`gitStatus`、`gitDiffFile`、
  `listCommits`、`listBranches` 以及工作区徽标扇出都是异步的，所以一次多次 spawn 的读取绝不可能
  冻结宿主的单一协作式事件循环（迁移前实测每次 `workspace.list` 冻结 119–246ms）。同步运行器留给
  **写入者**（它们 加载→变更→保存 的原子性依赖于不交错 —— `gitCommitPaths` 的索引快照/恢复、
  `workspaces` 的各写入者），也留给与那些写入者共享的**微型管道叶子辅助函数**
  （`currentBranch`/`tryCurrentBranch`/`resolveDefaultBranch`/`resolveCommitOid`/`readBlobAt`/
  `gitHeadSha` —— 单次快速的本地 ref 读取），再加上 `gitUncommittedPaths`，那个有意为之的生命期
  例外：它在 agent 能越过其 `in_progress` 工具结束继续之前，对一段 TODO 工作窗口做快照；
  **`snapshotWorktree(worktreePath)`** → 在 git 此刻看来该工作树的树 oid（跟踪的编辑与未跟踪的
  文件，被忽略的文件排除在外），通过 `GIT_INDEX_FILE` 下一份临时索引副本写出，所以用户真正的
  索引、`HEAD` 与 reflog 绝不移动 —— 这是 `turns` 模块围绕一次 agent 运行的前/后围栏；它返回
  `null` 而不是抛出，因为错过一次快照只损失一份回执。git 读不了的文件会被跳过，而不是致命：
  `add --ignore-errors` 在写完其他一切之后仍然退出 1，所以只有 `fatal:` 或一次超时/启动失败才会让
  它作废；
  **作用域→范围解析器** —— `resolveDiffRange(ws, scope?)` → `Promise<DiffRange>`（异步 —— 而且
  有意保留*单一*实现：它的 `reviews` 消费者随它一起转成异步，而不是留一个易漂移的同步双胞胎）——
  **一个 `GitDiffScope` 意味着什么的唯一定义**（`branch`：`git diff <merge-base(base, HEAD)>` +
  未跟踪，两侧 = **分叉点** ↔ 工作树 —— 工作区*自分叉以来*改了什么，所以一个在其之下推进过的
  基线（一次 fetch 移动了 `origin/main`、上游工作落地）绝不会冒出来变成幻影改动；而在基线尚未分叉
  时 merge-base *就是*它的尖端，一次正常的非零 `merge-base`（基线缺失、无共同历史、未出生的
  `HEAD`）会回退到原始 ref，保住既有的错误面 —— 并保持文件列表与 `listCommits` 的 `base..HEAD`
  在祖先关系上一致；一次超时或启动失败会抛出，而不是冒充那个语义结果。同一个区分让一次超时的
  提交探测不会变成 `UNKNOWN_COMMIT`，也让一次超时的父提交探测不会变成根提交；
  `uncommitted`：`git diff HEAD` + 未跟踪，两侧 = `HEAD` ↔ 工作树；`commit`：`git diff <sha>^ <sha>`，
  无未跟踪，两侧都来自历史 —— 一个**根**提交退化为 `git show --format=` 且原始侧为空，与一个
  缺失路径本就得到的同样的"新增式"退化；`pinned`：`git diff <oid>` + 未跟踪，两侧 = 给定的不可变
  提交 ↔ 工作树 —— 评审侧边栏的基线侧导航，校验方式与 `commit` 的 sha 完全一样，同样
  `UNKNOWN_COMMIT` 拒绝；`turn`：`git diff <baseTree> <headTree>`，无未跟踪，两侧都是 `turns`
  模块围绕一次 agent 运行所取的**树**快照 —— 每个 oid 都做形状检查并验证为 `^{tree}`，一个被
  修剪掉的快照以同样的 `UNKNOWN_COMMIT` 拒绝，好让客户端以同样的方式重置该范围）。两个读取都
  通过 `changedFileArgs(range, mode)` 从它构建 argv，所以文件列表与一个文件的两侧绝不可能对范围
  意见不一 —— 而那段 argv 在**两侧**都给它的 rev 加了括号：它们前面是 **`--end-of-options`**
  （任何 ref 都无法被重新解析成 git 选项），它们后面是一个收尾的 **`--`**（一个同时也命名了磁盘上
  某条路径的 rev —— 一个叫 `docs` 的分支 —— 会被当作 rev 读取，而不是让命令以"ambiguous argument"
  失败）。一次**失败**的 `git diff`、未跟踪 `ls-files` 或 `git show` **抛出**；只有 Git 明确的
  路径不存在诊断才产出一个空的文件侧，所以一次坏掉的读取绝不会被报告成没有改动或一次新增/删除。
  一个 `commit` 范围的 `sha` 被校验**两次** —— 形状（十六进制 oid 正则，所以一个构造出来的值绝
  不可能作为选项或路径到达 git 参数）然后是存在性（`rev-parse --verify`，随后用的是它的完整
  oid）—— 而一个消失的提交抛出一个 **`CodedError("UNKNOWN_COMMIT")`**
  （`@thinkrail/shared/codedError`），宿主把它作为 `WsResponse.errorCode` 放到线上协议上，客户端
  把它变成"重置该范围，并弹一个 toast" —— *只*针对那个具名失败，绝不针对超时或一个未具名的宿主
  失败；
  **`isSafeRef(ref)` / `assertSafeRef(ref)`** —— 每个**用户/仓库提供的 ref** 在其变更入口都必须通过
  的形状检查（`workspaces` 的 `createWorkspace` 基线 —— 那个**已解析**的基线，包括从仓库自己的
  `HEAD` 读到的值 —— 加上 `setWorkspaceDiffBase` 的目标）。规则集就是 `git check-ref-format` 的
  规则集，在进程内复刻（校验路径上不 spawn）：非空、无前导 `-`、无空白/控制字符、无 `..`、
  无 rev 元字符（`~ ^ : ? * [ \`）、无 `@{` 且无裸 `@`、无空的路径分量、无以 `.` 开头的分量、
  无 `.lock` 后缀、无结尾的 `.` 或 `/`。git 自己拒绝的名字，我们绝不接受 —— 而且对称地，**不设
  长度上限**：`check-ref-format` 就没有，所以仓库真的拥有（且 `for-each-ref` 真的列出）的长分层
  分支仍可选择；长度不是安全属性，真正的限制（文件系统分量上限、argv 大小）会作为读取错误大声
  失败，而不是"畸形"。威胁是一个**不可信的仓库**，不是一个恶意客户端：`git update-ref` 接受
  `refs/heads/--output=x` 这样的名字（只有 `git branch` 这层 porcelain 拒绝它），而 `listBranches`
  用 `for-each-ref` 读 ref，所以一个选项形状的分支会进到用户打开的任何仓库的选择器里 —— 而浏览
  别人的仓库正是这个产品的职责；
  **`diffBaseRef(ws)`** —— `diffBase ?? baseBranch`，一个工作区两种基线含义（创建来源 vs 评审
  目标）的唯一折叠，由解析器与 `listCommits` 消费（`workspaces` 模块的 `diffStats` *经由*解析器
  到达它 —— 见必须做对的事）；
  **`resolveCommitOid(worktreePath, ref)`** —— 一个 ref 此刻点名的完整提交 oid，或 `null`。这是
  符号 ref 被**冻结**的唯一地方，每个此后仍须意味着同一件事的调用方都经过它：评审的 `baseSha`、
  一条基线侧评论的 `baseRef`。一个范围的 `originalRef` 本身并不可变（`uncommitted` 是字面的
  `HEAD`；一个 `branch` 范围在 `merge-base` 失败时退化到原始基线 ref），所以逐字存下一个这样的
  ref，就让它指的内容在存下它的人脚下移动。一个 `DiffRange` 把那个冻结形式作为
  **`resolvedOriginalOid`** 携带（经 `resolveCommitOid` 冻结，原始侧没有提交时为 `null` ——
  一个根提交、一个未出生的 `HEAD`、一个不再解析的基线 ref）：一个必须把*同一*原始侧读两次的
  调用方 —— `changes` 模块的 加载→校验→写入 过程、宿主的不可变 `/blob` URL —— 按 oid 寻址它，
  而不是按一个含义可能被某次提交在请求中途改变的 ref；
  `gitStatus(workspaceId, scope?)` —— 该范围之上的改动文件加上未跟踪文件（仅当范围止于工作树
  时），每个都携带逐文件的 `added`/`removed` 行数（`git diff --numstat`，其被改名搅乱的路径经
  `numstatPath` 解析以匹配 `--name-status`；二进制行被丢弃；未跟踪文件只有在 `fs.classifyBytes`
  同意它是文本时，才把整份内容算作新增，所以非法 UTF-8、含 NUL、以及魔数类型的未跟踪文件都
  像它们的 `ResourceMeta` 一样省略计数）供 Changes 树的 `+/−` 徽标使用；
  `gitDiffFile(workspaceId, path, scope?)` → `{ original, modified, originalOid, meta: { original, modified } }`
  —— `originalOid` 是该范围已解析的不可变起点（或 `null`），并且给出一个文件改动的两侧，供
  中间的差异标签页使用（`original` = 该文件在范围起始 ref 处的原始内容，缺失时为空 —— 未跟踪/
  新增、一个被改名文件的新路径，或一个根提交 —— 并退化为新增式差异；对一个止于工作树的
  范围，`modified` = 该工作树文件（被删除时为空），否则是提交自己的树；路径经
  `fs.resolveWorktreeFile` 检查，防词法逃逸、`.git` 与逃逸的符号链接；历史侧使用有界异步
  `git cat-file blob`，带确定性的英文诊断，所以只有 Git 明确的路径不存在结果才变成一个空的侧；
  树、提交、gitlink、普通的非零
  失败、超时与启动失败都会抛出）。**两侧都按字节读取，并携带一个 `ResourceMeta`**
  （`fs.resourceMeta` —— sha-256、字节长度、文本性、嗅探出的 mime）：只有是文本时才解码一侧，所以
  一个字节专用的侧以 `""` 加它的元数据传行，客户端改为经宿主的 `/files`/`/blob` 路由取那些字节，
  而不是渲染替换字符。提交范围的侧经 `gitAsyncBytes` 并发读取，保住字节同一性，既不阻塞事件
  循环，也不 spawn 第二次解码读取；**`gitUncommittedPaths(workspaceId)`** → 为上面那道 TODO 基线
  边界保留的同步 跟踪+未跟踪 路径集，用 NUL 分隔符与原始输出读取，所以文件名里合法的前导/尾部
  空白（或换行）就是身份本身，绝不修剪；`gitStatus` 对其跟踪/未跟踪行使用同一套 NUL 安全路径
  处理；**`listCommits(workspaceId)`** → `{ commits: GitCommit[] }` —— `git log <diff base>..HEAD`，
  最新在前且封顶，每个提交一行 `--format`，其字段由一个 **NUL 字节**分隔，并以**固定元数**读取
  （前四个按位置读，其后的一切再拼回去作为标题）。NUL 是仓库控制的文本唯一无法偷带进来的字节：
  一个 author ident 既不携带 NUL 也不携带换行，所以没有构造出来的 `%an` 能移动 `%cI` 或截断它
  自己，而一个携带了 NUL 的 `%s` 无论如何都会落在尾部。（`%an` 是*位于*结构化字段与标题*之间*的
  自由文本，这正是"结构化字段先行"从来不够的原因 —— 一个叫 `a<sep>2020-01-01T00:00:00Z` 的
  author 把标题挤过去一个字段。）随后自由文本字段在上线上协议之前会剥掉控制字符**以及不可见的
  欺骗性字符** —— bidi 覆盖/隔离、零宽与格式字符 —— 而普通的国际文本与 emoji 存活下来；
  一个不可读的范围（被删除的基线、未出生的 HEAD）若让 Git 正常退出则退化为一个空列表，
  好让范围菜单仍然提供它的其他范围；一次超时或启动失败会抛出，而不是擦掉一个
  此前有效的列表；**`countPushDivergence(worktreePath, branch, {fetch?})`**（异步 —— 同步双胞胎会在
  每次窗口聚焦重取时阻塞共享事件循环）→ 经一次 `rev-list --left-right --count origin/<branch>...HEAD`
  得到 `{ ahead, behind }`：**`ahead`** = origin 缺少的本地提交（未推送），**`behind`** = 分支缺少的
  origin 上的提交。`behind > 0` 意味着该分支已**分叉** —— 一次普通推送是非快进，两段历史必须被
  调和（计划页把它当作同步冲突，而不是强推的暗示）。仅当远端 ref 不存在（从未推送）时才为 `null`；
  超时/启动失败会抛出，而一次 ref 仍在的普通非零退出也会抛出，而不是冒充不存在。带 **`fetch`** 时
  它先尽力刷新 `origin/<branch>`，好让 `behind` 反映*真实的*远端（离线时回退到最近已知的 ref，
  而不是让整次查找失败）；宿主的 `workspace.openReview` **只在一次新鲜查找**时传 `fetch`
  （聚焦 / 显式刷新，而不是一次缓存激活），并把 `ahead`→`unpushedCommits`、`behind`→`behindCommits`
  组合到一份打开的评审上（与 gh 查找并行，而不是在其后），这样计划页能标出 PR 还没有的提交，
  以及分叉的同步冲突状态 —— 这里的 `origin/` 是全远端清扫的第二个有意幸存者，因为它问的是*这个*
  工作区自己的分支被推到了哪里，而不是某个基线是从哪个远端分出来的；`listBranches(projectId)` →
  `{ local, remote, remoteGroups?, defaultBranch }`（本地 `refs/heads`；规范的 `remote` = `refs/remotes`
  下每个直接完整 ref，符号别名省略；附加的 `remoteGroups` = 宿主拥有的远端/分支元数据，供呈现用；
  default = origin 的 `HEAD`→另一个远端的 `HEAD`→`origin/main`→仓库的 `HEAD`；任何 ref 列表或归属
  列表失败都会抛出，绝不给出一个成功的部分目录），
  **`resolveDefaultBranch(repoPath)`** —— 那段默认分支解析被抽了出来（只命名一次），由
  `listBranches` 与 `workspaces` 模块的 Default 工作区 ensure（它的 `baseBranch`）共享；它最后一道
  回退是 `currentBranch`，所以一个未出生的 `HEAD` 会解析成它将要成为的那个分支名，绝不是字面的
  `"HEAD"`（那会持久化进一个用户可见的 `baseBranch`）；**`currentBranch(repoPath)`** —— 一次检出
  当前持有的分支（`symbolic-ref --short HEAD`，未出生安全；分离头指针 → 字面的 `HEAD`），由
  `workspaces` 模块为用户所有工作区的 folder-truth `branch` 消费，而 **`tryCurrentBranch`** 是它
  可失败的形式（路径不是可读的工作树根时为 `null`，这样一次刷新绝不会把一次 I/O 失败持久化成
  一次分离）；**`canonicalPath(path)`** —— 任何要与 git 输出比较的路径都必须取的符号链接已解析
  形式（git 会解析符号链接，调用方给的路径不会），与 `workspaces` 的工作树身份检查共享；
  `prefetchBranch(projectId, ref)` —— 尽力而为的后台 `git fetch`，取一个已配置远端的 ref（经
  `gitAsync`），好让之后的一次 `createWorkspace` 从一个新鲜的尖端分叉，而不在其关键路径上付一次
  网络往返（本地/未知 ref 或离线 → 空操作）。它的 ref 是**线上协议提供的，且在到达 git 之前通过
  `createWorkspace` 所用的同一道 `isSafeRef` 门禁**：`--` 分隔的是*选项*，不是 refspec，所以只在
  `fetch` 之后加 `--` 只挡住了一个以 `-` 开头的名字，别的什么也没挡 ——
  `origin/+main:refs/heads/victim` 本会作为一个 **refspec** 抵达，让任何客户端在每个打开的项目里
  强制覆盖或创建任意本地分支（一个不安全的 ref → 同样是 `{ ok: false, moved: false }` 空操作，
  绝不抛出，因为这条路径是即发即忘的）。它的结果还会说明这次取回是否**`moved`** 了本地远端跟踪
  ref（首次出现也算在内；即使 fetch 报告失败也会探测取回后的 oid，因为 Git 可能在之后的失败/超时
  之前就已经更新了该 ref；比较是在完整限定的 `refs/remotes/…` 上做的 —— 也就是一次 fetch 会更新
  的那个确切 ref —— 所以一个字面就叫 `origin/<b>` 的本地分支无法借 git 的 DWIM 顺序遮住这项检查）：
  一个被移动的 ref *可能*改变某个兄弟工作区分支范围差异的含义（它的 merge-base 可能移动），而它
  对 `watch` 模块不可见（这次写入落在项目仓库共享的 `.git` 里，在每个被监视位置之外）—— 所以
  `git.prefetch` 处理器用 `moved` 扇出宿主的无路径 `fsChanged` 推动（`host` 的 fsNudge 接缝；
  一次不受影响的重读是幂等的空操作）。`moved` 是宿主内部的；线上响应仍是 `{ ok }`；
  **`readBlobAt(worktreePath, ref, path)`** → 该文件在一个 ref 处的 UTF-8**解码后**内容，或 `null`
  当这次读取没有产出任何内容时（差异两侧把它退化为 `""`；`reviews` 模块通过它渲染一个基线侧
  锚点的文本片段）；**`readBlobBytesAt(worktreePath, ref, path)`** → 同一次读取，但**字节精确**
  保留（`Uint8Array`）且同步，专为 `reviews` 的快照过程而存在；**`readBlobBytesAtAsync`** 是
  `changes` 使用的有界请求路径原语，它的读取必须完整才能被哈希。两者都跑 `git cat-file blob`，
  只在 Git 明确的路径不存在诊断时返回 `null`，对一个非 blob 对象或其他一切失败都抛出；因此
  超时/启动失败绝不可能冒充不存在。**`readBlobStreamAtAsync`** 是宿主的 `/blob` 路由所用的同一种
  读取，它绝不能把一个 blob 握在内存里：它只 await 最初的 `CONTENT_SNIFF_BYTES`（路由所分类的
  `head`），其余作为 `body` 流交出，那条流重新发出 head，然后随着 `git cat-file` 的 stdout 抵达
  而转发它 —— 不存在与失败由第一次读取观察到的退出码决定，遵循同样的 `null`/抛出契约，而 head
  交出*之后*的失败会让流报错，而不是关闭它，这样消费者看到的是一次中止的传输，绝不是被静默截断的
  blob。一个可选的 `signal`（HTTP 请求的）可在任何时刻取消这次读取 —— 包括 head 仍在被 await、
  响应体尚不存在可供取消的时候 —— 而取消会杀掉 `git` 子进程，而不是让它等满中继期限。
  **`readBlobSizeAtAsync`** 在宿主接纳一个不可变 blob 响应之前，通过 `git cat-file -s` 执行同样的
  有界、严格缺失判定读取；**`readPathModeAtAsync`** 用有界的 `git ls-tree` 读取一条路径的树模式，
  好让 `changes` 能拒绝符号链接并恢复 Git 的可执行位，而无需自己推导树元数据；
  **`gitCommitPaths(workspaceId, message, paths)`** → `{ sha } | null` —— 为 TODO 改动集特性把
  **恰好 `paths`** 提交为一次提交（见 [[submodule-server-todos]]）：先暂存它们（`git add -A --
  <paths>`，所以一次删除也作为一个暂存），然后 `git commit --no-verify -- <paths>`（宿主的提交绝不
  运行/触发用户的钩子；author/committer 仍是用户自己的 git 配置 —— 那是他们的分支），并返回新的
  sha。**只有被点名的路径** —— 绝不是"现在脏的那些"：调用方传入它已证明属于该事项的集合（而且
  作为过滤后的增量，它从不会包含 `.thinkrail/`），所以在调用方的 `gitStatus` 与本次调用之间出现的
  脏东西无法被扫进来，用户的其他已暂存工作也保持暂存，而不是被顺手带上。这些路径是**字面文件名，
  绝不是 pathspec**：每个吃路径的命令都以 `--literal-pathspecs` 运行，所以一个名字本身就是
  pathspec 魔法或通配符（`:(top)*`）的已跟踪文件，无法扩张到已证明的增量之外、击破精确路径保证或
  `.thinkrail/` 排除。**索引在失败之间是被保留的：** 该检出的真实索引**文件**
  （`rev-parse --git-path index` —— 在链接工作树里是逐工作树的）在暂存之前逐字节快照，并在每条
  失败路径上写回，所以一次被跳过的提交让用户的暂存区保持原样 —— *包括一次树往返会丢掉的仅索引
  状态*（一个来自 `git add -N` 的 intent-to-add 条目没有树表示，所以一次 `write-tree`/`read-tree`
  快照会静默地把它取消暂存）。暂存会成功但提交可能失败（未设置的身份、一个不可用的签名密钥），
  而一个尽力而为的特性绝不能让用户的下一次提交带上他们从未暂存的文件。一个有未合并条目的索引
  （一次在途的冲突合并）会原封不动地退出；一个半合并的工作树反正没什么可自动提交的。路径集
  为空、那些路径没有可提交的东西（`git diff --cached --quiet -- <paths>`），或任何 git 失败时
  返回 `null` —— 调用方（`todos/artifacts`）把它当作"回退到路径列表产物"，绝不让它抛出。
  这是唯一一个**写入**用户分支的 git 原语；调用方按工作区对它串行化。
  **`gitHeadSha(workspaceId)`** → `string | null` —— `rev-parse HEAD`（未出生的 HEAD 上为 `null`），
  在 `in_progress` 时记入 todos 基线 sidecar。
  **`readCommitSubject(workspaceId, sha)`** → `string | null` —— 一个提交的标题行（sha 畸形或无法
  解析时为 `null`），是 todos 模块"被采纳提交评审解析器"背后的同步读取（`base..HEAD` 之间不被任何
  计划事项拥有的提交）。
  **`listCommitsSince(workspaceId, sinceSha)`** → `sinceSha..HEAD` 的 `{ sha, subject }[]`，
  **最旧在前**（`git log --reverse`，封顶在 `COMMIT_LIST_MAX`），供 todos 模块的工作窗口提交采纳
  （[[submodule-server-todos]]）：一个事项在 `in_progress` 期间子代理/用户落下的提交，于是 `done`
  的事项认领它们，而不是把它们漏成 `adoptedCommits`。`sinceSha` 是该事项自己的基线头（`in_progress`
  时的 `gitHeadSha`）；空/未出生的头或一个非十六进制值产出 `[]`，而 sha 无论如何都用
  `--end-of-options` 括起来。超时/启动失败会抛出；一个正常退出但不可读的范围退化为 `[]`。
  **`resolveListedCommit(workspaceId, sha)`** → `string | null` —— 当且仅当 `sha` 落在
  **`listCommits` 所发出的同一个封顶 `base..HEAD` 集合**里（同样的 `COMMIT_LIST_MAX` + 范围）时，
  返回它的**规范 OID**，否则 `null`。返回规范 sha 让被采纳提交的评审解析器能拒绝缩写/非规范的
  id，而共享的上限保证它绝不接受一个越过最新 `COMMIT_LIST_MAX` 窗口的提交 —— 对那样的提交永远
  不会发出任何被采纳的事项。与 `listCommits` 保持步调一致。
- **Public surface（公开接口，barrel）：** `git`, `gitAsync`, `gitAsyncBytes`, `gitAsyncStream`, `nonInteractiveGitEnv`, `remoteRefOid`, `remoteTrackingRef`, `gitStatus`,
  `gitUncommittedPaths`, `gitDiffFile`,
  `readBlobAt`, `readBlobBytesAt`, `readBlobBytesAtAsync`, `readBlobStreamAtAsync`, `readBlobSizeAtAsync`,
  `readPathModeAtAsync`, `readCommitSubject`,
  `gitCommitPaths`, `gitHeadSha`, `listCommits`, `listCommitsSince`,
  `resolveDiffRange`, `changedFileArgs`, `diffBaseRef`, `resolveCommitOid`, `DiffRange`, `isSafeRef`,
  `assertSafeRef`, `listBranches`, `resolveDefaultBranch`, `tryCurrentBranch`, `currentBranch`,
  `canonicalPath`, `resolveListedCommit`, `prefetchBranch`, `countPushDivergence`, `listRemotes`, `remoteNameOf`,
  `snapshotWorktree`.
- **允许的依赖：** `persistence`（工作区 + 项目查询）、`log`；`fs`（`resourceMeta`/`decodeText` ——
  那次唯一的内容分类，所以一个差异侧的元数据不会与 `fs.readFile` 的意见不一）；
  `contracts`（`Git*`/`BranchList`/`ResourceMeta` 类型）；
  `subprocess`（`runBounded`，两个异步运行器背后的有界子进程）；
  `@thinkrail/shared/codedError`（为线上协议命名一个失败）；`@thinkrail/shared/spawn`
  （`spawnSyncCaptured` / `spawnSyncCapturedBytes`，带 `windowsHide` 的同步运行器）。
- **绝不触碰：** `host`；兄弟特性。

## 必须做对的事

- **一个范围只被定义一次。** 任何必须知道"差异"是什么的新读取都走 `resolveDiffRange` —— 绝不自己写
  一行 `git diff <base>` —— 而任何对基线 ref 的读取都走 `diffBaseRef`，所以
  `diffBase ?? baseBranch` 在代码库里恰好只存在一处。
- **一个 commit 范围校验该提交*存在*，而非它是否仍可从分支到达。** 一次 rebase 或 reset 会把历史
  从一个选择之下重写掉；对象还在那里，而展示它的差异比静默把用户重置成"所有改动"*更*有用。哪些
  提交被*提供*是范围菜单的活（`listCommits`），不是读取的活 —— 所以没有任何读取为一次
  `merge-base --is-ancestor` 配对付钱。
- **一次失败的读取是一个错误，绝不是"没有改动"。** `gitStatus`（及其 `--numstat` 过程）尊重退出码：
  一次跑不起来的 diff 会抛出，所以面板保住它最后一份好列表，并说明刷新失败，而不是渲染一个空的
  改动集。`workspaces` 模块的 `diffStats` 从另一端遵循同一规则 —— 它返回*没有*统计（并记录原因），
  而不是编造一个 `+0 −0`。一个把脏工作树说成干净的评审界面，是这个产品可能有的最坏失败。
- `gitStatus` 为一个用户所有的（`kind: "default" | "external"`）工作区报告**实时**的当前分支
  （它的分支会带外地移动 —— 一次终端的 `git checkout` —— 而持久化快照只在列表时自愈；Changes 头部
  绝不能滞后）。
- **一次网络 git 调用由我们来界定，而不是被劝着别等。** 一次远端索要口令的 `fetch` 会永远阻塞在
  `/dev/tty` 上，而唯一曾结束那次等待的东西是*客户端的* 60s 请求超时（`transport.ts` 的
  `DEFAULT_TIMEOUT_MS`，未对 `workspace.create` 覆盖）—— 那个超时从构造上就不携带原因，所以用户
  得到的是 `request "workspace.create" timed out`（issue #209）。`gitAsync` 因此让子进程与一个
  **55s 预算**赛跑（`opts.timeoutMs` 可覆盖；测试以 500ms 驱动它）：到期时它杀掉子进程，并以
  `timed out after <actual>s — the remote never answered` 解决，`workspaces` 把它带进创建失败里。
  **预算是刻意设在客户端 60s 允许的那么高的。** 任何低于客户端的预算，都会把一个*慢但健康*、本会
  完成的操作变成硬失败 —— 在慢链路上首次取回一个大仓库就是真实场景。那个窗口**并未被关闭，只是被
  收窄**到大约 55–58s，而且它无法被关闭：一个等于或高于客户端的预算，会把这场赛跑交还给本条存在的
  理由——那个无因的 `request … timed out`。剩下的约 5s 是抛出需要一路返回并仍能赢过客户端的时间；
  如果被阻塞的事件循环超了这一点，客户端的通用超时就会触发 —— 修复前的行为，是一次降级而不是一个
  新失败。这个次序本身**没有被任何东西钉定**：`transport.ts` 的 60s 与这里的 55s 是两个独立发布的
  产物里手工维护的数字，靠约定而非靠构造正确。从一个推导另一个属于 `contracts`，且有意不在本次
  改动的范围之内。
  **消息绝不说出一个我们未曾观察到的原因。** 到期时我们知道的全部就是远端没有作答；一个未加载的
  SSH 密钥被作为*一种*可能原因提出，且有条件地仅当远端使用 SSH 时，因为把它直接断言出来，会把每次
  `https://` 停滞和每次慢链路取回都误诊成认证问题。经过的秒数向下取整到 1：`Math.round` 会把一次
  不足 500ms 的等待渲染成 `0s`，那读起来像 bug。**它是一个下界，不是上限。** `setTimeout` 在事件
  循环被阻塞时无法触发，而*同步*运行器按设计就会阻塞它（`spawnSyncCaptured`），所以真实的等待是
  预算加上兄弟 `git()` 调用占住循环的那些时间 —— 在一次刻意制造的风暴下实测为预算的 6 倍。因此
  消息报告的是**经过**的时间，而不是配置的预算：用户读到的数字从不是虚构。要关闭这个差距，就得把
  git 完全移出事件循环，那不是这张工单要买的东西。定时器是 `unref` 掉的：它的存在是为了*界定*一次
  等待，所以它本身绝不能成为宿主继续存活的原因 —— 否则一个在途的即发即忘 `prefetchBranch` 会让
  关停挂住，最长达整个预算。
  **`boundedStderr` 剪的是中间，不是尾部。** git 自己的话总是在最后，而剪尾把它们藏了起来：
  `git.ts` 的 `exists on disk, but not in` 探针位于路径*之后*，所以丢掉它会把一次普通的未命中变成
  一场 `console.warn` 风暴。这是残留的、未修的，也是任何固定大小裁剪的固有后果 —— 一条长到足以把
  那句话推进被省略中段的消息（一个约 2000 字符的路径*加上*一个约 800 字符的 ref）仍然会丢掉它，
  而移动头/尾的分割点只是移动了窗口。
  **等待在 git 退出时结束，不是在 git 的管道关闭时。** 那个区分是 `subprocess`（`runBounded`）要
  守住的，而把它弄错会把这个特性的逻辑颠倒过来：一个孙进程 `ssh` —— 一个 `ControlMaster`、一个
  凭据缓存守护进程、一个企业包装器 —— 继承了 `stderr` 且比 git 活得更久，所以读到 EOF 永不返回，
  *即使在取回成功时*。把读取当作完成信号，就会把一次毫秒级完成的取回报告成一次耗满预算的认证失败。
  由 `gitExec.test.ts` 双向验证过：一个把持有 stderr 的子进程放到后台并退出 0 的 `core.sshCommand`，
  在远不到一秒内产出 git 自己的 `Could not read from remote repository`，而在修复前则在耗满预算后
  产出那条停滞消息。
- **我们绝不碰用户的 ssh 客户端 —— 那被尝试过并撤回了。** 把 `-o BatchMode=yes` 追加到他们生效的
  ssh 命令（`GIT_SSH_COMMAND`，否则 `core.sshCommand`，否则 `ssh`）能为常见设置修好 #209，却无法做
  到安全。它的两个失败是原则上无法修复的，不只是尚未修复：`BatchMode` 会压制 `SSH_ASKPASS`，于是
  每个桌面口令对话框*本来能用*的用户都失去它 —— 那个对话框**就是**在等待人类，所以禁止等待就禁止
  了对话框；而通过 `GIT_SSH_COMMAND`（一个*进程*作用域、排序高于 `core.sshCommand` 的变量）下发一个
  *按仓库*的选项，会为该环境之下触及的每个其他仓库反转优先级 —— 一个自带部署密钥的子模块会拿到
  父仓库的客户端。还有四个缺陷来自"必须先按 git 的方式解析（`split_cmdline`）一条我们必须重写的
  命令"—— 一条带引号的 plink 路径溜过非 OpenSSH 的退出分支、企业包装器拒绝那个 `-o`、`GIT_SSH` 退出
  却把挂起留着未修，以及每次 `git()` 多一次 `spawnSync` 配置读取。上面的预算这些都不需要：它对哪个
  ssh 客户端、哪个变种、哪个包装器、以及是否存在 askpass 一概不感知。
- **环境是叠加在 `process.env` 之上，绝不替换它。** `boot` 的 `resolveShellEnv()` 通过*改写*
  `process.env` 修复 `PATH`/`LANG`；一个裸的环境对象会丢掉那项修复，并连带丢掉 `SSH_AUTH_SOCK`，
  而一个活着的 agent socket 正是让那些确实加载了密钥的用户完全免提示地取回的原因。
