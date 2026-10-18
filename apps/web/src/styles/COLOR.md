---
id: web-color
type: submodule-design
status: active
title: ThinkRail 颜色 — 单一 JSON 源，生成的 CSS，语义角色
parent: module-web
depends-on: [submodule-web-themes]
references: [web-typography]
---

# 颜色系统

颜色分为**两层**到达，而组件只可以命名第二层。

```
themes/bundled/*.theme.json    the PALETTE — one file per theme, the only place a hex lives
styles/colors.json             the SEMANTIC layer — what each palette entry is FOR (one file)
styles/colors.schema.json      the editor-facing contract for it
scripts/colors.ts              load / validate / render — the only place a derivation is written
scripts/generate-colors.ts     writes the output; `--check` fails when it is stale
styles/generated/colors.css    GENERATED: the roles, the `@theme inline` map, the effect blocks
themes/runtime.ts              writes the active manifest onto the document root
styles/colorUsage.test.ts      the adoption guard
```

**没有任何颜色被写两次。** 一个角色的派生住在 `colors.json` 里，别处没有——不在 `tokens.css`（只放结构），不在
`index.css`（完全没有 `--color-*`），也不在 `runtime.ts`（它现在派生变量名，而不是把它们列成表）。编辑生成
的文件会让 `bun run colors:check` 失败，该检查在 pre-commit 与 `apps/web` 的构建中运行。

**变量名是派生的，不是选出来的。** 一个清单键写入它 kebab-case 后的名字——`borderStrong` →
`--border-strong`，`editorSelection` → `--editor-selection`。`colors.json` 与 `runtime.ts` 各自独立地应用
同一条规则，因此一个角色的 `from` 与它读取的变量不可能不一致。没有需要同步的查找表，也没有再出现 `info` 用
`--blue` 这样的名字。

一个**调色板条目**回答*哪种颜色*（`--warning`、`--elevated`、`--hint`）。一个**语义 token** 回答*用来做
什么*（`feedback-warning`、`container-elevated-bg`、`text-muted`）。组件命名角色；调色板是内部的。

```tsx
<div className="bg-container-elevated-bg text-text-muted border-border-default" />  // yes
<div className="bg-[var(--elevated)] text-hint border-border2" />                   // no
```

## 为什么要拆分

主题改变的是一个角色解析到*哪种*颜色，而不碰任何组件；一个角色可以被重新指向一次，而不是在 160 个调用点各指
一次。它还让失败模式变得可见：`bg-elevated` 不再是 Tailwind 工具类，而 Tailwind **会静默丢弃未知工具类**——
元素渲染成无样式，它的类名列表却声称不然。`colorUsage.test.ts` 之所以存在，是因为这曾经真的发布过。

## token

在 `colors.json` 中声明，由生成器发布为工具类。每一个都在被使用；没有调用点的 token 会被删除，一个永远不可能
与邻居不同的别名同样如此（`border-strong` 等于 `border-default` 并不是第二个字重，而是第二个名字）。

| 族 | token | 说明 |
| --- | --- | --- |
| 文字 | `text-default` · `text-muted` · `text-subtle` · `text-disabled` · `text-on-primary` | `text-subtle`（来自 `hint` 调色板键）是次要元数据层级（分支行、规范角色标签）；`text-disabled`（默认 `text` 颜色 @ 60%——一个禁用元素继承它启用时的语义颜色，在 token 层调暗）留给真正禁用的 UI 文字 |
| 容器 | `container-workspace-bg` · `container-sidebar-bg` · `container-terminal-bg` · `container-header-bg` · `container-content-bg` · `container-elevated-bg` | **已打开文档的画布是 `workspace`，不是 `content`**：Monaco 桌面文件编辑器、Pierre 手机端文件，以及 markdown/规范预览，与聊天列和标签条坐在同一个表面上，因此文档读起来是工作区的一部分。`content` 是**凹陷的 diff 画布**——Pierre 源码 diff、渲染 diff、Shiki 代码块，以及它们背后的中心工作台背景。`terminal` 是终端主体 + xterm 画布（当前取自与 `sidebar` 相同的调色板键）；`elevated` 是每个抬升表面 |
| 控件 | `control-bg` · `control-bg-hovered` · `control-bg-selected` · `control-primary-bg` · `control-primary-bg-hovered` · `control-primary-text` · `control-border-default` · `control-border-active` · `control-disabled-bg` · `control-disabled-text` · `control-disabled-border` · `control-primary-disabled-bg` · `control-primary-disabled-text` | 三个 `control-primary-*` token 就是主按钮/主控件，它们**与其他每个角色一样是按主题派生的**——`control-primary-bg`（来自 `accent`）填充、`control-primary-bg-hovered`（来自 `accentHover`）hover 填充、`control-primary-text`（来自 `onAccent`）标签。`accentHover` 是强调色的 **hover 步**，是它自己的清单键，好让主题拥有那一步：主按钮 hover 到 `control-primary-bg-hovered`（一个颜色 token），绝不是 `hover:opacity-*`。因为填充来自 `accent`，`bg-control-primary-bg` 与 `bg-primary` 构造上就是同一种颜色——主按钮绝不可能偏离主题的强调色。`control-bg-hovered` 仅指指针 hover；`control-bg-selected` 是持久的选中/打开/活跃/高亮填充（当前取自同一调色板来源）。`control-border-default` 是静止的表单控件边框；`control-border-active`（来自 `borderStrong`）是一个*活跃*控件的**更强中性**边框——按下/`active:` 按钮、打开的 selector（`data-[open=true]`），以及获得焦点的文本输入/文本域。它只是边框：强调色的焦点**环**仍是焦点指示器（因此强调色 = 焦点，中性强 = 活跃）。绝不用于非活跃/默认控件，也不用于选中的导航行、标签页或静态表面。**禁用是一等控件状态**，而不是一个不透明度工具类：**一个禁用元素继承它启用时所用的同一种语义颜色，并在 `strong`（60%）alpha 步解析**——在 token 层派生，好让背景、文字、图标与边框各自保持显式归属，嵌套内容绝不被调暗。因此禁用角色就是启用角色 @ 60%：`control-disabled-bg`（来自 `input`，即 `control-bg`）、`control-disabled-text`（来自 `text`，即 `text-default`）、`control-disabled-border`（来自 `border`，即 `control-border-default`），以及主要配对 `control-primary-disabled-bg`（来自 `accent`，即 `control-primary-bg`）+ `control-primary-disabled-text`（来自 `onAccent`，即 `control-primary-text`）。**没有**专属的 `disabled` / `primaryDisabled` / `onPrimaryDisabled` 调色板键——禁用状态绝不携带自己的颜色。仅文字/图标的控件只需 `control-disabled-text`；非控件的禁用文字仍用 `text-disabled`。**不要**在组件上使用 `disabled:opacity-*`（它会调暗嵌套内容并绕过 token 归属）。**一处有记录的例外**：输入框的发送 pill 是一个大多数时候（草稿为空）*惰性*的主控件，那里一块 60% 的强调色会把视线拉向一个无法行动的控件——因此它静止在 `control-bg-selected` + `control-disabled-text` 上，切到完整的强调色填充就是「就绪」信号（`chat/SPEC.md`，*Composer trailing controls*）。任何其他禁用的主要控件都保留 60% 配对 |
| 边框 | `border-default` · `border-muted` | |
| 主要 | `primary` + `primary-subtle` · `-soft` · `-muted`, `on-primary-soft` | |
| Feedback | `feedback-{info,success,warning,error}` + the `-subtle` / `-muted` steps in use | 实心边框就是实心颜色，因此没有 `-border` 层级 |
| 聊天气泡 | `bubble-user-bg` · `bubble-user-border` | 从清单自己的 `bubbleAccent` 上色。标准与 High Contrast 调色板让它**等于自己的 `accent`**——用户气泡穿上品牌色；Minimal 调色板把它重指到中性灰，好让用户内容不与动作/注意的颜色竞争。那个独立的键就是旋钮（见 `themes/SPEC.md`）：主题不碰组件就能决定气泡怎么读 |
| 效果 | `overlay` · `sunken` | 由主题引擎按浅色/深色分别写入 |
| 严格使用方的编辑器角色 | `editor-selection-bg` · `editor-selection-text` · `editor-selection-highlight-bg` · `editor-find-match-bg` · `widget-shadow` | `publish: false`；Monaco/xterm 直接读取它们，不产出任何 Tailwind 工具类 |
| 媒体 | `media-checker-tile` | `publish: false`；`index.css` 的 `.media-backdrop` 在每张图片与矢量预览背后绘制的透明棋格块，从 `text` 的 `soft`（20%）步派生，因此在深色主题里是深上的浅、在浅色主题里是习惯的 `#ccc`-on-white——透明 PNG 上的深色 logo 绝不能读成「没有图片」 |

没有 `text-strong`，也没有 `text-link` 工具类：它们重复了其他 token，而 `--text-link` 作为一个变量只留给
`global.css` 的裸锚点回退。那个回退住在 CSS 基础层里，因此在链接形状的行控件上显式写了语义文字工具类时，它总能
赢得层叠。

## 透明度：只有一种形式

**一个色调就是一个 token，以 `in srgb` 混合，落在 alpha 刻度上。**

```
subtle 10%   ·   wash 12%   ·   soft 20%   ·   muted 40%   ·   strong 60%
```

`wash`（12%）是 feedback 表面填充步（`feedback-*-subtle`），比 `subtle`（10%）高一档，好让 `primary-subtle`
与 `bubble-user-bg` 留在 10%，而 feedback 背景读作 12%。

Tailwind 的 `/40` 不透明度修饰符**不用于颜色工具类**。它按 `in oklab` 混合，因此同一个名义百分比会因来自类还
是来自 token 而渲染不同——而且数字会漂移（10、12、15、16、25、30、35 和 50 曾同时存在）。一个新的色调是刻度上的
一个新 token，绝不是类名里的一个新数字。

## 非 CSS 使用方

Monaco、Pierre、xterm、mermaid 与 Shiki 无法为它们绘制的内部穿上类名。Monaco、xterm 与 mermaid 通过
`getComputedStyle` 读取 token，并在 `[data-theme]` 替换之后重建；Monaco 现在只有 `EDITOR_THEME`，并把桌面
文件画在 `container-workspace-bg` 上。Pierre 的开放 Shadow DOM 继承一个 `.pierre-code-surface` 自定义属性
桥：它的 CSS 变量 Shiki 主题把 `--diffs-token-*` 映射到既有的 `--code-*` 语法角色，而 `--diffs-bg*`、行号
前景色以及增/删基础色映射到工作区/content 画布、弱化文字，以及 feedback 的 success/error 角色。那些值保持
为活的变量引用，因此 Pierre 既不需要按主题注册，也不需要替换之后重新高亮。Monaco 与聊天共享同一个
`THINKRAIL_SHIKI_THEME` TextMate 定义；聊天保持它活的 CSS 变量形式，而 Monaco 为它严格的 API 把同一批变量
解析成 hex。因此所有使用方命名的都是其他一切所命名的同一批语义 token，每个值一个名字。这些使用方与组件*共享*
的角色（`--container-*-bg`、`--text-muted`）保持已发布并在 `@theme inline` 中有映射；那些**只有**它们读取的
东西（`--editor-selection-*`、`--editor-find-match-bg`、`--widget-shadow`，以及只给样式表用的
`--media-checker-tile`）是 `publish: false` 且没有映射——一个谁也用不上的工具类是死重。严格 JS 使用方需要
的值通过 `cssColorToHex`（`lib/utils.ts`）规范化成 hex 到达它们手里，因为构建出的 CSS 被压缩，而 Monaco/
xterm 只接受 hex。

**它们刻意*不*覆盖什么。** 这些库每一个画的东西都远超我们交给它的量，剩下的来自它自己内置的调色板：

| 使用方 | 我们设定的 | 其余来自 |
| --- | --- | --- |
| Monaco | 桌面文件画布/前景/行号槽；活跃与非活跃行号；光标 + 两种选中颜色；当前行填充/边框；缩进参考线；括号匹配 + 六种括号对颜色；单词/选中/查找高亮；粘性滚动画布/阴影；折叠/空白绘制；编辑器 + hover 组件；菜单、快速输入与输入表面/状态；焦点边框；组件/滚动条阴影 + 滑块状态；每一条 TextMate 语法规则 | 经 `inherit: true` 来自 `vs` / `vs-dark` / `hc-black` / `hc-light`——suggest/peek/debug、minimap，以及其他未列出的专门表面 |
| Pierre | 文件/diff 画布与行号槽、前景/行号/选中、语法变量、success 新增、error 删除、分隔/标注表面、代码族/字号 | 未经桥接的属性由 Pierre 核心布局/效果提供；不应用任何 `@pierre/theme` 预设 |
| xterm | 背景、前景、光标、两种选中颜色、全部 16 个 ANSI | `cursorAccent` 与 `selectionInactiveBackground` 用 xterm 默认值 |
| mermaid | `thinkrail-extensions/visualize/web/mermaid.ts` 中的 `themeVariables` 映射 | 该映射里缺失的任何东西由 mermaid 的 `base` 主题提供 |

这是一个有界的、被接受的缺口，而不是疏忽。仅 Monaco 就暴露约 200 个颜色键；把它们全部枚举会是一个庞大而脆弱的
表面，而基础是从清单的外观与对比度元数据挑选的，因此绝不会错得离谱。如果某个主题在这些组件之一里看起来不对，
修法是加上那个特定的键——而不是接管整个表面。

## 增加或修改一种颜色

每种情况都是一次 JSON 编辑，随后运行 `bun run colors:generate`。

1. **某个主题应该看起来不同** → 编辑 `themes/bundled/<theme>.theme.json`。别的什么都不变，也不需要重新生成：
   清单在运行时读取。
2. **某个角色应指向别处** → 改它在 `colors.json` 里的 `from`。
3. **一个新角色** → 把它加进 `roles`，带上 `from`、可选的 `alpha` 步，以及 `publish`（`true` → 一个
   Tailwind 工具类；`false` → 由 Monaco/xterm/mermaid/`global.css` 直接读取）。
4. **一个新色调** → 一个来自 `scale` 的 `alpha` 步，绝不在调用点写 `/N`。如果这一步本身是新的，就把它加进
   `scale`——那是一个设计决策，而且只做一次。
5. **一个两个主题必须能有所不同的角色** → 它需要自己的清单键。把它加进 `THEME_COLOR_KEYS` 与
   `theme.schema.json`，以及每个打包清单，然后让一个角色指向它。只要某个角色命名了不存在的键、或某个键没有
   任何角色读取，生成器就拒绝运行。

绝不：组件里的原始 hex 或 `rgb()`、内联 `style` 对象、`bg-[var(--palette-entry)]` 逃生口，或给一个已有名字的
值再起第二个名字。

## 测试钉住了什么

`styles/colorUsage.test.ts` 通过共享的构建期源码扫描器扫描应用源码、`packages/ui`，以及每个
`thinkrail-extensions/*/web` 树。它在以下情况失败：

- 一个颜色工具类命名了 `@theme inline` 未发布的 token（静默丢弃 bug）；
- 组件里含有原始 hex、`rgb()` 或 `hsl()`；
- 组件通过 `bg-[var(--…)]` 够到调色板条目；
- 一个 `/N` 不透明度修饰符出现在颜色工具类上；
- 一个已声明的 token 没有调用点，或一个已发布的工具类没有 token；
- 已提交的生成文件与 `colors.json` 渲染出的结果不符。

`themes/schema.test.ts` 还钉住了**对比度下限**，这些值得在这里说明，因为其中两条是我们而非标准的判断：

- 在每一个静止表面（`background`、`content`、`sidebar`、`header`、`elevated`、`input`）上，文字完整满足
  WCAG AA——正文与 `text-muted` 层级为 4.5；
- 刻意安静的 `text-subtle` / `hint` 层级在每个静止表面上保持 **3.0** 可见；
- 在临时的 HOVER 表面上，下限是 **3.0**，而不是 4.5；
- `hover` 填充——`control-bg-hovered` / `control-bg-selected` 的调色板来源——保持**与每个静止表面可区分**：
  对全部六个 ≥ **1.15**。没有画布豁免：交互填充会到达它们每一个（content 画布承载 PlanPane 的行与工作台
  背景的控件；`input` 是被 hover 控件换离的那个静止填充）。

WCAG 没有「临时状态」的宽容，因此 hover 层级是我们刻意划的线。这些主题在 hover 时把行背景抬向文字颜色，把
它卡在 4.5 会迫使一个主题的标志性强调色变成被冲淡的色调，只为在 hover 行上幸存。3.0 让 hover 的文字保持舒适
可见，同时让主题保持可辨识。如果严格 AA 覆盖每个状态有一天成为要求，就重新审视它。

可区分性下限同样是我们的：WCAG 根本没有相邻填充的度量。它存在是因为 High Contrast Light 把 `hover` 以
1.05:1 发在自己的侧边栏上——选中的项目/工作区行与面板无法区分——而每个易读性检查都保持绿色；对那处修复的评审
随后发现 Light 直接把 `hover == content` 发了出去，于是 PlanPane 的 hover 行以同样的方式消失了。1.15 是分开
「可见填充」与「不可见填充」的那条线；每个打包主题在全部六个表面都通过它（当前最弱的一对是 Light 的
hover-on-content，1.165）。

`themes/runtime.test.ts` 钉住了应用；`themes/shiki.test.ts` 钉住了语法变量映射。清单本身见
[`themes/SPEC.md`](../themes/SPEC.md)，平行的类型系统见 [TYPOGRAPHY.md](./TYPOGRAPHY.md)。

## 范围：应用及其 UI SDK/扩展

`apps/website`——公开落地页——有自己的样式表，带着自己硬编码的颜色与字体，与本系统毫无共享。这是刻意的：它是在
GitHub Pages 上的一张静态营销页，没有主题切换、没有运行时，也没有理由携带 token 层。不要通过从这里导入来「修
复」它；如果它有一天需要与应用一致，正确的做法是抽出一个小的共享 token 包，而不是跨应用伸手。
