---
id: submodule-web-lib
type: submodule-design
status: active
title: lib — UI 辅助函数
parent: module-web
---

## 职责

跨组件共享的微小应用辅助函数。类名合并（`cn`）属于 `@thinkrail/ui/utils`，不属于本模块；主题感知的高亮器
保持应用本地。

## 边界

- **拥有：** `utils.ts` → `stripFrontmatter()`（丢弃开头的 YAML `---` 块，使渲染出的文档不把规范元数据当成
  标题显示）+ `cssColorToHex()`（把 CSS 颜色规范化成十六进制——压缩后的 CSS 会给出 `#fff`/`gray` 这类等价
  写法，而 Monaco 与 xterm 这类严格使用方会拒绝它们；无法解析时得到 `""`）。再加上那些不止一个模块需要、
  谁也不该重述的原语：**`normalizePath()`** / **`isAbsolutePath()`**（来自 pi 工具调用或宿主的路径可能用
  任一种分隔符，也可能相对或绝对——应用里每个路径判定都从这两个出发，因此 `chat` 的展示辅助函数与 `store` 的
  工作树匹配器共享同一个定义）、**`viewport.ts`** → `isPhoneViewport()` 加上实时的 `usePhoneViewport()`
  投影（粗指针或低于 768px 的视口都算手机类；两个媒体查询都被观察）、以及 **`shallowEqualArrays()`**
  （逐元素 `Object.is`——store 快照同一性守卫与 `ErrorBoundary` 重置键背后那个“真的变了吗？”的判定）、
  **`userText()`**（用户消息的纯文本——由 `chat` 的对话记录水合/渲染器与 `store` 的实时事件折叠共享，因此
  “同一条消息”在任何地方都是同一个意思；它住在这里是因为 `store` 到 `chat/` 的边是仅类型的）、
  **`parseSkillInvocation()`** + **`matchesSkillInvocationCommand()`**（Pi 那个权威的、展开后的 `<skill>`
  用户消息语法的锚定浏览器侧镜像，由 `chat` 的紧凑渲染器与 `store` 的乐观回显对账共享；畸形/带引号的块会
  失败关闭）、**`relativeTime(ms, now)`**（相对显式的 `now` 给出 `just now` / `5m ago` / `2d ago`，绝不用
  `Date.now`——由聊天历史、标签条里的已关闭聊天，以及 Changes 范围菜单的提交行共享；它住在这里是因为
  `chat/` 不能从 `panels/` 导入，而正是这一点让它的三个私有孪生副本积累了起来）、
  **`platformShortcutLabel()`** + **`hasPlatformModifier()`** + **`platformFamily()`**（快捷键 chrome 与
  全局处理器共用一份 Apple 与其他平台的定义，外加用于按 OS 快捷键表的 `apple` / `windows` / `linux` /
  `other` 家族；它们默认都取浏览器报告的平台，但接受显式的平台字符串，因此非浏览器调用方与测试绝不会意外
  继承宿主运行时的合成 `navigator`；该标签可选地渲染 Alt 变体——`⌥⌘N` / `Ctrl+Alt+N`——因此快捷键 chrome
  绝不自己组合修饰键字形）、以及 **`copyText()`**（写剪贴板并报告是否落定——*降级*只有一个地方：非安全上下文
  （明文 HTTP 远程访问）或被拒绝的权限都没有剪贴板，而每个调用方的答案都相同——不做任何吵闹的事，文本保持
  可见/可选中）、**`randomId()`**（16 个随机字节经由 `getRandomValues`，它对明文 HTTP 远程客户端仍然可用）、
  **`DOUBLE_CLICK_SETTLE_MS`**（缓存打开与宿主读取的标签页打开共享的那一个单击→双击仲裁窗口）、
  **`mcpState.ts`**（MCP 服务器状态词汇——`MCP_STATE_LABEL`、`mcpStateTone`（报告零工具的已连接服务器会
  告警）、`mcpStatusLabel` / `mcpToolCountLabel`，以及 `isMcpAttentionState`（需要登录、失败、待批准）/
  `isMcpActiveState`（已连接、启动中）两个判定——由 `store` 的选择器、Settings，以及只收 props 的 chat
  Resources 行共享，后者可能不导入任何共同的别的东西），以及 **`LayoutAttention`** 这个由 store、shell 与
  无头布局子模块共享的设备本地覆盖层，配有对不受信任的元组键映射的自身属性安全访问器
  `readLayoutSelection()` / `readLayoutNavigationClock()`，以及不受键顺序影响的
  `sameLayoutAttention()` 相等判定，它让一个空操作的注意写入在到达 store 之前就被丢弃。可选的终端召回是
  工作区本地的历史，而不是第二个被选中标签页的权威；布局所有者会用当前成员关系来校验它。还有共享的 Shiki
  高亮器，**被排除在 barrel 之外**，使急切的 `@/lib` 导入保持不含 shiki：`highlighter.ts` 拥有由 chat 与
  桌面 Monaco 渲染器共享的精选语法/id/文件关联目录，外加 `createChatHighlighter(engine)`：`themes` 那唯一
  一份通用 CSS 变量注册，以及每个 chat 语法在首次使用时加载。Chat 代码在主线程之外被高亮：
  `highlightCode.ts` 解析语言别名（未知与 `mermaid` 都答 `null` 且不启动 worker），然后投递给每页一个惰性
  `highlighter.worker.ts`，它使用 Oniguruma WASM 引擎。每个调用方键至多一个请求在飞；更新的调用替换等待中
  的那个，后者解析为 `null`。如果不存在 `Worker`、构造函数抛错、worker 触发 `error`/`messageerror`
  （宿主的 SPA 回退会为被某次更新删掉的 chunk 提供 HTML），或者它无法构建自己的高亮器（WASM 加载失败），
  客户端就永久切换到线程内高亮，使用 JS 正则引擎（在 WebKit、桌面 webview 上，第一道 TS 围栏约 1 秒），并在
  那里重跑待处理的请求；这些失败绝不回答 `null`。语法加载失败会对该次调用回答 `null`（纯文本），并在下一次
  重试。结果存放在一个有界 LRU 里（256 条 / 4M 字符的代码 + HTML；超过其中四分之一的单条结果不缓存），它以
  `cachedHighlight()` 同步作答；一个键占一个条目，因此流式围栏不会把它填满。`useHighlightedCode()` 是唯一的
  组件 hook：它只在客户端读缓存（静态渲染，例如渲染后的差异，保持纯文本），按请求顺序应用回复，并在 worker
  追上之前显示上一次高亮加上更新的流式文本作为纯文本。两个文件都在 barrel 之外，只从惰性 chunk 中按文件
  导入（`@/lib/highlighter`、`@/lib/highlightCode`）；主题的同一性/调色板从不放在 `lib` 里。碰撞安全的
  浏览器身份组合也在这里：**`tupleKey()`** 给独立字符串加长度前缀，**`parseTupleKey()`** 只读它请求的命名
  空间，**`layoutResourceIdentity()`** 给每个前端本地的放置/缓存别名一个语义资源键，因此分隔符与稳定的
  非规范放置 id 都无法拆分或混淆身份。
- **Public surface（公开接口，barrel）：** `stripFrontmatter`、`cssColorToHex`、`isPhoneViewport`、
  `usePhoneViewport`、`normalizePath`、`isAbsolutePath`、`projectRelativePath`（规范的工作树相对 POSIX
  身份；折叠根内的 `.`/`..` 别名，但保留一次尝试性的前导逃逸以便宿主拒绝；Windows 盘符根包含性以大小写
  不敏感方式比较 path/root，同时保留候选者的原始大小写）、`shallowEqualArrays`、`userText`、`isShellInert`
  （一个仅由在 POSIX、PowerShell 和 cmd 中都保持字面意义的字符构成的值，因此它可以被插进人类会复制并运行的
  命令里）、`parseSkillInvocation`、`matchesSkillInvocationCommand`、`relativeTime`、
  `platformShortcutLabel`、`hasPlatformModifier`、`platformFamily`、`copyText`、`randomId`、
  `MCP_STATE_LABEL`、`mcpStateTone`、`mcpStatusLabel`、`mcpToolCountLabel`、`isMcpAttentionState`、
  `isMcpActiveState`、`McpStateTone` 类型、`DOUBLE_CLICK_SETTLE_MS`、`tupleKey`、`parseTupleKey`、
  `layoutResourceIdentity`、`readLayoutSelection`、`readLayoutNavigationClock`、
  `sameLayoutAttention`、`LayoutAttention` 类型，以及由 shell 的和弦与 panels 的纯字母复查快捷键共享的
  键盘门：`MODAL_LAYER_SELECTOR` + `hasLayer`（打开的 modal/dialog/alertdialog 掌管键盘）与
  `isTextEntryTarget`（输入框、textarea、select 与 contenteditable 保留它们的字母）——在目标上做鸭子类型
  判断，因此它在无 DOM 的测试里也成立。
- **允许的依赖：** React（只有视口订阅 hook）；`@thinkrail/contracts`（仅用于规范消息与 `McpServerState`
  的类型；布局资源身份的输入是本地结构类型）；`shiki`/`@shikijs/*`（只有按文件的 shiki 模块——绝不能经由
  barrel 触达）。
- **绝不触碰：** 每个应用内部模块——这是一个叶子。
