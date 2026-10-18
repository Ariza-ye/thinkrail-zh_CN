---
id: submodule-server-auth
type: submodule-design
status: active
title: auth —— 提供商状态 + 应用内登录
parent: module-server
depends-on: [module-contracts, module-shared]
references: [submodule-server-agent, central-integration]
tags: [auth, pi]
---

## 职责

关于**模型提供商凭据**的一切：欢迎条带所渲染的读取侧（`provider.status`），以及从应用内部配置
它们的写入侧 —— OAuth 登录、交互式 API-key 录入（两者都走**同一条登录通道**，issue #97），还有
登出。这一切都经由共享的 `ModelRuntime`（pi 的模型/认证门面）；我们从不自己解析 `auth.json` /
`models.json`，也从不把凭据值送到线上协议上。

## 边界

- **拥有：**
  - `providerStatus` —— `getProviderStatus()` → 线上协议里的 `ProviderStatusReport`：每个提供商
    的 `configured`（pi 的 `hasAuth` 系真相，所以环境变量认证也算）+ 认证 `kind`（oauth / api-key /
    env / other）+ 展示名 + 应用内登录能力标志 **`canOAuth`/`canApiKey`**，已配置者优先。
    它**在每次读取时经由 `agent` 的当前运行时门面重新校验**：本地配置/认证的可用性在禁用网络的
    情况下刷新，所以一次外部的 PI 登录会变得可见。Central 不通过模型 URL 推断：状态把
    `shared/jbcentral` 的可执行文件/版本/产物后置条件以及封闭的认证/代理观察，与同步器最新的
    期望/已应用代次结合起来。监视器漂移会安排一次重建；在最新候选应用之前状态是 `configuring`，
    无法应用时是 `load-failed`。跨模块的有界退出义务与 drain 已知的饿死风险，由
    [[central-integration]]（不变量）拥有。

    **认证/代理观察是缓存的、在读取路径之外刷新，且从不轮询。** 一个已定论的 `supported` 读数
    会立即服务缓存结果，并在超过 `JBCENTRAL_STATUS_TTL_MS` 之后启动一次后台 `central status`
    探测；当任一结论改变时它发布常规的提供商失效，于是一个打开着的卡片无需任何客户端定时器
    也能收敛。只有被明确观察到的否定结果才设置线上标志：`signed-out` 设置 `signedOut`，而已
    停止的代理只在已配置状态上设置 `proxyStopped`；未知从不设置。被拒绝的 `central add pi`、
    已启动的 `central login`，以及一次 Start proxy 尝试，都会丢弃共享缓存，因为每一个都可能
    让该观察变陈旧。TTL 窗口内的一次带外变化会被有意地以陈旧形式服务，直到下一次越过它的读取。
    探测绝不在动作进行中运行，也不在重建未了时运行，所以它无法拖延一次 Connect 或一次候选
    切换。装配是在一个窄来源切片之上的纯 `buildProviderReport(sources)`，用夹具数据做过单元
    测试；kind/detail 映射本身是 `agent` 的 `describeProviderAuth`，与目录的逐模型 `WireModel.auth`
    投影共享，所以提供商行与选择器行绝不会互相矛盾。它的运行时读取被限制在该代次的 provider-id
    允许清单内，那份清单是在不透明的 Central 扩展加载之前（在不变量的宿主注册之后）捕获的：
    Central *引入*的提供商从不会成为行，也不会跨线上协议。一个被中央 *替换* 的内建项
    （真实产物里的 `anthropic`、`openai`、`google-vertex`）仍是一行 —— 用户必须能看见哪些提供商
    是通过 JetBrains AI 到达他们的 —— 并报告为 `kind: "central"` 且无 `detail`，这完全由该 id
    在该代次的 `opaqueProviderIds` 中的成员资格决定；它的 `name` 是该代次的扩展前展示名（pi 会
    合成 `extension.name ?? base.name`，所以一次实时读取会把一个由产物选定的字符串交给客户端），
    而 `configured` 与 `canLogout` 沿用常规读取，Central 的 `baseUrl`/`apiKey` 从不被读取。
    - **支持 OAuth 的 id 是一等行。** id 全集并集了模型目录里的提供商、已存凭据的提供商
      （`listCredentials()`）、**以及** `Provider.auth.oauth` 存在的提供商 —— 一个 OAuth id 可能
      与任何模型提供商 id 都不同（`openai-codex` ≠ `openai`），而已存的凭据可能比它的模型活得
      更久。`canOAuth` = 该行的提供商携带 OAuth 认证（于是 `provider.loginStart(row.id)` 用的是
      pi 实际会存下的那个凭据 id）；它的行名优先取 `auth.oauth.name`（对仅 oauth 的行更具体）。
      `canApiKey` = **`Provider.auth.apiKey.login` 存在** —— pi 公开的 api-key 登录真相，*别无
      其他*（issue #97：交互式登录通道会驻留提供商提出的每一个提示，所以多提示类凭据 ——
      bedrock/vertex/azure —— 以及 OAuth+key 型提供商 —— github-copilot —— 都能直接工作；手工
      维护的排除集已经消失；`openai-codex` 报告 `false` 是因为 pi 的提供商没有 key 认证，不是
      因为我们这么说）。`canLogout` = 该 id 有一份已存的 **auth.json** 凭据
      （`credentialProviders`）—— 那是宿主唯一能移除的认证；env / models.json 类型的认证报告
      `false`（Sign-out 会变成空操作，所以该条带把它藏起来）。Central 自己的生命周期只是那个
      专门的封闭 `jbcentral` 状态，从不是一行；被替换的内建项上的 `central` kind 是一个身份事实，
      绝不从模型 URL 或配置推断。
  - `providerLogin` —— 应用内凭据**写入**，无会话（一次登录在欢迎界面上运行，早于任何会话
    存在），所以它是一个以 `loginId` 为键的 `agent/webUiContext` 兄弟：
    - `startLogin(providerId, type = "oauth")` → `{ loginId }`，**同步**返回；
      `runtime.login(id, type, interaction, piLoginOptions)` **分离（detached）**运行（一个流程
      可能耗时数分钟 —— await 它会击穿客户端请求超时并阻塞 WS 泵）。**一座桥，两种认证类型**
      （issue #97）：`"oauth"` 与 `"api_key"`（提供商自有的交互式密钥录入 —— 大多数提供商一个
      密钥提示，azure/vertex 风格的凭据则是多提示）。`piLoginOptions`（agent barrel）从全局设置
      提供 pi 稳定的安装 `deviceId`，pi 的 openai "Sign in with ChatGPT" 流程需要它（没有它会
      抛错）；和 pi 的 CLI 一样，它首次使用时创建，绝不为其他流程创建。pi 的 `AuthInteraction`
      接到 `provider.login` 通道上的 `LoginFrame` 推送：`notify` `auth_url`→`authUrl`、
      `device_code`→`deviceCode`、`progress`/`info`→`progress`（info 链接作为纯 URL 追加）；
      `prompt` `select`→一个驻留的 `select` 帧，`text`/`secret`/`manual_code`→一个驻留的
      `prompt` 帧等待回复（`secret` 提示会在帧上打标记，好让对话框遮蔽输入）。提示自身的
      `signal` 中止（pi 取消它浏览器对粘贴竞赛中的败者）会让驻留的输入定论 —— 带身份守卫，
      所以迟到的中止无法清掉一个更新的驻留提示。pi **在 `login()` 内部持久化凭据并刷新可用性**，
      所以成功只需推 `success`；抛出则推 `error`。
    - `resolveLogin({ loginId, value })` —— 浏览器的回复让驻留的交互定论。
    - `cancelLogin(loginId)` —— 中止 signal **并**用 `undefined` 让驻留的输入定论（这会让
      正在等待的 `prompt` 抛出），因为仅靠 signal 停不住提供商对浏览器/回调服务器的等待；
      `cancelAllLogins()` 在宿主 `stop()` 时清扫它们。
    - `logoutProvider(id)` —— `runtime.logout`（内部自行刷新）。（旧的 `setProviderApiKey` ——
      一个恰好回答单个密钥提示的罐头式交互 —— 已随 `provider.setApiKey` 一起消失：对话框流程
      把它涵盖了，并且还能服务多提示的提供商。）
    - `setLoginPublisher(fn)` —— 推送接缝（默认是空操作）。成功完成时还会把执行该登录的代次作为
      单独的仅宿主上下文提供；它绝不是 `LoginPush` 的一部分，也不会被序列化到线上协议上。
  - `jbcentral` —— 应用内的 **JetBrains AI** 原生流程。它把 `shared/jbcentral` 的宿主本地适配器
    与产物监视器，和 `agent` 的候选代次接缝组合起来；它绝不触碰管理器内部。宿主启动时启动
    监视器，并在模型工作之前请求一个初始代次。一个经审阅的已配置产物作为不透明扩展路径传入；
    配置缺失或不受支持时产出一个普通运行时。若 Central 候选在启动初期失败，auth 记录
    `load-failed` 并向 agent 请求一个普通运行时，好让 UI 和无关提供商仍然可用；那个普通运行时
    若失败，启动仍然失败。

    Connect 执行最低版本预检，运行 `central add pi`，校验产物存在，并 await 监视器所用的同一条
    重建路径。Disconnect 运行 `central remove pi`，在产物存在时校验其不存在；产物本来就不存在
    就是完整的后置条件，并直接重建普通 PI，即使 Central 本身现已缺失/不受支持（于是 Retry 能
    修复一个失败的普通候选）。Login 在版本预检之后启动 `central login` 并丢弃缓存的状态观察，
    因为用户即将带外地改变它；该次启动只有在子进程活过其宽限期之后才被报告为成功，所以一个
    无法启动的登录会以"宿主命令"作为回退呈现为失败，而不是邀请用户去一个从未打开的浏览器里
    完成。Update 调用 `central update --install` 并重新检查状态。Start proxy 调用
    `central proxy start --ensure-updated`，使共享状态观察失效，并校验一次新探测不再给出肯定
    的"已停止"；它不重建、也不重连 PI 运行时。每个动作都使用解析出的绝对可执行文件。没有任何
    动作会编辑此前的模型配置、预检实时聊天模型、做补偿，或回滚 Central 的全局状态。

    `getJbcentralQuota({ maxAgeMs, force })` 是单独的配额协调器。它只在当前生命周期满足卡片的
    Connected 谓词时才接纳读取，随后把 `shared` 的纯数值读取包进一个进程全局、仅内存的缓存与
    single-flight。普通读取复用比 `maxAgeMs` 更年轻的最近一次已完成尝试；force 绕过年龄但仍
    加入一次在途读取。失败时把最近一次成功的数字作为 `stale` 返回，在任何成功之前返回封闭的
    `unavailable`。生命周期变化会同时清除新鲜度与旧的成功回退，所以另一个账号绝不可能继承它；
    越过该边界后的一次读取会等待过去，但绝不加入/返回上一代次的在途任务。值从不持久化。调用方
    提供来自设置的时间上限，所以 auth 不导入 settings 兄弟。

    监视器事件会被去抖/合并，每次重建都重新审视最新的版本 + 产物后置条件。单调的请求序列防止
    一个更旧的候选在更新的文件事件之后激活。成功时，auth 为提供商/模型读取与未来会话激活该
    候选，清除 `load-failed`，并发布模型/提供商失效。已有的活会话有意保留它们创建时所用的
    运行时 —— 包括全局 Disconnect 之后的一个 Central 支撑会话 —— 直到该会话被释放或宿主重启。
    它们绝不被排空，也绝不被重连。

    候选失败保留当前运行时并报告 `load-failed`；它绝不封锁无关的模型动作。Retry、后续的文件
    事件或 Disconnect 会请求另一次重建。一个进程级的 single-flight 串行化 CLI 动作，而候选请求
    则合并到最新的已观察产物状态。状态与动作结果只用封闭的 contracts 分类法 —— 绝不用子进程
    输出、扩展内容、诊断、代理数据、原始模型或任意抛出的消息。
- **Public surface（公开接口，barrel）：** `getProviderStatus`, `buildProviderReport` (+ `ProviderStatusSources`);
  `startLogin`, `resolveLogin`, `cancelLogin`, `cancelAllLogins`, `logoutProvider`,
  `setLoginPublisher`; `initializeJbcentralRuntime`, `stopJbcentralRuntime`, `getJbcentralStatus`,
  `getJbcentralQuota`, `connectJbcentral`, `disconnectJbcentral`, `startProxyJbcentral`,
  `updateJbcentral`, `jbcentralLogin`，成功动作 / 运行时变化发布器接缝，以及兄弟宿主测试所用的
  显式 `resetJbcentralStateForTests` 生命周期接缝。
- **允许的依赖：** `contracts`（线上类型）；`shared/jbcentral`；**`agent` barrel** 用于当前
  运行时/认证门面以及候选的准备/激活；`@earendil-works/pi-ai`（仅认证交互**类型**）。
- **绝不触碰：** 深入 `agent` 内部（运行时与代次的改动只经它的 barrel）；导入 `host`、`settings`
  或任何其他兄弟；为了私有的提供商常量而深导入 pi 的 TUI（`modes/interactive/*`）；
  把凭据**值**放到线上协议上。

## 必须做对的事

- **`loginStart` 绝不能 `await` 该流程** —— 返回句柄，分离运行 `login()`。
- **会话前的运行时/认证读写要捕获当前代次。** pi 的 login/logout 会在本地同步被捕获的运行时；
  活会话保留自己的代次。产物漂移会构建并原子地激活一个新的当前代次，既不原地变更候选，也不
  原地变更已有会话。
- **API key 只通过 `login(id, "api_key", interaction)` 持久化** —— `setRuntimeApiKey` 是一个
  会话生命期的覆盖层，会在宿主重启时静默丢掉该 key。交互是真正的对话框桥，绝不是罐头式自动
  回答（罐头式只能服务单提示的提供商）。
- **取消要让驻留的 promise 定论**，不只是 `abort()`。
- 帧在客户端**累积**（`authUrl` + 粘贴-`prompt` 竞赛），所以终态的 `success`/`error` 才是
  关闭一个流程的东西 —— `terminate()` 保证每个 `loginId` 恰好一个终态结果。

## 使用方

`host`（接线所有 `provider.*` 处理器 + `provider.login` 通道发布，并停止 Central 监视器）；
`agent` **不**依赖 `auth`（这条边是单向的：`auth` → `agent`，经由当前运行时与候选代次接缝）。
