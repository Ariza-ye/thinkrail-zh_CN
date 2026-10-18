---
id: submodule-server-turns
type: submodule-design
status: active
title: turns —— 每次 agent 运行产生的变更集
parent: module-server
depends-on: [module-contracts, submodule-server-git, submodule-server-persistence]
references: [submodule-web-panels, submodule-web-chat]
tags: [git, review]
---

## 职责

在不信任工具参数的前提下回答“这次 agent 运行改了什么？”。在 `agent_start` 时，追踪器把工作树快照成
一个 git **树对象**（`snapshotWorktree`：真实索引被复制到临时的 `GIT_INDEX_FILE`，`add -A` 针对该
副本运行，`write-tree` 返回 oid —— 包含已跟踪的修改与未跟踪的文件，被忽略的文件和用户的真实索引
原样不动）；在 `agent_settled` 时再快照一次，当两棵树不同时记录一个 `TurnChangeSet` —— 两个树 oid、
该次运行的墙钟时间，以及二者之间 `turn` 范围上的 `gitStatus` —— 持久化它，并推送 `turn.changed`。
运行边界是 `agent_start`→`agent_settled`，即 pi 的 round（一个提示词及其引发的一切），而不是 pi 的
`turn_*`（一条助手消息）：每条消息一张回执会把一个回答碎片化成许多卡片。

## 边界

- **拥有：** `TurnTracker`（每个会话的挂起运行 → 结算，外加用于在飞记录的 `drain()`）、数据目录下
  的 `turns.json`（`persistence.loadTurns` / `saveTurns`，带版本、原子、每个工作区上限 30 次运行、
  随工作区一起被丢弃）、`listTurns(workspaceId)`、`turnScope(turn)`、`turn.changed` 发布器接缝。
- **Public surface（公开接口，barrel）：** `TurnTracker`, `listTurns`, `forgetWorkspaceTurns`,
  `setTurnPublisher`, `turnScope`
- **使用方：** `host` 把追踪器接进会话发布器、与运行分析并列，并服务 `workspace.turns`；`git` 把
  `turn` 范围解析为 `diff <baseTree> <headTree>`，两侧都不可变（不做未跟踪文件的遍历，设置了
  `modifiedRef` —— 因此 `changes` 拒绝改动它，与提交范围完全一致）。

## 决策

- **用快照，不用工具参数。** 聊天的轮次分隔线已经会从 `write`/`edit` 参数里列出路径；那会漏掉 shell
  写入、格式化器与生成器，并且对重命名或行数一无所知。树快照才是 agent 实际留下的东西。
- **用树，不用提交。** 快照绝不能碰 HEAD、索引或 reflog；悬空的树只花对象存储，`git gc` 会在其宽限期
  之后清理它们。代价是一个很旧的轮次可能不再可解析 —— 该范围随后以 `UNKNOWN_COMMIT` 失败：Changes
  侧边栏会像面对一个被重写的提交那样重置到*全部变更*，而为该轮次打开的评审标签页会说明这一点并提供
  *全部变更*。
- **回执是工作区的区间，不是这次运行的作者归属。** 两个快照都覆盖整个工作树，因此在这个运行挂起期间
  落地的第二个聊天、一次用户编辑或一次还原也会出现在它的回执里。排他归因需要宿主并不具备的逐次写入
  来源信息；而工具参数正是本模块要替换掉的那个不可靠来源。
- **零变更的运行不记录任何东西。** 一张写着“0 个文件”的回执是噪声，而*上一轮*意味着最后一次改变了
  东西的运行。
- **一次运行中第一个 `agent_start` 胜出。** pi 在重试时会重新发出 `agent_start`；挂起的运行会一直
  保留到它结算，因此基准快照是 agent 第一次写入之前的状态。
- **两个快照都在各自的边界处开始。** 基准快照在 `agent_start` 开始，头部快照在 `agent_settled` 开始，
  各自同步地发生在事件处理器内部；结算随后等待两者。若为了慢的基准而推迟开始头部，会让下一次运行的
  首批写入漏进本次运行的回执。剩下的就是被接受的竞态：快照是异步的 git 工作，一次在它运行期间落地的
  agent 写入可能落在任何一边。对第一次工具调用来说模型延迟让这几乎不可能；而阻塞式快照会在大仓库上
  拖慢每一次运行的开始。
- **回执属于被捕获的工作区，而不是某个活跃会话。** 在 `agent_start` 时捕获工作区 id 与工作树路径；
  一个在结算期间被分离的会话绝不可失去它的回执。在记录/发布之前立即独立地检查工作区登记表，因此
  工作区的移除仍然无法在 `turns.json` 里重建它的条目（`forgetWorkspaceTurns` 只删除已存在的记录）。
  `workspace.turns` 同样拒绝未知工作区。
- **优雅关闭在结算会话之后、拆除之前排空记录。** `drain()` 等待在 `agent_settled` 时开始的任务；它
  绝不为一个挂起的开始凭空造出一个结算。它像之前的会话结算一样是有界的（5 s）：一个卡在慢文件系统
  上的 git 只损失那次运行的回执，绝不会造成一次挂几分钟的退出。同步的 `stop()` 仍是应急路径，不是
  记录屏障。
- **开始顺序就是顺序。** 轮次按 `startedAt` 存储与限量，而不是按结算时间，因此一个开始更晚但先结算的
  运行不会变成“上一轮” —— 客户端对活的 `turn.changed` 施加同一条规则，因此重载与推送永不矛盾。
- 宿主在打开时把每个 socket 都订阅到 `turn.changed`，与其他工作区频道一样；一张只曾通过重载时的
  `workspace.turns` 到达客户端的回执，正是这一行所要防的 bug。
