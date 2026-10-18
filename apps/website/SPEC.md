---
id: module-website
type: module-design
status: active
title: 项目网站（thinkrail.ai）
parent: architecture
tags: [website, marketing]
depends-on: [module-website-analytics]
references: [module-ci-release]
---

## 职责

位于 `thinkrail.ai` 的项目公开网站：IDE 外壳式的落地页、其博客，以及在 `/vibecoding/`
提供的面向特定受众的 vibecoding 体验（同一体验也以每路由各自的 hero 标题与文案变体、
以及指回 `/vibecoding/` 的 canonical，在 `/agentic-development/` 与 `/agentic-ide/` 上提供）。
落地页与博客的创意巧思是**网站就是 IDE 本身**：用 HTML/CSS 忠实复刻 ThinkRail 外壳
（标题栏、项目栏、标签条、文件栏、终端、状态栏），其中心的"编辑器"就是正常滚动的页面
内容。每个落地页小节都伪装成 `website` 工作区的一个文件（`README.md`、`why.md`、
`features/*.md`、`INSTALL.md`、`CONTRIBUTING.md`）。**文件树是页面导航结构的唯一事实来源**，
它的选中状态随滚动响应（scroll-spy），就像编辑器在切换文件。顶部编辑器的**标签条由该
文件树导航派生**——不是手工维护的清单——并且是交互式的：活动标签**通过同一 scroll-spy
跟随当前可见的小节**，**点击标签会滚动到它的小节**。标签条对**每个唯一的小节目标恰好
保留一个导航标签**：文件树可以保持层级结构并在多行重复同一个目标，但重复的目标折叠为
单个标签，因此 scroll-spy 对每个小节始终只激活一个标签。标签条会**滚动**
（`overflow-x: auto`，滚动条隐藏）——在约 1500px 以下标签就会溢出，而每一个都必须保持
可达。它的底部隔线**按标签**绘制，不画在标签条上：标签条的边框位于滚动视口之外，活动
标签无法在那里覆盖它来并入内容。状态栏只是普通的版权页脚，不是实时的行数计数器。

`/vibecoding/` 刻意使用一套独立的视觉语法：[[submodule-website-vibecoding]] 以路由本地
（route-local）的 React island 加路由本地 Tailwind 拥有动画产品叙事与安装体验。它与网站
共享源、产物、analytics 初始化器、SEO 输出与部署——但不共享 IDE 外壳式的呈现。

不属于产品的一部分：应用里没有任何东西依赖这个公开网站，它也绝不会随二进制一起发布。

## 边界

- **独立部署的叶子模块。** 它唯一的工作区依赖是 [[module-website-analytics]]；它绝不能导入
  contracts、server、shared 或 web。它从不接入产品宿主的线上协议（wire）；
  [[submodule-website-attribution]] 单独拥有独立的、有界的 HTTP 认领协议与 D1 状态。
- **一份静态 Astro 产物加同项目内的认领函数，另有一处路由本地的框架例外。**
  落地页与博客保留原生 TypeScript + 手写 CSS：没有任何 React island，也没有任何 Tailwind
  样式表或运行时进入这些路由。[[submodule-website-attribution]] 单独引入 Pages Functions
  与 D1；只有 `/vibecoding/`、`/agentic-development/` 与 `/agentic-ide/` 可以使用共享的 React
  island 与 Tailwind v4。Astro 的 React 集成与 Tailwind Vite 插件是构建范围的工具；构建校验要求
  每个被允许的路由输出中恰好一个 island，并拒绝固定的落地页、博客、文章与认领输出中出现
  island。浏览器 analytics 工作区模块会被编译进静态输出。`@fontsource-variable/*` 包是
  构建期资源来源，其 woff2 文件被输出到 `dist/`。它们与 `apps/web` 共享，来自根
  `workspaces.catalog`——一份 pin 供两个应用使用，使网站的字体与应用完全一致。
  - *为什么选 Astro（决策，2026-08）：* 博客 + 规划中的文档触发了"自制 SSG"的绊线
    （RSS、OG、类型化 frontmatter、内容 DX）。Astro 底层就是 Vite——落地页逐字移植、
    `bun test` 套件保持不变——而 React 19 island 只在某个路由需要时才可用。被否决的方案：
    Next.js 静态导出（把 React 运行时发到静态页面，且不是 Vite 文化）、VitePress（Vue）、
    Eleventy（文档功能要自己拼装——又落进自制陷阱）、Hugo/Zola（非 TS 工具链，token/测试
    集成丢失）。先前的自制流水线（`scripts/build-blog.ts` + HTML 字符串模板）已删除。
  - *Lint 注意事项：* Biome 只解析 `.astro` 的 frontmatter，因此 `biome.json` 里对 `*.astro`
    关闭了 `noUnusedVariables`/`noUnusedImports`（模板中的使用对它是不可见的——每个告警
    都会是误报）。模板改由 `astro check` 覆盖。

父模块拥有路由组合的接缝；vibecoding 叶子模块没有同级依赖：

```text
src/pages/{vibecoding,agentic-development,agentic-ide}/index.astro ──▶ src/vibecoding (through index.ts)
src/pages/{vibecoding,agentic-development,agentic-ide}/index.astro ──▶ src/components/Analytics.astro
landing + blog shells                                              ──▶ src/components/Analytics.astro
src/main.ts, src/vibecoding                                        ──▶ src/installLinkShare.ts
```

`src/installLinkShare.ts` 是两个路由族都使用的、唯一一个无框架依赖的手机"发送链接"助手：
手机/平板检测（Android、iPhone/iPad/iPod，或带触控的 Mac）、分享 URL，以及先调原生分享、
失败则写剪贴板的投递方式。它不导入任何东西，因此 vibecoding island 可以复用它而无需
触碰 IDE 外壳。

- **字体自托管；网站不发起任何外部字体请求。** 字体包与字体栈从应用的 `typography.json`
  复制而来，而非导入——并且 `src/fonts.test.ts` 在测试时读取该 JSON，一旦漂移即失败，
  这正是复制之所以安全的原因。`--font-display` 镜像应用的 `brand` 字族——**Orbitron**
  （`@fontsource-variable/orbitron`，自托管），用于品牌元素（字标 + hero 标题）的独立展示
  字体，回退到 `--font-sans`；小节标题与标语使用界面字体（`--font-sans`），与应用一致。
- **品牌取值是复制的，不是导入的。** 主题调色板在编写时从
  `apps/web/src/themes/bundled/*.theme.json`（dark = 默认、darcula、light、gruvbox）提取到网站
  自己的、位于 `[data-theme]` 之下的 CSS 自定义属性；网站在构建时从不伸进 `apps/web`
  （应用的 token 假定主题引擎在运行时替换）。
- **IDE 外壳的页面框架（chrome）在组件中单一来源。** `src/components/BaseHead.astro` 是落地页与
  博客共用的唯一 head：charset/viewport、favicon、它们的全局样式表（打包了字体），
  以及绘制前主题守卫。`src/components/Analytics.astro` 不含呈现，且每个路由族只包含一次。
  `src/components/IdeShell.astro` 是落地页与博客渲染所用的唯一 IDE 外壳——图标 sprite、
  跳过链接、标题栏（工作区名字参数化：落地页为 `website`，博客页为 `blog`，各自配对的
  `workspace/<name> · from main` 分支标签）、左侧项目栏、右侧文件栏 + 终端、状态栏，
  以及 `main.ts` 脚本导入；中列是它的默认 slot，而右栏的 Files 行是它的 `filetree` slot。
  左栏以 `website` 工作区的子行承载网站的真实导航——**Landing**（`/`）与 **Blog**（`/blog/`，
  在索引页与每篇文章上均选中）为链接，**Docs** 置灰并带 `Coming soon` 小标签（无 tooltip——
  标签本身承载状态）——而其余 mock 行保留 `data-mock-hint` 处理；选中行使用与右栏活动
  文件行相同的强调色语法（同一条分组 CSS 规则）。`src/components/Copyright.astro` 是唯一的
  版权行（外壳状态栏）。深/浅主题模型位于 `src/theme.ts`（`localStorage` 里的显式选择 →
  回退到 `prefers-color-scheme`，实时跟随系统，历史 `darcula`/`gruvbox` 取值归一化为 dark）；
  BaseHead 中的内联 FOUC 守卫是它声明的孪生体——行为变更要同时更新两者。
- **有对比度下限的颜色要得到一个 `:root` token，绝不用区域内可继承的 `--accent`。**
  某个区域可能会重新指向 `--accent`（浅色主题的 kicker 胶囊就是这么做的；hero 也曾如此），
  因此读取它的后代可能继承到为另一个表面挑选的取值。`--link` 与 `--focus-ring` 在 `:root`
  上一次性声明为 `var(--accent)`，它针对*根*强调色解析——按主题变化，但区域覆盖够不到它。
- **主按钮（以及 hero 的品牌强调色）按主题区分，不是品牌常量**（决策在 2026-08 评审时被
  反转——浅色主题曾沿用深色主题的亮绿）：`--control-primary-*` token 镜像应用的语义映射
  （`bg = accent`、`hovered =
  accentHover`、`text = onAccent`，依据 `apps/web/src/styles/colors.json`），通过上面的根
  token 机制在 `:root` 上声明，其中 `--accent-hover` 按主题从应用的调色板复制。hero 标题像
  其他每个强调色元素一样跟随主题强调色；`palette.test.ts` 钉住 hovered 填充上的标签对比度。
- 所有营销文案都是静态 DOM 文本；JS 只做*增强*（scroll-spy、派生的编辑器标签条及其
  scroll-spy/点击导航、终端打字、聊天流式回放、主题切换器、复制按钮、star 数、安装平台选择）。
  页面在禁用 JS 时必须读起来是完整的（编辑器标签是 JS 构建的导航便利设施，其内容本来就可以
  通过滚动和文件树到达），且动画在 `prefers-reduced-motion` 下跳过。
- **由 `main.ts` 拥有的增强行为**（代码里不写理由——理由就在这里）：
  - *终端回放*：hero 安装选择器把所选 OS/shell 的主桌面动作与 **Browser UI via command line**
    展开项放在一起；静态标记里的启动器命令是终端的唯一事实来源，终端订阅它并在简短的安装
    记录之前将它打字输出。一个代际计数器在 OS 变更时使进行中的序列失效；点击*已完成*的终端
    （或它那时才出现的、键盘可达的 `Replay logo` 按钮）会重放 ASCII logo + 一个 GitHub CTA——
    绝不重放安装。logo 横幅的字符绝不改动；只有它的字号适配栏宽（resize 时重新适配）。
  - *工作树提示*（左栏）：在标记中初始可见（禁用 JS 时也能读到）；内联脚本在绘制前隐藏它，
    `main.ts` 在 5 秒后显示它——每会话一次（`sessionStorage`），在点击 Understood 之后不再
    出现（`localStorage`），若 `main.ts` 加载失败则有 10 秒的内联脚本兜底。对存储的访问完全
    做了防护（取存储对象本身就可能抛异常）。
  - *Mock callout tooltip*：`data-mock-hint` 区域（右栏标签、左栏剩余 mock 行）打开一个
    点击常驻的 callout，带 GitHub CTA——点击外部/Escape 关闭，Escape 恢复焦点。无障碍契约：
    触发器变为带 `aria-label` 的 `role="button"`（值取自 `data-mock-label`），打开时带
    `aria-expanded` + `aria-describedby`——没有 `aria-haspopup`（`tooltip` 不是允许的 popup
    取值）。`.rail-tabs` 的 callout 锚定到面板的实时边缘；其余放在触发器旁边，限制在视口内
    并在 resize 时重新定位。
- hero 的安装体验有紧凑的 **macOS / Windows / Linux** 标签，并让稳定版桌面应用成为每个面板中
  唯一展开的动作：macOS Apple Silicon DMG、Windows x64 setup ZIP，以及各自独立的 Linux x64 /
  ARM64 setup 归档。每个面板只带一行兼容性说明；它不在动作标签之外重复产品名、桌面/稳定性
  文案或格式。一个原生的 **Browser UI via command line** 展开项保留本地启动器，并说明
  `thinkrail` 会打开浏览器 UI，而不呈现第二个仅终端的界面。Windows 只在该展开项里增加
  **PowerShell / Command Prompt (cmd) / WSL** 标签：PowerShell 运行
  `irm …/install.ps1 | iex`，Command Prompt 启动 `powershell -c "irm …/install.ps1 | iex"`，
  WSL 使用 `install.sh`。收起的选择器在桌面上保持在 150px 以内、在移动端保持在 190px 以内。
  无版本号的 GitHub `releases/latest/download` URL 指向 [[module-ci-release]] 拥有的公开别名；
  网站不携带任何发布版本、更新器载荷名或私有产物知识。浏览器提示只挑选初始支持的桌面 OS；
  它们绝不隐藏其他选择、绝不推断 Linux CPU 架构，也不声称能检测有歧义的移动平台。每个面板
  都保留在静态 DOM 中；JS 把完整的回退呈现变成标签，而 `<details>` 拥有键盘/无 JS 的展开语义。
  详细的 `INSTALL.md` 小节是一个紧凑的平台行矩阵加一个 browser-UI-via-command-line 展开项；
  nightly/版本示例存在于发布文档中，而不是营销页面上。
- **手机访客会在 hero 选择器上方得到一个 "Send link to my computer" 动作**。它存在于静态 DOM 中
  但是 `hidden`，`main.ts` 只在检测到手机或平板时才显示它（桌面选择器仍在它下方可见；不隐藏
  任何平台）。激活它会打开原生分享面板，带入当前页面 URL，其 query 被替换为
  `utm_source=send_to_computer&utm_medium=share`、其 fragment 被替换为 hero 锚点，这样后续的
  桌面访问会记录到一次带标签的首次触点。没有 Web Share 时，或者分享因访客取消面板之外的任何
  原因失败时，它会复制链接并短暂显示 "Link copied"。该控件只为 analytics 委派携带
  `data-share-install-link`，别无其他。

## 分析（analytics）与同意

`src/analytics.ts` 是 [[module-website-analytics]] 之上的站点本地门面。它提供确切的生产主机名
`thinkrail.ai`、构建期的 `PUBLIC_POSTHOG_PROJECT_KEY`（绝不提交；生产 `site.yml` 从 `website`
环境的 secret 传入它，没有它就会在构建前失败，而预览与本地构建没有这个 key，保持静默），
并把 Cookiebot 的、能感知响应的 Marketing 状态以及同意就绪/接受/拒绝事件适配到共享的当前值/
订阅契约；共享模块拥有 PostHog 端点与 GTM 标识符、旅程持久化、类型化捕获、隐私配置与脚本
加载器。未知或被拒绝的 Marketing 状态保持无 cookie，且不携带旅程 ID。Localhost、`astro dev`、
每个 `pages.dev` 部署、`jetbrains.github.io` 地址以及同胞子域都不发送任何东西。

`src/components/Analytics.astro` 初始化该门面，然后每个文档初始化一次幂等的站点事件委派；它仍
是 IDE 外壳路由与 vibecoding 路由的 analytics 组合点。内容键从 `window.location.pathname` 派生：
`/` → `landing`，`/blog/` → `blog/index`，其他只含小写安全字符的路径变成去掉首尾斜杠的路径
（因此 `/blog/<slug>/` → `blog/<slug>`）。键只允许小写字母、数字、连字符与路径分隔符，并限制
在 105 个字符以内，足以容纳 `blog/` 加上最大 100 字符的文章 slug；无效路径不发出任何内容或
动作事件。query 与 fragment 字符串不出现在 `pathname` 中；带点的 `index.html` 路径不是路由
别名。新页面与新文章无需改动任何 analytics 代码。只有用 Analytics 组合出来的页面才加载它：
手写的 `src/pages/404.astro` 是独立的、无 analytics 的页面，用于未知 URL，而独立的
`/attribution/claim/` 页面也保持无 analytics。每个有效文档发出一次显式的 `content_viewed`，
带其派生的键。构建校验递归检查每个输出的 `.html` 文档，确认恰好一个 PostHog 与 GTM 加载器，
显式无 analytics 的 `404.html` 与 `/attribution/claim/` 输出例外，它们必须既不含加载器也不含
浏览器分析（analytics）。路由各自的布局、产物与 SEO 检查仍然聚焦于拥有它们的路由。

初始化时，只有当已同意的旅程已经存在时，才会记录当前页面触点；初始化之后出现的旅程不会重放
页面 URL 或 referrer，而旅程的移除会清除归因上下文。触点只携带有界的 UTM 值、referrer 类别、
时间戳与策略版本；它们不传递页面键。网站事件保留其 `content_key` 与旅程身份，因此 PostHog 能
把这些事件与应用的 `acquisition_linked.journey_id` 连接起来，用于落地页/末页分析。文档级的
`click`、中键 `auxclick` 与展开项 `toggle` 委派为静态安装控件加上埋点，而不改变它们的导航或
无 JS 行为。在每个初始化之后的 install CTA、下载或 CLI 事件之前，都会尝试当前导航触点，因此
在页面上授予的同意只能影响后续动作。只有那四个确切的稳定 GitHub 桌面别名算作下载。它们的
CTA 位置来自所在的 hero、安装小节、quick start、final CTA 或博客文章；一次被识别的激活发出
`install_cta_clicked`（`desktop`），随后发出 `download_started`。当存在已同意的旅程上下文时，
该激活会在 `download_started` 之前创建并存储一个规范的、按下载区分的 bridge ID，而该事件携带
同一个 ID。后续的桌面下载只会替换已存储的最新 bridge ID；没有同意的下载保持无 bridge。打开
任一落地页命令行展开项只发出 `install_cta_clicked`（`cli`）；关闭它则不发出。那次打开属于
浏览，而不是安装意图：主按钮点击一个 `[data-copy]` 控件、且其值是已知安装命令时，会发出
`install_command_copied`，带其 `sh`/`powershell`/`cmd` shell 以及 hero 或安装小节位置（其他
复制值不发出任何东西；手动选中并复制文本不会被观测到）。任何其他指向 `JetBrains/thinkrail`
仓库的链接（确切仓库、带 `#`/`?` 后缀，或子路径；绝不是同胞仓库或桌面别名）发出
`github_clicked`，带 `repo`/`releases`/`other` 目标，以及一个来自所在博客文章、final CTA、
quick start、安装小节、hero（`#readme` 或 vibecoding 的 `#top`）、header、footer、终端或
mock-callout tooltip 的位置——当没有任何一个包含它时为 `other`。GitHub 点击是独立信号：GTM
报表只把 `download_started` 与 `install_command_copied` 计为安装意图，因为访问仓库混合了加
star、浏览与安装。主按钮点击 hero 或 quick start 里的 `[data-share-install-link]` 控件发出
`install_link_share_clicked`；它记录这次激活，而不记录分享面板是否完成。这些事件中的每一个
都会先尝试实时导航触点，与现有动作一样。没有任何页面或子模块携带 analytics 导入、厂商配置或
另一个加载器；控件只暴露委派所读取的 `data-copy` / `data-share-install-link` 标记。

现有的 GTM 容器仍然是 Cookiebot 的控制面；路由特定的下游标签使用 `thinkrail.ai` 主机名条件加
Page Path，绝不使用另一个 GTM 容器。共享确切的 apex 源意味着 Cookiebot 扫描与浏览器同意状态
适用于全部三个路由族。

站点测试钉住生产主机身份、被禁用的主机、Cookiebot 适配器、每个路由键与稳定桌面别名、事件
派生以及初始化器的幂等性。共享包测试 PostHog/GTM、旅程与捕获契约。共享契约刻意不依赖
`posthog-js`、不粘贴 bootstrap，也不带静态 GTM `noscript` iframe。

非索引的 `/attribution/claim/` 路由属于 [[submodule-website-attribution]]；其无 analytics 的页面
只在当前 Cookiebot `CookieConsent` cookie 记录 Marketing 授权或 `-1` 时，才在加载时静默尝试
认领绑定，然后导航到 `/blog/`。该模块拥有认领协议与防框架嵌入保护。

## 部署

Cloudflare Pages 项目 `thinkrail-website` 为静态产物与认领 Functions 拥有生产与预览。固定版本的
Wrangler `4.124.0` 从 `apps/website` 部署，使其配置、`functions/` 与 `dist` 产物构成一次部署。
顶层的 `ATTRIBUTION_DB` 服务生产与本地 Pages/D1 工作流；生产在部署前应用已提交的归因迁移。
构建会编译 Functions，一次本地 Pages/D1 冒烟从检入的配置启动 Pages、应用真实迁移，并演练
create、bind 与 redeem。`.github/workflows/site.yml` 在推送触及本模块、
[[module-website-analytics]]、根包清单或 lockfile 时（外加手动触发）运行
`bun run --filter @thinkrail/website build`（`astro check`、Functions 的 typecheck 与构建、
`astro
build` 以及产物校验）。它在成功之前先验证提供商 URL。`thinkrail.ai` 是项目的自定义
apex 域；提供商 URL 是部署探针，不是产品身份。

生产并发绝不打消进行中的发布。Cloudflare 保留成功的生产部署作为回滚目标，因此回滚选择上一个
`main` 部署，而不是运行第二条托管流水线。

### PR 预览部署

`.github/workflows/site-preview.yml` 运行同一条构建命令，并上传到 `thinkrail-website` 中的
`pr-<number>` 分支。Wrangler 的 `env.preview` 覆盖让预览部署没有 D1 绑定；生产源守卫独立地
继续在访问 D1 之前对预览归因请求返回 not-found。确定性的别名
`https://pr-<number>.thinkrail-website.pages.dev` 以一条 sticky PR 评论和一条 `Website preview`
提交状态呈现，覆盖 `/`、`/blog/`、`/vibecoding/`、`/agentic-development/` 与 `/agentic-ide/`。
它会等待上述所有路由都能提供服务之后才公布 URL。

只有同仓库的 PR 会得到预览；fork PR 会跳过，因为 Cloudflare 凭据绝不跨过仓库边界。预览 URL
在其 PR 打开期间是公开的，且对分析（analytics）保持静默。单独的关闭工作流会识别 sticky 预览
标记，删除该 PR 分支的每一个部署，并把它的预览元数据标记为已退役；没有该标记的 PR 是无操作。
共享的并发组防止清理与进行中的发布竞争。更新的推送只取消该 PR 被取代的那个预览。

一次性设置使用 `CLOUDFLARE_API_TOKEN`（Pages:Edit 加 D1:Edit，用于已提交的归因迁移）与
`CLOUDFLARE_ACCOUNT_ID` 仓库 secret 创建生产分支为 `main` 的 `thinkrail-website`，然后在
提供商托管的主部署通过验证后挂上 `thinkrail.ai` 自定义域。token 权限更新必须落在第一个启用
认领的生产部署之前。

### 托管与已退役的主机名

Cloudflare 托管的 DNS 把 `thinkrail.ai` 路由到已验证的 `main` 部署。生产回滚通过 Pages 选择
上一个成功的 `main` 部署；旧托管不属于稳态的一部分。

`vibecoding.thinkrail.ai` 是一条 Cloudflare Single Redirect：主机名匹配、动态目标
`concat("https://thinkrail.ai/vibecoding", http.request.uri.path)`、状态 301、启用 query 保留。
它那条无源站的、经代理的 `192.0.2.1` 记录使该重定向在没有部署的情况下依然可解析。

## 博客

`/blog` 子站是一个类型化的 Astro 内容集合，覆盖 `content/blog/` 里的 Markdown 文章（每篇文章：
一个含 `index.md` + 可选 `images/` 的文件夹），由 `src/pages/blog/` 通过
`src/layouts/BlogLayout.astro` 渲染。携带真实安装指引的已发布文章遵循当前的桌面优先层级，
而不是冻结过时的、仅 CLI 的说明。

- **Schema 就是门禁**（`src/content.config.ts`，zod）：必填 `title`/`slug`/`date`/`author`，
  可选 `excerpt`/`draft`/`tags`。格式错误或保留的 slug、缺失字段、未知的 `author` 键，或两篇
  文章共享同一个 slug，都会**让构建失败**——没有静默的绿色部署。草稿在 `astro dev` 中渲染
  （作者预览、热重载），并被排除在生产构建之外（`src/blogCollection.ts`，索引、文章页与 RSS
  共用的那一个查询——最新优先、过滤草稿）。
- **URL 是目录式的**（`/blog/<slug>/`），在博客尚未发布时就已决定，因此没有东西被破坏；RSS 位于
  `/blog/rss.xml`（`@astrojs/rss`）。文章页携带 meta description（即摘要）、canonical、
  OG/article 标签。
- **代码块**：Astro 内置的 Shiki，双 `github-light`/`github-dark` 主题以
  `--shiki-light`/`--shiki-dark` CSS 变量输出（`defaultColor: false`），因此由网站的
  `[data-theme]` 切换——而不是媒体查询——来挑选调色板。在 `src/styles.css` 的 `.astro-code`
  下样式化。
- **YouTube 嵌入必须无 cookie**：作者写普通 iframe；Sätteri HAST 插件
  `src/youTubeEmbeds.ts`（Astro 7 的原生 Markdown 处理器——unified/rehype 流水线是我们不带
  的独立遗留包）把 `youtube.com/embed` → `youtube-nocookie.com` 改写，并在缺失时补上
  `title` + `loading="lazy"`。这保住了无同意横幅的立场。
- **框架：博客页活在 IDE 外壳里**，而不是独立的页面外框（决策，2026-08——先前独立的博客
  header/footer 已删除）。`BlogLayout.astro` 通过 `IdeShell.astro` 渲染：内容与落地页小节位于
  同一个可滚动的编辑器窗格中，处在一个共享它们确切几何的 `.blog-main` 容器里（一条分组的
  `.file-section, .blog-main` CSS 规则——刻意*不是* `.file-section` 类，因为它的排版级联会
  与博客内容样式打架）。打开一篇文章会在同一中央区域替换索引。**博客页上没有标签条**（落地页
  保留它的小节标签；页面级的 Landing/Blog 标签目前被明确否决）。右栏的 Files 列表显示已发布
  的文章（当前一篇为活动）；终端保留其静态安装记录——`main.ts` 的守卫让每个仅落地页的增强
  都失效（没有小节 → 没有 scroll-spy，没有选择器 → 没有终端回放）。文章卡片是整卡链接，只在
  边框上示意 hover（无下划线、无位移），并共享落地页特性卡片的表面，这使 `--elevated` 标签
  小标签在它们上面仍然可见。主题化：BaseHead（主题守卫、字体、analytics）+ 通过外壳
  `main.ts` 的 `src/theme.ts` 切换——与落地页相同的行为，一份实现。
- **作者是共享实体，不是逐文章的字符串。** 第二个集合（`authors`）通过 Astro 的 `file()`
  加载器加载 `content/authors.json`——一个以作者键为键的对象，schema `name` 必填 + `url`
  可选（存在 ⇒ byline 名字渲染为链接）。文章携带 `author: reference("authors")`，**必填**，
  因此引用完整性是框架的检查：拼错的键是构建失败，而作者改名或新增链接会一次更新每篇文章。
  解析集中在 `src/blogCollection.ts` 的 `postAuthor()`；没有页面内联这次查找。Avatar/role
  字段被刻意省略——没有渲染器的 schema 字段是死表面；两者都是后续可加。
  - *Byline 位置（决策，2026-08）：* **只在文章头部**，作为 `.blog-post-meta` 行的第一项
    （`author · date · reading time`），共享日期的提示色、字号以及一条分组的 `·` 分隔符规则。
    索引卡片、RSS 条目、OG/`article:author` meta、文章末尾的作者卡片，以及
    `/blog/authors/<key>/` 页面都被各自考虑过并暂时否决——共享实体让其中每一个都成为廉价的
    后续工作。
- **作者指南**：`content/blog/BLOG.md` 记录 frontmatter schema、作者档案、Markdown 特性、嵌入，
  以及本地预览循环（`bun run dev` 会热重载文章）。
  它们。主题化：BaseHead（主题守卫 + 字体）+ 通过外壳 `main.ts` 的 `src/theme.ts` 切换——
  与落地页相同的行为，一份实现；Analytics 仍是那个独立的共享 head 初始化器。
- **作者指南**：`content/blog/BLOG.md` 记录 frontmatter schema、Markdown 特性、嵌入，以及本地
  预览循环（`bun run dev` 会热重载文章）。
- **部署**：通过同一个 `site.yml` 工作流与主站一起部署；对
  `apps/website/content/blog/**` 的改动会触发重新构建。

## 发现与资源

一份 apex `robots.txt` 允许公开站点，并把爬虫指向 Astro 生成的 sitemap。sitemap 派生自同一个
静态路由构建，因此覆盖 `/`、博客索引与已发布文章，以及 `/vibecoding/`；
`/agentic-development/` 与 `/agentic-ide/` 被过滤出 sitemap，因为它们 canonicalize 到
`/vibecoding/`（见 [[submodule-website-vibecoding]]）。预览保留生产 canonical URL，不会成为
第二个搜索身份。

`public/favicon.svg` 是 IDE 外壳落地页/博客的标签页图标：品牌主绿上的圆角方块，承载黑色的
**header wordmark 的 TR 标记**（同样的 `viewBox` + 路径，不是重画的），居中并留有均衡的内边距
以在标签页尺寸下保持可读。它通过 `index.html` 中的
`<link rel="icon" type="image/svg+xml">` 接入；没有 `.ico` 回退。

`public/og.png` 是网站自身 hero 在 IDE 外壳内的捕获（深色主题、Landing 选中、终端安装记录
已完成、工作树提示可见）。`features/agent-chat.md` 小节里的记录来自应用在为本仓库工作时捕获的
一次真实 `pi` 会话。重新捕获：对构建后的站点执行 `astro preview`，在 1200×630 视口、
deviceScaleFactor 2（深色主题）下查看它，等待终端回放 + 栏内提示（约 7 秒），对 viewport 截图，
并把 2400×1260 的捕获缩小到 1200×630。

`public/vibecoding/` 拥有该路由独立的 favicon、1200×630 Open Graph 图片与渐变字标。它们的
公开 URL 仍在 `/vibecoding/` 下，而 Vite 生成的 chunk 仍留在站点范围的 `/_astro/` 根下，
因为一个 Astro base 服务所有路由族。
