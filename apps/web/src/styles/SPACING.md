---
id: web-spacing
type: submodule-design
status: active
title: ThinkRail 间距 — 单一 JSON 源，唯一规范的数值刻度
parent: module-web
references: [web-color, web-typography]
---

# 间距系统

间距是**唯一一套规范的数值词汇**。当设计说「使用间距 8」，实现就写 `p-8` / `gap-8` / `py-8`，它恰好解析为
8px——一个值、一个名字、没有本地重复声明。这集中了编写出来的节奏值；它并不从源码、生成的 CSS 或编译后的
bundle 中移除字面量。

```
styles/spacing.json            the authored SOURCE — the only authored canonical rhythm lengths
styles/spacing.schema.json     the editor-facing contract for it
scripts/spacing.ts             load / validate / render — the only place a spacing derivation is written
scripts/generate-spacing.ts    writes the output; `--check` fails when it is stale
styles/generated/spacing.css   GENERATED: the `--space-<n>` tokens + the `--spacing: 1px` base
styles/spacingUsage.test.ts    the adoption guard
```

## 刻度

`spacing.json` 声明档位 **`0 · 2 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 64`**。**档位名就是它的像素值**——
`"8": "8px"`——因此一条点名某个数字的指令恰好映射到一个 token 与一族工具类。`0` 是恒等档位（无间距）。

刻度是**一套特意定义的原始集合，而不是当前用量的清单**：一个档位可以存在于任何使用方之前。`32`/`40`/`64` 是
没有节奏调用点的保留原语——它们是规范的，不是孤儿，也不会因为没人用而被移除。反过来，新增一个档位（比如
`6`）是刻意的设计决策，而不是机械操作——审计发现 6px 有四种用法，每一种都被解析进一个既有角色，而不是新铸
一个档位。

`spacing.json` 是编写源；没有其他编写源重述一个规范节奏长度。生成的输出必然把这些值物化为 `--space-<n>` 自定义
属性。它们被少数无法使用工具类的手写 CSS 表面直接读取（`index.css` 中的 Monaco 评审组件），也被严格的数值型
第三方选项读取（Monaco 文件查看器的顶部内边距）；组件调用点使用 `p-<n>` / `m-<n>` / `gap-<n>` 工具类。编辑
生成的文件会让 `bun run spacing:check` 失败，该检查在 pre-commit 与 `apps/web` 的构建中运行。

## 数字 = px（以及尺寸为何共用它）

工具类通过生成 `@theme inline` 块中设置的 **`--spacing: 1px`** 解析。Tailwind v4 把一个纯数字间距工具类
计算为 `calc(var(--spacing) * n)`，因此 1px 的基数让 `p-4` = 4px、`gap-12` = 12px，一律如此。这**替换**了
Tailwind 内置的 `0.25rem` 基数，于是任何长度都无法回落到 Tailwind 自己的数值刻度——正是这条要求让 t-shirt
名（`p-xs`、`gap-sm`）值得退役。

Tailwind v4 从**同一个 `--spacing` 基数**驱动**间距（`p`/`m`/`gap`）与尺寸（`w`/`h`/`size`/inset/
translate）**——它们无法按主题分开。所以 1px 基数让尺寸也「数字 = px」：`w-16` = 16px、`size-14` =
14px、`h-32` = 32px。这是刻意的，并且是按 1:1 迁移的（每个旧的 `w-4`/`size-3.5`/`h-8` 都变成了
`w-16`/`size-14`/`h-32`），完全保住了 UI 原样。**但一个盒子是多少 px 是布局约束，不是节奏**——尺寸刻意
*不*由间距门禁管束，尺寸值是自由形式的 px，而不是规范的档位集合。

Tailwind 的**具名容器预设仍是一套独立刻度**：`max-w-lg`（以及 `w`/`min-w`/`max-w`/`basis` 的其余
t-shirt 名）通过 `--container-*`（32rem）解析，独立于 `--spacing`。它们**不是**间距别名，绝不能被迁移到
数值工具类——一次机械的 `lg`→`16` 重写会把一个 32rem 的列压成 16px。`spacingUsage.test.ts` 钉住了这一点
（门禁从不检查宽度/尺寸前缀，而我们依赖的容器预设保持具名）。

间距独立于排版、颜色与圆角：字体刻度或主题的变化绝不移动布局。`tokens.css`（结构）不含任何间距刻度；
`spacing.json` 是它唯一的编写源。

## 布局角色

一个必须由多个表面**一起**改变的值就是一个具名布局角色，而不是重复的字面量，这样一次密度变化会同时移动每个
使用方，且不可能被半途应用（曾有一个漏掉的字面量让 Specs 的行停在 28px，而每个兄弟行都已移到 24px）。角色声明
在 `tokens.css` 的 `:root` 中，并由 `index.css` 的 `@theme inline` 映射进 Tailwind——与
`--panel-header-row-height` → `h-panel-header-row` 同一种形态：

| 角色 | 值 | 工具类 | 保持相等 |
|---|---|---|---|
| `--panel-header-row-height` | `28px` | `h-` / `w-panel-header-row` | 每条头部条（标签条、面板头部、聊天工具栏、底部工具边栏）的高度，以及它全高方形动作的宽度 |
| `--panel-header-control-height` | `calc(var(--panel-header-row-height) - var(--space-4))` | `h-panel-header-control` | 浮动在头部条内的每个控件，这样无论头部高度如何变化，它都能持续让开该条的 1px 边框 |
| `--panel-row-height` | `22px` | `h-` / `min-h-` / `size-panel-row` | 每个侧边面板行（文件、变更、规范、项目、工作区）以及它们内部行高的图标按钮 |
| `--panel-inset` | `var(--space-8)` | `p-panel-inset` | 每个工具面板（Projects、Specs、Files、Changes、Review）的内容内边距 |
| `--tree-indent` | `var(--space-8)` | `pl-tree-indent` | Files、Changes 与 Specs 树按深度的缩进 |
| `--chat-gutter` | `var(--space-8)` | `px-` / `p-chat-gutter` | 聊天行的栏距、流状态与活动面包屑条、输入框内边距，以及对话记录宽度和无界用户气泡计算中的栏距项 |

- 一个**节奏角色别名一个规范档位**（`var(--space-<n>)`），绝不是原始长度，因此 `spacing.json` 仍是节奏长度的
  唯一来源，`tokens.css` 也仍然不含自己的刻度。尺寸角色（`--panel-row-height`）是几何，保持自由形式的 px，
  与所有尺寸一样。
- 只为有多个使用方且必须保持相等的值铸造角色；一次性的长度仍是数值工具类。角色不是 t-shirt 别名，绝不取代
  刻度。
- 角色名是 kebab-case 且**至少两个词**（`panel-inset`）。`cn`（`@thinkrail/ui/utils`）把这种形态教给
  tailwind-merge 作为间距/尺寸值，因此一个角色会覆盖同一工具类的某个档位（`size-28` + `size-panel-row` →
  `size-panel-row`），而不是两个类都存活、再由样式表顺序静默挑一个；门禁会在单词角色名上失败。

## 门禁

`styles/spacingUsage.test.ts` 在 `p`/`m`/`gap` 调用点（以及手写 CSS 的节奏属性上）强制这套词汇，并从
`spacing.json` 读取允许的档位，使二者无法漂移。共享的源码扫描器覆盖应用源码、`packages/ui`，以及每个
`thinkrail-extensions/*/web` 树：

- 一个间距工具类要么命名一个**规范档位**——`p-8`、`gap-4`——要么命名一个**已声明的节奏角色**——
  `p-panel-inset`：一个 `index.css` 中的 `--spacing-<role>: var(--<role>)`，其 `tokens.css` 值为
  `var(--space-<step>)`；退役的 t-shirt 别名（`p-xs`）、未知的字母后缀（`p-bananas`）、被当作节奏使用的
  尺寸角色（`p-panel-row`）以及任何脱离刻度的数字（`p-6`、`py-1`、`gap-0.5`）都被拒绝；只有与前缀相称的
  Tailwind 关键字，例如 `ml-auto`、`gap-px` 和 `space-x-reverse`，仍然有效；
- 调用点上的长度**绝不是原始像素值**（`py-[3px]`），档位也**绝不通过任意值重新拼写**（`p-[8px]`、
  `p-[var(--space-8)]`）——数值工具类是唯一的途径；
- 不是节奏的关键字后缀仍然无妨（`ml-auto`、`gap-px` 细线）；
- **方括号逃生口对**文档化的、并非节奏档位的测量/几何表达式关闭：`pr-[2rem]`（关闭按钮的预留）、
  `pl-[1.6em]`（em 相对的列表缩进），以及与图标对齐的 `pl-[calc(0.875rem+var(--space-8))]` /
  `pl-[calc(1.125rem+var(--space-8))]` 缩进。任何其他任意间距工具类都会让守卫失败；添加一个是在这里记录的
  设计决策，而不是对刻度的静默逃逸；
- 刻度是已定义的原始集合，因此一个档位**不**要求有使用方——门禁没有可能拒绝保留原语（`32`/`40`/`64`）的
  孤儿/可达性检查；
- 那些源码根中遍布的手写 CSS 声明都被覆盖，包括多行声明和 TypeScript 里的 CSS 字符串字面量：`gap` /
  `padding` / `margin`（及其长写形式）必须使用已声明的 `--space-*` token（或 `0` / `auto`），绝不用原始
  长度或不相关/未知的自定义属性。尺寸、坐标与 box-shadow/边框偏移是几何而不是节奏，不被扫描；一个已记录
  的非节奏光学偏移可以经守卫的 `CSS_RHYTHM_EXEMPT` 允许列表保持原始（`.review-region` 的边栏对——
  `padding-left: 10px` 被 `margin-left: -10px` 抵消，零布局位移）。

与颜色和排版守卫一样，这一道存在的原因是漂移**不可见**：不同于未知的颜色工具类（Tailwind 会丢弃它，什么也
不渲染），一个脱离刻度的长度总是会渲染，所以它在评审时看起来正确，并通过其他每一道门禁。

## 增加或修改一个档位

编辑 `spacing.json`，运行 `bun run spacing:generate`，提交重新生成的 `styles/generated/spacing.css`。这就
是全部改动——工具类（`p-<n>`、`gap-<n>`、……）与原始的 `--space-<n>` token 都从源码而来。档位名是一个规范的
非负整数，没有前导零，且必须等于它的像素值（`validate()` 强制 `"<n>": "<n>px"`）。新档位不需要任何使用方
就已有效——保留原语可以在使用之前添加。然而，移除一个调用点仍在消耗的档位会破坏那些工具类（它们会变成脱离
刻度）。
