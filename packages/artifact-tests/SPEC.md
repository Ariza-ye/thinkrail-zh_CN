---
id: module-artifact-tests
type: module-design
status: active
title: 原生产物测试装置
parent: architecture
depends-on: [module-cli, module-server, module-shared]
references: [module-desktop, module-browser-e2e, module-ci-release, module-ext-visualize]
tags: [testing, artifacts, public-surface-checked]
---

## 职责

面向已编译 CLI 与原生桌面产物的、仅源码的测试基础设施：真实的进程
适配器、共享的 HTTP/WS/资源/扩展探测、扩展后的桌面 smoke，以及首次安装 smoke。
它消费已完成的产物；它不构建应用，也不提供应用运行时代码。

## 边界

- **拥有：** 产物定位器、隔离环境、原生/安装器 smoke 入口、共享的宿主
  探测、它们的夹具与辅助单元测试，以及公开 build 操作中桌面打包调用
  与产物收集器的契约测试。
- **Public surface（公开接口）：** `locateDesktopLauncher`
- **允许的依赖：** CLI 的公开产物名辅助函数；服务端获准的历史夹具导出；
  共享的发布身份与带重试的拆除；对 `.github/actions/build-binary/action.yml` 的只读访问，
  以便在隔离的夹具目录中执行其打包调用与收集器；Bun/Node 与原生安装器工具。
- **绝不触碰：** 应用或 SDK 的源码内部、Electrobun 的导入/依赖、假的宿主或 agent、
  生产包导入本包，或测试期间改动真实用户状态。

根级 smoke 命令直接执行 CLI、桌面与安装器入口。浏览器 E2E
编排留在 [[module-browser-e2e]]，并通过本包的 barrel 导入那个纯定位器。
单元测试与严格 typecheck 使用普通的工作区 Turbo 任务；这里没有包构建步骤、
SDK 准备、声明生成或 Playwright 测试发现。产品单元测试仍
留在各自所属的模块中。

## 产物验证

共享探测启动真实产物、加载一个合成的外部 PI 扩展且不存在任何 pi 可执行文件（该
夹具对裸的 `@earendil-works/pi-coding-agent` 说明符做值导入，并把导入的值体现在
其模型名中，因此这次加载会经由宿主强制开启的转换路径检验 pi 的虚拟模块映射——一个缺少
`PI_BUNDLED_NODE` 定义的 bundle 会让此探测失败；[[submodule-server-agent]] 拥有
该接缝）、
检验打包的工厂/技能、运行**一次脚本化的提供商轮次**——该夹具还以自己的 `api` 名称注册一个
pi-ai 的 faux `streamSimple`，它总是用一个悬挂的流程图边调用 `visualize`，因此该探测断言严格的 mermaid
解析错误会作为 `isError` 工具结果到达对话记录（打包后的宿主组合的是 ThinkRail 扩展注册表，而不是那个可移植包
尽力而为的探测；[[module-ext-visualize]]）——在一个真实聊天中启动 pi 打包的 MCP 引擎（一个写出的
stdio 夹具必须报告*connected · 1 tool*，而一个以受保护资源元数据回答 401 的探测内 HTTP 服务器必须报告
*needs sign-in*，通过 `mcp.list` 读回，这证明惰性导入的
MCP 运行时确实在产物内部执行）、在没有提供商轮次的情况下到达一个 OAuth URL、验证健康/UI
与对话记录回收站，然后关闭。CLI 专属探测还会检查其只有退出码的行为与内嵌缓存行为。
原生桌面 smoke 加载真实 UI，并验证路由/preload 消息以及生产环境的外部
导航处理器。在 macOS 上它还会端到端驱动标题栏双击路径：一次不触发拖拽的
双击必须不产生动作，而标题栏双击所记录的动作及其导致的窗口状态必须
与机器的 `AppleActionOnDoubleClick` 设置相匹配，按 [[module-desktop]] 所记录的方式映射（未设置、
`Maximize` 和 `Fill` 缩放）。Linux 跳过它，因为其带装饰的窗口没有 web 拖拽区域；
Windows 跳过它，因为其原生标题栏命中已在双击时最大化。在 Windows 上它改为点击 HTML 最大化按钮，然后在
实时 webview 中点击其 Restore 后继；启动器必须每次点击恰好记录一条 `toggleMaximize` 请求，
并发布匹配的 `maximized` 状态，从而证明真实的桥接请求分支与原生状态
推送，而不是一个假桥接。Close 不做探测：它共用原生 X 的 `requestClose()` 路径，而
随后的外部导航探测需要那个窗口。由桌面端支撑的 Playwright 使用启动器的选择性中性窗口接缝，
使其成为唯一被 hydration 的客户端。实时窗口的 ready/control 接缝仍留在启动器中，绝不是本包的
运行时导入。

普通的产物子进程设置 `CI=1` 来静默每一层分析（analytics），而不改变生产运行时模式；单独设置
`THINKRAIL_NO_ANALYTICS` 只抑制附加事件。`bun run smoke:desktop --analytics [launcher]` 则改为对一个
回环 PostHog 收集器运行受控的隐藏宿主探测，绝不指向厂商端点。它为人类模式启动移除继承来的 CI/测试/可选静默
与代理、检查首次打包初始化在 `app_started` 之前发出 `app_installed`、检查重启只发出 `app_started`，
并在两者上钉住标准的桌面/发布/平台出处加一个 UUID（包括附加退出）。随后它独立验证
CI 与测试静默。不模拟任何 UI 操作或确认；投递在正常宿主关闭之后检查。预期的发布身份是用于构建该产物的
那个共享身份，因此该探测需要一个已发布盖章（带 key）的产物；未盖章的构建正确地什么都不发出。

每个宿主拥有隔离的主目录、数据、agent 与缓存目录；环境覆盖遵循 Windows 的
大小写不敏感键。原生 UI 启动会预先创建其主目录：在 macOS 上，当设置了 `XDG_CACHE_HOME` 而 `HOME` 指向一个不存在的
目录时，窗口永远达不到 DOM-ready。就绪轮询拥有一个有限截止时间，并观察根的早退；
由于启动器非原子地写出其就绪、路由与导航探测文档，smoke 会把缺失或写了一半的 JSON 文件
当作“还没有”，并继续轮询，而不是在对撕裂读取的失败上中止。当需要失败清理的是实时的
已启动根或已校验的就绪文档 app/launcher PID 时，拆除是有界的，并在对临时安装根做共享的带重试
删除之前被等待。一个 setup 根可能在其 app 交接就绪之前就成功退出；在该退出之后，测试装置
不会从 setup 进程推断或发现后代进程。首次安装 smoke 运行实际的 DMG 应用、Windows ZIP setup 或
Linux tarball 安装器、观察安装器的自动应用启动、检查健康与正常的控制文件关闭，并等待
安装器/宿主/启动器退出。仅测试装置的安装器 UI 自动关闭标志关闭的是完成对话框，
而不是错误或断言。

Windows 安装器 smoke 只允许在可丢弃的 GitHub 托管 Actions runner 上运行：v2 安装会
写出真实的已知文件夹快捷方式与 HKCU 注册，超出 HOME 隔离范围。该守卫在创建文件或启动安装器之前
运行。其他原生 smoke 仍同时隔离 HOME 与 USERPROFILE。

定位器解析文档化的 app/安装器路径与按频道的 setup 名称，而不是从一个有歧义的目录里取第一个
匹配的产物。Windows setup 后缀保留 stable/canary 的区分。
一次 macOS 运行不构成 Windows/Linux 原生执行或下载时 Gatekeeper 接受的证据。
签名/公证验证属于 [[module-ci-release]] 的私有服务交接。
