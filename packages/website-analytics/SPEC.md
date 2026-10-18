---
id: module-website-analytics
type: module-design
status: active
title: 共享网站分析（analytics）
parent: architecture
references: [module-website]
tags: [website, analytics, privacy]
---

## 职责

由统一公开网站消费的浏览器分析（analytics）策略。它是 PostHog EU 端点、浏览器旅程状态、
类型化事件捕获与加载器，以及 Google Tag Manager 容器与加载器的唯一来源。消费方提供其确切的
生产主机名、构建期注入的 PostHog 项目 key，以及营销同意的来源；本包从不确定哪个产品 URL、路由或
同意管理器才是生产。

## 边界

- **Public surface（公开接口）：** `src/index.ts` 导出配置/事件/同意类型以及
  `createWebsiteAnalytics({ productionHostname, postHogProjectKey, marketingConsent })`。返回的门面暴露一个
  纯主机名配置函数、一个幂等的浏览器初始化器、当前/订阅式的旅程访问，以及对
  `content_viewed`、`install_cta_clicked`、`download_started`、`install_command_copied`、
  `github_clicked` 和 `install_link_share_clicked` 的类型化捕获。CTA 位置是封闭的
  `hero | install_section | quick_start | final_cta | blog_post` 集合；`github_clicked` 用
  `header | footer | terminal | mock_hint | other` 拓宽它，并携带一个封闭的 `repo | releases | other` 目标；
  `install_command_copied` 携带一个封闭的 `sh | powershell | cmd` shell，且只限 hero/install-section 位置；
  `install_link_share_clicked` 只限 hero/quick-start 位置。下载的平台、架构与产物值都是封闭联合类型。
  网站为已同意的桌面下载提供 `bridge_id`；该属性保持可选，因此无桥接的下载同样有效。
- **无依赖的浏览器模块。** 它使用类型化的 DOM API，没有任何运行时包或工作区依赖。
  它绝不导入某个网站、应用的分析接收端、contracts、server 或 shared。
- **构建期边界。** [[module-website]] 把这份源码编译一次进它的静态产物。因此本包的一次变更会触发该站点的
  生产工作流与 PR 预览工作流。
- **不含站点知识。** 页面结构、路由到内容键的映射、导航、部署提供商、Cookiebot 全局/事件、同意 UI，
  以及生产主机名都留在消费方网站模块中。本包只消费一个当前值/订阅适配器。

## 运行时契约

工厂的纯配置函数只有在被观察的主机名与所提供生产主机名完全相等、且所提供的 key 非空时，
才返回完整的 PostHog 与 GTM 设置。localhost、IP、提供商预览、同胞子域、其他任何主机，
以及任何无 key 的构建都产生空配置。初始化器在触碰 DOM 之前应用同一道门，
并且在被再次调用时不会追加重复的厂商脚本。

PostHog 通过团队已有的 EU Cloud 项目实现渐进增强：

- `array.js` 与事件摄取使用 `p.thinkrail.ai` 上第一方受管的反向代理；`ui_host` 保持为
  `eu.posthog.com`，以便生成的链接指向真正的 PostHog 应用。
- PostHog 保持无 cookie：`cookieless_mode: "always"`、`respect_dnt: true`、
  `disable_session_recording: true` 和 `person_profiles: "identified_only"`。自动捕获与页面浏览保持启用。
  PostHog 项目中必须保持启用无 cookie 的服务端哈希模式；其每日盐使非旅程的跨日唯一访客计数
  是近似值。
- 一次已确认的 Marketing 授权会读取或创建一个经校验的随机第一方旅程 ID，并把它注册给后续事件。
  未知同意绝不访问存储：在授权之后它清除内存中的注册、通知旅程订阅者，
  并剥离已排队的 `journey_id`/`bridge_id`，同时为重新授权保留已存储的 ID。已知的拒绝会移除已存储的 ID
  与注册。当前/订阅式的旅程访问在已授权期间只暴露那个经校验的内存值，
  绝不读取存储，也绝不回溯性地充实更早的捕获。
- 类型化捕获以生产为门控，并且只保留最近 100 个事件直到 PostHog 完成初始化。
  预览/已禁用的宿主从不排队、不持久化旅程状态，也不触碰厂商客户端；加载器或初始化失败会清空并
  为该文档禁用队列。
- 公开的 `phc_…` 项目 key 预期出现在生产静态 bundle 中，绝不出现在仓库里；消费方在构建期注入它。
  宿主侧的应用接收端保持独立，并直接发送到 PostHog EU，因为它不存在浏览器广告拦截的顾虑。
- 加载器使用类型化的脚本注入，而不是 `posthog-js` 或粘贴的压缩引导代码。代理的 `array.js`
  建立 `window.posthog`；初始化在其 load 处理器中发生。

GTM 容器 `GTM-WDW2DZW4` 在同一道生产门之后与 PostHog 一起加载。不发出任何静态的 `noscript`
iframe，因为它无法遵守那道门。GTM 本身不存储任何东西，但容器中配置的任何设置 cookie 的标签都会重新
为公开站点开启同意要求；容器所有者负责那次复查。路由专属的下游标签以 GTM 的主机名 + Page Path 条件表达，
绝不通过初始化另一个容器。

## 验证

包测试钉住厂商标识符（使用注入的测试 key）、URL、隐私选项、精确主机门控与
已禁用宿主的行为。消费方站点另行测试它所提供的生产主机名，使部署身份不会
漂移，而厂商策略保持不变。
