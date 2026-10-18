---
id: submodule-web-auth
type: submodule-design
status: active
title: auth — 应用内提供商登录 UI
parent: module-web
depends-on: []
references: [submodule-web-store, submodule-web-chat]
tags: [ui, auth]
---

## 职责

应用内提供商登录的客户端半边：累积式的客户端**登录状态类型**，以及渲染它们的**展示型** OAuth 对话框。该对话框
与 `chat/ExtUiDialog` 完全类比——pi 的流程，经线上协议桥接，渲染为模态框——但**无会话**：登录在任何会话存在
之前就在 Welcome 屏幕上运行。（镜像 `chat`/ExtUi 的切分，**帧 reducer 位于 `store`**，不在这里——`auth` 保持
展示型 + 类型，因此这里没有任何东西导入 `store`。）

## 边界

- **拥有：**
  - `loginState` — **类型** `LoginState`（+ `LoginInput`/`LoginInputSelect`/`LoginInputPrompt`）：一次登录的
    客户端累积状态。它的文档钉住了 store 的 reducer 所实现的累积契约——帧是**追加**，而不是替换（`url` 可以
    与粘贴的 `prompt` 同时存在，即浏览器 vs 粘贴的竞态），`status` 走 `active → success/error`。可选的
    `target` 命名某次 MCP 登录或连接测试所属的 MCP 服务器（`LoginPush.target`）。**仅类型**（像
    `chat/types`）。
  - `LoginDialog` — **props 驱动、无 store/transport**（像 chat 的渲染器）：渲染一个 `LoginState`（打开 URL
    的按钮 + 可选中的 URL；带**可点击验证链接**的设备码，该链接还会在到达时尽力在新标签页**自动打开**；
    `select`/`prompt` 输入——被标为 `secret` 的提示词渲染为**遮蔽**（API key，issue #97）；进度/处理中的
    spinner；终态的成功/错误），并回调 `onReply(value)` / `onCancel()` / `onClose()`。文案写的是
    **“Connect”**，而不是 “Sign in”——同一个对话框同时服务于 OAuth 与 API-key 录入。只用 token 工具类
    着色；图标来自 `@remixicon/react`；shadcn `Dialog`/`Button`。
- **Public surface（公开接口，barrel `index.ts`）：** `LoginDialog`；`LoginState`/`LoginInput*`（类型）。
- **允许的依赖：** `@thinkrail/ui/dialog` 和 `@thinkrail/ui/button`。（状态类型不需要任何导入。）
- **绝不触碰：** 导入 `store`/`transport`（对话框保持展示型——**面板**才是集成件，正如 `chat/ChatView` 之于
  chat 的渲染器）；任何 `pi`/`server` 导入。

## 集成（由调用方拥有，不在这里）

- **store** 持有唯一的 `activeLogin: LoginState | null`（扁平的、无会话的），在 Providers 与 MCP 任一方发送
  请求之前同步预留登录启动，并拥有帧 reducer（`foldLoginFrame`）——绝不在会话运行时之下（那条路径会在会话
  之前丢弃帧）。启动失败会释放该预留；某个帧仍可能在启动响应之前就创建出匹配的对话框。迟到的响应绝不替换
  另一次活跃的登录。
- **`provider.login` 频道**在 `transport/wireTransport` 中被路由到 `store.applyLoginFrame`。
- `panels/ProvidersSettings`（Settings 对话框的 Providers 小节）是集成件：它启动登录（`provider.loginStart`，
  `type` 为 `"oauth"` 或 `"api_key"`——两条认证路径走同一个频道，issue #97 ——`store.beginLogin`），从
  `store.activeLogin` 挂载 `LoginDialog`，把 `onReply`/`onCancel` 接到 `provider.loginReply`/`loginCancel`，
  并在某次登录（或登出）落定时重新抓取 `provider.status`；它会忽略携带 `target` 的登录。（Welcome 屏幕只
  承载 `panels/ProviderWarningBanner`，在没有提供商连接时它会打开 Settings → Providers。）
- `panels/McpSettings` 是第二个集成件：`mcp.login` / `mcp.testConnection` 返回一个登录 id，其
  `provider.login` 帧只到达发起它的那个连接；它把服务器作为 `target` 启动登录，只对带 target 的登录挂载
  同一个 `LoginDialog`，并通过同样的 `provider.loginReply` / `loginCancel` 作答。登录页面仍然只从对话框的
  按钮打开（桌面外壳把 `window.open` 路由到系统浏览器）；粘贴字段接受完整的重定向后 URL。

## 必须做对的事

- **帧会累积**——reducer 在粘贴的 `prompt` 到达时绝不能覆盖 `url`，反之亦然。
- 对话框以 `key={state.loginId}` 挂载，因此新的登录会得到全新的本地（文本/忙碌）状态。
- 设备码的**自动打开**是尽力而为（弹窗拦截器可能阻止异步 `window.open`）；可点击的验证链接是保底回退，因此
  流程绝不会因为弹窗被阻止而走不下去。
