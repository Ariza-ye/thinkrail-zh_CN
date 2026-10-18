---
id: module-ui
type: module-design
status: draft
title: 共享宿主 UI 原语
parent: architecture
depends-on: [module-contracts]
references: [web-color, web-spacing, web-typography]
---

## 职责

由应用与扩展的 web 两部分共享的、自有的 shadcn/Radix 原语。仅做呈现：
特性状态、主题选择与 token 生成仍留在应用中。

## 边界

原语以逐文件 `@thinkrail/ui/<primitive>` 子路径暴露，而不是一个根组件 barrel；这使
懒加载块保持独立，并保留 shadcn 的约定。`./utils` 暴露 `cn`；`./theme` 只暴露
`onThemeSwap`，即对完成后的 `data-theme` 信号的一个 DOM MutationObserver 订阅，
并带有显式清理。它对主题目录或偏好一无所知。`./i18n` 为原语、应用与扩展 web 两部分提供一个共享的、
React 响应式翻译运行时。应用安装
目录并选择生效的 locale；偏好持久化与系统语言检测留在此包
之外。英文源消息是回退键，采用整消息的具名插值。
翻译绝不处理用户内容或协议标识符。

工作区导入只能到达 `contracts`。外部依赖是 React、Radix、cmdk、
react-resizable-panels、Remix Icon、class-variance-authority、clsx 与 tailwind-merge。宿主内部、
pi、应用 store、传输层与主题运行时被禁止。token 仍是全局 CSS 变量，生成于
`apps/web/src/styles` 之下；工具类遵循 [[web-color]]、[[web-spacing]] 与 [[web-typography]]。
应用的 Tailwind 源与采纳守卫都包含本包以及各扩展的 web 部分。

## 原语不变量

逐文件的接口是 `button`、`switch`、`dialog`、`dropdown-menu`、`context-menu`、`menu-styles`、
`popover`、`command`（cmdk 组合框主体）、`textarea`、`tooltip`、`resizable` 与 `toast`，连同
`utils`、`theme` 和 `i18n`。`menu-styles` 由菜单原语与自定义的应用菜单行共用。

- Button 变体是 `default`/`destructive`/`outline`/`ghost`/`soft`；destructive 用于确认不可逆
  操作，而 `soft`（主色着色的表面 + 主色文本）标记一个显眼的次要操作，例如
  提供商 Sign in / New template。Switch 暴露原生禁用行为与 `role="switch"`/`aria-checked`，而不是可见的
  On/Off 文本。每个模态对话框的遮罩都携带 `data-modal-layer`，`useModalLayerOpen()` 报告是否有
  一个处于打开状态：它让调用方无需一个对话框注册表就能区分“被某个模态框遮住”与自身不可见，
  且与 `aria-hidden` 如何对待实时区域无关。Dialog 接受 `hideClose` 用于无边框表面。`DialogPanel`
  就地渲染 Radix 内容，不含传送门或遮罩，用于调用方定位的非模态对话框；标题/角色语义、Escape
  关闭与焦点归还仍归 Radix 所有，同时周边 UI 保持可交互。
- React 19 的 ref 穿过各控件；dialog/popover 的传送门保持无障碍焦点与滚动
  行为。Popover 接受一个宿主 Dialog 容器以兼容滚动锁定。
- 仅图标控件使用 `IconTooltip` 加 `aria-label`，而不是原生 `title`；一个根级 `TooltipProvider`
  设置延迟。原生 `title` 只保留给非控件的截断回退，或 provider 之外的表面
  （应用自己的复查小组件）。`wrapTrigger` 为被禁用的控件或另一个 Radix 触发器提供那个可交互的 flex
  span，隔离它们的 `data-state` 值；调用方不要手写那个
  包装器。应用、SDK 与扩展 web 的调用点测试都会强制执行这一约定。
- 上下文菜单与下拉菜单共用菜单几何与 token 类：内容表面、圆角/阴影、
  条目/图标间距、分隔符、语义化操作颜色、焦点行，以及视口碰撞行为。
  上下文菜单额外加入指针位置的右键/触摸长按锚定；特性自己拥有启用的手势
  与操作。下拉菜单在垂直方向上以 60vh 与 Radix 可用高度中的较小者为界，
  可滚动且横向溢出隐藏，因此长行会截断而不是滚动。
- Toast 暴露 `ToastProvider`/`Toast`/`ToastViewport`/`ToastTitle`/`ToastDescription`/`ToastAction`/
  `ToastClose` 与 `toastVariants`（`error`/`success`/`warning`/`info`）。严重程度是中性
  `bg-container-elevated-bg` 背景上一道统一的语义化边框（`border-feedback-*-muted`）。`ToastAction`
  不带样式：调用方通过 `asChild` 提供控件。队列所有权、图标与通知
  生命周期留在应用中（`panels/Toaster` 组合这些原语）。
- Resizable 手柄在其前缘画一条 1 px 的线；指针命中区域只延伸到
  后一个面板内（细指针边距 1 px），因此前一个面板尾缘的滚动条保持
  可用。不存在抓握变体。
- 原语只使用宿主的 token 工具类，绝不使用 shadcn 默认的 oklch 调色板。

代码高亮刻意缺席：`CodeBlock` 与 shiki 依赖应用的主题注册，
在第二个扩展需要那个接缝之前保持为应用本地。
