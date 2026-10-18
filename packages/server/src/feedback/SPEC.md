---
id: submodule-server-feedback
type: submodule-design
status: active
title: feedback —— 宿主范围的产品访谈邀请
parent: module-server
tags: [feedback, research]
depends-on: [module-contracts]
---

## 职责

拥有自动产品访谈邀请的宿主范围生命周期。从特性上线起统计被接受的用户撰写消息，持久化延期/永久
忽略，并在到期时提供一条定向邀请。设置里的预约链接是独立的，绝不改变这一生命周期。

## 边界

- **拥有：** 经过校验的 `feedback.json` 状态（`acceptedMessages`、`nextInvitationAt`、`dismissed`）；
  固定的 10 条消息初始/重试间隔；一个仅存于内存的认领客户端；`recordAcceptedMessage(clientKey)`；
  `respondToInterview("book" | "postpone" | "never")`；`releaseInterview(clientKey)`；一个注入的
  定向邀请发布器；以及供测试使用的重置接缝。
- **Public surface（公开接口，barrel）：** 生命周期操作、重连重投递接缝、发布器装配入口，以及测试重置。
- **允许的依赖：** `persistence`（仅 `dataDir`）；`contracts`（`InterviewResponse`，仅类型）；Node 的
  文件系统/路径 API。
- **绝不触碰：** `host` 或其他特性兄弟；分析（analytics）；对话记录/会话文件；浏览器/UI 代码；
  Google Calendar 或任何网络访问；在线上协议上暴露计数器或客户端身份。

## 必须做对的事

- 文件缺失或格式不对时从 `{ acceptedMessages: 0, nextInvitationAt: 10, dismissed: false }` 开始；
  历史对话记录绝不被扫描。非负安全整数加一个布尔值就是完整的可接受 schema。每次更新都写入同目录的
  临时文件，并以原子重命名覆盖 `feedback.json`，失败时清理该临时路径，因此一次部分写入不可能抹掉
  此前已持久化的永久忽略。
- `host` 只在 `ackSend` 接受了一条非控制类 `prompt`、`steer` 或 `follow_up` 之后才调用
  `recordAcceptedMessage`。该同步持久化发生在带重放缓存的请求执行内部，因此请求重放不会重复计数。
  计数持久化失败会被吞掉而不扰动既有认领；该增量保留在内存缓存中，并在下一次被接受的发送时重试，
  但在该状态持久化之前不会提供新到期的邀请。发布失败只释放为那一次投递所创建的认领。访谈记账
  绝不可把一条已被接受的产品消息变成被拒绝的发送。
- 达到 `nextInvitationAt` 时至多认领一个不透明的客户端 key，并调用注入的定向发布器。在认领期间，
  其他客户端不会收到弹窗。投递失败或重连宽限期之后最终清理客户端会释放该仅存内存的认领；一次
  临时重连会在欢迎之后把它重投递给同一个客户端，而重启会释放它，欢迎则清除任何过期的浏览器投影，
  同时持久化的资格仍然保留。客户端在 socket 握手时声明其线上协议版本，而比邀请频道更旧的客户端
  无法保留认领。
- `postpone` 设置 `nextInvitationAt = acceptedMessages + 10`；`book` 与 `never` 设置
  `dismissed = true`。每个响应都在持久化之后清除认领。一旦被忽略，之后的发送既不计数也不提供邀请。
- 该状态绝不依赖匿名分析（analytics）、绝不向它发出任何东西，也绝不被它禁用。只有用户显式的浏览器
  导航才会联系所提供的 Calendar URL。
