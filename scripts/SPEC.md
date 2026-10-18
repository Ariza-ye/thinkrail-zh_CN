---
id: module-repo-scripts
type: module-design
status: active
title: 仓库开发与一致性脚本
parent: architecture
references: [module-contracts, module-server, module-web, module-cli, module-desktop, module-ci-release, module-thinkrail-extensions]
tags: [tooling, boundaries, build]
depends-on: [module-spec-graph]
---

## 职责

属于整个仓库的开发编排与一致性门禁，它们不属于任何单个产品包。这些脚本验证架构、规范与产物假设；
它们绝不实现产品行为。

## 边界

- **拥有：** 多进程开发启动器；精确版本/catalog 校验；PI 二进制接缝的 canary 检查；模块依赖/import 边界校验；
  声明的 spec 公开接口与 TypeScript barrel 的一致性；以及把原本彼此独立的产品实现组合起来的聚焦
  根契约测试。
- **Public surface（公开接口）：** 开发者、Husky 与 CI 使用的根 `package.json` 命令。
- **允许的依赖：** Bun/Node、TypeScript 编译器 API、用于权威规范/frontmatter 模型的
  `pi-spec-graph/core`、用于 CommonMark 块结构的 `mdast-util-from-markdown`；对工作区 manifest 与源码树
  的只读检查；每个检查所校验的公开包元数据与 bundle 产物；以及当根测试装置必须在不建立产品依赖的
  前提下证明某个跨包契约时，对真实产品内部实现做的仅测试用途 import。
- **绝不触碰：** 产品运行时逻辑；包或特性行为的第二处来源；在检查过程中编辑源码；或聚焦根契约测试
  之外的应用内部 import。根契约测试可以组合实现，但绝不能成为协议来源或产品依赖。

`check:boundaries` 在扫描真实工作区之前先运行检查器自身的聚焦测试。它同时强制 manifest 边与静态源码
import，包括 type-only、动态、re-export、CommonJS、import-type、包子路径以及相对路径的跨模块形式。
生成目录/构建目录被排除在外，包括 Hutch 投射出的 `.hutch` SDK 树与临时的 `.cottontail-tmp` 加载器。
当前的产品环与启动器边是穷尽的：contracts、`pi-delegation` 与 `pi-background-commands` → 无；
`pi-subagents` 与 `pi-dag` → `pi-delegation`；shared → contracts；server → contracts/shared 加上它既有的
打包扩展与委派包；web → contracts 以及下面的浏览器 SDK/扩展入口；CLI → server/shared；desktop →
server/shared/contracts；artifact-tests → CLI/server/shared。产品包不得 import artifact-tests。未来的
组合根必须新增一条显式规则，而不能静默继承对所有工作区包的访问权。

扩展边界遵循 [[module-thinkrail-extensions]]，并且由被发现的 manifest 注册，而不是一份固定的扩展名单：

- 在 `apps/*`、`packages/*`、`pi-extensions/*` 与 `thinkrail-extensions/*` 下发现工作区根。每个被发现的
  pi 扩展都不得有宿主工作区依赖。每个 ThinkRail 扩展都会被扫描，包括试点之外的扩展。
- 仅当 `packages/ui` 与 `packages/extension-api` 存在时才注册它们，这样边界优先的交付方式无需未来的
  SDK manifest。两者都可以依赖 contracts，但绝不依赖宿主内部实现。UI 允许逐文件的公开 import；
  extension-api 的浏览器使用方必须恰好使用 `@thinkrail/extension-api/web`，不得使用它的根入口、server
  入口、深层路径或相对路径绕过。服务端使用方使用它公开的 `./server` 入口。
- 扩展 manifest 可以声明其两半依赖的并集。它的 `web/**` 源码可以使用 UI、extension-api 公开的 `./web`
  以及 contracts；它的 `server/**` 源码可以使用 extension-api 公开的 `./server` 及对应的
  `pi-extensions/<name>` 包。两半都不得以相对路径或 type-only 语法 import 另一半，即使在同一个包内也不
  可以。扩展代码不得 import 宿主内部实现。
- `apps/web` 只能消费被发现的扩展恰好公开的 `@thinkrail/ext-*/web` 入口；`packages/server` 只能消费
  `@thinkrail/ext-*/server`。根入口、深层路径、另一半入口与相对源码 import 一律被拒绝。它们的 manifest
  可以依赖该扩展包，因为 manifest 无法表达子路径边。既有的 server pi-package 边保留，直到每个扩展的
  server 接线交付完成。
- 浏览器源码（web 应用、UI、extension-api 的浏览器半边以及扩展的 web 半边）绝不能 import
  extension-api 的 server 半边。整个 extension-api 保持运行时浏览器安全：pi 的类型可以描述 server
  契约，但两个入口都不得以值的形式 import pi。浏览器源码与 contracts 同样拒绝 pi 的值 import，包括未
  注册为工作区根的外部 pi 包。显式的类型 import/re-export 仍受既有工作区边规则约束；type-only import
  不能绕过被禁止的模块边或源码半边。

这些是静态字面量 import 检查，不是运行时模块解析器。负向文件系统夹具覆盖与真实工作区门禁相同的发现
与扫描入口。

`check:spec-surface` 只接纳带有 `public-surface-checked` 标签的有效规范。接纳是显式的，这样新增散文不会
悄悄把强制检查关掉：被接纳的规范必须保留一份纯反引号的标识符列表和一个可发现的 TypeScript barrel，
否则检查失败。未被接纳的散文式公开接口保持描述性质，只由 `--list-skipped` 报告。

TypeScript 编译器解析 barrel 的有效导出名，包括 type-only 导出、默认导出与传递性 re-export；CommonJS 的
`export =` 赋值算作该模块唯一的 `default` 公开接口，而不是所赋值对象的合成成员。无法解析的 re-export 是
违规，而不是静默地得到一个不完整的公开接口。声明的名字集合与有效的名字集合必须在两个方向上完全匹配。
文件系统层面的测试通过 CI 调用的同一个运行器来检验接纳、解析与失败行为。
