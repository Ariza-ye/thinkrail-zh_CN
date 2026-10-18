---
id: module-pi-background-commands
type: module-design
status: active
title: pi-background-commands——显式的、会话自有的后台命令
parent: architecture
tags: [pi-extension, background-commands, public-surface-checked]
---

## 职责

为 Pi 提供一个显式的后台命令能力：启动一条非交互式命令而不占用
agent 轮次、检查其近期输出，并停止那一条确切的命令。常规 `bash` 保持不变。
用户批准的范围是仅日志的命令；没有 PTY、终端标签页、自动交接、stdin、
重启/重跑、守护进程发现或任意进程管理。

## 边界

- **拥有：** 一个与会话绑定的命令服务、其不透明的命令身份、准入、运行时
  快照、有界输出、取消与完成投递的记账；`background_command` Pi 工具，
  以及一个默认的原生 Pi 扩展入口。
- **Public surface（公开接口）：** `BACKGROUND_COMMAND_COMPLETION_MESSAGE`, `BackgroundCommandInput`,
  `BackgroundCommandsExtensionOptions`, `createBackgroundCommandsExtension`,
  `createBackgroundCommands`, `default`, `BackgroundCommandCompletion`,
  `BackgroundCommandCompletionBinding`, `BackgroundCommandContext`, `BackgroundCommandHandle`,
  `BackgroundCommandOutput`, `BackgroundCommandSnapshot`, `BackgroundCommandStart`,
  `BackgroundCommandStatus`, `BackgroundCommands`, `BackgroundCommandsBinding`,
  `BackgroundCommandsOptions`
- **允许的依赖：** 公开的包根 Pi SDK API，以及作为 peer 的 `typebox`；Node 标准库。
  执行委派给 Pi 导出的 `createLocalBashOperations`，而不是一个复制来的 spawn 运行器。
- **绝不触碰：** ThinkRail 各包、web/TUI 小组件所有权、Pi 私有导入、委派
  所有权、工作区 PTY，以及通用的资源提供商/插件机制。线上协议 DTO 在 contracts 中被镜像，
  绝不从本包导入，也绝不通过本包再导出。

## 会话绑定与执行

根 `index.ts` 是唯一的导入面；`src/` 是私有实现。一个服务暴露
start/list/find/change-subscription/dispose，外加完成绑定与重放；一个命令句柄
暴露其快照、输出与幂等停止。控制器与子进程细节保持私有。

嵌入方把一个服务绑定到一个不可变的会话身份，并提供当前的会话
上下文与生效的 shell 设置。独立扩展从 Pi 的公开上下文/设置 API 提供等价的绑定，
并遵循项目信任。Cwd、shell 路径/命令前缀以及
`PI_SESSION_*`/模型/reasoning 环境，在命令启动时遵循 Pi 当前的会话值；
用户提供的环境覆盖与宿主选定的 cwd 不是额外的工具输入。

`createBackgroundCommands({ sessionId, getContext, canDeliverCompletion? })` 捕获那个不可变的
身份；同步的 `getContext()` 会在每一次被接受的启动时求值。其投影携带
`cwd`、可选的 `sessionFile`、`model`（provider/id）、`thinkingLevel`、`shellPath`、`commandPrefix`，
以及 `exposeSessionEnvironment`（默认 true）。嵌入方投影其生效的内存中设置；
独立的 Pi 在启动时以最新工具上下文的项目信任决策读取 `SettingsManager.create`。
Pi 不会在 ExtensionContext 上暴露其实时的 SettingsManager。该环境保留
进程值、移除过期的 Pi 会话/模型标记，并且只注入本次启动的当前值。
由于 Pi 的 `getShellEnv` 不是公开的，受管 bin 的 PATH 一致性改用公开的 `getAgentDir()` 加
`bin`，并保留既有条目与环境里 PATH 键的大小写。测试把完整环境与公开的原生 bash 定义作比较；
没有任何生产代码使用那个定义或其无界的临时输出累加器。可选的第二个工厂参数 `createOperations`
是供外部边界测试使用的执行器构造接缝，默认使用 Pi 的公开本地执行器。

shell 命令本身保持前台；转入后台意味着该工具不 await 其结果。
每条命令拥有一个独立于父轮次的 AbortController。Pi 提供输出回调、
退出状态与进程树终止。超时是可选的，且意味着终止，绝不切换执行模式。
不会对有意长期运行的命令施加任何默认超时。

`background_command` 有四个动作：`start`（命令、可选的显示名与超时）、
`list`、`output`（命令 id）与 `stop`（命令 id）。start 以那个不透明的 id 与当前快照确认
已接受。id 字段在 output/stop 上是 `id`；动作专属的额外字段会被
拒绝，包括路径、cwd、env、PID 与 stdin 控件。其他每个动作都限定在已绑定的
会话内；命令 id 不是 PID、路径或授权令牌。重复 stop 是安全的，而 stop 绝不创建一条命令。
工具的提示词指引要求受管命令避免诸如 `&`/`nohup` 的 shell 分离；
这不是一个 shell 沙箱，也不承诺回收逃出监管的后代进程。

## 运行时与保留

命令状态是 `running`、`stopping`、`completed`、`error` 与 `stopped`。只有执行器的
落定才确立终结状态：退出零为 completed，非零退出或无信号的空
退出为 error，而一次被请求的取消在落定之后为 stopped。仅有停止请求并不
证明该进程已退出。错误文本封顶 4 KiB，启动失败仍然可检查。
超时是执行器错误（自然的失败通知），不是用户停止请求。

一个会话最多接纳八条活跃命令，并保留其最新二十条终结记录；
超出的 start 显式失败而不是排队。活跃/停止中的工作绝不被淘汰。显示
名封顶 200 个字符，命令封顶 64 KiB。每条输出记录只保留
最新的 2,000 行或 50 KiB，先到者为准，采用 UTF-8 安全的裁剪与显式的
截断指示。读取是非消耗式的，而输出快照替换更早的快照。
行计数包含结尾换行之后的一个空末行。增量 UTF-8 解码
保留被分割在执行器块之间的字符；无效/不完整的终结字节使用常规的
UTF-8 替换解码。这有意提供近期日志，而不是归档：没有
无上限的临时文件，也没有第二个持久化的命令索引。淘汰会释放输出，即使
调用方仍持有一个旧句柄。

当拥有它的宿主/会话仍然存活时，记录/输出能挺过浏览器重新加载、客户端断开、聊天放置关闭与父轮次的
Stop。它们在宿主重启时丢失；历来的 Pi
确认绝不重建活跃记录。Pi 对话记录中已完成命令的通知保留
一小段有界的诊断摘录，而不是完整日志。缺失/已被淘汰的输出报告不可用。

真正的会话销毁会关闭准入、禁用完成唤醒、在等待任何一个活跃命令之前
向每个活跃命令发信号，并参与嵌入方的有界关停。工作区归档与
聊天删除走同一条生命周期路径。没有空闲计时器会杀死安静的工作。宿主的突然死亡与
逃逸的守护进程后代无法被承诺干净终止或可恢复；绝不从持久化的 PID
重建控制权威。

`list()` 返回快照副本；`find(id)` 返回本服务的句柄或 undefined。`stop()` 是
同步的，返回请求后的快照；它不等待也不制造落定。
`output` 是一个非消耗式的 `{ text, truncated }` 快照，或在淘汰之后为 undefined。
`onChange(listener)` 返回一个取消订阅函数，报告准入、停止中以及终结/淘汰
变化，绝不报告字节更新。观察者的错误不能中断命令清理。
`dispose({ timeoutMs? })` 立即关闭准入，并在并发的
调用方之间共享同一个 promise。其默认等待预算是 5 秒；宿主可以选一个更短的非负预算。到期
结束的是等待，而不是执行权威：未落定的命令仍为 `stopping`，而任何最终的执行器
落定仍会确立 `stopped`。所有活跃命令都会在等待任何一个之前先被发信号。

被注入的服务属于嵌入方，而不属于某个扩展实例：资源重新加载会重新绑定
完成投递而不丢弃它的任务。独立扩展在会话关停时销毁自己的服务。
完成认领与保留的记录同住，因此重新绑定既不能重复投递
同一个结果，也不能在重新加载的间隙静默丢失一条已保留的完成。独立的资源
重新加载是一次 Pi 会话关停事件，会销毁独立扩展拥有的工作；只有被注入的服务拥有
位于该扩展生命周期之外的拥有者。

`bindCompletion({ deliver, canDeliverCompletion? })` 替换当前的同步投递
绑定、立即重放待处理的已保留结果，并返回一个身份安全的解绑函数。
`flushCompletions()` 针对当前绑定重试待处理结果，而不做轮询。无论是
服务绑定的还是投递绑定的可选判定都必须允许投递。宿主在一个临时删除墓碑期间
关闭其判定，随后在回滚之后调用 `flushCompletions()`；已确认的删除则调用 `dispose()`。一次资源重新加载
的间隙没有投递绑定，会在下一次绑定时被重放。认领在同步发送之前做出，以防可重入的重复；
一次抛出的发送会让该记录保持待处理。成功的发送意味着被 Pi 的公开即发即忘 API 接受，
而不是确认最终的提供商响应。淘汰也会移除一个待处理的认领：不存在
无界的第二个通知队列。

## 完成与控件

自然完成会发送一条被显示的 Pi 自定义消息，其中包含一段有界的结果摘录，并安排
一个后续轮次，与既有的分离式子代理约定一致。agent 可以显式检查更多已保留的输出，
而不是轮询等待完成。导出的 `BACKGROUND_COMMAND_COMPLETION_MESSAGE` 是 `background-command-completion`；
消息 details 省略完整命令，只保留一段 40 行/4 KiB 的诊断输出摘录加上有界的快照元数据。
消息以 `deliverAs: "followUp"` 显示，自然结果配 `triggerTurn: true`，
已停止的命令配 `false`。一次显式的用户/工具停止记录该取消，而不启动一个
空闲父级；它不会中止一个已在运行的父级。真正的
会话关停会抑制向那个垂死会话的投递。

工具与宿主 UI 调用同样的句柄。服务的变更订阅报告目录或
生命周期变化，而不是输出的每一个字节；输出在被查看时单独读取。一旦启动确认 resolve，
原生 `tool_execution_update` 就不再是投递路径。

## 验证义务

检验准入与淘汰、有界的多字节输出、自然/非零/空退出、启动错误、
按任务的停止隔离、父级中止的独立性、重复停止、通知/重新加载竞态，以及
有界的销毁。集成检查使用真实的本地命令与 Pi 的公开执行器；由提供商驱动的
覆盖通过一个真实 Pi 会话验证工具使用与完成。Windows CI 原生运行该包的
测试套件，包括关停/进程树覆盖所用的后代标记；可见控制台
的行为仍需要一次原生可视化探测，而不是一个仅限 Unix 的主张。包测试套件使用 Bun
测试、受控的执行器落定、真实的本地 shell 命令，以及由 SDK 的 faux provider 驱动的 Pi AgentSession。
真实提供商下的宿主 E2E 仍是嵌入方的验收检查，与这些包内测试不同。
