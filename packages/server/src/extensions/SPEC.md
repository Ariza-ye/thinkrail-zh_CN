---
id: submodule-server-extensions
type: submodule-design
status: active
title: extensions —— ThinkRail 扩展的服务端注册表
parent: module-server
depends-on: [module-extension-api, module-thinkrail-extensions]
tags: [extensions, public-surface-checked]
---

## 职责

宿主列出它所组合的 ThinkRail 扩展的唯一场所（[[module-thinkrail-extensions]] § 组合）。`registry.ts`
静态导入每一个 `@thinkrail/ext-*/server`，并导出有序条目 `{ specifier, extension }` —— 即
`defineServerExtension` 描述符**以及**它作为字符串的公开服务端说明符。这些静态导入通过常规的服务端
依赖图，把工厂带入编译后的 CLI 二进制与桌面 server-runtime bundle，因此打包器不为注册表扩展生成
任何工厂清单。

## 边界

- **拥有：** `serverExtensions`（有序条目）、`registryInlineExtensions(kind, isDisabled?)`（把
  `extensions` / `childExtensions` 摊平为以扩展命名的 pi `InlineExtension` —— 单个工厂保留裸名，
  多个则得到 `name#n` —— 使 pi 诊断显示 `<inline:visualize>` 而不是一个位置；每个工厂都在 **pi
  加载它时**询问 `isDisabled(name)`，因此一次重载会重新决定成员资格而无需重建加载器）、
  `omitDisabledRegistryExtensions(result, isDisabled)`（从 pi 的 `LoadExtensionsResult` 中剔除已
  禁用扩展的 `<inline:…>` 条目，供父加载器的 `extensionsOverride` 使用，使已禁用的扩展是缺席的
  而不是存在但为空）、`registryExtensionName(path)`（把一个 `<inline:name>` / `<inline:name#n>`
  路径 —— 扩展或其工具的 `sourceInfo.path` —— 映射回拥有它的注册表扩展，否则为 `undefined`）、
  `listExtensionCatalog(disabled)`（设置里的目录：每个条目含 `name`、`title` —— 缺失时回退到
  `name` —— 可选的 `description`、`hasChildExtensions`、`enabled = !disabled.has(name)`，以及其
  **父**工厂对着一个记录用的桩 `ExtensionAPI` 所注册的工具名，该桩的其他每个成员都是惰性的；每个
  进程计算一次，绝不来自活跃会话，而对着桩抛错的工厂会保留它在抛错之前已记录的工具），以及
  `resolveExtensionSkillRoots(entry)`（属主范围的技能解析器：从 `specifier` 取得该扩展的入口文件，
  再经 `createRequire(extensionEntry)` 取得每个 `skillPackages` 清单，返回其 `pi.skills` 目录；
  一个已具名但没有任何技能的包会显式失败）。说明符之所以保持为字符串，正是因为描述符持有函数，
  而函数不产生模块身份。
- **Public surface（公开接口，barrel）：** `serverExtensions`, `ServerExtensionEntry`,
  `registryInlineExtensions`, `RegistryExtensionKind`, `ExtensionDisabled`,
  `omitDisabledRegistryExtensions`, `registryExtensionName`, `listExtensionCatalog`,
  `resolveExtensionSkillRoots`
- **允许的依赖：** `@thinkrail/extension-api/server`（类型）、每一个 `@thinkrail/ext-*/server`、
  `@earendil-works/pi-coding-agent`（仅类型）、`@thinkrail/contracts`（`ExtensionCatalogEntry`
  类型）、Node 的 `module`/`fs`/`path`。
- **绝不触碰：** `host`；`settings`（禁用集合作为参数传入）；兄弟特性；用宿主自己的
  `createRequire` 解析扩展所拥有的包（宿主不依赖扩展所组合的那些 pi 包，因此该解析在隔离布局中会
  失效）。

## 使用方

`host` 用 `listExtensionCatalog` 在 `disabledExtensions` 设置之上回答 `extension.list`。
`agent/extensions.ts` 把摊平后的父集合组合进每个资源加载器，并把子集合组合进 dev 与打包模式下都
一样的那组精选隐藏子扩展；`buildSupport.ts` 为两个打包器暂存摊平后的技能根目录；未打包的 dev 在
运行时解析同样的根目录，而打包后的运行时只使用启动器暂存的根目录。
