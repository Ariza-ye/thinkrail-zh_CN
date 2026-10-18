---
id: submodule-website-vibecoding
type: submodule-design
status: active
title: Vibecoding 落地页体验
parent: module-website
tags: [website, marketing, vibecoding, react]
---

## 职责

直接服务在 `https://thinkrail.ai/vibecoding/` 的、面向特定受众的体验，以及作为同一模块之上的
额外路由、在 `https://thinkrail.ai/agentic-development/` 与 `https://thinkrail.ai/agentic-ide/`
提供的同一体验：它的 header 导航、hero 与 quick start、桌面下载控件、脚本化聊天、原则与能力、
编排动画、工作流说明、行动号召、metadata，以及路由本地的呈现。它保留已批准的视觉设计，而
父网站拥有路由组合、analytics、SEO 聚合、部署与跨路由校验。

`index.ts` 是唯一的公开接口。每个路由都收到可抓取的服务端渲染内容，然后为有状态的交互 hydrate
一个 React island。

两个 prop 按路由参数化 `Landing`。`heroTitle` 默认为 vibecoding 的文案（"Vibe code
without losing control."）；`/agentic-development/` 传入 "Agentic development without losing
control."。`positioning`（`"control" | "compounding"`，默认 `control`）选择营销文案变体：
`/agentic-ide/` 传入 `compounding`，hero 标题为 "The agentic IDE that gets
better every time you use it."——这是一次定位测试（2026-02），把 ThinkRail 框定为随使用而变好的
IDE（活的规范、可复用的技能、即将到来的扩展），而不是"控制"的框定。在 `compounding` 下，
hero 副标题、聊天演示脚本（增加一段 "how do you get better over time" 对话；worktree 那段
对话保留）、原则、能力（外加一张即将到来的 "Extensions" 卡片）、spec-first 标题/副标题以及
CTA 都会替换；其他每个小节都是共享的，文案变体就放在各自组件旁边，以 `Positioning` 为键。
Analytics 只通过父模块按路径派生的 `content_key`（`agentic-ide` 对比 `vibecoding` /
`agentic-development`）区分这些单元；该变体不增加任何事件属性、analytics 导入或 CTA 位置。
完整复制模块被否决（2026-02）：约 25 个会漂移的重复文件，违背仓库的不重复规则。

agentic-development 与 agentic-ide 路由整体复用 vibecoding 身份：同样的 `siteMetadata`
title/description，同样的 `/vibecoding/` favicon、OG 图片与字标资源 URL，以及指向
`https://thinkrail.ai/vibecoding/` 的 canonical + `og:url`（决策，2026-02：内容近乎相同，因此
原始页面保持为搜索主页面；额外 URL 服务活动/测试/直链，并被排除出 sitemap）。`validateBuild.ts`
按路由钉住这一切，包括每个路由的 hero 标题以及每个变体的定位标记——丢失一个 prop 会静默渲染
默认值。

## 边界

- 可以依赖 React 与 Lucide，加上它自己的 Tailwind 入口样式表与 `public/vibecoding/` 下检入的
  资源，以及父模块那个无框架依赖的 `src/installLinkShare.ts` 助手（它唯一可以导入的父文件；
  这条边位于 [[module-website]]）。它没有工作区依赖。
- 绝不能导入父模块的 IDE 外壳组件或手写样式表、博客模块、analytics、Astro 页面组合、包范围的
  构建校验、部署配置、另一个工作区，或复制来的 UI kit。
- Tailwind 使用 `source(none)`，并且只扫描本模块。它的 preflight、字体、token、工具类与动画
  只输出到 `/vibecoding/` 引用的那张样式表里；父模块的落地页与博客绝不能引用该样式表或 React
  renderer/组件 chunk。
- 该路由只呈现桌面应用。一个类型化的下载模型驱动紧凑的 macOS / Windows / Linux 标签，带一行
  兼容性说明与克制的动作；macOS 暴露 Apple Silicon，Windows 暴露 x64，Linux 暴露 x64 加 ARM64，
  且不猜测浏览器架构。没有任何命令行产品、启动器命令、安装命令复制控件、展开项、Windows
  shell 状态或 analytics 导入进入 vibecoding/agentic 体验。父网站的文档级委派观察其静态下载
  链接，并从所在小节派生 `quick_start` 或 `final_cta`；它还观察 GitHub 链接（`hero` 来自
  `#top`，`header`）。在检测到手机或平板时，quick-start 选择器在 OS 标签上方增加一个
  "Send link to my computer" 动作（在 hydrate 之后；静态 HTML 保持桌面优先）。它使用父助手
  并带 `quick-start` 锚点，在剪贴板兜底后显示 "Link copied"，并且只携带父委派所读取的
  `data-share-install-link` 标记。final CTA 不重复该选择器：它检测受支持的桌面 OS 以给出一个
  紧凑的下载动作，并把 Linux、未知/移动或备选平台的访客链接回 Quick start。每次下载都使用
  GitHub 无版本号的 `releases/latest/download` 别名。
- 初始 HTML 就包含完整的营销信息。JavaScript 增强控件与动画，而不是让内容变得可发现。
- 每个控件都可键盘操作。动效较重的效果在 `prefers-reduced-motion` 下解析为稳定的最终状态；
  当请求减少动效或文档被隐藏时，canvas 动画暂停。
- 组件使用映射到本模块语义 token 的本地 Tailwind 工具类。它们不携带原始颜色字面量或内联
  style 对象；运行时的几何使用 DOM/SVG 属性或由样式表拥有的自定义属性。
