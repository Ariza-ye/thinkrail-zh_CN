---
id: submodule-server-branch-review
type: submodule-design
status: active
title: branch-review —— 打开的 PR/MR 元数据
parent: module-server
depends-on: [module-contracts]
implements: [task-branch-pr-awareness]
tags: [github, gitlab, pull-request]
---

## 职责

尽力而为地查找与某个工作区分支相关联的代码评审 —— 开启、已合并或已关闭 —— 通过本地 `gh` CLI 查询
GitHub.com PR，或通过 `glab` 查询 GitLab.com MR。该查找**先请求一个开启中的评审**（`gh pr list
--state open --limit 1`、`glab mr list --per-page 1`；一次调用，与已结算状态存在之前相同），**仅当
没有时**才翻页取最新的已合并/已关闭行（`--state all` / `--all`，五行，最近一次合并或关闭的胜出）。
用两次有界调用而不是一个合并分页，因为合并分页按创建时间排序：一个分支若有一个更旧的仍然开启的评审
加上若干更新的已结算评审，就只会呈现已结算的那些，而信任该答案的宿主会把一个 PR 仍然开启的工作区
搁上货架。答案在 `OpenBranchReview` 上携带 `state` 与 `changedAt`（合并或关闭时间）：一次查找同时
服务顶栏胶囊（开启 = success，已合并 = info，已关闭 = neutral）与 Settled 货架的“PR 已合并/已关闭”
规则，而不是两次轮询互相矛盾。一个已合并/已关闭行只有在带上与之匹配的合并/关闭时间戳时才可靠；没有
这一排序事实，宿主无法证明后续工作是否应保持活跃，因此它会拒绝该答案，而不是持久化不完整的货架
依据。一个只理解开启中评审的 v78 之前的使用方会把已合并/已关闭行读成一个活跃 PR，这就是为什么
contracts 规范把 `state` 绑定到 `WORKSPACE_SETTLE_PROTOCOL_VERSION`，且宿主对这类客户端的
`workspace.openReview` 在评审已合并或已关闭时回答 `null`。

## 边界

- **拥有：** 远程主机检测，以及返回 `OpenBranchReview` 或 `null` 的有界、异步 CLI 查找，加上成功
  查找答案的短期内存记忆。
- **远程主机检测同样是异步的。** 它的 `git config` / `git remote` 读取在 `LOOKUP_TIMEOUT_MS` 之下
  经由 `gitAsync` 运行，绝不同步派生进程：宿主的已结算生命周期遍历每五分钟为每个候选行跑一次这个
  查找，而同步读取会按行把整个宿主（每个聊天、agent 与终端）阻塞约 45 ms。
- **该查找会向提供商一并索取评审的 `url` 与其编号**（`gh … --json number,url`；GitLab 的行携带
  `web_url`）并把它放到 `OpenBranchReview` 上。它不是装饰：客户端的 `PR #N` 胶囊只有在 url 已知时
  才是链接，而在此之前 url 只存在于刚刚跑过 `pr.open` 的那个会话里 —— 每一次重载、第二个窗口与每一次
  重连都把编号渲染成死文本。一个 url 缺失或不是 `https:` 的行产出的是没有 url 的评审，而不是一个
  坏链接。
- **Public surface（公开接口）：** `findBranchReviewOutcome(cwd, branch, { fresh? })` →
  `{ value, reliable }` —— `reliable` 是被暴露出来的可缓存位，使一个*持久化*该答案的宿主能区分
  “提供商说没有评审”与“提供商没有回答”，从而在一次 `gh` 故障期间保住它最后已知的快照；
  `forgetOpenBranchReview(cwd)`；外加 `pr` 动作模块复用的读取原语 —— `providerFromRemoteUrl`、
  `reviewNumber` 与 `runProviderCommand`（有界、禁用提示的 CLI 运行器）。
- **成功的答案按 `(worktree, branch)` 缓存，自结算起 60 秒，且查找是单飞的。** 一个语法合法但内容为
  空的提供商响应是一次成功的 `null` 并被缓存 —— “没有 PR”是最常见的情形，也是重新推导代价最高的
  情形。提供商 CLI 失败、必需的本地远程检查失败、运行器抛错，或响应格式错误，对调用方仍降级为
  `null` 但不被保留，因此修好 CLI 认证或一次临时中断可以在下一次读取时恢复。过期条目在缓存活动时
  被惰性清理。
- 普通的工作区激活可以复用已结算的答案；`{ fresh: true }` 绕过它，但仍会加入一次已在运行的查找。
  web 在窗口聚焦时走 fresh 路径，把焦点保留为对在 ThinkRail 之外被开启、关闭或合并的评审的显式
  重新校验点。
- `forgetOpenBranchReview(cwd)` 使该工作树的每个分支世代失效。一次在飞行中被取代的查找必须经由
  当前世代结算，而不是返回或重新缓存它那个过期的答案；这正是让失效在并发读取面前安全的原因。
- **允许的依赖：** `contracts`（结果类型）；服务端 `git` barrel（用于本地远程检查，以及
  `nonInteractiveGitEnv()` 这个子进程运行环境的唯一定义 —— `process.env` 加上
  `GIT_TERMINAL_PROMPT=0`，本模块在其上叠加自己的 `GH_PROMPT_DISABLED`/`GLAB_PROMPT_DISABLED`）；
  `subprocess` barrel（在本模块的 `LOOKUP_TIMEOUT_MS` 下运行该查找）。
- **绝不触碰：** `host`、`workspaces`、浏览器代码、持久化，或本次读取之外的任何 PR/评审动作（动作住
  在 `pr` 里）。
- CLI 缺失/认证缺失、不支持的远程、超时、格式错误的输出，以及没有开启中的评审，一律降级为 `null`。
- **这个界必须是*调用*的界，而不是子进程的界。** 杀掉 `gh`/`glab` 然后等待其 stdout 到 EOF，在一个
  孙进程继承了那根管道时永远不会返回，而 `review.get` 会等待这次查找 —— 因此上面承诺的降级为
  `null` 只能通过客户端自己无因的请求超时才能到达。是 `subprocess` 的 `runBounded` 让
  `LOOKUP_TIMEOUT_MS` 成真；本模块绝不能长出自己第二次派生进程。
