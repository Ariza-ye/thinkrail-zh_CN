---
id: submodule-web-themes
type: submodule-design
status: active
title: themes — 打包清单目录与应用
parent: module-web
depends-on: [module-contracts]
tags: [ui, themes]
---

## 职责

浏览器侧的主题引擎：在引导时校验打包的声明式主题清单，拥有由此产生的固定目录，并原子地解析/应用活动调色板。
宿主只拥有那个不透明的固定 id，加上固定/系统模式与可选的浅色/深色配对；本模块拥有这些值在这个客户端上的含义，
包括操作系统配色方案观察与同外观回退。**新增一个主题 = 新增一个 `bundled/*.theme.json` 文件**（一次 PR +
重新构建）——不改代码、契约、CSS 或测试。

随附六个清单：标准的 **Dark** 与 **Light**（即配置的默认及其配对，未改动）、**Minimal Dark** 与
**Minimal Light**（Minimal 界面研究那种安静的中性表面层级、克制的绿色强调与中性 `bubbleAccent`，共享标准
配对的语法与终端调色板），以及两套带有更严格无障碍契约的 High Contrast 调色板。Minimal 只是用户在
Appearance 里挑的一个调色板，仅此而已：每个主题都渲染相同的角色，因此组件绝不按活动主题或其对比度元数据分支
来丢掉某个填充或边框。调色板无法通过清单键表达的东西，是对所有主题的产品决策，而不是某个主题。

## 边界

- **拥有：** 带版本的 `ThemeManifest` 契约 + JSON schema；打包的清单集合；目录构建与固定/系统解析；确定性的
  配对派生与同外观回退；操作系统配色方案的读取/订阅；原子地应用 CSS 自定义属性；带版本的首绘偏好提示；语义
  语法变量契约；Shiki 的通用 CSS 变量 TextMate scope 映射；以及为严格的桌面编辑器 API 适配同一份定义的 hex
  解析器 + Monaco 颜色键映射。
- **Public surface（公开接口）：** 仅 `index.ts`——`initializeBundledThemes`（同步引导）、`applyTheme` /
  `resolveTheme`、偏好感知的 `applyThemePreference` / `resolveThemePreference`、
  `deriveSystemThemePair`、`readSystemAppearance`、`onSystemAppearanceChange`、`getThemes`、
  `readThemeHint` / `writeThemeHint`，以及 manifest/descriptor/preference-result 类型，外加 Shiki 注册
  及其 `resolveThinkrailShikiTheme` 严格使用方适配器。
- **允许的外部依赖：** `@thinkrail/contracts` 提供不透明 id、主题偏好形状与配置的默认值；浏览器
  DOM/media/storage API 与 Vite 的构建期 glob；仅 Shiki 类型，用于给通用注册标注类型。
- **绝不触碰：** server/shared/pi；store、transport、panels、shell 或组件状态；任何形式的运行时主题注册或
  发现；可执行的主题代码；由清单提供的选择器/布局或任意 CSS。

## 清单契约

一个主题恰好是一个 `*.theme.json` 文件。Schema 版本 2 严格且自包含：id、label/order、浅色或深色的外观、
普通或高对比的元数据、一份完整的语义 UI 调色板、全部 16 个终端 ANSI 颜色，以及一份完整的语义语法调色板。
颜色值是规范的六位/八位 hex；两个选中文字前景覆盖可以显式设为 `null`，以保留使用方原生的前景色。不存在继承
或部分叠加。引擎拥有外观级效果、TextMate/Monaco scope 映射与 CSS token 映射，因此那些机制绝不泄漏进清单。
排版、间距、圆角、字体与动效仍是产品 token，而不是主题值。

**清单提供调色板，而不是角色。** 它回答*哪种颜色*；每种颜色*用来做什么*是由 `styles/colors.json` 声明的
语义层——`container-elevated-bg`、`feedback-warning`、`text-subtle`——它才是组件唯一命名的层，并拥有 alpha
刻度。正是这种拆分让一个主题成为一次调色板替换而无需改动组件，也正是本模块的变量（`--elevated`、
`--border-strong`、`--muted`）属于内部的原因：从组件里够到其中一个，就绕过了它所属的角色。见
[`styles/COLOR.md`](../styles/COLOR.md)。

**每个可被主题独立变化的角色各有一个键。** Schema 版本 2 把 `header` 从 `content` 中拆出，此前它同时写
`--bg-dark` 与 `--surface-content`，因此在每个主题里都把应用头部钉在了代码画布上。每个打包清单都让 `header`
等于它的 `content`，所以这次拆分没有改变任何像素——它让一个旋钮存在了。今后任何分化需要的也是这一手：一个
角色只有在清单为它提供了键时，才能在主题之间变化。

主要控件有一份显式的不透明填充契约：`accentSolid` 是它的静止填充，`accentHover` 是它的 hover 填充，
`onAccent` 是二者之上的标签色。独立的 `accent` 仍是前景/环/边框与色调来源。这让调色板可以改变不透明控件而不
悄悄改变每一处强调色调：Minimal 调色板让自己的静止填充与强调色一致，而标准 Light 保留它更亮的独立实心填充。

**清单→变量名是派生的，不是映射表。** 一个键写入它 kebab-case 后的名字——`borderStrong` →
`--border-strong`，`editorSelection` → `--editor-selection`。`runtime.ts` 在把调色板写到文档根时应用这条
规则，`scripts/colors.ts` 在解析一个角色的 `from` 时应用同一条规则；两者都不查表，因为那张表*正是*漂移路径
（而且它的名字——`info` 用 `--blue`、`borderStrong` 用 `--border2`——早已不再描述它们所装的东西）。
`colors.json` 里没有 `palette` 分区，也没有生成的 TypeScript：`generate-colors.ts` 只产出一个产物
`styles/generated/colors.css`（角色、按外观的 `effects`，以及 Tailwind 的 `@theme inline` 映射）。让两个
列表保持诚实的是覆盖率而非映射——除非**每个** `THEME_COLOR_KEYS` 条目都至少被一个角色认领，否则生成器拒绝
运行，因此一个加进清单 schema 却被 `colors.json` 遗忘的键无法进入构建，而一个角色命名了不存在的键也会在同一
道门禁上失败。

**清单还必须易读，而不仅仅是完整。** `schema.test.ts` 对每个静止表面（`background`、`content`、
`sidebar`、`header`、`elevated`、`input`）强制 WCAG AA，并对临时的 `hover` 表面强制更低的 3.0 下限——
后者是我们自己的线而非标准的线，好让一个从别处借来的主题保留它的标志性颜色。`accent` 与 `success` 仅在
`input` 上获得豁免：二者都不会作为文字渲染在控件上。另外，`onAccent` 必须在**两个**主要填充（`accentSolid`
与 `accentHover`）上都通过 AA，因此主题不能把自己的 hover 步压暗到吞掉主要按钮自身标签的程度。仅易读性被
证明不够：High Contrast Light 曾把它自己的 `hover` 填充——即选中/hover 控件角色的调色板来源——以 1.05:1
发在它自己的侧边栏上，一个看不见的选中态，而所有检查全绿，因此测试套件还钉住了 hover 相对表面的**可区分性**
（对每个静止表面 ≥ 1.15——包括 `content`，因为 PlanPane 与工作台背景在那里承载 hover 控件，而 Light 最初
的 `hover == content` 调色板让它们不可见）。一个读起来糟糕的新清单无法合入；理由见
[`styles/COLOR.md`](../styles/COLOR.md)。

**一个 `contrast: "high"` 的清单被要求静止 AAA（7.0）、甚至 hover 也要满 AA（4.5）**，`hint` 除外。高
对比正是这两个主题存在的全部理由，所以普通的 AA 底线对它们是错误的门禁：它会让其中一个退化成仅仅够用的主题，
而所有检查依旧全绿。这不是假设——当调色板变绿时，High Contrast Light 的 `accent` 从 8.98 落到 5.17、
`success` 从 7.39 落到 5.08，却什么也没失败。更严格的下限才让「高对比」成为测试套件强制的属性，而不是清单里
的一个标签。

打包文件由构建期 glob 发现，而不是在代码目录里指名，并在引导时全有或全无地校验。文件是我们自己的，因此任何
无效或重复的清单、缺失的配置默认值，或一个不含至少一个浅色和一个深色清单的目录都会**大声失败**（单元测试在
合入前捕获它）。运行时校验与 JSON-schema 校验一致。

## 运行时契约

目录在 `initializeBundledThemes` 运行之后就固定了（pre-React，在 `main.tsx` 中）；一个新主题要等一次重新构建/
重启之后才出现。固定模式解析 `AppConfig.theme`。系统模式读取
`matchMedia("(prefers-color-scheme: dark)")` 并解析该外观配置的槽位；媒体 API 缺失、失败或不匹配都意味着
浅色。该查询是普通浏览器与 Windows、Linux、macOS 上原生系统 webview 唯一的跨平台路径——没有原生外观分支，
`prefers-contrast` 被刻意忽略。

一个配置的系统槽位只有在它的清单存在且声明了所需外观时才可用。否则解析会完整保留宿主的那个不透明值，并选择该
外观中排序最靠前的普通清单，再退到该外观中排序最靠前的任意清单，以 label/id 打破平手。首次启用时，解析出的固定
主题填充它自己的槽位；对面的槽位选择对比度匹配的、排序最靠前的主题，然后是同样的普通/任意回退。已持久化的配对
在之后的启用中复用。

从使用方的视角看，应用是原子的：写入完整的变量集、`color-scheme` 与语义对比度元数据，最后才通过 `data-theme`
发布生效的清单 id，这样通用使用方（Monaco/xterm/mermaid）可以在那个信号之后重建，而不会观察到半个调色板。与
目录无关的 `onThemeSwap` 订阅位于 `@thinkrail/ui/theme`；应用与扩展的使用方使用它，而不是自己手搓
MutationObserver。主题选择与应用留在这里。当清单值为 `null` 时，选中文字的前景色会被移除。系统模式下，一个
媒体查询监听器在 `change` 时就地重新应用；它绝不写配置、也不影响另一个客户端，其所有者必须在偏好或组件生命
周期变化时清理它。

首绘提示是固定 id、模式与可选配对的带版本快照——不是最后生效的 id。遗留的字符串按固定模式解析；格式错误的
数据变成固定的 Dark 默认。启动时会拿当前媒体查询同步解析该快照，因此应用关闭期间发生的时段切换会在首绘时
得到体现。宿主同步的配置总会在第一次 welcome 之后把它调和；在此之前，外壳保留并观察该提示，而不是用 store
默认值覆盖它。存储在有原生外壳已注入的稳定偏好适配器时使用它，否则使用 localStorage，这样在 Electrobun 变化
的 loopback 源下依然存活，同时又不给启动器任何主题语义。

Shiki 使用一个仅限 web 的 TextMate 注册，其颜色是语义 CSS 变量（Shiki 显式支持的一种模式）。聊天直接消费该
注册，无需重新高亮。Monaco 把同一份注册经由 `resolveThinkrailShikiTheme` 传入：它把每个可用的 CSS 变量规范
化为 hex，省略不可用的值以便 Monaco 继承来的基础仍可用，并附上 token 拥有的编辑器 UI 映射；面板提供
`cssColorToHex`，因此主题不保留任何回到 `lib` 的依赖。Monaco 从外观/对比度元数据挑选它的基础，绝不用已知
的主题 id，并在一次原子主题替换之后以同一个固定名字替换解析出的注册。因此新增一个主题从不新增 Shiki 导入、
CSS 选择器或编辑器专属的目录条目。单元覆盖钉住了精确匹配与错误外观的解析、两个回退层级、配对派生、缺失信号时
的浅色行为、遗留/带版本提示、媒体监听器清理，以及共享语法映射的完整 hex 解析。

## 非目标（刻意）

用户不能新增主题，除非经由源码 PR。运行时注册、扩展打包/加载、热发现、外部主题格式、操作系统对比度跟随、时段/
时区 UI，以及信任/优先级模型都属范围之外；如果运行时主题有一天会变，要重新引入的接缝是在同一个目录之前加一条
受校验的注册路径。
