---
id: module-spec-graph
type: module-design
status: active
title: Spec-Graph pi 扩展
parent: architecture
depends-on: []
tags: [spec-graph, pi-extension]
---

## 职责

`pi-spec-graph` 是一个可移植的 pi 包，它教会 `pi` agent 认识本项目的**规范图**，并让它
搜索、导航与管理规范。它随附一个**技能**、七个 **`spec_*` 自定义工具**，以及一条
项目范围的 **`before_agent_start` 规则**。它不依赖本 monorepo 中的任何东西，因此可在原生 `pi`
下运行；thinkrail 把它打包进每个会话。

它管理仓库规范所用的 frontmatter schema——一个文件只要其 frontmatter 携带
`id` 和 `type` 即为规范；该 schema 本身记录在技能中。Frontmatter 用 `yaml`
库处理，链接/元数据列表内联。`spec_create` 按规范的字段顺序写出新的 frontmatter；
`spec_update` **就地**编辑既有文件——它保留文件自身的字段顺序与任何
注释/嵌套字段，只重写 frontmatter 块（沿用该块原本使用的行尾符），
并保持正文的每一个字节不动。

## 边界

- **拥有：** 规范模型（is-a-spec 规则、派生图、读取索引、校验）、那七个
  工具，以及技能 + `before_agent_start` 规则。
- **Public surface（公开接口）：** 扩展入口 `index.ts`（默认 `ExtensionFactory`）与
  `package.json` 中的 `pi` 清单（`{ extensions: ["./index.ts"], skills: ["./skills"] }`）——即原生 `pi`
  （`pi install`）与 thinkrail（`additionalExtensionPaths` / `additionalSkillPaths`）加载它的方式
  ——外加 **`pi-spec-graph/core` 导出**（不含 pi 的读取模型），可被宿主（thinkrail 的服务端）
  直接消费而不经过 agent。`tools/` 保持为内部。
- **允许的依赖：** `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`typebox`（peer）；
  `yaml`（frontmatter 解析/序列化）；Node 内建模块。
- **绝不触碰：** 任何 `@thinkrail/*` 包——依赖边是单向的（thinkrail → 本
  包），这正是它保持可移植的原因。

## 子模块

`core/`（`submodule-spec-graph-core`）是不含 pi 的规范模型；`tools/`（`submodule-spec-graph-tools`）
是它之上的薄 pi 包装。这条边是单向的——`tools/` → `core/`，经由 core 的 barrel——而
`index.ts` 把各工具加上 `before_agent_start` 规则接进扩展。每个子规范钉住自己的
边界与出口。

## 派生的读取索引

文件系统是事实来源；工具所读取的模型是**派生的、内存中的、只读的，并且
按需重新校验**。每次读取都会重新运行**glob**——一次按名称排序的遍历，忽略
`node_modules`/`.git`/`dist`/`build`，以及其他助手在项目中保留的草稿目录
（`.claude`、`.superpowers`、`.gsd`、`.mockups`、`.playwright-mcp`），它们的计划与生成的技能携带
形似规范的 frontmatter，但并不属于本项目的规范——并按 `(mtimeMs, size)` 重新校验每个文件：未变化的文件
复用其缓存的解析结果，已变化/新增的文件被重新解析，消失的文件被淘汰，而派生图
只在规范集合确实变化时才重建。因此，从任何来源新增、删除或编辑的规范——包括 pi 常规的
`write`/`edit`——始终是最新的，而在什么都没变时多余的重新解析/重建会被
跳过。每个根（以 cwd 为键）复用同一个 `SpecIndex`，因此缓存能在
一个 agent 的多次调用之间产生收益。唯一理论上的漏网情形是一次编辑落在同一个 mtime 刻度内*并且*
保持字节长度不变（可忽略；内容哈希是获准的升级手段）。

## 工具

读取——`spec_grep`（内容搜索，可按元数据收窄）、`spec_get`（一个节点的 frontmatter、已解析的
链接与路径——不含正文）、`spec_graph`（一个有界的 subtree/ancestors/neighbors 切片）。管理——
`spec_create`（它会拒绝索引永远看不到的任何路径——见 `submodule-spec-graph-core` 中的
`resolveSpecPath`——以及任何会写出一个天生非规范文件的参数）、
`spec_update`（仅 frontmatter）、`spec_delete`、`spec_validate`。逐工具的
用法记录在技能中以及各工具的 `description` 中；**它们都不编辑散文**——散文用
pi 常规的 `read`/`write`/`edit` 来写入/编辑。

## 知识传递

概念、schema 与工作流住在**技能**中（通过 `pi.skills` 清单 /
`additionalSkillPaths` 自动发现）。那条常开规则保持规范为权威，同时让查阅具有上下文：
当工作受某个已记录的边界、契约、不变量、行为或架构决策管辖、或可能改变它时，查阅相关规范；
本地化的工作无需阅读无关的规范。该规则在 `before_agent_start` 中作为
`systemPromptOptions.sections` 的 `pi-spec-graph` 条目贡献——就地修改，处理器不返回任何内容——因此它
作为自己的 XML 标签块渲染在 `cwd` 之后，即旧式自由文本追加所在的尾部位置。
返回 `systemPrompt` 会强制整个提示词：任何变化都是一次缓存未命中，而一个具名 section 只是一个被 diff 的补丁。
它不是一个 `promptGuidelines` 条目，因为那会把这条多行规则压平进 pi 共享的 `rules` 列表。
标签 = 包名：全局唯一，而一个可移植的包不得携带宿主品牌。一个返回 `systemPrompt` 的第三方扩展会强制整个提示词，
并丢弃每一个结构化 section，包括我们的——这是 pi 记录的强制语义；接受它，而不是把该规则重新追加到一个被强制的
提示词上。
每个工具携带一个 `description`（其约束）和一行 `promptSnippet`（它在系统
提示词 Available-tools 列表中的条目，与打包的 `pi-web-access` / `visualize` 工具一致）。这是
经扩展实现的、pi 原生的提示词影响，而不是宿主的提示词拼装。

## thinkrail 集成

`packages/server/src/agent/extensions.ts` 以与 `pi-web-access` 相同的方式把本包分层接入每个会话的
`DefaultResourceLoader`：`require.resolve("pi-spec-graph/index.ts")` 放在
`additionalExtensionPaths` 上，该包的 `skills` 目录放在 `additionalSkillPaths` 上。服务端只以解析后的路径引用它
（没有值导入），因此它不进入服务端的 typecheck 图。另外，
`packages/server/src/spec/` 值导入 **`pi-spec-graph/core`**（不含 pi 的模型——该子树内没有任何 pi 包）
以通过线上协议提供只读的 Specs 查看器——与 agent 工具使用的是同一条 is-a-spec 规则、同一个解析器，以及同一个
读取时重新校验的 `SpecIndex`。

## 不变量

- 依赖边是单向的：thinkrail 依赖本包；本包不依赖 monorepo 中的任何东西，
  且 `core/` 不导入任何 `@earendil-works/*`。
- 该索引是文件系统（事实来源）之上的派生读取缓存；它不持有任何权威
  状态——状态归 `pi` 所有——且绝不提供过期的图。
- 工具绝不编辑散文；`spec_update` 仅改 frontmatter、无损（保留注释/嵌套
  字段），并且绝不把一个文件变成非规范。

## 非目标

本包中的 UI（thinkrail 的 Specs 查看器从外部消费 `core/`）、语义/嵌入
搜索、相关代码的 frontmatter 字段、孤立目录检测，以及移动/重命名规范。
