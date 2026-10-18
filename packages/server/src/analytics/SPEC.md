---
id: submodule-server-analytics
type: submodule-design
status: active
title: analytics —— 基础事件与受偏好控制的产品洞察
parent: module-server
depends-on: [module-contracts]
tags: [analytics, privacy]
---

## 职责与边界

由 CLI/源码/桌面共享的、仅宿主侧的产品分析，以无个人身份的方式投递到 PostHog EU。本模块拥有封闭的
事件词汇表、目录分桶、安装身份的使用方式、投递、同意门禁与有界关闭。只有宿主观察特性结果并捕获事件；
特性模块保持与分析无关。兄弟依赖边属于 [[module-server]]。

- **Public surface（公开接口）：** 初始化、基础捕获、按同意范围限定的附加捕获、附加数据启用、
  关闭/测试重置、事件类型、分桶辅助函数与 `BuildKind`。
- **允许的依赖：** persistence、log、contracts 类型、pi-ai 的内置目录、Node，以及仅在 sink 内部
  使用的 `posthog-node`。
- **绝不触碰：** 导入宿主/特性兄弟；在宿主之外被导入；在线上协议上暴露安装 UUID；把丰富的特性负载
  复制进遥测；浏览器自动捕获或仅原生的 sink。

## 事件

在带 key 的人工运行中，基础事件始终开启：`app_installed`、`app_started`、
`chat_started { provider, model, auth_method }`、`message_sent { mode, provider, auth_method }`，以及
`provider_login { provider, method, auth_method }`。`app_installed` 只携带标准的环境属性，并在
非 CI、非测试的二进制或桌面初始化认领共享的安装标记时，先于 `app_started` 发出一次。初始化在认领
之前就构造好基础 sink；一旦认领，状态在入队之前就已安装。因此 sink 构造失败会让标记保持可用，而
之后的投递失败既不清除也不重试它。既有的 `{ id }` 记录在其首次符合条件的打包启动时发出。启动指
宿主启动，而不是 UI 就绪。聊天可以是空的；宿主不得不在没有任何可用模型的情况下创建的聊天，会把
`provider` 与 `model` 报告为 `none`，`auth_method: unknown`；这种情况由宿主自己的模型解析
决定，而不是 pi 的占位模型（后者否则会分桶为 `custom`），而已解析的聊天会报告所创建会话实际持有的
模型（启动扩展可能切换它）。因此"创建了聊天却没有可用于发送的东西"始终能与配置的自定义提供商区分
开来。发送在 `ackSend` 之后计数，排除 TODO 控制类的提醒，并且不证明执行成功。登录要求相关联的成功，
或既有的已应用 Central 连接动作。`auth_method` 是封闭类别
`api_key | subscription | oauth | central | other | unknown`，绝不是凭据或账户/套餐身份。它描述观察到
的认证路径，而不是计费权益。宿主在派发之前捕获发送元数据，使用每个会话/登录所保留的运行时，并把
模棱两可的模式留作 other/unknown。Central 出处使用加载器注册元数据，而不检查不透明的 auth。

附加事件遵循 `analyticsEnabled` 偏好。它们确切的属性并集与负载测试就是 schema。产品结果字段使用固定
枚举或有界分桶；下面的获取触点字段是有界的、由浏览器派生的字符串，绝不是资源身份或任意的产品负载。

| 事件 | 信号 |
| --- | --- |
| `setup_state_observed` | 提供商/模型/项目的就绪状态（`yes/no/unknown`）；当前状态的首次观察与后续变化，而不是每次轮询。 |
| `setup_action_finished` | 显式的设置操作、结果与固定的失败类别；自动的 Default 预置被排除。`directory_pick` 是原生文件夹选择器（成功 / 取消 / 失败，绝不是路径）；`project_open` 报告来自 projects 模块编码错误的带类型 `not_git` / `already_open` 原因，而每个未类型化的失败都保持 `unknown` —— 原因绝不从错误文本推导。 |
| `agent_run_started` | 工作周期的来源、工作区种类，以及按目录分桶的提供商/模型。 |
| `agent_run_settled` | 最终结果、耗时/重试/压缩的分桶；只有 `agent_settled`，绝不是尝试级的 `agent_end`。 |
| `task_completed` | 产物归并之后非空任务组的完成转换、变更证据，以及是否记录过验证。 |
| `plan_opened` | 计划向用户呈现，按 `surface`（`page`/`rail`）；一次有意的打开动作，而不是每次计划重取。 |
| `plan_item_added` | 用户新增的计划条目（`origin:"user"`），按 `surface`（`chat`/`page`/`rail`）；是用户在整理计划，而不是 agent 重新规划。 |
| `review_decided` | 真实的用户/agent 批准或请求修改决定，而不是被中止的评审清理。 |
| `review_comment_added` | 针对文件/差异（diff）/文档创建的评审评论，按 `author`（`user`/`agent`）与 `kind`；人类草稿流程与评审 agent 的发现被区分开 —— 不是草稿编辑。 |
| `review_comment_sent` | 每一条投递给 agent 的评论**各一个**事件（价值时刻），带 `outdated`（`yes`/`no`）；按评论计数，使 added→sent→resolved 成为可数的漏斗，而 `outdated` 是重锚定的质量信号。这是投递，不是 agent 有效行动的证明。 |
| `review_comment_resolved` | 评论的终态结果，按 `actor`（`user`/`agent`）与 `outcome`（`resolved`/`dismissed`）；即人类更新与 agent 的 `resolve_comment` 工具，而不是草稿删除或 Clear。agent 的 `resolved` 是 agent 的声明，绝不是问题已修复的证明。 |
| `pr_action_finished` | 结果/类别；创建 PR 与更新、推送、对比页移交保持区分；当由计划页的 PR 阶段驱动时 `source` = `plan_page`，否则为 `other`。 |
| `acquisition_linked` | 一次成功的浏览器认领兑换，携带瞬时的 journey/bridge id 与规范化后的首次/末次获取字段。 |

评审评论的漏斗是宿主基于既有线上/工具动作观察到的：`review_comment_added` 取自
`review.commentAdd` 处理器（人类，`author:user`）以及宿主归档进 Review 标签页的每条计划评审判定
（`author:agent`，带持久化的 `kind`，因此锚点回退会读作 `review`）。`review_comment_sent` 每条评论
对每一次投递给 agent 都触发一次：`review.sendComment` / `review.sendBatch`、投递给 worker 的计划评审
修复（在确认之后走按钮路径，当其锁定的 file+mark+record 事务提交时走工具路径），以及用户的
Request-fix。按评论计数使 added→sent→resolved 在无个人身份的人群中仍然可数（按动作计数的分桶会让
该比率无法还原）；`outdated` 报告的是已重锚定后的发送集合中的锚点漂移。它在**接收**时触发，而不是
在分离的提示词启动时：轮次之前的拒绝（模型不对/密钥过期）会把评论回滚为草稿，因此过早捕获会虚高
转化率。`review_comment_resolved` 只在真正转入 `resolved`/`dismissed` 时触发 ——
`review.commentUpdate`（用户）与 agent 的 `resolve_comment` 接缝（`agent`/`resolved`）—— 因此来自
陈旧客户端的幂等重复绝不会被计两次。绝不复制评论正文、路径、锚点文本或行号 —— 只有封闭的
`author`/`kind`/`actor`/`outcome`/`outdated` 枚举。

计划/TODO 漏斗同样搭乘既有的线上动作，绝不使用浏览器自动捕获：宿主从一次有意的 `todo.list { opened }`
调用中捕获 `plan_opened`（计划页打开或 TODO 侧栏打开 —— 不是自动重取），从成功的 `todo.add` 捕获
`plan_item_added`（`surface` 指明 TODO 侧栏的新增行、聊天的新增路径或计划页的新增行），并根据
`pr.open` 的调用方给 `pr_action_finished` 打上 `source` 判别符（当由计划页的 PR 按钮驱动时为
`plan_page`）。计划页的 Review 阶段经 pi-subagents 委派运行（[[submodule-server-host]] 的计划评审），
其异步判定与触发它的界面解耦，因此 `review_decided` 目前不带 source。`surface`/`source` 是封闭枚举；
缺省分别默认为 `chat`/`other`，因此省略的参数绝不会凭空造出计划页归因。

获取触点的 schema 是 [[submodule-website-attribution]] 的严格服务端镜像：有界的规范化 UTM
source/medium/campaign/content 字符串、封闭的 referrer 类别、时间戳与策略版本。网站与服务端两份拷贝
一起变动；产品包绝不导入网站代码。落地页不会被传输；PostHog 通过 `journey_id` 把网站事件与
`acquisition_linked` 关联起来。当附加授权处于活跃状态时，持久化的、只含活动信息的首次/末次字段会
充实之后的基础事件与附加事件，但 `app_installed` 除外；被充实的基础事件只使用当前授权中可撤销的
sink，而未被充实的基础事件仍走永久的基础 sink。因此撤销会连附加事件一起丢弃已排队/重试中的被充实
基础事件，而不停止普通基础事件；只有 `acquisition_linked` 携带 journey/bridge id。获取信息在
`last_touch` 之后 30 天过期：启动时把过期或无效状态终结，且每次捕获在充实之前都会检查，因此跨越过期
时刻的进程会清空内存，并以终结性的尝试标记原子地替换该文件。若关联发生在某次启动期间，该次启动的
首个 `app_started` 仍保持未充实状态。

关联是瞬时的，且只限于一个已启用偏好的时期。不重放历史，也不重建在共享启用之前就已开始的工作；
来自禁用时期的异步结果在重新启用之后仍会被丢弃。
内部/未知的工作绝不虚高用户激活。正常的停止，或 agent 声明的任务/验证状态，并非价值、正确性或测试
通过的证明。到达顺序不是执行顺序。

## 偏好与投递

`analyticsEnabled` 是附加数据偏好兼宿主投递门禁；`analyticsConsentConfirmed` 记录首次运行对话框已完成，
而不是持续生效的投递门禁。宿主初始化会让未确认的配置保持关闭，直到该对话框挂载。对话框默认开启的挂载
预置会在未确认的情况下持久化 `analyticsEnabled: true`，并在所应用的设置更新成功的那一刻就启用投递，
早于用户按下 Done。切换开关会立即应用其偏好。Done 会带着确认一起持久化当前偏好；该确认只控制提示流程
的生命周期。初始化之后，只有显式包含 `analyticsEnabled` 的已应用设置更新才改变授权；无关的整份配置
广播会保留它。设置变更把偏好与确认一起写入。窗口行为属于 [[submodule-web-panels]]。已确认的后续启动
不再预置，也不再重新打开对话框。

只有盖了项目 key 的构建才会上报（见数据边界）；没有 key 的源码/dev 构建、CI 与 `NODE_ENV=test` 不创建
任何厂商客户端，也不认领安装标记。`--no-analytics` / `THINKRAIL_NO_ANALYTICS` 只抑制附加事件，不改变
同意状态。宿主侧分析是各启动器之间唯一的环境策略读取者。浏览器归因还额外限于满足以下条件的二进制/
桌面人工运行：偏好与确认均为真、注入了启动器 opener，且此前没有尝试过。源码、CI/测试、单次运行抑制、
显式关闭以及 CLI 的 `--no-open` 都不消耗该次尝试。对话框未确认的在挂载预置阶段可以启用普通的附加事件，
但不能启动归因；最终确认的更新才可以。已保存的"确认开启"只有在 CLI 打开其常规本地 UI 之后，或桌面
窗口首个 `dom-ready` 之后才开始；服务端启动与流逝的时间都不代表启动器已就绪。

宿主生成随机的 32 字节 verifier，发送其 SHA-256 challenge，要求严格的协议响应，只调用一次返回的同源
相对 claim URL 打开器且不等待它，并最多进行 54 次、间隔 10 秒的状态轮询，随后做一次兑换。每个请求都有
中止超时，整个认领有九分钟的截止时间，低于网站的认领有效期。当前同意代次拥有一个 AbortController；
撤销与关闭会中止 fetch 与正文读取，并在后续捕获之前移除充实。
失败与已完成的尝试是终结性的，绝不自动重试；重新启用只会恢复一份仍然有效的已存活动记录。一次通过校验
的兑换会在其代次仍然活跃时激活内存并发出 `acquisition_linked`，即使尽力而为的活动持久化失败也是如此。

附加授权的撤销会在传输层边界处丢弃已排队/重试中的请求，而不停止基础事件；已经发出的请求无法召回。
被撤销的队列绝不复活。捕获/启动绝不阻塞产品流程，也绝不向调用方抛出错误；优雅关闭会等待一次幂等的
两秒 SDK 排空。

## 数据边界

稳定的安装 UUID 与可选的 `appInstalled: true` 字段只存在于服务端；
[[submodule-server-persistence]] 拥有独占的 ID 创建与至多一次的跨进程安装认领。认领之后崩溃可能丢失
那次事件，但绝不会重复。单独的 `attribution.json` 存的是终结性的浏览器尝试标记，或通过校验的首次/
末次活动上下文，绝不存 claim ID、verifier、challenge、claim URL、journey/bridge id、IP 或 user agent。
过期或无效的上下文会转为终结；已保存的活动数据在偏好关闭/开启之间存活，而活跃的充实不会。其他状态
没有单实例协调。计数描述的是安装，而不是人。每个事件都携带 `app_version`、`channel`、`os`、`arch`、
`build` 以及其封闭属性。只有内置的提供商/模型名原样通过；自定义值变为 `custom`，同时保留既有的显式
`jbcentral` 登录名。不收集任何聊天/文件内容、路径/名称、资源 ID、凭据、任意错误、token/成本计数或
录屏。

sink 使用启动器提供的公开 key、EU 端点、关闭的 GeoIP 充实与 `$process_person_profile: false`；
key/端点/fetch 注入支持测试与自托管。仓库不携带任何 key：发布 CI 把它盖进 [[module-shared]] 的版本
接缝，因此源码、dev 与本地构建的产物（`channel=dev`、`0.0.0-*`）绝不可能污染生产数据。2026-10-06
一次针对未盖章的 dev 桌面/二进制测试装置运行（未设 `CI=1`）中 275 条 `app_installed` 的突增，促成了
这一点；仅靠 `CI`/测试静默，依赖于每个测试装置都记得设置它们。`phc_` key 仍是从已发布二进制中可提取
的公开摄取 key，因此这只阻止意外污染，而不是刻意滥用。无个人身份的数据处理并不会去掉 UUID 关联；
厂商的 IP 丢弃/保留策略是另一回事。自动化/schema、同意撤销、迁移、宿主触发以及打包后的回环投递测试
固定了这些边界。
