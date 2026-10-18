---
id: submodule-pi-dag-persistence
type: submodule-design
status: active
title: 持久化 DAG 快照、所有权与不可变负载
parent: module-pi-dag
tags: [backend, dag, public-surface-checked]
---

## 职责

拥有本地按 DAG 的快照持久化、独占的进程所有权与不可变的捕获字节。domain 拥有快照
schema；runtime 拥有状态迁移、证据捕获与发布。

## 边界

- **Public surface（公开接口）：** `createDagStore`, `DagStore`, `DagLease`

barrel 是唯一的兄弟入口。外部依赖是 `node:*`；domain 契约与校验通过其公开的 barrel
消费。没有 runtime、extension、delegation 内部、provider、凭证、网络、通用 I/O
抽象或后台过期服务。

## 存储与路径包含

受信任、经配置的存储根在构造时解析，包括既有的根别名。其下 SHA-256(scope)/dagId
包含 `state.json`、`payloads/` 与 `owners/`。scope 字符串绝不成为路径组件。DAG id
是安全且有界的路径组件。子孙目录与文件不得是符号链接；内容必须是常规文件。
文件使用私有权限。支持根迁移：在移动后的根上打开新的 store 即可，
持久化的引用只包含摘要与大小，绝不包含绝对路径。文件在发布之前被同步，
且平台允许时包含它的目录也会被同步。Windows 上的 Node/Bun 会拒绝目录 `fsync` 并返回
`EPERM`；这一种平台结果被容忍，因此原子链接/重命名仍然适用，但命名空间的掉电持久性不
能宣称具有 POSIX 的目录屏障。存储树是本地且由服务管理的，它不是针对并发的特权 actor
在两次调用之间替换其祖先的安全边界。

`read` 恰好打开一个已提交快照并解码它；不存在即 undefined，损坏或未知 schema
是显式错误。`list` 枚举已提交的快照，忽略外来的不安全名字或非目录的根条目，
以及没有快照的目录。安全 id 的符号链接、或已提交状态损坏的 DAG 目录仍然会 fail
closed。两种读取都不获取所有权，也不把私有快照导出为公开负载。不维护全局资源索引或数
据库。

## 所有权

`claim` 使用独占的硬链接发布一个已同步、不可变的 owner 记录。记录是规范 JSON，
含格式版本、host、PID 与随机身份 token；非规范编码（包括重复键）是歧义的，会被拒绝。
每次获取都在该 DAG 的 `owners/` 中追加下一个编号记录；release 发布一个 token
匹配的不可变 release 标记。这些小记录被保留，不删除也不压缩。这避免了
compare-then-unlink 的竞态：竞争的恢复者只能争夺同一个下一个槽位，绝不会删除更新
owner 的锁。未发布的临时文件被忽略。未知或不连续的 ownership 文件名、
或格式错误的活动 owner/release 记录，都会 fail closed。已退役的记录没有控制权限。
另一台主机上未释放的所有权是歧义的，会阻塞获取。

存活的 PID（包括本进程经由另一个 store）会阻塞 claim。只有 `kill(pid, 0)` 以 ESRCH
失败才证明一个未释放的 owner 已死。EPERM、未知失败与被复用的存活 PID 都会阻塞；
年龄绝不授权接管。save、负载发布与 release 都会重新校验当前 token。
读取仍然对竞争进程可用，但 `put` 要求该 store 中已准入的租约。`ownerStatus`
采样所有权而不获取它：已释放/不存在/已证明死亡即为 inactive；否则就是被持有。
runtime 的读取用这一事实区分另一个 owner 与暂停恢复；它只是一次观察，
不是对后续进程死亡或获取的保证。

同一租约上的并发 save 会被拒绝。release 同步关闭准入，等待所有已准入的 save
与负载写入（包括失败的），然后发布 release。重复 release 返回同一个了结结果。
失去所有权绝不授权删除或替换另一个 token。在发布 owner 记录之后失败的获取，
可能保守地保持为已拥有直到进程死亡；歧义的元数据绝不自动修复。

## 快照

save 在第一次 await 之前就分离并校验传入的状态。scope 与 DAG id 必须匹配；
创建要求当前没有快照、expectedVersion 为 undefined 且 version 为 1。更新要求
expectedVersion 等于已提交版本，且版本恰好递增一次。graph revision 由 domain 拥有，
独立于这一存储 CAS。每次读写都使用 `decodeState`。

可选的同步 `beforePublish` 检查在异步准备与所有权检查之后、在发出原子替换之前的那一
刻重新校验调用方的吊销状态。被拒绝的检查会清理临时文件而不发布。一旦替换已经发出，
取消不会回滚一个可能已提交的命令。

快照字节被规范编码进一个独占的临时文件，同步并关闭，然后原子重命名覆盖
`state.json`；包含它的目录遵循上面的平台规则。待处理的临时文件在失败时被清理。
不存在内存状态缓存或投机的发布。替换之前的错误是确定的失败；替换之后的错误、
或歧义的 rename 错误是 `commit-unknown`，要求在 runtime 边界做一次读取/相同命令的重
放。

## 负载

`put` 在 await 之前分离 Uint8Array 输入。默认配额是 LIMITS.valueBytes；
显式配额不得超过 LIMITS.historyBytes。产物身份等于小写的 SHA-256 摘要。
字节在独占发布到按 DAG 的负载目录之前被同步，该目录的元数据在返回之前也被同步。
并发的相同内容会去重；既有字节被校验而不是被覆写。调用方在保存引用之前 await `put`；
快照校验不会递归加载所有历史负载。

`load` 校验引用身份、字节长度与摘要。缺失、非常规、符号链接或损坏的负载会显式失败。
`reference` 检查身份、路径包含、常规文件状态与长度，返回一个新鲜的路径提示，
而不复制/导出字节或做摘要读取。需要经过完整性校验的字节的消费者使用 `load`。
私有快照路径绝不可能由 StoredFile 表示。所有公开失败都是 domain 的 DagError 值。

## 验证

聚焦的 Bun 测试演练 CAS 与分离的版本一致快照、不可变负载与配额、迁移、
同进程与子进程所有权、并发的死 owner 恢复、格式错误的所有权、损坏/未知状态、
路径包含、release/在途安全，以及真实的文件系统失败。狭窄的仅测试用 rename
拦截保留真实的文件系统操作，同时在替换周围安排权限失败，并在真实 rename
之后安排一次丢失的完成；不暴露生产故障接缝或通用 I/O 框架。以 root
运行时权限测试会跳过。
