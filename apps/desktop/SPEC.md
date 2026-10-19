---
id: module-desktop
type: module-design
status: active
title: 桌面启动器/客户端（Electrobun）
parent: architecture
depends-on: [module-server, module-contracts, module-shared]
tags: [desktop, launcher, packaging]
references: [submodule-web-navigation, module-artifact-tests, module-ci-release, submodule-web-shell]
---

## 职责

运行在既有 web UI 与线上协议之上的原生 Electrobun 启动器/客户端。local-host 配置把服务器嵌进 Electrobun
的 Bun 进程，在一个回环 origin 上提供打包好的 web 产物，并在原生系统 webview 中打开那个 origin。
`apps/cli` 仍是同级的浏览器启动器与发布回滚路径。之后的 shared-client 配置可以拨通一个既有宿主，而不引入
另一套 UI、线上协议或引擎架构。

## 边界

- **拥有：** Electrobun 配置与生命周期；原生窗口策略，包括按平台的标题栏处理方式以及它向 web 客户端发布的
  窗口外壳几何；本地 `bootHost()` 启动；打包资源暂存；PI 兼容的 server-runtime bundle；桌面路由的
  preload/持久化；web 客户端界面字体选择器所读取的已安装字体列表；稳定 backend-profile/window 身份下的有界
  通用客户端偏好适配器；以及可选的实时窗口测试接缝。独立的 artifact 测试装置属于
  [[module-artifact-tests]]。
- **Public surface（公开接口）：** 打包好的桌面应用及其安装程序。应用包不导出任何测试辅助库。
- **允许的依赖：** `server`（用于内嵌宿主与 build-support 清单）；`shared`（用于发布标识）；`contracts`
  （用于兼容/native-bridge 类型与共享的 `createQuitConfirmation` 规则）；已完成的构建 web 产物；
  Electrobun `2.0.1` 及其生成的 SDK；仅构建期使用的 `pe-library`/`resedit`（补 Electrobun 2.0.1 的
  Windows 卸载器图标缺口）；仅构建期使用的 `@resvg/resvg-js`（光栅化图标源，见下文）；Bun/Node。
- **绝不触碰：** 启动 CLI 或第二个引擎进程；实现普通产品功能或 agent/领域逻辑；在运行时导入 web 源码；
  引入仅桌面的线上协议或 UI 状态模型；在后端存储一个活动位置；或在没有新的验收失败作为理由的情况下打包
  CEF。原生外壳、生命周期与打包关注点是唯一属于桌面的行为。

## 配置与拓扑

只发布 local-host 配置。一个 Electrobun Bun 进程在同一个事件循环上拥有原生外壳与服务器；已被接受的进程内
崩溃取舍保持不变。宿主绑定回环端口 `0`，其实际端口构成窗口 origin。因此打包的 `web/dist`、`/ws`、
`/files` 与 SPA 回退保持同源，web 客户端没有桌面分支。动态回环端口绝不持久化。

桌面、CLI 与源码宿主不按数据目录互相排除。每个启动器绑定各自独立的服务端口，并初始化自己的进程内服务。
若多个宿主使用同一份可变状态，它们的持久化与事件流并不协调，并发修改可能互相覆盖。

## 启动与打包运行时

1. 在任何 server 导入之前解析应用资源，并把 `BUN_PTY_LIB` 指向已暂存的目标平台 FFI 库。Electrobun 生成
   的是普通 JavaScript 入口，而不是 `bun build --compile` 可执行文件，因此它不内嵌 `bun-pty` 的库。
2. 动态导入单独构建、未打包的 `server-runtime.ts` 资源。该 bundle 用 pi 的 `PI_BUNDLED_NODE=true`
   define 构建，这使 PI 对 Central 这类外部扩展使用其内嵌模块的扩展加载器（静态 jiti，内置 Babel，外加
   虚拟模块）。没有该 define，单文件 bundle 会被当作普通 Node 运行时而 PI 的惰性 Babel `require` 无法在其中
   解析（[[submodule-server-agent]] 拥有该接缝）。把 PI 摊平进 Electrobun 的普通入口仍然是被禁止的：那会
   在 `BUN_PTY_LIB` 设置之前加载 `bun-pty`。
3. 运行时按值导入四个打包的 pi-package 工厂（`pi-web-access`、`pi-spec-graph`、`pi-thinkrail-workflow`、
   `pi-todos`），并用这些工厂、委派子进程所需的 `pi-web-access` 工厂（由
   `BuildRuntimeSources.webAccessIndex` 选定，绝不按位置）、已暂存的技能（把每个
   `BuildRuntimeSources.skillRoots` 条目摊平进一个目录，重复路由被拒绝），以及 macOS/Windows 的 trash
   helper 调用 `registerBundledRuntime()`。来自 server 注册表的 ThinkRail 扩展
   （[[submodule-server-extensions]]）不需要生成的入口：它们的工厂通过 `@thinkrail/server` 的静态导入图
   抵达该 bundle。生成器的键映射必须满足 server 拥有的 `BundledExtensions` 契约的每一个键，因此新增一个
   必需的启动器字段会让桌面 typecheck 失败，而不会产出只在打包版本里才有的 `undefined`。随后它在回环端口 `0`
   上，带着已暂存的 web 目录、烘焙版本与仅发布版使用的 analytics key、`desktop` analytics 来源，以及
   （仅打包时）启动器提供的 `Utils.openExternal` 回调调用 `bootHost({ resolveShellEnv: true, … })`，
   该回调供宿主的一次性浏览器归因声明使用。该回调穿经 `DesktopHostOptions` 与生成的运行时。首个原生窗口的
   `dom-ready` 会显式调用被代理的 `host.server.startAttributionClaim()` 就绪方法；宿主启动与已流逝时间都不
   会启动一次已保存选择的声明。不新增任何深链接或 RPC 接口。
4. 为 `{ backendProfileId: "local", windowId: "main" }` 恢复有效路由片段与有界客户端偏好映射。路由被
   追加到新 origin 上；偏好映射被序列化为数据并前置到 preload 源码，好让 web 客户端在端口不断变化的情况下
   仍能在 React 挂载前水合。用系统渲染器打开一个普通的原生 `BrowserWindow`。

Electrobun 入口 bundle 只包含原生外壳代码。其中出现静态 server 导入是被禁止的：它可能在 `BUN_PTY_LIB`
之前加载 `bun-pty`，并绕过已定义的 server-runtime 构建。启动失败经由共享崩溃路径记录、在原生错误对话框中
展示，并退出而不留下一个隐藏的宿主。

打包资源保持物理且未打包：web 资源与技能通过文件系统路径读取，PTY 使用 FFI，trash helper 是可执行
sidecar，preload 以源码文本形式读取。ASAR 不属于本设计。

## 原生应用菜单

外壳在创建主窗口之前安装 Electrobun 的原生应用菜单。标准编辑命令由原生角色（role）拥有，而不是浏览器级的
按键处理器，因此 Command/Ctrl-C、V、X、A、Z 与 Shift-Z 会穿过操作系统的响应链，在普通输入框、Monaco、
xterm 以及未来的 webview 表面上生效，同时不与它们本地的按键处理竞争。

macOS 获得惯常的 application、Edit 与 Window role 菜单。Windows 获得所支持的 Edit role 菜单。Linux 跳过
注册，因为 Electrobun 2.0.1 在那里不支持应用菜单；WebKitGTK 保留其渲染进程原生的编辑行为。macOS 上的
Command-H、Option-Command-H 与 Command-M 携带显式加速键，因为 role 项没有默认快捷键。Settings…
（Command-逗号，位于 About 之后）、Quit 与 Close 是自定义动作项，而不是 role；见已确认的退出与关闭。该策略
是平台纯粹的，打包的 ready 接缝会报告注册是否运行过，因此单元测试钉住菜单组成，而扩展应用冒烟钉住生产接线。

### 已确认的退出与关闭

Command-Q（`quit-shortcut`）必须被确认：按住它 1200 ms，然后松开 Q 或 Command；或者在松开第一次按下
之后 500 ms 内再次按下，然后再松开。单次轻点会静默过期。组合键被按住期间键盘退出绝不触发，因此按键重复
无法把 Command-Q 泄露到下一个应用。Electrobun 在每次按下以及每次 OS 按键重复时都会触发该菜单动作，
且没有重复标志，因此 `quitShortcut` 驱动共享 contracts 的 `createQuitConfirmation` 规则（该手势的唯一
一份实现，Linux 上的 Ctrl+Q 也由 web 外壳使用），并从 CoreGraphics（`keyState.ts`、Bun FFI、HID 系统状态，
无需额外权限）向它提供按键状态，同时在侦测期间轮询它。按住只统计动作触发时按下的非修饰键，因为菜单按
字符匹配 Q，而它的物理键因布局而异（AZERTY、Dvorak）；按键重复的按下保留该集合且绝不向其添加，因此之后
按下的键绝不计作按住。菜单点击以同一动作到达，但没有按键按下，且左键抬起晚于最后一次按下，因此它直接
退出。键盘或 VoiceOver 菜单选择（Ctrl+F2、Enter；VO+Space）到达时 Command 已抬起，且其最后一次按下晚于
最后一次修饰键变化，因此它也直接退出。迟到处理的轻点则改为待命：它的 Command 松开是晚于 Q 按下的修饰键
变化。迟到处理的按下中 Command 已松开但 Q 仍按下，可能被当作菜单选择；处理只需毫秒级，因此这是被接受的。
按下时按键状态不可读则直接退出；已在待命状态时不可读则取消，除非已经到达松开。若没有可见提示（窗口最小化，
或宿主启动早于窗口与 RPC 存在），按下会跳过确认并在松开时退出。菜单监听器紧接菜单之后挂上，因此退出在
启动期间就能工作；命令在窗口出现之前被丢弃。每一次已确认的退出都经过退出协调器。Dock Quit、Apple Event
退出与更新重启绕过菜单，保持直接。提示以 `quitHintChanged` 消息传递。退出保持在命令通道之外：main 拥有
它，它需要按键状态，且它必须在 webview 挂起时仍能工作。

在 Linux 上没有应用菜单，因此由 web 外壳拥有 Ctrl+Q：它从 keydown/keyup 确认同一手势，并调用
`NativeShortcutsBridge.quit()`，即 `quitApp` RPC 请求，这会启动同一个退出协调器而不等待关闭。Windows
不绑定任何退出组合键；Alt+F4 仍是 OS 窗口关闭及其普通关闭流程。

其他菜单快捷键被转发为 `NativeCommand`：菜单动作就是命令 id（由一个穷尽的
`Record<NativeCommand, true>` 门控），且 main 发送 `nativeCommand`。共享的 `repeatGate` 使它们边沿触发：
在一次带按键按下的转发之后，后续动作会被丢弃，直到没有任何非修饰键按下，因此按键重复绝不把命令触发两次。
没有按键按下的点击，或不可读的按键状态，总是转发。Command-W（`close-item`）请求 web 客户端关闭其聚焦的项
或什么都不做；它绝不关闭原生窗口。Command-逗号（`open-settings`）请求它打开 Settings；由 web 决定模态是否
阻断它。preload 在每个桌面平台上把提示与命令暴露为冻结的不可枚举
`__THINKRAIL_NATIVE_SHORTCUTS__` `NativeShortcutsBridge`（由 `shortcutsBridge.ts` 构建）；目前只有 macOS
菜单会发送事件。在 Windows 与 Linux 上，web 外壳通过其命令表拥有 Ctrl+W / Ctrl+F4（关闭项）与 Ctrl+,（Settings）。

preload 还在每个桌面平台上暴露冻结的不可枚举 `__THINKRAIL_NATIVE_NOTIFICATIONS__`
`NativeNotificationBridge`（[[module-contracts]]）。它有两个能力：
`show({ title, subtitle?, body, silent? })` 把 `showNotification` RPC 请求转发给主进程，
主进程调用 Electrobun `Utils.showNotification`（原生 OS 通知中心）；投递是尽力而为的，因此失败的请求
被丢弃，而不是冒出未处理的 rejection。`isWindowFocused()` 返回原生窗口是否持有 OS 级焦点；主进程通过
`BrowserWindow` 的 `focus`/`blur` 事件跟踪这一点，并通过 `windowFocusChanged` RPC 消息把状态推给渲染进程，
preload 同步缓存它。当 DevTools 或其他窗口内 chrome 持有渲染进程焦点时，这能正确报告 `true`，而
`document.hasFocus()` 在该情况下返回 `false`。**平台注意：**在 Windows 上，DevTools 是独立的原生窗口；
聚焦它会触发主 `BrowserWindow` 的 `blur`，因此 `isWindowFocused()` 会退回到与浏览器通道相同的限制。在
macOS 上，DevTools 是停靠的，主窗口焦点得以保留。Electrobun 2.0.1 没有应用级激活信号；跨窗口方案需要
未来的 API。web 客户端按能力探测这座桥，并把它的注意力通知经由该桥转发，而不是走页面的 Notifications
API —— web 外壳不保留桌面分支。Electrobun 的点击回调尚未落地，因此原生通知不携带点击动作。

每个组合键恰好只有一个拥有者：原生菜单加速键（转发为 `NativeCommand`）或 web keydown，绝不两者兼有，
因为 webview 对加速键组合仍会收到 keydown。原生拥有 OS 或浏览器保留的组合键（Command-Q/W/H/M）；在
没有任何原生菜单认领之处，Ctrl+Q/W/F4 归 web 所有。

## 原生页面缩放

Command/Ctrl-`+`（`=`）、`-` 与 `0` 像浏览器的默认动作那样缩放：桌面 preload 在页面处理器之后监听，
并把任何已被处理器用 `preventDefault` 认领的组合键让出（Monaco 的 `Mod+K` 折叠组合键以这些键结尾），
然后向主进程发送一个类型化的单向请求。只阻止传播的处理器同样保留该组合键，因此当这类输入持有焦点时缩放是
惰性的。主进程从 webview 当前的原生缩放步进到相邻的有界浏览器式倍数，因此在这些快捷键之外发生的缩放变化
（WebView2 的 Ctrl+滚轮）无法让它失步。

在 macOS 上，WebKit 的双指捻合生命周期连续驱动同一套原生页面缩放。preload 让出被页面内容认领的手势并转发
校验过的缩放比例；主进程在手势开始时捕获原生缩放，并以该基线应用每个绝对比例，范围限制在 50%–200%，因此
更新绝不叠加，也不会引入第二个缩放拥有者。web 应用不拥有任何重复的快捷键、手势或缩放状态。

## 已安装字体

web 客户端的界面字体选择器向宿主询问本机的字体族（`listSystemFonts`、`systemFonts.ts`，通过冻结的
`__THINKRAIL_SYSTEM_FONTS__` 桥暴露给页面），因为系统 webview 无法回答这个问题：WebKit 没有
`queryLocalFonts`，只有 WebView2 才会有。字体族来自在各平台字体目录中读取每个字体文件的 `name` 表
（macOS 上的 `~/Library/Fonts`、`/Library/Fonts`、`/System/Library/Fonts{,/Supplemental}` 以及 Apple 的
`AssetsV2/com_apple_MobileAsset_Font*` bundle —— PingFang 就在那里，而不在 `Fonts/`；Windows 上的
`%WINDIR%\Fonts` 加上按用户目录；Linux 上的 `~/.fonts`、`~/.local/share/fonts`、
`/usr/local/share/fonts`、`/usr/share/fonts`）。该枚举刻意读取文件偏移而不是 shell out：
`system_profiler SPFontsDataType` 在字体丰富的 macOS 安装上对同一问题要花约 11 秒（超出该桥 5000 ms 的
请求预算），而 Windows 字体注册表给出的是诸如 `Microsoft YaHei & Microsoft YaHei UI (TrueType)` 这样的
显示名称而不是字体族。两个容器细节是关键承重的：`.ttc` 集合的 table 偏移是相对文件起始的绝对偏移，而不是
相对字面；Macintosh 平台的 `name` 记录是单字节的。Apple 以 `.` 为前缀的私有字面在这里被丢弃，因此没有
客户端需要知道那个约定。不可读的目录或文件只是产出更少的行，绝不是一个失败的请求；答案在进程生命周期内被
缓存，而字体族的选择是 web 客户端的偏好，绝不是宿主设置。

## 原生窗口外壳

只要框架允许原生控件在没有原生条带的情况下存活，web 顶栏（[[submodule-web-shell]]）就是窗口的标题栏。
Electrobun 2.0.1 在任何平台上都不暴露标题栏颜色 API（macOS 与 Windows 只跟随系统的浅色/深色设置），
因此主题色的标题栏意味着移除原生条带并让 web 头部占据它。该策略是平台纯粹的（`windowChrome.ts`，由单元
测试钉住）并被铺进主 `BrowserWindow`：

| 平台 | `titleBarStyle` | 原生控件 | 发布的内边距 | 头部拖拽 |
|---|---|---|---|---|
| macOS | `hiddenInset` —— 透明条带、隐藏标题、全尺寸内容视图 | AppKit 的红绿灯按钮保留；`trafficLightOffset { x: 0, y: 4 }` 把 12px 按钮在 40px 顶栏中居中（在打包构建上实测：默认位置把它们居中在 16px，因此 +4 落在 20） | 左 `64px` —— 红绿灯区（按间距栅格 7 + 3×12 + 2×8 = 59px） | 是 |
| Windows | `hiddenInset` —— Electrobun 创建 `WS_CAPTION \| WS_THICKFRAME` 并在 `WM_NCCALCSIZE` 中剥掉标题栏：缩放边框与 DWM 阴影保留，没有原生标题栏按钮 | 没有原生控件；web 渲染最小化 / 最大化或还原 / 关闭（[[submodule-web-shell]]）并通过 RPC 驱动窗口 | 右 `138px` —— 三个 46px 标题栏按钮 | 是 |
| Linux | `default` | GTK/WM 装饰 | 无 | 否 |

**Windows。** Electrobun 2.0.1 已经启用 WebView2 的非客户区支持，因此头部的 `app-region: drag` 是真正的
`HTCAPTION` 命中：Aero Snap、从最大化状态拖拽、双击最大化以及 Alt+Space 都来自 OS，而不是来自 Electrobun
的原始输入移动器。Electrobun 从其 `hiddenInset` 样式里省略的是 `WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX`
（上游 blackboardsh/electrobun#558）：没有它们，最大化会盖住任务栏，双击 / 系统菜单行为失效。
在该修复落地上游之前，`windowsFrame.ts` 在窗口创建后通过 `dlopen` 的 `user32.dll`
（`GetWindowLongPtrW` → `SetWindowLongPtrW` → `SetWindowPos(SWP_FRAMECHANGED)`）把这三个位一次性 OR 到
HWND 上 —— 可注入 API 背后的纯样式算术，没有 C 源码，没有运行时编译；失败会被记录，绝不致命。成功与否通过
回读样式来判定，而不是看 `SetWindowLongPtrW` 的返回值：先前样式为 0 是有歧义的，而它的
`SetLastError`/`GetLastError` 消歧会跨越多次独立的 FFI 调用，运行时可能把它们弄脏。HTML 控件调用
`minimizeWindow` / `toggleMaximizeWindow` / `closeWindow` 请求；关闭走 `requestClose()`，与原生 X 相同的
路径，因此退出协调器仍拥有关闭流程。主进程在每次 `dom-ready` 以及 `resize` 变化时发布
`windowStateChanged { maximized, fullScreen }`，而 preload 只在注入的种子声明 `windowControls` 时才暴露
`NativeWindowControlsBridge`（`__THINKRAIL_NATIVE_WINDOW_CONTROLS__`，[[module-contracts]]）。已知缺口，
被接受而不是用窗口子类打补丁：上边缘不是缩放到手（Electrobun 把它折进客户区，同样是 #558），并且 Windows 11
的 Snap Layouts 不会在悬停 HTML 最大化按钮时出现（那需要 `HTMAXBUTTON`，除了 WebView2 预发布的
window-controls overlay 之外没有任何东西能提供）。PR #469 探索过通过运行时编译的 HWND 子类与 WebView2 区域
遮蔽来保留 DWM 自己的按钮；它被认为验证成本过高而被搁置。

Linux 未被规划：`hiddenInset` 在 GTK 下是无操作，而 `hidden` 会把装饰与 WM 提供的缩放手柄一起去掉。完全
自定义的 macOS 外壳（`titleBarStyle: "hidden"` 加自绘红绿灯按钮）被否决，因为平台提供真的那些。

**几何契约。** 桌面在 `<html>` 上发布三个 CSS 自定义属性：两个内边距属性外加
`--window-chrome-drag-region`（`drag` | `no-drag`），它告诉页面其头部是否为标题栏。拖拽标志只搭乘初始的
preload 全局（它是按策略恒定的常量）；几何更新以 `windowChromeChanged { insetLeft, insetRight }` 到达。
web 以 `0px` 回退值消费这些属性，因此在浏览器中托管的客户端与中性的 E2E 宿主窗口（`about:blank`，无
preload）都不受影响，并且*web 客户端仍然没有桌面分支*。preload 校验几何，在文档根缺失时只保留最新值，并在
`DOMContentLoaded` 时冲刷它，因此一次待处理的启动写入无法覆盖更新的原生状态。右侧内边距在 Windows 上是
`138px`，其它地方是 `0px`；种子还携带按策略的 `windowControls` 标志，preload 把它变成可选的控件桥。

**全屏。** macOS 原生全屏会连菜单栏一起自动隐藏红绿灯按钮，而 Windows 的全屏窗口是裸的 `WS_POPUP`，因此
全屏会把两个内边距归零，且当 `windowStateChanged` 报告 `fullScreen` 时 web 隐藏其控件。主进程在每次 webview
`dom-ready` 时发布几何（全屏期间的重载绝不能继承窗口态的内边距），并只在几何变化时于 `resize` 发布。中性的
E2E 宿主窗口（`THINKRAIL_DESKTOP_E2E_HOST=1`）保留默认原生外壳且不发布任何东西。

**拖拽。** 桌面唯一的贡献是 `drag` 标志：web 头部的 `window-drag` 工具类仅在
`--window-chrome-drag-region` 如此声明时解析为 `-webkit-app-region: drag`，而 Electrobun 自己注入的 preload
会把同源样式表中的 app-region 声明改写成一个镜像的自定义属性，并在 `mousedown` 时针对它做命中测试。带装饰的
窗口（Linux、中性窗口）发布 `no-drag`，因此绝不获得第二条、部分可用的拖拽条带。

**标题栏双击。** webview 覆盖原生条带，因此 `NSWindow` 永远看不到头部双击，而 Electrobun 2.0.1 只实现了
app-region 拖拽。它的原生移动使用直通事件监视器，因此页面仍会收到 `dblclick`。桌面 preload 监听未被页面
`preventDefault` 的主按钮 `dblclick` 事件，并在目标按 Electrobun 自己的命中测试输入属于拖拽区域时发送一个
无载荷的 `titleBarDoubleClick` 消息：该输入就是其样式表改写所产出的、计算后的继承属性
`--electrobun-app-region`。因此，恰好是能拖拽窗口的区域也会缩放窗口；`window-no-drag` 动作簇两者都不做，
而 web 客户端仍然没有桌面分支。主进程只在 macOS 策略的 `titleBarDoubleClick` 标志被设置且在原生全屏之外时
才动作；Windows 保持关闭，因为它的 `HTCAPTION` 拖拽区域已经原生最大化，再处理一次会切换两次。它在每次双击
时读取 `AppleActionOnDoubleClick`（异步 `defaults read -g`，因此改动的设置无需重启即生效），并像 Chromium
对自定义可拖拽区域那样映射：未设置、`Maximize`（Zoom）或 `Fill` 通过 `maximize()`/`unmaximize()`
（`[NSWindow zoom:]`）切换缩放；`Minimize` 最小化；`None` 与未知值什么都不做。`Fill` 使用 zoom 是因为
Apple 的 `_zoomFill:` 是私有的、通过 Electrobun 无法抵达；该窗口的标准缩放框是屏幕的可见框，因此只有平铺
边距不同。前一次双击仍在解析时到达的双击会被丢弃。这个变通存在只是因为 Electrobun 缺少该行为，上游追踪于
[electrobun#561](https://github.com/blackboardsh/electrobun/issues/561)。Electrobun 升级时必须重新核对镜像
属性名与该 issue：一旦框架自己处理拖拽区域双击，就移除 preload 监听器、`titleBarDoubleClick` 消息与处理器，
否则窗口会切换两次。

## 导航与窗口安全

原生窗口只在其精确的回环 origin 内允许导航。用户请求的外部 URL 通过 OS 打开，而不是替换应用表面。导航
监听器使用 SDK emitter 的 webview 作用域通道 `will-navigate-<id>` 与 `new-window-open-<id>`；未加作用域的
载荷没有 webview id，而实例监听器的类型化事件列表省略弹窗。载荷类型源自 SDK 事件工厂，而不是复制到本地
声明里。detail 可以是原始 URL、弹窗对象，或序列化的导航 JSON；有界解码只保留字符串 URL 以及
HTTP/HTTPS/mailto 白名单。原生 `navigationRules` 强制约束：导航事件响应无法取消它。

桌面 preload 发送类型化的单向路由、本地偏好、页面缩放与标题栏双击消息，并且是上文所述窗口外壳 CSS 属性的
唯一写入者。它在页面脚本之前包裹 `history.replaceState` 与 `history.pushState`，并且还上报初始/hash/pop
导航，因为 Electrobun 的原生导航事件观察不到 History API 路由变化。主进程只接受来自主窗口的消息。路由以
有界片段字符串持久化在一个按频道限定作用域、带版本的文档中；不可读/无效状态回退到 `#/v1`。偏好持久化在
一个独立的有界、带版本、按 `{ backendProfileId, windowId }` 限定作用域的通用字符串映射中；每个值上限为
256 Ki 个字符，整个文档仍以 1 MiB 为上限。原生侧只校验大小/形状，绝不了解功能含义。它冻结的 preload
适配器只暴露 `getItem`、`setItem` 与 `removeItem`，写入经由类型化单向通道返回。畸形消息被忽略；文件系统
拒绝会被记录，而不改动内存中的文档或终止客户端。web 功能仍然拥有每个值的校验与默认值。web 路由器仍是
路由语法的校验者，且 preload 不暴露任何宿主/域能力。

在 Windows 上，webview 到 main 的 RPC（请求与单向消息）走 Electrobun 的原生宿主桥，而不是它的回环
WebSocket。Electrobun 2.0.1 的核心在 Windows 上以地址复用绑定其固定的默认 socket 端口 `50000`，因此第二个
运行的 Electrobun 应用（包括另一个 ThinkRail 频道）会共享该端口并收到这个 webview 的 socket 流量；于是每个
请求都会超时，每条消息都会丢失。因此启动器在 Windows preload 前面加上一段移除两个注入的 socket 端口全局的
代码，这会选中 Electroview 文档化的无 socket 路径（`__electrobunHostBridge`，同一个按 webview 的 WebView2
通道被用作其回退）。main 到 webview 的投递不受影响。Electrobun 升级时重新核对：一旦核心在 Windows 上选择
私有端口，就移除 `hostTransport.ts`。

宿主读取已暂存的 preload bundle，并把其 JavaScript **源码文本** 传给 `BrowserWindow.preload`。`views://`
形式的 preload URL 是被禁止的：Electrobun 1.18.1 在 macOS 上能解析它，但在 Linux 上会把字面 URL 作为代码
注入。

## 生命周期

每条退出路径都只调用一次共享的、幂等的异步 server 关闭，包括在获取宿主之后、而在原生窗口或退出监听器就绪
之前的启动失败。关闭所有权在宿主被获取的那一刻开始。它在自己的界限内收敛/中止活动 agent 工作，排空
analytics，释放 server 资源与 PTY，并关闭 socket。Electrobun 同步的 `before-quit` 回调在该 promise 挂起
期间取消退出，并在完成守卫下重试 `Utils.quit()`。启动失败也在错误对话框的终结器里经由同一个协调器直接
请求退出，因此即使缺少退出拦截或对话框失败也无法绕过关闭。突然死亡只依赖操作系统进程清理。

Artifact 测试通过可选的 环境/ready/control 接缝驱动同一个入口：隔离的用户数据、供浏览器后端测试使用的隐藏
中性窗口、DOM-ready 时的 host/launcher id 与 origin，以及普通退出。原生 UI 冒烟可以捕获一次外部打开结果，
并请求一次固定的导航探测，而不是启动用户的浏览器。配合标题栏探测文件时，两个控制命令会在活的 webview 中
派发合成的 `dblclick`：`title-bar-double-click` 作用于头部，`title-bar-double-click-no-drag` 作用于
no-drag 动作簇，并在同一个任务中随后作用于头部。启动器记录它收到并处理了多少条双击消息，以及最后处理的
偏好、动作与前后窗口状态。仅头部的阶段证明头部被转发；同时统计收到与处理，使第二阶段能检出一次被转发的
no-drag 点击——单飞处理器会把它丢弃。配合 window-controls 探测文件时，`window-controls-maximize` /
`window-controls-restore` 会在 HTML 标题栏按钮带上预期标签后点击它，且启动器记录它处理的每个 window-control
请求外加最后发布的 `NativeWindowState`。这些钩子需要活的窗口；它们的独立驱动器与断言位于测试包中，产品
代码从不导入该包。

## 构建与发布

该包把 Electrobun `2.0.1` npm bootstrap 钉为仅构建期依赖。这个精确版本钉会选中其配套的 Hutch 工具链与 SDK；
直接调用全局 Hutch 以及浮动版本覆盖不属于构建路径。应用显式选择真正的 Bun 主进程，而不是默认的 Cottontail
运行时。Electrobun 拥有打包的 Bun `1.4.0` 版本；按项目覆盖运行时不受支持。仓库独立钉住的开发/CI 运行时通过
[[architecture]] 的根工具链契约与它对齐。

该包运行官方的 `electrobun build` / `dev` 命令。配置读取与启动器相同的共享版本模块，无需环境版本桥。一个
文档化的 `preBuild` 钩子构建共享 web 产物，并暂存应用专属的 PTY/trash/技能资源与 PI 运行时。该钩子在 Hutch
的 Cottontail 下运行，因此它会调用真正的 Bun CLI，既用于读取 `@thinkrail/server/build-support` 清单
（该清单按值加载 server 扩展注册表并连带 pi 图 —— Cottontail 的模块运行时无法求值那张图；`typebox` 的
`String` 导出是第一个受害者），也用于打包单独暂存的 `.ts` server 运行时，而不是改动 PI 的打包器。它那临时
的工厂入口即使失败也会被移除。暂存资源包括被打包技能所消费的 workflow SPEC。一个文档化的 `postBuild` 钩子
在框架复制完暂存内容后将其移除；失败构建的暂存会在下一次 pre-build 时被替换。在 Windows 上，该钩子还会在
卸载器资源存在之后、发布压缩、包裹与签名之前为打包的卸载器打上品牌。同一个工作树中的构建保持串行。

Electrobun 的平台图标配置指向一个 ThinkRail 标记，采用各目标所需的原生格式：macOS iconset、Windows
多分辨率 ICO 与 Linux PNG。原生标记保留其圆角方形轮廓，ThinkRail 字形是深色系品牌绿（`#8dff4f`）置于纯黑
底片上；半透明玻璃、高光与装饰性镶边被排除，好让小的任务栏图框保持清晰。浏览器 favicon 与应用内外壳标记是
各自独立的 web 拥有表面。同一个 Windows ICO 是 Hutch 拥有的源，用于已安装应用、setup/解包可执行文件、快捷
方式与任务栏身份；没有任何发布动作会替换成第二个安装器图标。Electrobun 2.0.1 不会把该图标应用到其打包的
Windows 卸载器，因此项目的 `postBuild` 钩子把同一图标组加入 `Resources/uninstall`。

`assets/icon.svg` 是唯一手工编写的源；它下面的每个位图（iconset、ICO、Linux PNG）都由
`scripts/generate-icons.ts`（`bun run generate-icons`）生成，绝不手工编辑，使用 `@resvg/resvg-js` 直接从
矢量栅格化。Windows ICO 携带 16/24/32/48/64/128/256 的 PNG 压缩帧 —— 微软文档化的图标构建最小集
（16/24/32/48/256）外加两个额外尺寸，好让中间 DPI 缩放能从邻近尺寸插值 —— 经由已用于卸载器的同一个
`resedit` 依赖打包。先前的一个 4 帧原始 BMP ICO（16/32/48/256，早于生成器）没有匹配 Windows 11 任务栏
24×24 100% 缩放目标的帧，在那里看起来是糊的；生成集补上了这个缺口。

Electrobun 的 `build.views` 拥有浏览器 preload bundle；`build.copy` 拥有物理资源包含。没有自定义 SDK
resolver、SDK 元数据校验器或 Electrobun 命令运行器。应用本地的 Hutch 配置选择 Bun 作为包管理器，保留工作区
catalog 与 `bun.lock`。

Hutch 拥有生成的 `.hutch/devkit` 投射与下载缓存。该投射与瞬态 `.cottontail-tmp` 加载器被忽略，并被排除在
仓库源码边界扫描之外，绝不编辑或提交。框架构建会隐式准备它；typecheck 在 TypeScript 之前运行标准的
`electrobun prepare` 命令。准备错误会正常传播，新机器需要网络访问。普通 install、仅 web 开发/构建与单元
测试都不准备原生 SDK。

桌面 typecheck 通过编辑器工具所用的同一批无 baseUrl 路径消费官方 SDK 的 `.ts` 源码；不存在手写的 API 声明
或影子 typecheck 配置。经明确批准，只有桌面设置 `exactOptionalPropertyTypes: false` 以匹配 Electrobun 的
源码契约，同时保留 `strict: true` 与 `noUncheckedIndexedAccess: true`。该设置适用于桌面编译，包括被导入的
工作区源码；其它每个包保留各自未变动的 strict 检查。上游源码不兼容追踪于 Electrobun issue #516；
`skipLibCheck` 无法排除被导入的实现 `.ts`。直接源码方案遵循 v2 迁移指南，并避免第二条声明生成流水线。
规范的 main 导入使用 `electrobun/main`；preload 保留 `electrobun/view`，而 RPC schema 保留其
`bun`/`webview` 键。

参考：[官方 v2 迁移指南](https://framework.blackboard.sh/electrobun/guides/migrating-to-v2/)、
[上游可选属性 issue](https://github.com/blackboardsh/electrobun/issues/516)。

桌面安装器与 CLI 产物并列发布，覆盖 macOS ARM64、Windows x64、Linux x64 与 Linux ARM64。Electrobun 2.0.1
不发布 macOS x64 核心。Nightly 映射到 Electrobun canary，stable 映射到 stable。标准格式是 macOS 上的 DMG、
Windows 上的 setup-EXE 加载荷 ZIP，以及 Linux 上的 setup tar.gz。私有发布流水线保留既有的
`thinkrail-desktop-*` 下载别名；其收集器为频道与原生目标选择精确的框架产物。macOS 应用归档被私下传输用于
SRE 定稿，绝不作为更新器载荷发布。运行时更新在下面集成；feed 发布仍由发布方拥有，并受目标策略门控。

### 签名

签名与公证通过私有发布协调器使用 JetBrains 提供的服务；公开构建既不包含服务凭据，也不包含新的 Apple
登录/钥匙串流程。当前 Windows 覆盖会为 setup stub 签名而不重写其以哈希为键的相邻载荷。

原生 macOS 构建还暴露 Electrobun 标准的展开 `.app.tar.zst` 作为私有签名输入。获批准的 JetBrains SRE 流程
为展开的应用签名，并围绕它定稿一个常规 DMG，然后为该容器签名/公证/装订。它不改动 Electrobun 的压缩自解包
载荷，也不使用错误的元数据前封口钩子。本地框架 DMG 仍是未签名的构建产物；只有私有流水线验证过的最终 DMG
才是一个已签名的发布。交接与验证契约属于 [[module-ci-release]]。

Linux 使用原生 WebKitGTK 而不使用 CEF，并声明 Ubuntu 24.04+/glibc 2.38 加 `libgtk-3-0`、
`libwebkit2gtk-4.1-0`、`libayatana-appindicator3-1` 与 `librsvg2-2`。Xvfb 软件渲染标志仅供 CI 使用，绝不
作为用户配置发布。

## 手动更新策略

桌面不自动检查更新，也不定时轮询或自动重试。检查、下载与安装各自需要一次显式的用户动作；关闭 Settings
或正常退出都不会安装任何东西。同版本与降级清单不合格。

生产检查只在打包的、受支持的 stable/canary 应用中启用，且其烘焙的发布元数据提供非空的 HTTPS 更新器基础
URL。该元数据是唯一的 feed 权威；开发与标准 artifact 测试接缝不暴露更新器。安装保持在其打包的频道上，而
UI 把 Electrobun 的 canary 频道称作 **nightly**。发布资格属于 [[module-ci-release]]。

Electrobun 调用与生命周期状态留在桌面 `updates` 模块之后；控件留在 web 客户端，优雅宿主关闭留在 server。
冻结的可选 `__THINKRAIL_NATIVE_UPDATES__` preload 桥暴露类型化状态、检查/下载/安装动作与订阅，而不把桌面
SDK 导入 web 代码。**Install & Restart** 通过既有退出协调器应用已准备好的发布；活动 agent 与 PTY 可能被
终止，没有第二次确认或渲染进程准备握手。

退出协调保留其完成动作。Electrobun 2.0.1 的第一次 `applyUpdate()` 在武装其替换 helper 之前，就在异步的
`before-quit` 否决处返回。更新意图等待同一个幂等的宿主关闭，等待第一次 SDK 调用收敛，然后在已完成的守卫下
恢复 `applyUpdate()`；普通完成仍然只调用 `Utils.quit()`。第二次交接失败会报告一个原生错误并退出，而不是留下
一个没有 server 的窗口。SDK 替换回滚不是应用健康或用户数据回滚。没有更新代码/feed 身份的既有安装需要一次
手动引导安装。

参考：[钉住的更新器交接](https://github.com/blackboardsh/electrobun/blob/v2.0.1/package/src/sdks/main/core/Updater.ts#L2220-L2330)。

## 验证

[[module-artifact-tests]] 拥有扩展应用/首次安装冒烟、共享宿主探测、原生导航/preload 验证与安装器隔离。每个
原生发布目标都必须通过两层冒烟；[[module-browser-e2e]] 另外覆盖针对打包宿主的线上协议支持行为。任何平台的
原生结果都不得从另一个平台的运行推断。签名下载验收需要 [[module-ci-release]] 中描述的私有发布检查。

## 后续

共享/远程后端配置、配置选择、多窗口/深链接路由、CEF，以及一旦 blackboardsh/electrobun#558 发布就移除
`user32` 样式位垫片。上述更新 feed 发布仍由发布方拥有。
