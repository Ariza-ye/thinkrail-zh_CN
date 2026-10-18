---
id: web-typography
type: submodule-design
status: active
title: ThinkRail 排版 — 单一 JSON 源，生成的 CSS，语义样式
parent: module-web
---

# 排版系统

**`styles/typography.json` 是排版的唯一真相来源。** 每个字族、字号、字重、行高、字距、变换与语义文字样式都住
在那里；应用随附的 CSS 是从它*生成*的。组件不得声明排版值，手写工具类不得新增排版值，其他任何文件也不得持有
指向它的别名——要改变任何东西的字体，就编辑这个 JSON。

```
styles/typography.json            the source (see typography.schema.json for the shape)
styles/typography.schema.json     the editor-facing contract: primitives + fully-resolved styles
scripts/typography.ts             load / validate / render — the only place CSS names are derived
scripts/generate-typography.ts    writes the CSS; `--check` fails when it is stale
scripts/validate-typography.ts    the enforced gate: shape + referential + policy validation
styles/generated/typography.css   GENERATED, committed, never edited by hand
```

| 命令 | 作用 |
|---|---|
| `bun run typography:generate` | 重新生成 `styles/generated/typography.css` |
| `bun run typography:validate` | 校验 JSON（形态、引用、策略） |
| `bun run typography:check` | 已提交的 CSS 过期或采用方式违反 token 契约时失败——pre-commit + `apps/web build` |

`bun test` 也会运行这些护栏：`styles/typography.test.ts`（源 + 生成输出）与
`styles/typographyUsage.test.ts`（跨应用源码、`packages/ui` 以及每个扩展的 web 半侧，使用共享的源码扫描器）。
`e2e/typography.spec.ts` 在真实表面上断言*计算后*的样式（hero、对话框/卡片标题、实体行、分支元数据、eyebrow、
Monaco、xterm、两个 markdown 表面、`<body>` 基础）。

> **关于 schema。** `typography.schema.json` 是编辑器通过 `$schema` 读取的契约——它在编辑时给出补全与内联
> 错误。它**不是**门禁：工具链里没有 JSON Schema 校验器，形态检查以及下面的每一条策略都实现在
> `scripts/typography.ts` → `validate()` 中。改了一处就要检查另一处。

## 原语与语义样式

**原语**是原始词汇——扁平的 id → 值映射。它们是系统中唯一的数字：

| 分组 | id |
|---|---|
| `fontFamilies` | `interface`（Geist Variable，所有比例 UI + 阅读文字）· `code`（JetBrains Mono Variable，仅代码）· `brand` → **Orbitron Variable**（自托管 `@fontsource-variable/orbitron`，品牌角色——`wordmark` + `hero`——专属的展示字体；它以前是指向 `interface` 的 `$ref`）。Orbitron **只含拉丁**，而 `brand.hero` 渲染项目自己的名字，因此字体栈在落到任何系统字体之前先回退到 *interface* 字体——非拉丁名字会落在 Geist（cyrillic/latin-ext/vietnamese，已打包）上，而不是落在 OS 提供的随便什么字体上 |
| `fontWeights` | `light` 370 · `regular` 400 · `medium` 500 · `semibold` 600 · `brand` 400 |
| `fontSizes` | `s10` `s11` `s12` `s13` `s14` `s16` `s18` `s20` `s24` `s44`（px） |
| `lineHeights` | `compact` 1.25 · `metadata` 1.25（12px→15px）· `ui` 1.3（14px→18.2px）· `code` 1.4 · `relaxed` 1.4（13px→18.2px）· `default` 1.3（14px→18.2px）· `reading` 1.45（14px→20.3px） |
| `letterSpacings` | `normal` · `loose` 0.02em · `wide` 0.05em · `widest` 0.1em · `brand` 0.5px |

行高刻度刻意是**密集的**（1.25–1.4）：Geist 在 14px 下的 x-height 为 7.4px（cap height 9.9px），所以以前
的 1.5–1.6 会在比字母本身还高的行之间留下一段空带——读起来接近双倍行距。阅读性散文——`body.reading`：聊天、
用户消息、文档——是刻意的例外，取 `reading` 1.45：在密集值下长回复读起来像一堵压缩的墙，因此阅读文字比 UI
chrome 保留更多行距。Monaco 与 Pierre diff 表面读取 `--tr-line-height-default` 并保持密集；两者都用整像素的
代码行（Pierre 的虚拟化器需要精确的行高）。`typography.json` 里的 `codeRow` 命名它的字号与行高，生成器产出
预舍入的 `--tr-code-row-height`，Pierre 的 CSS 与它的虚拟化器都读取它，因为 Safari 15.4 之前没有 CSS 的
`round()`。这些值刻意写成短的精确小数：生产压缩器会把自定义属性舍入到五位小数，因此像 18/14 这样的循环比值
永远落不到整像素上（它曾以 `17.9999px` 发布）。

**语义样式**才是组件使用的。每个只命名七个原语引用、别无其他，因此它确定性地解析——没有继承、没有按用法分支、
没有回退：

```json
"title": { "dialog": {
  "fontFamily": "interface", "fontSize": "s14", "fontWeight": "semibold",
  "lineHeight": "compact", "letterSpacing": "normal",
  "textTransform": "none", "fontStyle": "normal"
} }
```

一个样式也可以改为**别名**——`{ "$ref": "title.dialog" }`——意思是*与该样式完全相同*。规则如下，全部由
`typography:validate` 强制执行：

- 一个**规范定义**携带完整的七个值；
- 一个**别名**只携带 `$ref`，别无其他；
- 一个 `$ref` 必须命名一个**规范定义**——绝不能是另一个别名，因此**禁止链式引用**，解析就是一次直接查找；
- 缺失的目标，或指向自身的 `$ref`，会被拒绝；
- **两个规范定义不得持有相同的值**——那说明少了一个 `$ref`；
- 别名仍然产出自己的语义 CSS 类，因此 `.tr-title-card` 与 `.tr-title-dialog` 是两个类，背后是同一个定义。

`textStyles` 分组：**brand**（`hero`——Welcome 的文字身份；shell logo 是提供的矢量图稿）· **heading**（`xl`、
`lg`、`md`、`sm`——共享的文档标题刻度）· **title**（`dialog`、`card`→dialog、`section`、`compact`、
`entity`→body.reading）· **ui**（`default`、`metadata`、`eyebrow`、`labelPill`→eyebrow、`caption`——
10px/紧凑的大写徽标与方块首字母样式（行状态徽标、顶栏项目首字母），那里 `eyebrow` 的 18px 行高放不下、
`action`→title.compact、`emphasis`→title.compact）· **body**（`reading`）· **code**（`text`——基础的
13px 代码样式，`document`、`otp`、`textSmall`——用于表格单元格内联代码的 11px 代码样式）。`proseSystems`
为每个 markdown 表面持有一个条目，几乎全部是指向上述样式的别名。死别名不会保留：散文直接指向它使用的语义样式。

**20 个规范定义 + 30 个别名 = 50 个样式。**

有一条散文规则刻意*不*做成语义样式：`<strong>` / `<b>` 只获得**字重**（`--tr-font-weight-medium`），由生成器
写进每个 prose 系统。那里用一个完整样式会覆盖粗体文字所在元素的字号与行高。

JSON 里**没有** CSS 选择器、类名字符串、组件路径、用法清单、理由或审计数据。理由住在这个文件里。

## `<body>` 基础

`rootStyle` 是没有任何语义类的文字的排版——它是**一个 `$ref`，绝不是值**（今天 `{ "$ref": "ui.default" }`，
即 14px/370 的 interface 配 20px 行高）。生成器把它产出为 `@layer base` 内的 `body { … }` 规则，这把它放在
层叠中每个语义类*之下*：它是一层地板，绝不是组件可以依赖的东西。

为什么它是引用而非数值很重要：当基础持有自己的数字时，没有类的文字会以任何语义样式都未曾命名的字号渲染，于是
一个静默停止解析的类名看起来还算合理，而不是明显出错。因此 `styles/global.css` 只声明**颜色与渲染**——没有
字族、字号、字重或行高。

Tailwind 的 preflight 默认值（`index.css` `@theme inline` 中的 `--font-sans` / `--font-mono`）指向同一批
生成的 token，因此即使系统尚未触及的元素——一个裸 `<pre>`——也以系统选定的字体渲染。那个映射同时启用的
`font-sans` / `font-mono` 工具类在调用点被禁止。

## 组件如何使用它

生成器机械地为每个语义样式派生一个类：

| 源 id | 生成的类 |
|---|---|
| `brand.hero` | `.tr-brand-hero` |
| `heading.xl` · `heading.lg` · `heading.md` · `heading.sm` | `.tr-heading-xl` · `.tr-heading-lg` · `.tr-heading-md` · `.tr-heading-sm` |
| `title.dialog` · `title.card` · `title.section` · `title.compact` · `title.entity` | `.tr-title-dialog` · `.tr-title-card` · `.tr-title-section` · `.tr-title-compact` · `.tr-title-entity` |
| `ui.default` · `ui.metadata` | `.tr-text-ui` · `.tr-text-metadata` |
| `ui.eyebrow` · `ui.labelPill` · `ui.caption` · `ui.action` · `ui.emphasis` | `.tr-text-eyebrow` · `.tr-text-label-pill` · `.tr-text-caption` · `.tr-text-action` · `.tr-text-emphasis` |
| `body.reading` | `.tr-text-reading` |
| `code.text` · `code.document` · `code.otp` · `code.textSmall` | `.tr-code-text` · `.tr-code-document` · `.tr-code-otp` · `.tr-code-text-small` |
| `proseSystems.<id>.*` | `.tr-prose-<id>` + 每个一个元素选择器 |

原语 token 也产出为自定义属性——`--tr-font-family-code`、`--tr-font-size-s11`、`--tr-line-height-default`、……
——供那些无法使用类的表面使用。

**层叠层。** 三个层级，全部刻意：token 块不带层（自定义属性没有什么可竞争的），`<body>` 基础位于 `@layer base`，
语义类位于 `@layer components`。Tailwind v4 把层排序为 `theme, base, components, utilities`，因此语义类胜过
基础，而调用点的 Tailwind 工具类仍然覆盖它所命名的那一个属性——这正是让 `italic` 与 `leading-tight` /
`leading-snug` 能在语义类旁边生效的原因。不带层地产出这些类会压过每个工具类并静默取胜。

调用点的规则：

- **排版 = 恰好一个语义类。** 绝不组合 `font-*`、`text-<size>`、`tracking-*` 或 `uppercase`。例外是
  `italic` 与 `leading-*`：调用点可以加一个来覆盖那一个属性（见*层叠层*），这就是少数行与空状态带着它们的
  原因。
- **颜色留在调用点**，作为语义颜色 token（`text-text-muted`、`text-text-subtle`、条件性的 active）——见
  [COLOR.md](./COLOR.md)。活跃/选中状态是**颜色**变化——绝不是字重变化。
- **`<pre>` 与 `<code>` 总是命名一个样式**，即使在已经有一个样式的容器里。Preflight 直接针对这些元素，而一条
  直接匹配的规则胜过继承来的字族，因此一个裸 `<pre>` 会以与它的 `tr-code-text` 父元素*不同*的等宽字体渲染。
  由 `typographyUsage.test.ts` 钉住。
- 间距、截断、布局、hover 与状态类不受影响。

```tsx
<span className="tr-text-eyebrow text-text-muted">Projects</span>
<h2 className="tr-title-dialog text-text-default">{title}</h2>
<code className="tr-code-text text-text-subtle">{command}</code>
```

**当元素不属于你时。** 一个渲染自己内部 DOM 的第三方组件（cmdk 的分组标题）无法通过任意变体得到类——
`[&_[x]]:tr-text-eyebrow` 什么也不产出，因为 Tailwind 会静默丢弃它不认识的类名。改为传入一个节点
（`heading={<span className="tr-text-eyebrow">Remote</span>}`），或把该元素留给 `<body>` 基础。
`typographyUsage.test.ts` 会在任何生成器未产出的 `tr-` 类上失败，如今整个失效模式就是这样被捕获的。

## prose 系统

Markdown 通过 `proseSystems` 渲染：每个表面一个条目，各自拥有**同一套固定元素集合**（校验会拒绝缺少其中之一的
系统，或添加了没有选择器的元素），各自命名自己的字体。目前存在两套：

| | `chat` (`.tr-prose-chat`) | `doc` (`.tr-prose-doc`) |
|---|---|---|
| mounted by | `chat/Markdown.tsx` | `panels/MarkdownPreview.tsx` |
| body, blockquote, lists | 14 / 370 / 1.45 | 14 / 370 / 1.45 |
| h1 | 18 / 600 | **24 / 600** |
| h2 | 14 / 600 | **20 / 600** |
| h3 | 12 / 600 | **18 / 600** |
| h4 | 12 / 500 | **16 / 600** |
| h5 | 12 / 500 | 14 / 600 |
| h6 | 10 / 500 uppercase | 12 / 600 uppercase |
| 行内代码 | 13 mono | 13 mono |
| 围栏代码 | 13 mono / 1.54 | 13 mono / 1.5 |
| 表格正文 / 表头 | 12 / 370 · 12 / 600 | 14 / 370 · 14 / 600 |
| 表格单元格内行内代码 | **11 mono / 1.5**（`code.textSmall`） | 13 mono（`code.text`） |
| `strong` / `b` | weight 500 only | weight 500 only |

**为什么是两套。** 一个聊天气泡是一串短消息：那里的标题是分隔符，气泡内一个 24px 的 h1 是在喊。一个渲染出的文件
是一份文档：它的标题必须明显大于段落，否则结构就消失了。一套共享刻度无法两者兼得——在正文 14px 加一套紧凑刻度
的情况下，六个标题层级里有四个落在正文尺寸或更小，这正是 `doc` 系统存在要解决的问题。校验强制这一点：
`doc.h1`–`doc.h4` 每个都必须**大于 `doc.body`**，且 h1→h6 的阶梯绝不能倒置。`h5` 停在正文尺寸、`h6` 在它之下，
两者都是 semibold 且 `h6` 大写——这是每个 markdown 渲染器最终都会定下的惯例，因为文档基本不会嵌到那么深。

两套系统共享它们的规范定义：`chat.h1` 与 `doc.h3` 都是 `{ "$ref": "heading.md" }`，各处的正文都是
`body.reading`。28 个 prose 条目里只有 3 个是它们自己的规范定义。

`strong` / `b` 在两套系统里都只获得**字重 500**——字族、字号、行高、字距、变换与颜色都从外层元素继承，因此标题里
的粗体保留标题的字号，单元格里的粗体保留表格的字号。

调用点的「prose 皮肤」只承载间距、版心与 chrome（`chat/Markdown.tsx` = 气泡节奏，`panels/MarkdownPreview.tsx` =
文档节奏、标题规则、表格 chrome）。绝不要给皮肤加排版类或排版值；改为改 `proseSystems`。增加第三个表面意味着增加
一个 JSON 条目——生成器、命名与守卫都会随之而来。

## 字体

自托管的可变字体。这些包在 JSON 里按字族声明为 `selfHosted`，`styles/generated/fonts.css` 由它们产出
（`@fontsource-variable/geist`、`@fontsource-variable/jetbrains-mono`），打上指纹进入 `dist/assets` 并
嵌入二进制——**没有字体 CDN**，因此离线宿主也能渲染真实的系统。两种字体都是可变的，因此 800 与斜体是真实的，
不是合成的。由 `e2e/fonts.spec.ts` 钉住。

**替换一个字族只改一个文件**：在这里编辑该字族的 `stack` + `selfHosted`，`bun add` 新包，`typography:generate`。
字体面名字不写在别处——测试从生成输出里读回它（`e2e/fixtures/typography.ts`），而 `validate` 会同时拒绝一个
不是依赖的 `selfHosted` 包，以及一个没有任何字族认领的字体依赖。字体栈的另一份副本住在 `apps/website`（一个
无法导入我们的独立叶子）；当它与本文件漂移时 `apps/website/src/fonts.test.ts` 会失败。

`tokens.css` **完全不含排版**——没有一个值，也没有一个别名。它曾经把 `--font`、`--font-mono`、`--font-accent`、
`--font-mono-size` 与 `--line-height` 作为指向生成 token 的别名；它们每一个都消失了，因为一个值的第二个名字正是
会漂移的东西。无法使用类的使用方直接读取 `--tr-*` token。Cabinet Grotesk 已在全仓库退役，不得回归。

## CJK，以及用户自己的字体

Geist 只带 latin/latin-ext/cyrillic/vietnamese，**完全没有 CJK**，因此 interface 与 brand 字体栈以显式的 CJK
字体面收尾（`PingFang SC`、`Hiragino Sans GB`、`Microsoft YaHei`、`Noto Sans SC`、`WenQuanYi Micro Hei`）。
没有它们，*每个*汉字字形都由某个未指定的 OS 回退绘制，其 x-height 与笔画粗细与旁边的拉丁文字不匹配——这就是中文
UI 读起来发虚的原因。添加一个 CJK 字体面就是在这里编辑 `stack`，别的什么都不用。

interface 字族还额外是 `userSelectable`：生成器把它的变量产出为
`var(--tr-font-user-interface, "Geist Variable"), Geist, …`，因此应用可以在前面加上用户在这台机器上挑的字族，
而字体栈的其余部分——拉丁*与* CJK 回退——完全按这里所写保留。运行时只往那个槽位写一个字体面名字，别无其他；
该槽位是 store 或组件在运行时唯一可以设置的排版值，把它设在单个元素上就把选择限制在那个元素内（选择器就是这样
预览每个候选的）。

`metricOverrides` 为一个选择器重申原语，生成在 `:root` 之后，逐字照搬。今天只有一条：`:root:lang(zh)` 把
`light` 提到 400、`s12` 提到 13px、`metadata` 行高提到 1.4。应用早已把界面语言写进 `documentElement.lang`，
因此中文获得 CJK 可读的字重与字号，而拉丁设计保留它当初绘图所用的 370/x-height 调校刻度；`13px × 1.4` 也让
一行中文元数据的行盒保持正文的 18.2px 而不是缩水。代码 token 刻意不被覆盖——11px 的代码行是整像素的虚拟化器
契约。校验会拒绝命名未知 token、值类型错误，或只是重复原语的覆盖。

## 等宽策略

`code` **只用于代码与技术内容**：编辑器与终端文字、代码块、行内代码、diff 与技术文件路径、shell 命令、斜杠命令
语法、JSON/代码编辑表面、键帽、原始工具输出，以及 OTP 例外。它**绝不**用于项目或工作区名、分支或基础 ref、
模型名或 id、技能名、标签、tag、普通元数据或状态——那些是比例字体。校验强制这一点：非代码样式上的等宽字族会让
`typography:validate` 失败，比例字族上的代码样式同样如此，等宽的 `rootStyle` 亦然。

## 字重策略

- **370**（`light`）——普通 UI、正文、实体、元数据与状态文字（interface 字族）。
- **400**（`regular` / `brand`）——等宽 / 代码文字（`code.*`）与品牌展示文字（`brand.*`）。
- **500**——按钮（`ui.action`）、页内分区标题、紧凑标题、行内强调（`ui.emphasis`）、大写标签
  （`ui.eyebrow`/`labelPill`）、聊天散文 h4–h6 与 `strong`。
- **600**——对话框标题、卡片标题、警告标题、每个 `heading.*`、聊天散文 h1–h3、文档散文 h1–h6 与表头。

禁用的控件颜色来自 `control-disabled-bg` / `control-disabled-text`；禁用的非控件文字使用 `text-disabled`。
排版不编码禁用状态，控件也不使用不透明度来模拟它。

## 允许的例外

允许列表刻意很小，每个条目都在 `styles/typographyUsage.test.ts` 里按名字被强制：

| 表面 | 为什么它不能使用语义类 |
|---|---|
| `panels/monacoSetup.ts` | Monaco 把 `fontFamily` / `fontSize` / `lineHeight` 作为 JS 选项——它读取 `--tr-font-family-code`、`--tr-font-size-s11`、`--tr-line-height-default`，因此无法与代码块漂移 |
| `panels/resources/code/pierreVirtualizer.ts` | Pierre 的虚拟化器把行高作为 JS 度量——它读取生成的 `--tr-code-row-height`，与 `.pierre-code-surface` 交给 `--diffs-line-height` 的是同一个值 |
| `panels/TerminalInstance.tsx` | xterm，同样的原因——它读取 `--tr-font-family-code` + `--tr-font-size-s13`（`code.text` 背后的原语），并通过自己的 `lineHeight` 选项而非 CSS 行高来拥有行高 |
| `thinkrail-extensions/visualize/web/mermaid.ts` | mermaid 的主题配置接受一个字体族字符串（`--tr-font-family-code`） |
| `index.css`、`styles/tokens.css`、`styles/global.css` | 映射层本身；`.pierre-code-surface` 把代码字族、`s11` 与默认行高（舍入到整像素）传入 Pierre 的 Shadow DOM |

OTP 代码**不再**是例外：它是具名的 `code.otp` 样式（`.tr-code-otp`）。

## 增加或修改一个样式

1. 编辑 `styles/typography.json`——新增一个原语，或在 `textStyles` / `proseSystems` 下新增一个条目。复用原语；
   只有当没有既有值合适时才新增。**如果你需要的样式已经存在，就写 `{ "$ref": "<that.style>" }`**，而不是重复
   它的值——校验会拒绝值相同的第二个规范定义，并拒绝指向另一个别名的别名。只有当两者确实分化时，才把一个别名拆
   成自己的定义。
2. `bun run typography:validate`，然后 `bun run typography:generate`，并**提交生成的 CSS**。
3. 在调用点使用生成的类（颜色保持独立）。
4. `bun test`（源 + 采用守卫）与 `bun run e2e -- e2e/typography.spec.ts` 检查计算样式。

**不要**：给 `index.css` 添加排版工具类或 `--text-*` 映射，给 `tokens.css` 添加字体别名，在组件里声明字体属性，
或编辑 `styles/generated/typography.css`。pre-commit 钩子与 `apps/web build` 都会运行 `typography:check`，因此
过期的生成 CSS 无法落地。

这套「原语 + 语义 token + schema + 生成器」的形态正是 **颜色** JSON 应当镜像的模式；这里没有任何 Tailwind 专属
的东西，Tailwind 只是消费生成的 CSS。
