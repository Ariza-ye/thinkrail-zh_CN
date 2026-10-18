---
id: module-pi-extensions
type: module-design
status: draft
title: 可移植的 pi 包（pi-extensions/）
parent: architecture
tags: [pi-extension, publishing]
---

## 职责

这是 ThinkRail **发布到 npm**、并且必须在**不带 ThinkRail 的原版 `pi`** 中可用的那些 pi 包在工作区中的根。
这里的每个包都是一项能力（工具、技能），agent 可以在任何地方使用它；ThinkRail 只是众多嵌入方之一。能力的
ThinkRail 专属半边位于 [[module-thinkrail-extensions]]，绝不在本模块里。

在某个包的接线 PR 落地之前，它在 `packages/pi-*` 下的前身保持原封不动并由宿主加载 —— 两份副本是故意共存的，
接线 PR 会删掉旧的那份。新包从 `version: 0.0.0` 开始，并靠它的第一个 changeset 得到第一个真实版本。

## 身份与分发

- npm 名 `@thinkrail/pi-<name>`（npm 组织是 `thinkrail`；组织名 = scope），目录 `pi-extensions/<name>/`。
  私有工作区包共享该 scope，但保持 `private: true`；拥有该组织可以防止它们的名字在 npm 上被他人占用。最早在
  过渡性的 `thinkrail.ai` 组织下发布的包（只有 `@thinkrail.ai/pi-visualize@0.1.0`）已在那里弃用并指向此处。
  这个 scope 是刻意的：无 scope 的 `pi-*` 名字会冲突（`pi-subagents` 属于第三方），而 scope 能在
  `pi.dev/packages` 画廊里表明归属 —— 那个画廊是带 `pi-package` 关键字的 npm 包的索引，并没有什么注册表可以
  提交。
- **两种形态。** 一个*可安装的 pi 扩展*带 `pi` manifest（`extensions: ["./index.ts"]`、存在时的 `skills`、
  `image`）以及 `pi-package` 关键字。一个*可移植库*（例如 delegation）只有具名导出 —— 没有 manifest、没有
  关键字、绝不是一个空操作的 factory —— 并通过它打包后的使用方来验证。
- **原始 TypeScript，没有构建步骤**（pi 通过 jiti 加载入口点）。`files` 是每个包各自的白名单，列出入口点与
  `exports` 传递性 import 到的一切，测试除外；`exports` 保留既有使用方用到的每个子路径（例如 `./core`）。
  Pi SDK 包是 `peerDependencies: "*"`；在存在 TUI 渲染的地方，`@earendil-works/pi-tui` 是 `"*"` peer。受测的
  pi 版本就是根 catalog 的版本，绝不在这里重述（架构决策 10）。
- ThinkRail 宿主通过 `workspace:*` 消费这些包；发布出来的产物由对等门禁验证，而不是由宿主验证。

## 原版对等门槛

在一个包首次发布之前必需，它也是"能在原版 pi 中工作"的定义：

- 从它的**打包 tarball** 安装，依赖由 npm 解析，通过 pi 自己的解析器/加载器零诊断地加载，并注册它的工具与
  技能。（本地路径的 `pi install` 什么都不装 —— 它只记录路径 —— 所以门禁从不使用它。）
- **双运行时。** 原版 pi 是一个跑在 Node ≥ 22.19 上、带 jiti 的 npm CLI；ThinkRail 在 Bun 下运行同一份代码。
  发布的代码只用 `node:` 内建模块与标准 ESM —— 没有 `Bun.*`、`bun:*` 或 Bun 特有的 `import.meta`。
- TUI：在纯文本回退读起来糟糕的地方提供 `renderCall` 与 `renderResult`；每次 UI 调用都在 `ctx.hasUI` 之后。
  **在真实终端里的手动检查**（Ghostty/iTerm2，以及 tmux 内）是门槛的一部分。
- 没有 ThinkRail 假设：没有 `~/.thinkrail` 路径，没有宿主线上协议，除兄弟可移植包外没有 `@thinkrail/*`
  import。
- 门禁：`bun run check:pi-packages`（`scripts/check-pi-packages.ts`，CI 任务 `pi-packages`，无需提供商）。它
  打包该包以及每个待发布的可移植工作区依赖，在 tarball 里 grep 只有 Bun 才有的 API，把 tarball 加上 catalog
  版本的 pi 安装到**仓库之外**的临时 agent 目录（使用 pi 自己的 npm 策略 `--legacy-peer-deps`），配置
  `packages: ["npm:@thinkrail/pi-<name>"]`，然后把 `scripts/pi-package-parity.node.mjs` 复制**进夹具**并在
  Node 下运行它，使 pi 从夹具中解析（Node 会忽略 `import.meta.resolve` 的父 URL —— 从脚本自身位置解析会
  悄悄测到仓库自己的 pi）。运行器通过 `DefaultResourceLoader.reload()` 加载，断言零错误以及预期的工具/技能，
  并执行一张每包用例表（工具调用、预期文本/错误，以及一次 `renderResult(...).render(width)` 检查）。*会话
  绑定*的工具（在 `session_start` 中注册，例如 subagents、background-commands）将需要一种在 pi 的 faux
  提供商上绑定隔离 `AgentSession` 的模式 —— 随第一个交付此类工具的那一波一起加入。依赖 token 的 smoke 保持
  按需运行。

## 发布

`@changesets/cli`（catalog 锁定；`privatePackages: { version: false, tag: false }`，因此只有这个根会被升版本或
打标签）。改动已发布包的 PR 要添加一个 changeset（`bun changeset`）。**升版本是人工步骤**：维护者在一个分支
上运行 `bun run release:version`（`changeset version` + `bun install`）并开一个普通 PR —— JetBrains 的组织策略
禁止 Actions 创建 PR，而普通 PR 还能得到普通 CI，机器人开的 PR 得不到。当该 PR 进入 `main` 后，
`.github/workflows/release-pi-packages.yml` 在带 `id-token: write` 的 `npm-release` 环境里运行：重新运行对等
门禁，然后运行 `bun run release:publish`（`scripts/publish-pi-packages.ts`），后者在任何 changeset 仍待处理时
（版本尚未提升）提前退出，否则**先依赖后依赖方**地发布每个版本还不在 npm 上的包：`bun pm pack`（把
`workspace:*`/`catalog:` 重写为精确版本，满足决策 10）→ 在 npm Trusted Publishing 下执行
`npm publish <tgz> --provenance --access public`（Bun 没有 OIDC 认证；npm ≥ 11.5.1）→ 仅当脚本报告
`readyToTag=true` 时才 `changeset tag` + 推送：没有待处理的 changeset、不是 dry run，并且当前每个公开版本都在
npm 上（现在或更早发布的，例如手动 bootstrap）。因此提前退出绝不会给占位的 `0.0.0` 打标签，而 `changeset tag`
会跳过已存在的标签，这让标签推送失败后的重试是安全的。

Trusted Publishing 是按*已存在*的包配置的，所以每个新包都要先做一次手动 bootstrap 发布：
`bun run release:pack <dir>` 打包它，并为 npm 组织所有者打印 `npm publish … --provenance=false` 命令（manifest
的 `publishConfig.provenance` 否则会让本地发布失败；只有 CI 能出具证明）。

顺序：visualize → delegation + subagents → background-commands → spec-graph → todos。不发布：
`pi-thinkrail-workflow`（工作区内部）、`pi-dag`（直到它有使用方）。

## 边界

- **允许的依赖：** pi SDK peer、兄弟 `pi-extensions/*`、精确声明的普通 npm 运行时依赖。
- **绝不触碰：** `@thinkrail/*` 宿主包、`packages/server`、`apps/*`、`thinkrail-extensions/*`。
- 兄弟之间的依赖边（例如 subagents → delegation）在存在时列在这里：`subagents → delegation`、
  `dag → delegation`。

## 成员

| 包 | 形态 | 备注 |
| --- | --- | --- |
| `visualize` | 扩展 | `visualize` 工具；用 `lovely-mermaid` 做 TUI 制表符绘制与尽力而为的原版校验；导出 `createVisualizeExtension({ validateMermaid })`，使嵌入方可以注入严格校验器 —— ThinkRail 就是这样做的，来自 [[module-ext-visualize]]。详情：[[module-pi-visualize]]。 |
