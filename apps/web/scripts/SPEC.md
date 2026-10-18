---
id: module-web-scripts
type: submodule-design
status: active
title: apps/web 构建期脚本 — 排版、颜色与间距流水线
parent: module-web
---

# `apps/web/scripts`

`apps/web` 的构建期工具。**这里的东西都不随成品发布**：这些模块在开发者的机器上或 CI 里以 Bun 运行，绝不进入
浏览器 bundle。它们从 `src/` 读文件，把生成的文件写回 `src/`，并以一个状态码退出。

该目录存放四条流水线——排版、颜色、间距与提供商字形——以同样的方式构建，另加 React Compiler 盘点：一个基线
即棘轮门禁的诊断工具。它们住在这里而不是 `src/`，因为它们是*生成器*：它们使用 `node:fs` 与 `node:path`，而
那些绝不能进入浏览器打包的代码。

## 它拥有什么

| 文件 | 角色 |
|---|---|
| `typography.ts` | 库：加载 → 校验 → 渲染 CSS。**唯一**推导 CSS 自定义属性名、语义类名和 prose 根类名的地方。 |
| `generate-typography.ts` | CLI。写入 `src/styles/generated/typography.css` 与 `src/styles/generated/fonts.css`（自托管字体面的 `@import`）；当某个已提交的文件过期时，`--check` 会失败而不是写入。 |
| `validate-typography.ts` | CLI。校验 `src/styles/typography.json` 并打印摘要。被强制执行的门禁。 |
| `colors.ts` | 库：加载 → 校验 → 渲染。**唯一**书写颜色派生（调色板别名或 alpha 步进）的地方。 |
| `generate-colors.ts` | CLI。写入 `src/styles/generated/colors.css`——角色、外观级效果，以及 Tailwind 映射；过期时 `--check` 失败。 |
| `spacing.ts` | 库：加载 → 校验 → 渲染。它强制步进同一性，并且是唯一推导生成的间距 CSS 形状与 `--spacing: 1px`（数值 = px）基值的地方；步进长度只存在于 `spacing.json` 里。 |
| `spacing.test.ts` | 把间距源校验器的封闭根/元数据形状与值类型钉在 schema 上。 |
| `generate-spacing.ts` | CLI。写入 `src/styles/generated/spacing.css`——`--space-<n>` token + Tailwind 基值；过期时 `--check` 失败。 |
| `providerGlyphs.ts` | 库：**唯一**的 pi 提供商 id → 厂商标记映射，外加那个只在厂商 SVG 是 24×24、仅路径、`currentColor` 字形时才接受它的读取器（分层标记保留各自的按路径不透明度），以及为每个标记共享一个常量的渲染器。来源集合：仅开发用的 `@lobehub/icons-static-svg`（MIT；这些标记仍是其各自所有者的商标）。 |
| `generate-provider-glyphs.ts` | CLI。写入 `src/chat/generated/providerGlyphs.ts`；过期时 `--check` 失败。该生成模块像 `styles/generated` 一样被 Biome 忽略。 |
| `providerGlyphs.test.ts` | 钉住每个被映射的标记都存在于厂商集合中，以及带颜色的、尺寸异常或非路径的 SVG 被拒绝而不是被压平。 |
| `generatedFiles.ts` | 每个 generate CLI 对渲染出的文件要做的事：`--check` 报告漂移，否则写入。“过期”的**唯一**定义，因此三条流水线与测试不可能互相矛盾。 |
| `generatedFiles.test.ts` | 钉住那个定义——内容漂移与缺失文件算过期，CRLF 的工作树不算。 |
| `compiler-census.ts` | CLI。用带 logger 的 `babel-plugin-react-compiler` 跑应用、共享 UI 与扩展 web 的源码（排除测试、stories 与生成数据），把编译器放弃的每个函数打印为 `file:line: [fn] category: reason`，外加总计；`--json` 打印完整盘点。运行：`bun run --cwd apps/web compiler:census [--json]`。`--write` 把被放弃的函数渲染到 `compiler-census.baseline.txt`，形如 `file fnName`，不含行号，因此其上方的编辑不会让它翻动。`fnName` 是词法的，绝不是位置性的：函数被赋值到的绑定（穿过像 `memo(…)` 这样的包装调用），否则是它自己的名字，并由其具名外层函数限定（`factory.Row`）。同一个文件里两个身份相同的编译器单元会让盘点失败，因为在它们上方插入之后行号和序号都不再成立。`--check`（`bun run check:compiler`，CI）在任何漂移时失败，并指名每个新放弃或现在能编译的函数。新的放弃要么修好，要么通过重新生成来接受（`bun run compiler:census:generate`）。 |
| `compiler-census.baseline.txt` | 已提交的盘点基线。 |
| `compiler-census.test.ts` | 钉住函数的基线身份在它前面插入一个兄弟后仍然存活、嵌套函数由其所有者限定、以及无法区分的编译器单元被拒绝。 |

`designSources.ts` 拥有共享的采纳守卫与编译器盘点的源码扫描：应用源码、`packages/ui`，以及每棵
`thinkrail-extensions/*/web` 源码树，排除测试、生成产物与已安装的依赖。同一批 SDK/扩展根在应用样式表里是显式
的 Tailwind `@source` 指令。扩展源码用的是递归文件 glob：仅以 `*/web` 结尾的通配目录发现不了其中的嵌套文件，
会静默丢掉诸如全屏缩放这样的扩展专属类。浏览器缩放探针检查渲染出的尺寸，而不只是缩放标签，以钉住真实的 CSS
生成。每条 token 的 `*:check` 命令既检查生成输出，也检查它对应的采纳守卫，因此把某个原语移出应用无法掩盖
token 误用，也无法让一个在用的 token 看起来未被使用。

Public surface（公开接口）：`typography.ts`、`colors.ts`、`spacing.ts`、`providerGlyphs.ts`、
`generatedFiles.ts` 与 `designSources.ts` 的导出。没有 `index.ts` barrel——CLI 是从 `package.json` 按名
调用的入口点，而本目录之外唯一的导入方（`src/styles/*.test.ts`）直接导入库，这使测试与生成器关于同一批函数
的一致性是可证明的。

## 边界

- **允许的依赖：** `node:fs`、`node:path`、`node:module`（解析厂商字形集合）、三个 JSON 源 + 它们的
  schema、仅开发用的 `@lobehub/icons-static-svg` 文件（作为*数据*读取），以及另外两处作为*数据*、绝不作为
  导入的读取：`src/themes/schema.ts`（给 `colors.ts`，使角色与 `THEME_COLOR_KEYS` 不会漂移）和
  `apps/web/package.json`（给 `typography.ts`，使 `selfHosted` 条目与已安装的字体包不会漂移）。
- **绝不触碰：** 对 React、Tailwind、`src/` 或任何 `@thinkrail/*` 包的运行时导入，任何运行时（非 dev）依赖，
  以及任何网络或 shell 访问。采纳守卫把源码当数据读；生成器只读它们声明的输入。需要上述之一的生成器会是错误
  的形状。
- **盘点例外：** `compiler-census.ts` 还使用 `@babel/core` 与 `babel-plugin-react-compiler`，并作为*文本*
  从共享源码扫描里读取手写的 TypeScript，因此把一个组件抽取进 SDK 或扩展不会静默地把它从报告里移除。它必须把
  与 `vite.config.ts` 里 `reactCompilerPreset()` 相同的选项传给编译器，并镜像该预设的文件过滤，使它的计数与
  真实构建一致。构建期的编译器校验与 lint 规则不同（例如 `StaticComponents` 只在 lint 里），因此它的计数按
  设计会与 oxlint 的 React 扫描不同。
- **被谁导入：** `apps/web/package.json` 的脚本（`typography:generate` / `:validate` / `:check`，
  `colors:generate` / `:check`，`spacing:generate` / `:check`，`provider-glyphs:generate` / `:check`，
  `compiler:census:generate`，从根 `package.json` 再导出，另有 `compiler:census:check` 作为根的
  `check:compiler`；`compiler:census` 本身仅限 web），以及 `src/styles/typography.test.ts` +
  `src/styles/typographyUsage.test.ts` + `src/styles/colorUsage.test.ts` +
  `src/styles/spacingUsage.test.ts`。发布的应用里没有任何东西可以从这里导入——生成的 CSS 才是接口。
- **写入：** `src/styles/generated/` 与 `src/chat/generated/`，外加盘点的
  `compiler-census.baseline.txt`。两个目录都已提交（因此每次排版、颜色、间距或字形的变化都能作为 diff 被
  复查），并在 `biome.json` 里被排除在 biome 之外。

## 不变量

- **内置调色板重置领起 `@theme inline` 块。** `colors.ts` 在我们自己的条目*之前*发出 `--color-*: initial;`，
  使 Tailwind 的库存调色板（`bg-red-500`、`text-white`）根本不再是工具类——否则库存工具类会愉快地编译通过：
  硬编码、不可主题化，且在复查中不可见。顺序是承重的：若重置在更后的块里发出，会把我们的条目一并抹掉。
- **纯别名角色绝不重新声明自己的调色板变量。** 名字*就是*其调色板键的角色（`primary` → `--primary`）直接
  发布该调色板变量，不发任何 `:root` 行：`--primary: var(--primary)` 是计算值阶段的自引用（无效），今天之所
  以被掩盖，只是因为运行时把调色板写成内联样式，而它优先于 `:root`。
- **JSON 是唯一的来源。** `typography.ts` 机械地推导每个被发出的名字，因此新增 token、样式或 prose 系统
  不需要改动这里。如果新增一个样式需要编辑本目录，那说明命名规则错了。
- **生成是确定且幂等的。** 相同输入 → 逐字节相同的输出；没有时钟、没有随机性、没有环境读取。正是这一点让
  `--check` 成为 pre-commit、`apps/web build` 与 CI 里可用的漂移门禁。行尾是唯一的例外，因为它们属于检出
  而不是内容：`.gitattributes` 把工作树钉在 LF 上，而每次与已提交文件的比较都经过 `normalizeEol`，因此一个
  CRLF 的克隆无法报告并不存在的漂移。
- **门禁是 `validate()`，而不是 JSON Schema。** schema 是面向编辑器的契约（每个源里的 `$schema` 给出补全 +
  行内错误）；工具链没有 JSON Schema 校验器。每个校验器都先镜像其 schema 的封闭根与嵌套对象形状，再执行
  Schema 无法表达的策略。引用完整性、mono 仅用于代码、`title.card` == `title.dialog`、prose 元素集合匹配、
  文档标题阶梯，以及间距步进名/值同一性，全都住在 `validate()` 里。改动任一份契约都意味着检查另一份。
- **生成的文件绝不手工编辑。** 发出的 CSS 头部就写着这一点，而每条流水线的 `*:check` 命令强制执行它。

每个系统本身的设计与理由：[../src/styles/TYPOGRAPHY.md](../src/styles/TYPOGRAPHY.md)（`web-typography`）、
[../src/styles/COLOR.md](../src/styles/COLOR.md)（`web-color`），以及
[../src/styles/SPACING.md](../src/styles/SPACING.md)（`web-spacing`）。
