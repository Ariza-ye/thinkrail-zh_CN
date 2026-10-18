---
id: architecture
type: architecture-design
status: active
title: ThinkRail — 顶层架构
parent: goal-and-requirements
covers: [client-host-split, cli-entrypoint, wire-contract, transport-endpoint, ui-shell-panels, git-worktrees, remote-tailscale, hydrate-then-stream, domain-vs-view-state, frontend-local-workbench-frame, client-local-navigation, central-integration, portable-pi-packages, thinkrail-extensions]
tags: [architecture]
---

## 驱动因素

产品围绕 `pi` agent 构建，以**进程内**方式运行（`createAgentSession`）。两个可叠加的启动器共享同一个宿主库：
保留的 CLI 启动引擎宿主并打开浏览器，而 Electrobun 用原生系统 webview 外壳把该宿主打包。桌面配置仅限本地；
以后的共享客户端配置可以拨号到已有的宿主。UI 独立于宿主发布，并通过网络拨号到它；手机通过 Tailscale 到达所选
宿主。

## 拓扑——三个环

- **引擎宿主**（`packages/server` + `packages/shared`，在本地宿主模式下由 `apps/cli` 或 `apps/desktop`
  启动）：拥有 `pi`、会话状态、持久化，并提供线上协议端点。
  它把 pi 扩展（`pi-web-access`、`pi-spec-graph`、`pi-thinkrail-workflow`、`pi-todos`）
  以及来自其服务端登记表的 ThinkRail 扩展（`visualize`）打包进每一个会话。
- **线上协议**（`packages/contracts`）：类型化、带版本的协议——客户端与宿主之间唯一的耦合。
- **UI 客户端**（`apps/web`）：移动优先的 React 客户端，传输层驱动、端点可配置，可作为静态资源独立于宿主
  发布。

```
apps/cli        browser host launcher: boot server + open browser ── depends on ─▶ packages/server
apps/web        UI client (mobile-first)                           ── depends on ─▶ packages/contracts, packages/ui, packages/extension-api/web, thinkrail-extensions/*/web
apps/desktop    Electrobun local-host launcher                     ── depends on ─▶ packages/server, packages/contracts, packages/shared
apps/website    public landing + blog + /vibecoding (Cloudflare Pages) ── depends on ─▶ packages/website-analytics
packages/website-analytics  dependency-free browser analytics policy for the public website
packages/server createServer(): Bun.serve(HTTP+WS) + AgentSessionManager (in-process pi) ── depends on ─▶ packages/contracts, packages/shared, packages/pi-background-commands, packages/pi-delegation, packages/pi-subagents, packages/extension-api/server, thinkrail-extensions/*/server
packages/contracts  the wire (types plus tiny pure runtime)
packages/shared     shellEnv (server-side only)
packages/spec-graph portable pi extension: spec_* tools + skill (bundled into every session by packages/server;
                    its pi-free core/ read model also backs the host's spec.graph read method)
packages/pi-delegation         portable pure-pi package: the delegation core — controlled child sessions
                    for live session parents or independent resource owners
packages/pi-dag               portable durable backend DAGs over pi-delegation; host-owned resources;
                    not bundled into ThinkRail, no workflow UI, not a second pi runtime
packages/pi-background-commands portable explicit session-owned background commands over Pi's executor
                    (bundled into every ThinkRail parent session by packages/server)
packages/pi-subagents          portable pure-pi extension: Agent + get_subagent_result tools over
                    pi-delegation (bundled into every ThinkRail parent session by packages/server)
packages/pi-thinkrail-workflow pi extension: the workflow skill system + its always-on routing rule
                    (bundled into every session; workspace-internal, not portable)
pi-extensions/*     portable pi packages published to npm as @thinkrail/pi-<name>; work in vanilla pi
                    (decided, Decision 20; the pi-* packages above move here per publish wave)
thinkrail-extensions/*  ThinkRail extensions: a pi capability + ./server and ./web halves, composed by one
                    registry file per side (Decision 21; visualize shipped) ── depends on ─▶ pi-extensions/*,
                    packages/extension-api, packages/ui
packages/extension-api  types + define* helpers for extension halves ── depends on ─▶ packages/contracts
packages/ui         owned shadcn/Radix primitives + cn + onThemeSwap ── may depend on ─▶ packages/contracts
```

产物验证是一个独立的、仅含源码的工作区，[[module-artifact-tests]]。它依赖 CLI 构建元数据、服务端测试
夹具（fixture）与共享清理逻辑；根工具与浏览器 E2E 消费它。没有产品包导入该测试工作区，它也没有应用构建步骤或
Electrobun SDK 依赖。这让测试进程驱动位于两个启动器与服务端库之外。

## 决策

1. **客户端/宿主分离。** 引擎宿主拥有 `pi` 与状态；UI 是可移植的客户端；线上协议是唯一的耦合。**规则：
   `apps/web` 只依赖 `contracts`、`ui`、`extension-api/web` 与 `thinkrail-extensions/*/web`**——绝不依赖
   `server` 或 `shared`。所有新增的边都是浏览器安全的呈现包；UI 仍在没有宿主的情况下可发布。
2. **启动器是薄的；宿主是库。** `apps/cli` 与 `apps/desktop` 都在进程内嵌入共享的引导路径。CLI 打开浏览器；
   桌面版在一个全新的单源回环宿主上打开原生系统 webview。两者都不拥有引擎逻辑，也不互相 spawn。CLI 仍然是一个
   完整的独立产物与回滚手段。以后的桌面共享客户端配置可以省略本地宿主；每个配置都使用同一套线上协议与 web
   产物。

   **跨所有部署只有一条功能路径。** 一个普通的产品功能改动它的契约、拥有该功能的 server 功能模块、共享的 web
   客户端及其测试——绝不是每个启动器。启动器与未来的部署只拥有组合、生命周期、端点选择、原生呈现与产物打包。
   真正无法提供某项既有宿主操作的第二个环境，在拥有该行为的功能模块里赢得一个收窄的端口；不要预先用全局平台
   适配器抽象宿主。物理运行时需求通过 server 拥有的构建支持清单声明一次，然后由每个打包器转换。相同的行为与
   产物套件在每个启动器上都运行，因此复用是由边界与一致性来强制的，而不是靠并行实现。
3. **线上协议是带版本的。** `contracts` 是类型加上一个很小的无依赖运行时：线上协议常量、版本、配置默认值与
   守卫。任何其他运行时都是其规范里的具名例外，今天只有退出确认规则；新增一个就要更新本决策。
   `server.welcome` 携带协议版本，使独立发布的 UI 能检测宿主版本漂移。
4. **传输层端点是参数。** 默认同源（`location.host`）；远程浏览器、桌面或移动客户端把它指向所选宿主的
   Tailscale MagicDNS 名称。原生恢复状态按后端配置作为键，因此来自一个宿主的 id 绝不会被当作另一个宿主的 id
   来解释。
5. **UI = 面板 + 外壳。** 与布局无关、由 store 驱动的面板（项目→工作区导航、文件树、代码渲染器、更改/diff、
   工作区本地审查、终端、聊天、输入框）永远不知道自己的排布方式。每个桌面前端窗口拥有一个本地持久化、无资源的
   工位框架：一个递归分割的中部，加上垂直左右栈中的辅助组，以及一个水平分组的下部区域。当该窗口切换工作区时，
   框架的拓扑、单例工具的位置、可见性、折叠、几何与对齐保持不变；工作区范围的资源与注意力从各自独立的本地视图
   投射进来。终端可以占据中部或辅助组，新工作区默认把一个终端放在底部。另一个窗口绝不会重排这个窗口。未来的
   移动外壳可能以不同方式投射同样的面板；桌面停靠不定义那种投射。
   细节：[[submodule-web-shell-layout]]。
6. **工作区就是 git 工作树。** project（git 仓库）→ workspace（`git worktree`，有独立分支/cwd，位于
   `~/.thinkrail/worktrees` 下）→ {chats, files, terminals}。
   **两个刻意的例外，两者在线上协议上都由 `kind` 标记，
   且都属于*用户所有*——ThinkRail 绝不重命名或回收它们：** 每个项目恰好携带一个内置的**默认工作区**
   （`kind: "default"`），其 cwd 就是项目文件夹本身（git 的*主工作树*）——不可移除、不可重命名，且只能从项目的
   Welcome 分叉处（“在项目文件夹中工作”）显式进入，绝不自动进入——这是为在 worktree 模型中迷失的用户提供的“就在
   我的项目文件夹里工作”锚点；以及用户就地显式附加的**已有工作树**（`kind: "external"`），ThinkRail 可以忘记
   它，但绝不修改它（见 [[submodule-server-workspaces]]）。先构建外壳，最后连接 `pi`。
   **打开 PR** 是一次确定性的、宿主侧推送 + 打开/更新该分支的 GitHub PR，通过用户自己的 `gh` CLI（不存储
   token，不使用提供商的 REST API），正文由已验证的计划渲染，当 `gh`/GitHub 不可用时回退到 compare URL（见
   [[submodule-server-pr]]）。
7. **认证是外部的。** Tailscale ACL / 设备身份就是认证；应用带有一个 `owner` 字段，而不是登录 UI。
8. **先水合再流式（每个客户端都从宿主重建领域状态）。** 客户端绝不依赖*目睹*过事件来知道领域状态——连接时它
   **读取**当前状态，然后**订阅**实时增量。宿主在 `pi.event` 之外暴露 `project.list` / `workspace.list` /
   **`session.list`** / **`session.getMessages`**。因此一次重载、第二个标签页、手机或**宿主重启**都能重建相同的
   项目、工作区、会话与对话记录。`session.list` 把内存中的会话与 pi 磁盘上的会话合并；在那次权威读取上，某个
   界面水合它本地放置的聊天，然后被动地自动打开数量有界的最新未放置会话——仍处于活跃状态或带有未完成 todo 的
   那些（当没有任何符合条件的、且尚未放置任何会话时，单个最近的会话作为回退打开，因此只要聊天历史存在，工作区
   绝不会落空），并把历史中其他所有内容列出以便显式重新打开。这一次自动打开尝试在每个界面-工作区连接上只触发
   一次，而不是在每次目录重读时触发，而正在解析精确聊天路由目标的界面会把它完全推迟给该目标。当另一个前端启动
   会话时，`session.created` 提供那种仅历史的实时增量；重连通过 `session.list` 修复错过的增量。客户端是**领域
   状态的无状态投射**，绝不是第二个领域事实来源；它单独拥有前端本地的导航与工位视图状态。自动的 agent 运行在
   重试、压缩（compaction）与排队中的后续执行之间保持活跃：pi 的 `agent_end` 只是尝试边界，后面可能还有更多工作；
   `agent_settled` 才是到空闲的权威转换。

   **规范化的会话状态。** 宿主把执行、具体的输入阻塞项、Pi 拥有的队列计数与最新完成情况投射为正交的事实。
   需要输入是电平触发的，查看不能清除它；完成只由 `agent_settled` 或重启重建创建。成功、失败/长度与中断在
   所有者全局范围内保持未读，直到看到确切结果：在聚焦窗口聚焦且未被遮挡的聊天中渲染，对话记录处于最新边缘。
   显式停止是安静的，而空闲聊天的完成只有在它的后台命令与子代理都结束后才变为未读；同时宿主上报该后台工作，
   因此聊天读起来是在工作中。每个客户端都从宿主水合相同的状态与确切的完成回执，而焦点、在场与滚动位置仍是
   前端本地的“看见过”证据。

   **聊天标题契约。** 工作区的显示名、它的 Git 分支/cwd 以及每个聊天标题都是独立的身份；它们之间没有重命名
   级联。聊天标题是 pi 持久的会话名（`session_info`），绝不是浏览器视图状态或宿主侧的附属文件。**主 agent 通过
   `set_title` 工具在任务清晰之后为自己的聊天与工作区命名**：它拥有上下文，也拥有读取任何追踪系统中关联的
   PR/issue/工单（`Review #567 <title>`）的工具。没有辅助模型、首词启发式或宿主侧链接解析来命名任何东西：其中
   每一种都产生过用户想修正的名字。每次写入都以目标仍未命名为条件，因此任何手动命名总是胜出，且第一个名字
   是最终名字——不会有任何东西自动重命名。当目标未命名时，每一轮的系统提示词都会说明这一点；仅靠准则被可测量地
   跳过了。当托管工作区未命名时，每次调用都必须带上它的名字，并且 agent 被要求在一次调用中传入所有缺失的名字，
   使聊天与工作区一致，但它们仍是分别写入的独立身份——不是级联。如果 agent 从不调用该工具，目标就保持未命名
   （接受）。客户端水合 `SessionSummary.title`，通过 `session_info_changed` 实时收敛，并继续按会话 id 路由，
   因此重复的人类标题是合法的。
9. **领域状态、前端本地框构与工作区本地视图。** *领域*状态——项目、工作区、**会话 + 它们的对话记录**、终端
   目录/PTY 以及 git——由后端拥有、共享且持久；每个客户端都从宿主水合它。当前工位状态是视图状态，绝不跨越线上
   协议。每个浏览器标签页或原生窗口恰好拥有一个无资源的 `WorkbenchFrame`，用于中部与左/右/底部拓扑、单例工具的
   位置、可见性、折叠、规范化几何、底部对齐与恢复目标。它另外为每个工作区拥有一个 `WorkspaceViewState`，用于
   打开的文件/diff/聊天/文档/终端放置、标签页顺序与预览，外加一个以该框构为键的每工作区 `LayoutAttention` 叠加
   层。挂载的工位是这些本地值的投射，而不是另一个权威。

   框构变更局部于一个前端窗口，并通过外壳拥有的本地存储适配器持久化。切换工作区只改变被投射的工作区视图。空组
   会一直保留，直到显式的框构命令移除或合并它们；这样的命令会在每个本地保留的工作区视图里原子地重新安置受影响
   的资源。应用预设也是如此。另一个浏览器、设备或窗口既不会收到也不会采纳这些变更。内置预设以及显式本地框构
   重置所使用的默认值仍由客户端拥有；只有数量有界、无资源的自定义预设定义由宿主持久化并作为设置广播。线上协议
   上不存在任何当前布局的快照、版本号、变更、读/写方法或推送通道。

   这始终只是放置，绝不是资源生命周期。
   关闭一个文件/聊天放置是本地行为，会话仍然存在；关闭终端保留它显式的
   宿主领域 PTY 语义。活跃客户端位置同样是本地的：一条后端相对的路径命名 main / Project Home / workspace /
   精确聊天；web 把它存进带版本的片段，而原生外壳按后端配置与窗口持久化它。传入的 id 会对照已水合的宿主状态
   校验，且不存在后端拥有的“当前界面”或当前布局能让一个客户端移动另一个。没有有效本地文档的前端界面直接从
   Balanced 框构开始。先前持久化的宿主布局快照与旧的浏览器注意力条目绝不会被读取、迁移或删除；退役的配置、预设
   与终端标记形状被忽略而不是升级。
   细节：[[submodule-web-shell-layout]] 与 [[submodule-web-shell-layout-state]]。
10. **依赖锁定精确版本。** 每个清单里的每一个依赖都锁定**精确**版本——不使用范围（`^` `~` `>` `<` `.x` `*`）。
    理由：`pi` 每天都发布破坏性版本，因此浮动范围就是一根活线；更广泛地说，静默的 minor/patch 升级是经典
    的不可重现构建陷阱。精确锁定使 lockfile 成为依赖版本的单一来源，并把每次升级变成一个显式、可复查的
    diff。横切依赖（pi、TypeScript、typebox、bun types）在根 `workspaces.catalog` 中锁定**一次**，并通过
    `catalog:` 引用，因此它们的版本只存在于一个地方**且只在那里：规范从不复述它。** 一份依赖 pi 行为的规范会
    点名*它*验证了什么（dist 文件、函数、观察到的规则），并说“pi 升级时重新验证”；它不携带“锁定于 vX”，
    那是目录的第二份拷贝，每次升级都会过期且不增加任何信息。历史理由（“pi 0.86 让加载器选择变成运行时
    相关的”）则不同：它解释*为何*存在某个决策，永远不需要更新。
    **强制实施**，而不只是记录：`scripts/check-catalog.ts`（`bun run check:deps`，在 pre-commit + CI 中）
    拒绝任何范围、任何目录漂移，以及把 `react` 或 `react-dom` 解析到其唯一目录锁定之外的 lockfile 图
    （临时的预发布覆盖理由属于 [[module-web]]）。每一次 pi 升级也遵循 [[pi-compatibility]]，即架构拥有的
    宿主适配及其移除门禁登记表；详细理由留在拥有的模块规范里。例外：`peerDependencies`（扩展包故意声明
    `"*"`——依赖由宿主提供）与本地协议（`workspace:` / `link:` / `file:`）。精确的 SemVer 预发布/构建
    后缀仍是精确锁定（`19.3.0-canary-a1124489-20260826`）；检查器接受完整的标识符语法，包括连字符，但
    不容忍范围。

    根 `packageManager` 字段也为开发、CI 与 CLI 编译锁定 Bun；Bun 类型住在目录里。Bun `1.4.0` 使这些路径
    与桌面运行时对齐，而桌面运行时的版本仍由其 Electrobun 发布独立拥有（见 [[module-desktop]]）。CI 读取根
    锁定，而不是在工作流 YAML 里维护第二个版本。

11. **终端 = 基于 DOM 渲染器的 xterm.js。** 浏览器终端是 `@xterm/xterm`，由
    `apps/web/src/panels/TerminalInstance.tsx` 驱动，对接
    `packages/server/src/terminal` 里真实的 PTY（`bun-pty`）。它保持为选型，因为它是唯一可用于生产的浏览器
    终端：可信的替代品全都是把 Ghostty 的 VT 引擎编译成 WebAssembly（`ghostty-web`、`restty`、`wterm`），而
    其中最成熟的那个只有一个带标签的发布，既不能做鼠标上报也不能做 OSC 8 链接——vim/htop/lazygit 会回退。
    **渲染器刻意选择默认的 DOM 渲染器**，而不是 `addon-webgl`：xterm 自己的维护者把 DOM 渲染器称为触摸支持的
    前提，而 WebGL 带有我们会继承的缺陷（`WebglAddon.dispose()` 泄漏它的 WebGL2 上下文——对我们每个工作树
    终端的频繁创建销毁是致命的——加上 iOS 上下文上限崩溃）。加载 `addon-webgl` 是回退而不是升级；连字与
    `rescaleOverlappingGlyphs` 是被接受的代价。耦合被刻意保持得很薄（大约十几个 xterm API 成员；没有解析器
    钩子、装饰或序列化），因此替换仍是对一个文件的封闭式重写。**当以下两者都满足时重新评估**（a）上游为
    `libghostty-vt` 打上带有官方 WASM/npm 分发的标签，并且（b）`ghostty-web` 发布超过 0.4.0 且鼠标上报与 OSC 8
    都能工作。

12. **一个 shell 属于一个标签页，宿主拥有这个映射。** 终端以 `(workspaceId, tabKey)` 为键；
    `terminal.reserve` 可以不启动进程而持久地建立目录标签页，而一个幂等的 `terminal.attach` 仍是其 PTY 诞生
    的唯一途径。预留会在发布成员关系之前持久化，并在持久化失败时回滚它的内存插入。这种分离让一个已同步的隐藏
    默认放置能在重载与另一个客户端下存活，而不启动 shell。客户端自己不保留任何 tab→shell 指针。Shell 是
    **所有者范围的**，与 `history`/`todos`/`templates` 一致，因此它们能在重载、关闭浏览器与不同浏览器下存活
    ——attach 是独占的，接手一个标签页会通知被挤开的客户端。生命周期由引用（无标签页→无 shell）加上宿主进程
    限定，**而不是**由定时器：不做空闲清理，不回收被遗弃的客户端。宿主重启无法保留 shell（进程内 `pi`、PTY
    挂断），因此标签页会带着新 shell 并显示已记录的输出而复活。**tmux 被否决**作为持久化层：Windows 上无法
    假定的依赖、竞争的标签页模型、环境变量传递破坏，以及基于轮询的捕获——为了重启存活，我们已经决定不承担。
    细节：[[submodule-server-terminal]]。
13. **Central 的跨模块生命周期只有一个架构所有者。** 它的适配器、运行时生成、线上协议状态/配额、同步的偏好、
    提供商卡片与顶栏读数都留在各自有界的模块里；这些界面与它们存活义务之间的对应关系属于
    [[central-integration]]。这把功能特有的机制留在它们的叶子规范里，同时使一个不终止的组合在架构层可见。

14. **公开网站是一个来源、一个生产部署。** `apps/website` 拥有 `/`、`/blog/` 与 `/vibecoding/`，它们在一个
    静态 Astro 构建里，以同项目 Cloudflare Pages Functions 部署。D1 支撑的 [[submodule-website-attribution]]
    在该部署下提供短时的浏览器声明；它传递有界的营销活动/来源（referrer）接触数据，而不是页面身份，也不是
    第二个产品宿主或身份所有者。React 与 Tailwind 只允许在 [[submodule-website-vibecoding]] 内使用；无关路由
    保留它们的原生运行时与手写样式表。
   浏览器分析（analytics）与同意只在确切的 `thinkrail.ai` 源上初始化一次。
    已退役的 `vibecoding.thinkrail.ai` 主机名是一个边缘重定向，保留路径与查询，绝不是指向第二个站点的代理。

15. **桌面打包保持宿主/运行时边界。** Electrobun `2.0.1` 显式选择其发布所拥有的 Bun `1.4.0` 运行时，并把宿主
    嵌入那个进程，而不是默认的 Cottontail 运行时；它绝不包裹或 spawn CLI。它精确的 npm 引导版本锁定选择
    Hutch 构建工具链与生成的 SDK；Bun 仍是工作区的包管理器。原生窗口从宿主真实的回环端口加载打包的 web 构建，
    使 UI、线上协议、文件与 SPA 回退保持同一个源。需要路径的原生资源保持未打包。外壳在导入服务端之前设置暂存
    的 `bun-pty` 库，并从单独打包的 `.ts` 运行时加载 PI，使外部 TypeScript 扩展收到 PI 打包的虚拟模块，而
    不是不存在的 built-Node 别名。CLI 与桌面版共享宿主引导与优雅关闭，但启动器都不强制进程级单实例或规范
    数据目录所有权策略。每个宿主绑定自己的回环端口；当多个宿主指向同一个可变数据目录时，跨进程一致性刻意
    不做保证。桌面产物是可叠加的；Ubuntu 24.04+/glibc 2.38 上的原生 WebKitGTK 是受支持的 Linux 底线。标准
    框架 CLI/配置拥有打包与安装器；一个已记录的构建前钩子准备 ThinkRail 的物理资源与 PI 运行时。
    `JetBrains/thinkrail-signing` 里的发布工作流消费公开的构建配方，并针对一个明确的公开源码提交协调
    构建 → JetBrains 服务签名 → 发布。产品代码与普通 CI 保持公开；凭据与发布保持私有。macOS 服务签名消费
    框架展开后的应用归档，并通过已记录的 JetBrains SRE 流程最终确定 DMG，不涉及本地 Apple 凭据流程，也不修改
    Electrobun 的压缩包装。确切的交接与发布验证契约属于 [[module-ci-release]]。细节：[[module-desktop]]、
    [[module-ci-release]]。

16. **委派是可移植的；ThinkRail 是一个嵌入者。** `packages/pi-delegation` 拥有会话编织层：一个带正交轴的创建
    原语、一个拥有运行的手柄、血统、登记表与生命周期事件。`packages/pi-subagents` 消费它来暴露 `Agent` 工具。
    两者都能在原生 pi 下工作，SDK 作为 `peerDependency`（peer 依赖不受精确锁定规则约束，决策 #10），创建进程
    内隐藏的 pi 会话，并保持它们的宿主绑定可选。ThinkRail 在 `packages/server` 里组合它们：每个工作区一个服务、
    宿主数据目录下的子对话记录、一套精选的子扩展集合，以及每个父会话保留的确切 `ModelRuntime`，使子会话在
    Central 变更期间停留在该父会话的提供商生成上。线上协议只镜像面向 UI 的运行细节并提供对话记录读取；两个
    可移植包都不依赖 ThinkRail。同一个核心以显式执行上下文支持独立资源所有者，并为持久编排器提供不可变的捕获
    历史分叉；它绝不虚构父聊天，也不获取调度/存储策略。契约、语义与完整决策日志：[[module-pi-delegation]]、
    [[module-pi-subagents]] 与 [[submodule-server-agent]]。

17. **持久 DAG 是宿主拥有的资源，不是父聊天。** [[module-pi-dag]] 是 [[module-pi-delegation]] 的一个单独
    划定范围的、可移植的消费方，不是子代理或工作流技能系统的依赖。委派拥有规范的历史捕获/分叉、保留的资源
    执行上下文、子会话组装/重开以及现有的运行循环；DAG 拥有持久化、调度、门禁与恢复。ThinkRail 选定的未来
    组合是工作区拥有的，带有显式的宿主运行时，因此不需要标题会话。嵌入者可以通过可信的生命周期控制应用不同的
    生命周期策略，而不需要另一个调度器或绕过人工门禁。恢复已暂停；一个进程控制每个 DAG。ThinkRail 既不打包
    它，也不在线上协议或 UI 中暴露它。

18. **聊天资源投射的是能力所有者；它不是通用资源运行时。**
    [[module-pi-background-commands]] 在 Pi 的公开执行器之上提供显式的、会话拥有的仅日志命令；普通 Bash 与
    工作区 PTY 保持不变。`packages/server` 通过 `agent` 嵌入那个可移植包，并把它与直接的
    [[module-pi-delegation]] 子会话并列投射到当前聊天的资源视图中。父会话条目拥有注入的命令服务以及跨扩展重载
    保留的子代理完成投递；范围化的读取、控制与失效通过 agent barrel 组合。详细的集成属于
    [[submodule-server-agent]]，命令的生命周期/保留属于 [[module-pi-background-commands]]。

19. **审查界面是引擎中立的；渲染器是注册的，不是硬接的。** 一个资源（一个文件或 diff 的一侧配对）由 web 的
    `resources` 登记表根据匹配度、排名与能力为当前意图和视口类别选出的渲染器来展示；审查评论通过 `contracts`
    的 `ReviewSelector` 集合锚定（文本用 `lineRange`/`textQuote`，`structural` 方案如 `json-pointer`/`table-cell`/
    `ipynb-cell`，`region` 几何），每个渲染器把它们映射到自己的几何并回报为已放置或未放置——宿主的锚点是唯一的
    权威。`@pierre/diffs` 渲染每一个源代码 diff 与每一个手机级代码界面；丰富格式通过它们自己渲染器的 diff 渲染。
    Monaco 在桌面端渲染文件，且从不在手机上加载。写入路径由宿主推导并以 compare-and-swap 保护
    （`change.revert`/`change.undo`，[[submodule-server-changes]]）；客户端从不发送要写入的字节。ThinkRail 不
    托管任何 VS Code 扩展：语言智能（TextMate 语法、Shiki）作为库导入。活动内容（HTML、SVG、笔记本输出）只在
    沙箱化、拒绝网络的框内渲染。细节：[[submodule-web-resources]]、[[submodule-web-panels]]、
    [[submodule-server-reviews]]。

20. **可移植 pi 包要发布、有作用域，并遵守原生 pi 对等标准。** agent 在任何地方都能用的能力住在
    `pi-extensions/*` 下，并以 `@thinkrail/pi-<name>` 发布到 npm（npm 组织是 `thinkrail`，它也保留了私有的、
    从不发布的 `@thinkrail/*` 工作区包的作用域；裸 TypeScript、`pi` 清单、`pi-package` 关键词；无作用域的
    `pi-*` 名称会与第三方冲突）。
    “在原生 pi 中可用”是被定义的，不是被假定的：从打包的 tarball 安装到隔离的
    夹具里，在 **Node** 下通过 pi 自己的加载器加载（原生 pi 的运行时——ThinkRail 在 Bun 下运行同一份代码，因此
    发布的代码是双运行时），注册并执行工具，在真实终端中渲染。发布通过 Changesets 与带来源证明的 npm Trusted
    Publishing；宿主继续通过 `workspace:*` 消费这些包。可移植的*库*（delegation）不带清单发布，也永远不给它
    假工厂。细节与门禁：[[module-pi-extensions]]。

21. **ThinkRail 扩展是基于小型宿主 UI SDK 的独立包，由登记表文件组合。**
    `thinkrail-extensions/<name>` 把一个 pi 能力与 `./server` 半边（宿主打包的内容，以具名内联工厂形式；技能包
    按 specifier 命名，并从扩展而非宿主解析）和 `./web` 半边（按工具名键控的工具渲染器，以及宿主直接使用的
    具名导出）组合起来。两个半边绝不互相导入，也不导入宿主内部；宿主拥有的范围化状态只通过显式接缝到达扩展
    ——现在固定下来的这一个属性，让后续扩展（线上协议方法、面板）扩展 `define*` 对象而不是替换它们。组合是静态
    的：一个服务端登记表（`packages/server/src/extensions/registry.ts`），它的静态导入把工厂带进每个启动器而
    无需生成工厂列表（打包器生成的列表现在只覆盖尚未包装为扩展的 pi 包）；以及一个 web 登记表
    （`apps/web/src/extensions/registry.ts`）。技能包从扩展自己的依赖图解析，绝不从宿主的依赖图解析。SDK 是
    `packages/extension-api`（类型 + `define*`）与 `packages/ui`（自有原语、`cn`、`onThemeSwap`）；带高亮的
    `CodeBlock` 保持应用本地，直到出现第二个消费方。决策 1 的仅浏览器依赖规则由源码半边与公开子路径检查强制，
    包括 SDK 单独的 `./web` 与 `./server` 契约。**交付规则：** 每个扩展以三个可独立发布的
    PR 到达——新 pi 包与旧包并排、web 半边迁移、服务端半边 + 接线并删除旧包——其中任何一个都不改变用户能观察
    到的东西。**启用/禁用已发布：** 设置 →
    扩展 列出服务端登记表（`extension.list`），每个扩展一个开关；全局的
    `AppConfig.disabledExtensions` 通过宿主注入的解析器到达 `agent`（没有 `agent` → 设置的
    边），它在每次加载器（重新）加载时过滤登记表工厂，并通过 pi 的 active-tool API 从活动会话中扣留被禁用扩展的
    工具，同时 web 渲染器保持注册，使过去的
    对话记录仍能渲染。安装 UX、市场、每扩展设置、每工作区开关覆盖
    以及运行时加载的第三方扩展仍是明确的推迟项。被否决：现在就用运行时加载的
    bundle（React 单例、带版本的 UI API、先解决安全
    问题）、app 内的逻辑扩展（三个物理位置、没有边界）、从描述符生成工厂列表
    （函数不产生导入 specifier）；在行内组合旁边保留基于路径的 dev 加载
    （只有一种组合模式；`{ name, factory }` 保留诊断）；从宿主
    解析 `skillPackages`（宿主不再依赖扩展拥有的 pi 包，因此在隔离
    布局中会 `MODULE_NOT_FOUND`）。试点，分三个 PR 发布：visualize——便携包中用 `lovely-mermaid` 做 TUI 渲染与
    尽力校验，严格的 `mermaid`+`linkedom` 校验由
    ThinkRail 服务端半边通过 `createVisualizeExtension({ validateMermaid })` 注入；旧的
    `packages/pi-visualize` 已删除。细节：[[module-thinkrail-extensions]]。

## 不变量

- 绝不在浏览器打包的代码中**值导入** `pi`；类型只从 `pi-ai` / `pi-agent-core` 包根导入（仅类型导入在构建时
  被擦除，使 bundle 不携带提供商）。`@earendil-works/pi-coding-agent` 仅限服务端——它绝不会到达
  `contracts`/`web`。
- 单一 id 模型：UI 标签页 id 与 `session.sessionId`（`AgentSession` 的 id）。没有单独的 pi UUID。
- agent 以进程内方式运行，**没有崩溃隔离**——包住会话调用并转发错误；一个致命故障会拖垮整个宿主（与子进程
  RPC 模式相比，这是被接受的权衡）。
- `pi` 拥有状态并发出真相；宿主是薄桥——它通过读取方法**暴露** `pi` 的状态（不重新计算它），并把 `pi` 的
  事件作为增量转发。客户端**从读取中水合，然后流式消费增量**——它们只持有自己的视图状态。
- 由宿主或 CLI 启动的后台控制台子进程设置 **`windowsHide: true`**。有界的 Windows 子进程同样保持
  **非分离**，因此普通助手继承一个非可视控制台而不是打开自己的；平台策略与原生回归属于
  [[submodule-server-subprocess]]。这包括窗口聚焦时的 PR 重新校验；终端忙碌检查是关闭动作，Central 配额在
  可见性变化时恢复，而不是普通聚焦时。同步与发完即忘的场景使用 `@thinkrail/shared/spawn`；定制的有界 runner
  直接设置该选项。例外：继承已有终端 stdio 的 spawn（`update`/`uninstall` CLI 子命令、构建脚本）以及在 win32
  上无操作的 shell 探针（`shellEnv`）。
