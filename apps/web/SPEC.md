---
id: module-web
type: module-design
status: active
title: Web UI 客户端
parent: architecture
depends-on: [module-contracts, module-ui, module-extension-api, module-ext-visualize]
tags: [ui]
---

## 职责

移动优先的 React UI。以静态资源发布，并通过线上协议拨通一个引擎宿主。把 `pi` 的事件流渲染为一个以聊天为中心、
多会话的 IDE 外壳。

## 边界

- **拥有：** 浏览器 UI——客户端本地的导航与工作台状态、传输层客户端、store、panels、响应式外壳、品牌 token。
- **Public surface（公开接口）：** 构建出的静态 bundle（`dist/`）——一个可部署、会拨通宿主的产物。
- **允许的依赖：** `@thinkrail/contracts`（类型加上它那个小的纯运行时：WS 常量、版本、守卫、
  `createQuitConfirmation`；见 [[module-contracts]]）、`@thinkrail/ui/*`、`@thinkrail/extension-api/web`，
  以及 `@thinkrail/ext-*/web`；React / Zustand / Vite / 等。
- **部署义务：** 一个构建出的客户端服务每一个启动器与未来的部署。端点选择属于传输层引导；panels、stores 与
  功能流程绝不按 `cli`、`desktop` 或某个部署名分支。
- **绝不触碰：** 导入 `server` / `shared` / 任何 `pi` 包（值或类型）。靠仅类型导入 + `verbatimModuleSyntax`
  保持干净（`dist/` 构建里看不到任何提供商 SDK / `node:fs`）。

## 内部模块

每个都是有界的子模块；`navigation`/`transport`/`store`/`updates`/`prompt`/`resources`/`lib`/`extensions` 暴露
一个 `index.ts` **barrel**（它们唯一的公开接口）。`panels`/`chat` 按设计**按文件导入**——给它们加 barrel 会把
惰性加载的 Monaco/shiki/xterm chunk 拉进急切 bundle，并破坏 shadcn 的按原语约定；它们的边界由约定 + 规范
维持。兄弟边住在这里，不在叶子里。

| 模块 | 拥有 | barrel | 规范 |
| --- | --- | --- | --- |
| `navigation` | 后端相对的位置模型 + fragment 驱动/已校验恢复 | 是 | [navigation/SPEC.md](src/navigation/SPEC.md) |
| `transport` | WS 客户端 + 它的单例/store 接线 | 是 | [transport/SPEC.md](src/transport/SPEC.md) |
| `store` | Zustand：领域投影、一个本地工作台帧、按工作区的视图/注意、聊天运行时 | 是 | [store/SPEC.md](src/store/SPEC.md) |
| `panels` | 布局无关、store 驱动的功能视图 | 否 | [panels/SPEC.md](src/panels/SPEC.md) |
| `resources` | 资源描述符、渲染器解析，以及渲染器无关的复查界面类型 | 是 | [resources/SPEC.md](src/resources/SPEC.md) |
| `chat` | pi 对话 UI 原语：内容块渲染器 + 工具渲染器注册表 | 否 | [chat/SPEC.md](src/chat/SPEC.md) |
| `prompt` | 与生命周期无关的斜杠补全 + 提示词模板槽位编辑 | 是 | [prompt/SPEC.md](src/prompt/SPEC.md) |
| `auth` | 应用内提供商登录：展示型 OAuth 对话框 + 它的客户端状态 reducer | 是 | [auth/SPEC.md](src/auth/SPEC.md) |
| `shell` | 响应式组合 + 前端本地的工作台所有权（有界的 `layout/` 与 `layoutState/` 子模块） | 否 | [shell/SPEC.md](src/shell/SPEC.md) |
| `updates` | 可选的 native/宿主更新外壳 hook 与 props 驱动的控件 | 是 | [updates/SPEC.md](src/updates/SPEC.md) |
| `notifications` | 应用外注意通知：绿点观察器、队列/窗口引擎、浏览器 Notifications 包装、权限前言 | 是 | [notifications/SPEC.md](src/notifications/SPEC.md) |
| `components` | 依赖很轻的应用原语：错误隔离、状态图标、自定义图标、静默滚动框架 | 否 | [components/SPEC.md](src/components/SPEC.md) |
| `extensions` | 把 web 扩展描述符按序组合进 chat 注册表 | 是 | [extensions/SPEC.md](src/extensions/SPEC.md) |
| `themes` | 已校验的单文件清单、内置目录 + 原子 token 应用 | 是 | [themes/SPEC.md](src/themes/SPEC.md) |
| `i18n` | UI 目录、系统语言解析与客户端本地语言偏好 | 是 | [i18n/SPEC.md](src/i18n/SPEC.md) |
| `fonts` | 设备已安装的字体族与客户端本地的界面字体偏好 | 是 | [fonts/SPEC.md](src/fonts/SPEC.md) |
| `lib` | 共享的路径/数组原语 + 高亮 | 是 | [lib/SPEC.md](src/lib/SPEC.md) |

没有自己规范的叶子工具：`constants/`（品牌——产品名、存储/事件前缀，以及那一个 `BRAND_MARK_SEGMENTS`
字母组合区域，它们被拼成 `BRAND_MARK_PATH`，由外壳标志填充、并被 components 的工作中徽章裁切）、
`clientPreferences.ts`（对可选的原生稳定字符串适配器的功能中立访问），以及 `styles/`——它持有三个设计系统的
来源（`typography.json`、`colors.json`、`spacing.json`）、它们生成的 CSS，以及结构性 token 契约；按主题的
调色板属于 `themes`。每个系统都在其来源旁边有规范：[TYPOGRAPHY.md](src/styles/TYPOGRAPHY.md)、
[COLOR.md](src/styles/COLOR.md) 与 [SPACING.md](src/styles/SPACING.md)；建立在其上的应用内提示与 toast 外观
见 [NOTIFICATIONS.md](src/styles/NOTIFICATIONS.md)。
在 `src/` 之外，**[`scripts/`](scripts/SPEC.md)** 是构建期的生成器模块——它在 Bun 下运行、绝不发布，并把那
三个 JSON 来源变成 `styles/generated/`（另有厂商提供商标记变成 `chat/generated/`）。
`index.html` 命名产品，并链接那个本地、仅符号的 SVG favicon，它派生自与外壳标志相同的 ThinkRail 图稿（足够
紧凑以适应浏览器标签页尺寸与明/暗浏览器 chrome）。
`main.tsx` 是入口/组合根——它在 React 之前同步构建内置主题目录、解析并应用带版本的首屏主题偏好提示（包括当前
系统配色方案），初始化传输层、客户端本地偏好接缝（聊天呈现、隐藏模型、项目展开、界面字体）与导航，然后把
`<Shell />` 包进 `components/ErrorBoundary` 作为兜底边界（逃出每个区域的崩溃会显示重载屏，而不是一个空白根），
外加应用唯一的 `TooltipProvider`。

**在第一个携带上游修复 #34803 的稳定版发布之前，React 是一个精确的、互相匹配的 `react` + `react-dom` 19.3
canary 钉版。** React 19.2 的开发期 Performance Tracks 保留了每一条 `performance.measure()` 记录；Pi 速率的
聊天渲染让一个 Vite 标签页长到 10 GB 以上，而 JS 堆保持平稳，随后 Chrome 杀掉了渲染器，Vite 把已死的 socket
报告为 `EPIPE` / `ECONNRESET`（React #34770）。所选 canary 包含 React 自己的 `clearMeasures` 修复；ThinkRail
刻意不携带第二套 measure 清理策略。由于预发布版不满足依赖方的稳定 React peer 范围，根包管理器 overrides 通过
各自的 catalog 条目解析两个运行时包；`check:deps` 读取 `bun.lock`，拒绝任何第二个 `react` 或 `react-dom`
版本。每一次 React 迁移都同时升级这两个包，并重跑已挂载聊天的内存压力探针，之后这个临时的 canary 钉版才能
回到稳定版。

**React Compiler 对每个 `apps/web` bundle 都开启**（`vite.config.ts`：`@rolldown/plugin-babel` 在 dev 与
build 上运行 `@vitejs/plugin-react` 的 `reactCompilerPreset()`）。三个 devDependencies 只存在于这份清单里，
而 `@babel/core` 7.x 的钉版是承重的：`babel-plugin-react-compiler` 1.0.0 在 Babel 8 下会错误降级解构默认值，
并静默把那些函数从编译中丢掉。放弃编译绝不会让构建失败——编译器无法证明安全的函数会被整体跳过，而不是被错误
编译——所以要检查它确实运行过：生产构建的 `dist/assets/*.js` 里带有成百上千处 `react.memo_cache_sentinel`
（React 自己的运行时占三处），而当某个函数的编译状态偏离 `scripts/compiler-census.baseline.txt` 时，CI 的
`bun run check:compiler` 会失败。`bun test` 不经 Vite 转译，因此只有浏览器 E2E 套件会跑到编译后的产物。

外壳、工作台分组视图、`ChatView`、`Composer` 与 `useChatScroll` 之所以能编译，是因为它们遵守这些约定：

- 一个最新值 ref（`xRef.current = value`）在 `useInsertionEffect` 里写入，绝不在 render 里写入，且 render
  永不读取 `ref.current`。插入效应在整棵树上先于任何布局效应运行，因此子节点那个回调父节点的布局效应
  （`react-resizable-panels` 的 `onLayout`、`useChatScroll` 里 Virtuoso 的几何读取）看到的是当前值。该效应
  只赋值 ref：没有状态、没有 DOM。
- 一个 hook 把 ref 与 render 值一起作为元组交回（`useElementSize`），或者调用方把它们解构出来
  （`useCollapsibleRegion`、dnd-kit 的结果）：从一个携带 ref 的对象上读取 render 值会被算作一次 ref 读取。
- 作为 prop 传递的 ref 命名为 `*Ref`（`selectionEpochRef`），因此处理器可以修改它。
- 读取 ref 的闭包只能经由 hook 到达 `useState` 初始化器（`useReadingBandController`），而 ref 绝不交给一个
  普通辅助函数；该辅助函数会变成一个拥有它的 hook（`useSideResizeBinder`）。
- 默认参数绝不读取成员表达式（`caret = text.length`）；在函数体里解析它。
- 闭包绝不对它捕获的变量施加 `++`/`--`；写 `attempts += 1`。
- 一个 `useMemo`/`useCallback` 列出它读取的每一个依赖，否则编译器无法保留它。
- 回调没有读取的 `useMemo` 依赖会被丢掉，因此一个 memo 不可能在它忽略的键上重置
  （`useMemo(() => new Map(), [key])` 每次挂载都会建一个 map）。改为通过以该值为键的状态来重置
  （`ChatView` 的行高估算缓存）。
- render 永不读取编译器看不到变化的值——`matchMedia`、存储、`Date.now`、模块单例。它经由
  `useSyncExternalStore` 或状态到达：`AppearanceSettings` 用 `onSystemAppearanceChange` 订阅，相对时间标签
  从 `components/useNow` 取 `now`。

已知的放弃包括两条热路径：`useVirtualRows` 在每次 `ChatView` render（每个流式增量）时运行，`PlanComposer`
在计划窗格的每次击键时运行。共享 hook 与资源界面也有放弃；chat/shell 热路径能编译并不意味着覆盖了每个
文件/差异渲染器。

- render 里的 ref 访问：`useVirtualRows`（在 render 期间调整状态时读取可见锚点 ref；用状态会每次滚动多付
  一次 render）、`useWorkspaceRead`、`useOpenBranchReview`、`useBranchList`、`useTemplateCommandPicker`、
  `usePendingSelection`、`MonacoEditor`、`AskUserQuestionCard`、`useScrollViewState`、Pierre
  diff/file 的 `useThreadAnnotations`、`PierreDiffSurface`、`PierreFileSurface`、图像 diff 的
  `ImageContent`、`ImageView`、`PdfView`、`usePdfDocument`。
- try/finally：`PlanPane`（另外 try 内部还会抛错）、`PlanComposer`、`ReviewPanel`、`SendButtonBase`、
  `NewWorkspaceDialog`、`SkillsDialog`、`TemplateEditorDialog`、`JetBrainsAiCard`、`ProvidersSettings`、
  `ModelsSettings`、`GithubSettings`、`ProjectTrustNotice`。
- 没有 catch 的 try：`usePromptImages`。
- 手工 memo 依赖无法被保留：`CsvDiff`、`JsonDiff`、`NotebookDiffSurface`、`PdfDiff`。
- 其他：`useLiveTabContent`（`??=`）、`useAnalyticsConsent`（一个自己调用自己的回调）、`TemplateRow`
  （try/catch 内部的条件）、`HistoryOverlay` 的 `Highlight`（修改一个闭包计数器）。

新的放弃就是回归，除非它加入这份清单。

**渲染成本在单独的 profiling 构建上测量，绝不在发布构建上。** `bun run --cwd apps/web build:profile`
（`vite build --mode profile`）产出 `dist-profile/`：同样的已编译生产代码，但 `react-dom/client` 被别名到
`react-dom/profiling`、压缩关闭，因此组件名能存活下来以供归因。源码里没有任何 `<Profiler>` 包装、开关或收集器：
每个组件的成本由一个由测试装置安装的 React DevTools hook 读取（`e2e/perf`，见 [[module-browser-e2e]]）。
包装器需要在产品代码里加一个构建开关，而且只能给出区域总计；hook 能在零源码改动的情况下看到每一个组件。因此
`dist/` 里没有任何 profiler 计时器（`dist/assets` 里没有 `actualStartTime`）。

### 国际化

`i18n` 模块拥有应用 UI 目录与客户端本地语言偏好。所有 UI 模块都可以消费 `@thinkrail/ui/i18n` 做响应式翻译；
只有组合与语言控件使用应用的 `i18n` barrel。共享运行时让原语与扩展 web 半边独立于应用内部。默认语言跟随系统，
解析为简体中文或英文。Settings → Appearance 会立即在 System / English / 简体中文 之间切换，而不重新挂载工作台
内容。既有的原生稳定偏好适配器，或浏览器里的 localStorage，持久化该选择；不发生任何宿主设置写入。缺失的翻译
回退到英文源。用户/agent 内容、代码、路径、外部错误与协议标识符绝不翻译。见 [[submodule-web-i18n]]。

### 依赖图

- `navigation` → `store`、`transport`、`contracts`（仅类型）；两个依赖都不导入它，而 `main.tsx` 初始化该
  集成
- `shell` → 子模块 `shell/layout` + `shell/layoutState`、`updates`（一个可选能力 hook + props 驱动的
  Settings 内容与持久状态可供性）、`notifications`（挂载一次注意观察器 + 权限前言）、`panels`、`chat`（仅
  应用集成的 render/水合）、`store`、`transport`（领域水合 + 端点身份）、`contracts`（类型 + 共享的
  `createQuitConfirmation` 规则）、`ui`、`components`（每个挂载区域外层的 `ErrorBoundary` + 外壳拥有的工具
  主体外层的 `QuietScrollArea`）、`constants`、`lib`（平台快捷键语义）、`themes`（目录/媒体解析与原子主题
  应用的唯一所有者，由已水合的 store 偏好或水合前提示驱动）
- `shell/layout` → `contracts`（仅 `LayoutPreset` + `GitDiffScope` 类型）、`lib`（注意/id 原语）、`ui`
  （包括 `@thinkrail/ui/resizable`），以及 React / `@dnd-kit/core`；`shell/layoutState` → `shell/layout`、
  `store`、`transport`（浏览器端点身份 + 错误规范化）、`clientPreferences`（原生稳定持久化）、`contracts`
  （仅 `LayoutPreset` 类型）、`lib`，以及 React。父级注入 store 状态与功能渲染器，因此纯布局子模块没有
  功能模块的运行时边
- `updates` → `contracts`（原生桥 + 宿主通知类型）、`store`（宿主通知）、`ui`、React，以及 Remix Icon；
  原生快照仍留在外壳本地
- `notifications` → `store`（会话状态读取、prompt + `activateWorkspaceFromRoute` / `openSessionSwitcher`
  动作）、`ui`（权限前言对话框）、`contracts`（仅类型——`SessionState`/`SessionCompletion`/
  `NativeNotificationBridge`）、React，以及 Remix Icon；总开关的 Settings 面板住在 `panels` 里，`shell` 挂载
  观察器/前言。它通过一个按能力挑选的频道发出：页面 Notifications API，或在那个可选的
  `__THINKRAIL_NATIVE_NOTIFICATIONS__` 桥存在时的原生桌面频道（只用能力检测，没有 `desktop` 分支）。没有
  Service Worker：关闭的应用没有活着的客户端可供通知
- `panels` → `resources`、`store`、`transport`、`ui`、`components`（功能主体的 `ErrorBoundary` + 面板拥有
  的列表/xterm 的静默滚动表面）、`lib`、`contracts`、`constants`（`WelcomePanel` 的文字标志）、`prompt`
  （`NewWorkspaceDialog` 消费共享的斜杠/模板行为）、`chat`（`NewWorkspaceDialog` 急切复用
  `chat/ModelEffortPicker`+`useModelCatalog`+`useModelPreferences`，`ModelsSettings` 复用更旧的
  `ModelSelector`+`ThinkingSelector`，`VisibleModelsSettings` 复用 `chat/modelPicker` 的 `formatContext` +
  `chat/ProviderGlyph`，而 `ProvidersSettings` 复用 `chat/modelPicker` 的连接种类词汇——全部不含 shiki，
  因此急切导入保持可安全拆分；`TemplatesSettings` 为它的 New/Edit 流程复用 `chat/TemplateEditorDialog`
  ——见 `panels/SPEC.md` 的 `TemplatesSettings` 段落；`ProjectTrustNotice` 与 `NewWorkspaceDialog` 和
  Skills 对话框的信任横幅共享 `chat/projectTrust` + `chat/useProjectTrustSummary`）、`auth`
  （`ProvidersSettings` 与 `McpSettings` 挂载 `auth/LoginDialog`）、`notifications`（`NotificationsSettings`
  在启用时经由 barrel 请求浏览器权限）、`themes`（`AppearanceSettings` 消费活的目录；代码界面消费通用主题
  变量/语法映射）、`@shikijs/monaco`（桌面文件渲染器的 TextMate 适配器）、`@pierre/diffs`（所有源码差异 + 手机
  上的代码文件）、`diff`（引擎中立的变更块、CSV 行对齐，以及 notebook 单元相似度）、`jsondiffpatch`（带
  移动检测的结构化 JSON 增量）、`react-virtuoso`（CSV 行与惰性加载的 Changes 复查列表），以及 `pdfjs-dist`
  （PDF 画布渲染）
- `chat` → `contracts`（pi 消息类型，**仅类型**）、`ui`、`extension-api/web`、`ext-visualize/web`、
  `extensions`（仅注册）、`components`（`useNow`，以及流页脚里的 `RunningIcon` 徽章）、`prompt`（共享的
  斜杠/模板行为）、`lib`、`clientPreferences`；`store` + `transport`（**仅应用集成文件**——渲染器保持无
  store；当前集合见 `chat/SPEC.md`）
- `prompt` → `contracts`（仅斜杠/模板类型）、`@thinkrail/ui/utils`（`cn`），以及 React；它没有生命周期
  集成依赖
- `extensions` → `ext-*/web`、`extension-api/web`、`chat/toolRegistry`（仅注册；不导入 ChatView）
- `auth` → `ui`（对话框无 store/transport——由面板集成它；状态类型不需要任何导入）- `store` → `transport`
  （**仅类型**——`ConnectionStatus`）、`chat`（**仅类型**——`ChatTurn`/`ToolResultState`）、`auth`
  （**仅类型**——`LoginState`；`foldLoginFrame` reducer 住在 `store` 里，像 `reduceExtUi` 一样）、
  `contracts`（领域 + 自定义预设类型，绝不是当前布局的 DTO）、`lib`（共享的路径/数组原语——一个叶子，因此
  没有循环），以及 `shell/layout`（对 web 本地帧/视图状态**仅类型**）
- `transport` → `contracts`、`store`（welcome 路由；`store → transport` 的反向边是仅类型的，因此运行时图是
  无环的）、`lib`（对明文 HTTP 安全的随机页面身份）
- `components` → `lib`（`shallowEqualArrays`，供 `ErrorBoundary` 的重置键使用）与 `constants`
  （`RunningIcon` 绘制共享的品牌字母组合）——两者都是叶子，因此任何区域仍然可以包在它里面；展示型控件消费
  `ui`
- `resources` → `contracts`（仅类型）、`lib`；它不拥有任何 store、传输层、shell 或渲染器实现
- `lib` → `themes`（惰性高亮器使用那唯一一份通用的 CSS 变量 Shiki 注册）、React（只有手机视口 hook），以及
  `contracts`（仅类型，例如 MCP 状态词汇里的 `McpServerState`）
- `themes` → `constants`（品牌存储前缀限定了首屏提示的范围）、`clientPreferences`（原生稳定的提示存储）
- `i18n` → `ui`（共享翻译运行时）、`constants`（偏好键）、`clientPreferences`（原生稳定存储）；没有 store
  或传输层
- `fonts` → `contracts`（**仅类型**——`NativeFontBridge`）、`constants`（偏好键）、`clientPreferences`
  （原生稳定存储）、React；没有 store、传输层或宿主设置。`panels` 消费它的 barrel（`AppearanceSettings` 的
  字体行）
- 叶子（`clientPreferences`、`constants`、`utils`、`styles`）→ 内部没有

规则：一个 panel 绝不横向导入另一个 panel；没有任何东西导入 `shell`（它是组合根）。

`@pierre/diffs`、`diff`、`jsondiffpatch`、`react-virtuoso`、`pdfjs-dist` 与 `@shikijs/monaco` 是精确钉版的
运行时依赖。`pdfjs-dist` 及其 `pdf.worker.min.mjs` worker URL 只从惰性的 PDF 渲染器 chunk 触达；两者都不属于
入口图。Pierre、它的 Shiki 语言/主题图与 worker 入口，加上 Monaco、它精选的 Shiki 语法与适配器，都留在
resource-loader 的动态导入之后。只有惰性的 Pierre 渲染器模块会挂载该提供商，而每个被挂载的界面都会获取
Pierre 的模块单例 worker 池；因此一个普通工作区既不加载 Pierre，也不初始化它的池。渲染器元数据与加载器是
唯一的急切边。生产构建必须保留彼此不同的 Pierre diff、Pierre file、worker 池与 Monaco chunk，且它们的实现
代码一个都不在入口 chunk 里。
Vite 把每个 worker 都作为 ES 模块发出（`worker.format: "es"`），因此 worker 里的 `import()` 调用会拆成按需
chunk 而不是被内联；每个目标 webview（Chromium、WebKit/Safari 15+、WebView2）都运行模块 worker。

模块集合：`transport` / `store` / 带品牌的外壳 `shell` + 它无头的 `shell/layout` 子模块；布局无关的
Project/File/Specs/Changes/Review 渲染器；由注册表派发的资源主体与惰性 xterm 终端主体；共享的 `prompt` 行为
模块；以及 `chat` 模块（`ChatView`、内容块渲染器、工具注册表，以及完整的 Composer）。工作台拥有这些主体周围
的中部以及左/右/底部辅助条/组，绝不拥有面板本身。

## 样式与主题

- **映射到设计 token 的 Tailwind v4 工具类**（`src/index.css` 的 `@theme inline`）。组件用工具类处理颜色、
  间距、边框与布局（`bg-container-header-bg`、`text-primary`、`border-border-default`、`px-12`），并用一个
  **生成的语义排版类**处理字号（`tr-text-ui`、`tr-title-dialog`、`tr-code-text`、…）——**绝不用内联
  `style` 对象，除非是渲染器测量出的几何，也绝不用裸十六进制。** 有界的几何例外覆盖诸如媒体固有边界、归一化
  覆盖层、缩放、滑动位置、门户放置，以及虚拟列表几何（一个加载小节预留的高度、一个测量出的尾部占位）这样的
  值；颜色、间距与控制皮肤仍然用 token 工具类。响应式（`md:` …）与状态（`hover:` / `focus-visible:`）来自
  Tailwind（内联样式无法表达它们，而响应式外壳需要它们）。
- **Chrome 几何住在 `index.css` 里，宿主几何以 CSS 自定义属性到达。** 在生成的色彩/间距层旁边，
  `index.css` 映射外壳的结构行（`--spacing-panel-header-row`、来自 `tokens.css` 的
  `--spacing-topbar-row`）以及宿主公布的两个窗口 chrome 内缩
  （`--spacing-window-chrome-inset-left|right: var(--window-chrome-inset-*, 0px)`），同时宿主还公布
  `--window-chrome-drag-region`。它声明了唯一两个非排版的手写工具类，`window-drag` / `window-no-drag`
  （`-webkit-app-region` + `app-region`）；除非宿主选择加入，`window-drag` 是惰性的。移除了自己标题栏按钮的
  宿主还会安装来自 `contracts` 的仅类型 `NativeWindowControlsBridge`，外壳把它变成 HTML 窗口控件。原生宿主
  可以在 `<html>` 上设置这些属性；应用绝不检测宿主，它读取这些属性及其 `0px` 回退（[[submodule-web-shell]]
  拥有使用方，[[module-desktop]] 拥有发布方）。
- **颜色与排版系统是本应用自己的，不是 monorepo 的。** `apps/website` 有意保留它自己硬编码的样式表——
  一个没有主题化的静态页面用不上 token 层，而跨应用伸手只会白白把它们耦合起来。
- **颜色工具类命名一个语义角色，绝不命名调色板条目**——`bg-container-elevated-bg`，而不是
  `bg-[var(--elevated)]`；而一层淡色是四步 alpha 标尺上的 token，不是 `/40` 修饰符。`src/styles/COLOR.md`
  是系统本身；`src/styles/colorUsage.test.ts` 是采纳守卫（Tailwind 会静默丢掉未知的工具类，因此一个未发布的
  token 渲染出来什么都没有）。
- **普通的圆角与节奏间距值来自它们各自的标尺，绝不是裸像素长度**——`rounded-md` 与 `p-8` / `gap-12`，
  而不是 `rounded-[7px]` 或 `py-[3px]`。圆角是项目的 t-shirt 家族（`--radius-xs/sm/md/lg`——一个小尺寸的
  原语几何，上限 8px：`sm`（4px）是默认圆角，`md`（6px）是嵌套 4px 子节点的表面的外圆角，`lg`（8px）是大型
  独立浮起表面（对话框、用户消息气泡）的例外）。间距是**一套规范的数字标尺**——
  `0 / 2 / 4 / 8 / 12 / 16 / 24 / 32 / 40 / 64`——其中步进名*就是*它的像素值，因此 `p-8` / `gap-12` /
  `py-4` 解析为恰好那么多像素；它由单一 JSON 来源生成（`src/styles/spacing.json` →
  `src/styles/generated/spacing.css`），因此每个规范长度只写在 JSON 里一次，而不是在调用点重新声明。多个
  表面必须一起移动的值是一个具名**布局角色**，为某个步进起别名（`p-panel-inset`、`h-panel-row`），绝不是重复
  的字面量。`src/styles/SPACING.md`（`web-spacing`）是权威系统；`src/styles/spacingUsage.test.ts` 是那道
  采纳守卫，它之所以存在，是因为这类漂移是**看不见的**：与颜色工具类不同，任意长度总是能渲染出来，因此一个
  偏离标尺的值在复查中看起来正确，也能通过其他每一道门禁。完全不属于标尺步进的长度——`max-w-[78ch]`、
  `w-[320px]`、`max-h-[40vh]`、一个测量出的 `pl-[calc(…)]` 缩进——仍然允许；它们是布局约束，不是节奏。
- **图标是 `@remixicon/react`（Remix Icon）字形，按 UI *上下文*而非位置在 Tailwind 的 `size-*` 标尺上定
  尺寸**——按名字导入，没有 `<Icon>` 包装，也没有 `size=` prop，绝不为了缩放一个字形而加一个容器。Remix 字形
  是 `fill="currentColor"`，因此语义化的 `text-*` 工具类给它们着色。**风格由状态驱动：`Line`（描边）变体是
  默认；`Fill`（实心）变体标记*活跃/选中*的条目**——被选中的项目与活跃工作区行（`ProjectTree`）、活跃/主规范
  节点（`SpecsPanel`）、活跃文件/目录行（`TreeRow`）与活跃编辑器标签页（`Workbench`）换成 `Ri…Fill`；其他
  一切（按钮、折叠箭头、状态、输入框、聊天、菜单）保持 `Ri…Line`。没有 Line/Fill 配对的图标
  （`RiParagraph`/`RiDraggable`/`RiLinkM`/`RiListCheck3`）在两种状态下都渲染它们那唯一的风格。Remix 缺少的
  **项目自定义字形**以 SVG 形式住在 `public/custom-icons/` 里，并通过 `CustomIcon` 原语
  （`components/CustomIcon`）渲染——一个 `currentColor` 的 CSS `mask-image` span，因此它们和 Remix 字形一样
  主题化、并按状态切换 Line/Fill。**Changes** 工具使用自定义的 `file-diff` 字形；**Review** 使用
  `RiDiscussLine`/`RiDiscussFill`。三个层级：`size-12`（12px）用于**聊天内容**指示器（工具活动、计划/待办
  状态、展开/折叠聊天细节——从属于聊天文本）；`size-14`（14px）用于**紧凑的界面 / 导航 chrome**（左/右面板、
  面板与工具栏头部、标签页、移动端的切换栏、菜单项、独立的 chrome 图标按钮）；`size-16`（16px）用于**显眼的
  专用图标按钮表面**——应用 chrome 的 Settings 齿轮与输入框底部控件（Send 及其同伴）——**以及每一个折叠/展开
  箭头**（`ChevronDown/Right/Left/Up`），它们在所有上下文里都是 `size-16`，与层级无关。**图标↔文本的间隙是
  `gap-4`（4px）**，贯穿所有图标+标签行（导航行、菜单/命令项、标签页）。**两行**的行（例如分支与名字不同的
  工作区）会把图标**顶部对齐**到第一行（`items-start` + `mt-2`），使字形挂在它的标题上，而单行的行保持垂直
  居中（`items-center`，不做微调）。菜单项图标在 `packages/ui/menu-styles.ts` 里统一集中一次（`menuItemClass`
  `[&_svg]:size-14` + `gap-4`）。
- **`src/themes` 是主题契约与目录；`src/styles/tokens.css` 是结构性的。** 一个内置主题就是一份严格、完整的
  `*.theme.json` 清单：外观/对比度元数据 + 语义 UI 颜色 + 全部 16 个 ANSI 颜色 + 一套语义语法调色板。选中
  文本前景覆盖是唯一可为空的颜色槽（`null` 保留使用方的默认值）。一个构建期 glob 在引导时校验这一集合（我们的
  文件——坏的会大声失败），因此新增一个主题只改那一个文件——绝不动契约、标签映射、CSS 选择器、编辑器导入、
  测试或规范——并在重新构建后出现。清单是自包含的（没有继承），只含规范的颜色数据，且无法改动布局/排版/动效
  或注入 CSS/代码。引擎推导重复的淡色/效果，并在改变 `[data-theme]` 之前原子地写入映射后的自定义属性；
  `@theme inline` 让每个工具类都指向活的变量，因此组件保持不变。`tokens.css` 保留间距基准、圆角、动效与
  通用派生公式——**完全没有排版**（既不是一个值，也不是指向某个值的别名；`--font` / `--font-mono` /
  `--font-accent` / `--font-mono-size` / `--line-height` 别名都已消失，因为一个值的第二个名字正是漂移的
  来源）——也没有具名主题块。
- 主题偏好是**服务端同步的**：`AppConfig.theme` 仍是宿主拥有的不透明固定选择，而封闭的 `themeMode` 与可选
  的不透明 `systemThemePair` 让客户端选择加入按客户端的系统匹配。每个客户端用自己的 `prefers-color-scheme`
  解析这一对；操作系统的变化是本地 DOM 效果，绝不是配置写入，因此两个客户端可以同时渲染不同的外观。固定 Dark
  仍是新配置与旧配置的默认。`settings.update` 经由 `settings.changed` 收敛；仅主题的旧式变更会退出系统模式。
  不可用的系统槽会在所需外观之内确定性地回退，而不会破坏性地重写被请求的值。带版本的前 React 提示缓存的是
  偏好，而不是最后生效的 id，它在存在时使用注入的原生稳定偏好适配器，否则用 localStorage。主题随应用发布：
  只能通过一个源码 PR 添加一个，而运行时注册/扩展加载被刻意设计为不存在。
- **每个代码界面都与目录无关。** xterm 与 Monaco 在原子 `[data-theme]` 信号之后从通用变量重建，包括一个
  可选的选中文本前景。Monaco 从清单的外观/对比度元数据挑选 `vs`/`vs-dark` 或对应的高对比度基座，绝不是某个
  主题 id。Shiki 使用一份代码自有的语义 CSS 变量 TextMate 映射：chat 消费它的实时引用，而 Monaco 把同一份
  映射解析成十六进制交给 `@shikijs/monaco`；Pierre 单独的那份 `thinkrail` 注册也会发出实时变量引用。没有
  哪个需要按主题的导入或选择器，只有严格的 Monaco 在切换之后重新解析。Pierre 自己继承的差异变量把语义反馈色
  与画布颜色带进它的 Shadow DOM。Mermaid 从同一批变量重新推导。严格使用方的读取仍然经过 `lib.cssColorToHex`。
  数据驱动测试对每个被发现到的清单强制执行既有的对比度底线（主要声明表面上的 body/muted ≥ 4.5:1 且 hint ≥
  3:1）。
- 圆角 token **就是** Tailwind 的圆角命名空间：`tokens.css` 在一个 `@theme static` 块里声明
  `--radius-xs/sm/md/lg`，该块先重置 Tailwind 的默认标尺（`--radius-*: initial`）。因此 `rounded-<step>` 及
  其各边变体解析为活的 token，像 `rounded-xl` 这样未声明的步进永远不会被生成，而 `static` 让每个变量都为
  手写 CSS 发出。这取代了早先把冲突的 token 写成任意值的规则（`rounded-[var(--radius-md)]`）：冲突在它的源头
  被移除，而不是在约 300 个调用点绕过它，而守卫会拒绝任何任意圆角值。
- **排版来自 `styles/typography.json` 经生成的语义类——别无其他。** `styles/generated/typography.css`
  （已提交，由 `bun run typography:generate` 重新生成，由 `typography:check` 做漂移门禁）发出原语
  `--tr-*` 自定义属性、`<body>` 基座，以及每个语义样式一个类：`tr-brand-*`、`tr-heading-*`、`tr-title-*`、
  `tr-text-*`、`tr-code-*`，外加每个 markdown 表面一个 `tr-prose-<surface>` 系统（`tr-prose-chat`、
  `tr-prose-doc`——同一套元素集合，不同的标尺，因为聊天气泡与渲染出的文档需要不同的标题阶梯）。调用点恰好
  命名一个类，并加上自己的**颜色**；`italic` 与 `leading-*` 是唯一可以覆盖语义样式的 Tailwind 工具类（这些
  类在 `@layer components` 里发出，因此工具类在它所命名的那一个属性上取胜，而 `@layer base` 里的 `<body>`
  基座输给它们全部）。界面字体族还携带应用**唯一一个运行时可设的排版值**：生成的变量以
  `var(--tr-font-user-interface, "Geist Variable")` 打头，由客户端本地的界面字体偏好写入
  （[[submodule-web-fonts]]），而选取器通过生成的 `.tr-font-preview-interface` 规则预览候选字体，而不是
  第二份字体栈。中文度量是一个 `:root:lang(zh)` 覆盖块，不是第二套标尺。
- **绝不引入手写排版工具类。** 任何新的 `@utility` 规则都不得设置 `font-family`、`font-size`、
  `font-weight`、`line-height`、`letter-spacing` 或 `text-transform`，任何组件也不得组合它们——改为往
  `typography.json` 里加一个语义样式。原先的 `text-mono` / `text-base-mono` / `text-brand` / `text-eyebrow`
  工具类与 `--text-xs|sm|base|md|lg` 映射全部消失；每一个都由一个生成的类取代。`index.css` 恰好映射两个排版
  名字——`--font-sans` / `--font-mono`，因此 Tailwind 对 `html` 与 `code`/`pre` 的 *preflight* 默认值也来自
  这份 JSON；由此启用的 `font-sans` / `font-mono` 工具类在调用点被禁用。`styles/typographyUsage.test.ts` 强制
  执行这一切，包括组件命名的 `tr-` 类必须是生成器真正发出的那一个（未知的类会被 Tailwind 静默丢掉，于是元素
  渲染成无样式，而类名列表却声称不是）。
- **只有为某个有文档记录的第三方集成，才可以指名一个原语字体族。** Monaco（`panels/monacoSetup.ts`）读取
  代码字体族、`s11` 与默认行高；Pierre 通过 `index.css` 里 `.pierre-code-surface` 自定义属性桥收到同样的
  原语；xterm（`panels/TerminalInstance.tsx`）读取代码字体族 + `s13` 并拥有自己的行高；mermaid
  （`thinkrail-extensions/visualize/web/mermaid.ts`）读取代码字体族。这些第三方集成是
  `styles/typographyUsage.test.ts` 里穷尽的允许清单。其他所有地方都要求用类，而且 `<pre>` / `<code>` 即使
  在已经有类名的容器内部也必须携带一个：preflight 直接针对那些元素，而直接匹配的规则胜过继承的字体族。注意
  裸的任意值 `font-[var(--font-mono)]` 是有歧义的——Tailwind 把它编译成一个非法的 `font-weight`，因此它静默
  什么都不做；可用的形式是 `font-(family-name:--font-mono)`（`styles/fontClasses.test.ts` 会在裸形式上
  失败）。
- **字体随产物一起发布。** `styles/generated/fonts.css` 导入自托管的可变字体面（fontsource；Geist Variable +
  JetBrains Mono Variable，两者都带真正的斜体——与 `apps/website` 共享，因此它们的版本住在根的
  `workspaces.catalog` 里）。具体是哪些包按字体族在 `styles/typography.json` 里声明为 `selfHosted`，因此
  字体栈与随包发出的字体面不可能漂移；那些导入就是由它生成的。Vite 把 woff2 文件发进 `dist/assets`，而
  `apps/cli` 把它们内嵌。没有字体 CDN——宿主是本地且常常离线，而外部 `<link>` 还会把首屏压在第三方之后，
  并在每次加载时都联系它，尽管已有分析退出。`e2e/fonts.spec.ts` 钉住两半（没有 CDN 请求；真正的字体面
  存在）。
- **排版系统——`typography.json` 作为唯一的事实来源、由它生成的原语与语义样式、`<body>` 基座、
  370/400/500/600/800 字重策略、仅代码的 mono、两套 prose 系统，以及如何添加或修改一个样式——在
  [src/styles/TYPOGRAPHY.md](src/styles/TYPOGRAPHY.md) 里有规范**（`web-typography`）；改动要对照它检查。
  把它变成 CSS 的生成器是 [scripts/SPEC.md](scripts/SPEC.md)。
- **图标：`@remixicon/react`（Line 默认，活跃/选中时 Fill）。组件：shadcn/ui**（Radix 原语），由
  [[module-ui]] 拥有，并用我们的 token 工具类着色（`@thinkrail/ui/utils` 里的 `cn()`）——绝不是 shadcn 默认
  的 oklch 调色板。用它们来做无障碍的菜单 / 对话框 / tooltip；只有图标的控件用 `IconTooltip` 给自己打标签，
  绝不用原生 `title`。

## 必须做对的事

- **`apps/web` 只依赖 `contracts`、`ui`、`extension-api/web` 与 `thinkrail-extensions/*/web`。** 绝不值导入
  `pi`；绝不导入 `server`/`shared`。
- 流式不变量：`text_delta` / `thinking_delta` **追加**；`tool_execution_update.partialResult` **替换**。
  尝试级别的 `agent_end` 从不意味着空闲；自动工作只在 `agent_settled` 结束。
- 面板保持与排布无关，因此移动外壳是一个附加层，而不是一次重写。
- **应用组合出的每一条宿主 HTTP 路由都由 Vite dev server 代理。** 应用通过 `/ws` 以及两条字节路由
  `/files` 与 `/blob`（图像、PDF、notebook、markdown 相对图像）触达宿主，且总是经由一个函数
  （`panels/resourcePane.resourceBytesUrl`）在传输层的 HTTP origin 上组合。在 `bun run dev` 下那个 origin 是
  Vite，而 Vite 不代理的路由会以状态 200 答复 SPA 的 `index.html`——`<img>` 什么都不显示，PDF 抓取用 HTML
  “成功”，而宿主提供的构建与 e2e 套件仍然全绿。因此 `vite.config.ts` 在 `/ws` 旁边代理 `/files` 与
  `/blob`，`devProxy.test.ts` 把这份清单钉在输入框的常量上。

## 后续

移动端单视图外壳与 PWA 打包（可安装、离线外壳）搭载在这次切分之上，而不去碰面板或 store。
