---
id: submodule-pi-dag-extension
type: submodule-design
status: active
title: 可移植的 pi DAG 适配器
parent: module-pi-dag
---

## 边界

拥有 pi 工具/命令注册、受信任的会话来源、瞬时的上下文/历史的投影、
被动通知投递与独立组合。公开的 barrel 暴露 `createDagExtension`、
`DagExtensionOptions`，以及 `default`（零配置的扩展工厂）。外部依赖是公开的 pi
API、typebox、pi-delegation 的 barrel 与 Node API。兄弟依赖边在父规范中声明。
绝不触碰：runtime/domain/delegation 内部、ThinkRail/UI/server 包、pi 私有字段、
凭证复制，以及独立的 worker 循环。

## 适配器

注入的服务始终由宿主拥有，从不在此关闭。五个 controller 工具使用 domain schema，
直接映射到 execute 或那四个具名读取。调用方的命令 id 与版本保持不变。结果在 details
与 JSON 文本中保留整个 DagResult；已准入的 DTO 本身就已经捕获大体量正文，
因此任何展示层的上限都不得隐藏拓扑或门禁身份。公开的 `tool_result`
覆写会标记结构化失败，而无需每次调用都留一个暂存处。

每次 session_start 轮换一个生命周期与一个仅通知的绑定。命令绑定实际的会话 id，
把调用取消与生命周期吊销结合起来，并在 finally 中吊销它们的短绑定。
执行投影是同步且当下的，绝不作为回调被服务保留；undefined 会被透传，
使后端回执重放先于上下文要求。读取不投影执行上下文。controller 历史使用真实的管理器
与真实的 execute toolCallId 工具调用前切点，而不是 commandId。

`/dag` 解析并校验 RequestSchema，然后要求 hasUI 以及对完整未改动请求的显式确认。
支持 TUI 与 RPC 确认；非交互模式什么都不做。人类来源是带该会话 id 的
`operatorId: pi:<actual session id>`。确认之后，在投影上下文与当前历史的入口切点之前，
重新检查已捕获的生命周期。没有工具接受 actor 或升级为人类。操作员结果是自定义被动消
息。

通知汇聚点在提交带 triggerTurn:false 的 `dag-notice` 自定义消息之前，
检查已捕获的身份、当前生命周期与 isIdle。agent_settled 唤醒就绪监听器；agent_end
不会。吊销会移除监听器与所有保留的上下文闭包。后端绑定通过只读扫描恢复通知；
挂接不会声索执行所有权。runtime 的挂接身份把一次 controller 会话与人类显式匹配的会话
id 映射到同一个会话键，同时保持它们的调用方对象——以及由此产生的命令权限——彼此独
立。没有会话的人类与 owner 保留各自独立的挂接身份；不存在第二个观察者或隐藏的挂接路
径。

## 独立所有者

一个惰性的、带版本的 globalThis Symbol.for 注册表（而非模块缓存持久化）
拥有带作用域的服务。键包含规范化的 agent 根目录与 cwd；scope 是该 cwd 的 SHA-256。
存储位于规范化 agent 根目录的 dags 与 delegation 目录下。规范化会为初始并不存在的目
录解析最近的既存祖先，并向上传播除 ENOENT 之外的错误。悬空符号链接会失败，
而不会创建一个非规范的 owner 键。获取与插入都是同步的，因此关闭过程不会漏掉一次进行
中的 owner 获取。一旦关闭开始，获取就会失败，直到所有关闭完成且注册表被移除。
关闭失败会保留被阻塞的注册表并向上传播；不兼容的注册表版本/形状会大声失败。

new/resume/fork 只吊销会话绑定。quit/reload 在清空注册表之前等待每个保留 owner 的
close，包括未显示的 scope。替换代码获取全新的服务，并看到已暂停的持久化资源。
注册表不保留任何 pi/上下文闭包。委派拥有 provider 重放与资源执行；被借用的 provider
回调仍然是提供方宿主的生命周期契约，而不是一刀切的适配器限制。

## 验证

公开适配器的测试使用真实的 pi 会话与隔离的本地 faux 模型/凭证存储。
类型化的服务客户端替身把转发、来源、确认与通知投递同后端策略隔离开。
真实服务用例钉住调用历史、完整读取与独立生命周期。测试覆盖直接映射、身份/历史切点、
不带替换执行上下文的回放、结构化错误、被动空闲通知、切换存活、进程注册表的模块替换，
以及全 scope 的静默 reload/quit。读取绝不得调用 provider。没有付费/网络 provider，
不打进宿主包，也不重复后端策略测试。
