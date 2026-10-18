---
id: pi-compatibility
type: architecture-design
status: draft
title: pi 兼容性——宿主适配与升级移除门禁
parent: architecture
references: [submodule-server-agent, submodule-server-agent-mcp, submodule-server-history, submodule-server-templates, module-cli, module-desktop, submodule-web-chat]
tags: [pi, compatibility]
---

## 职责

为弥补缺失的 pi API、pi 缺陷或打包限制而存在的那部分宿主代码的升级检查清单。pi 仍是引擎与状态所有者。模块规范
拥有详细理由；这份索引记录一次升级必须重新检查什么，以及什么条件能让我们删除该适配。
已安装版本只来自根依赖目录，
而不是本文件里的第二个锁定。

## 最近一次复检

下面每一条 MCP 条目都已对照已安装的目录版本重新检查并保留：公开导出、内置 MCP 配置/写入器代码、`openUrl`、
关闭顺序与启动派发，以及短暂的 `structuredContent` 都没有变化。那次升级把 `structuredContent` 拓宽为任意 JSON
值，连接时不再枚举资源（状态措辞 `connected · N tools · resources`），取消在 OAuth 刷新期间被放弃的请求，并新增
`reachesTools`；状态解析器与结果摘要测试覆盖了这两处可见变化。

## 升级契约

每一次 pi 升级都对照**已安装包的导出与实现**检查每一条条目，而不只是发布说明或上游 issue 的状态。升级的验证摘要
点名被移除、带证据保留或被改变的适配，并运行受影响的测试。
新的绕行要在这里加一条条目，并在拥有它的规范里写明理由；
它被移除时同时删除该绕行与其条目。对等失败是漂移的证据，不是削弱测试的许可。

移除宿主实现之前，公开 SDK 替代品必须保持会话隔离、取消、项目信任、持久对话记录与已编译/桌面行为。在生产中导入
私有 dist 路径并不是替代品；这类导入仍只限于对等测试。

## MCP 适配

### 配置加载器与写入器

**拥有：** [[submodule-server-agent-mcp]]，`agent/mcp/config.ts` 与 `writers.ts`。
pi 的公开 `loadConfig` 钩子整体替换它的加载器；它的加载器、校验器与写入器都不是公开导出。宿主移植了它们的文件语义，
以施加项目策略并执行安全的多客户端写入。**移除门禁：** 一个公开的加载器/校验器/写入器接口，保持条目来源信息，并
允许在项目覆盖合并之前进行准入。对照已安装的 `core/mcp-servers` 与 `extensions/mcp/config` 验证这次移植；运行
`agent/mcp/config.test.ts` 与 `host/mcp.test.ts`。宿主侧的遏制、陈旧写入检查与私有策略仍是宿主的义务。

### 运行时状态、管理与登录结果

**拥有：** [[submodule-server-agent]]，`mcpSessions.ts` / `mcpSignIn.ts`，以及
[[submodule-server-agent-mcp]]，`status.ts` / `log.ts`。
pi 通过 `/mcp` 与通知暴露管理功能，而不是一个类型化控制器。宿主捕获这些命令，解析状态与结果文本，读取 pi 的日志
格式，并用一个隔离的 pi 会话做设置探针。OAuth 与凭据留在 pi 里；授权 URL 可通过 pi 公开的 `openUrl` 回调获得，
不需要文本解析器。**移除门禁：** 一个公开的每会话状态读取/订阅与可取消的管理/认证 API，加上用于日志读取的结构化
诊断。运行 `mcpEngine.test.ts`、`mcpSignIn.test.ts` 以及 MCP 状态/日志/脱敏测试；当 pi 的措辞变化时，验证现代状态
推送与遗留通知脱敏两者。

### 有序的引擎关闭与重载准入

**拥有：** [[submodule-server-agent]]，会话生命周期，以及 [[submodule-server-agent-mcp]]，`engine.ts`。
`AgentSession.dispose()` 不会发出关闭信号，而 pi 顺序式的扩展关闭可能被一个无关的处理器拖住。宿主捕获内置的 MCP
关闭处理器，并在普通的拆除/重载之前启动它，从而保留一条有界的宿主退出路径。被捕获的关闭与 runner 发出的关闭共享
同一个每次加载的清理 promise；重载在准入替换之前等待真正的清理。pi 在等待关闭之前就清空它的服务器列表，因此幂等
不足以保证完成顺序。宿主还在关闭之后守护真正的 MCP 启动/变更回调：`beforeSessionStart` 位于整个异步派发之前，
无法单独阻止迟到的启动。**移除门禁：** 一个公开的生命周期，它独立于无关处理器关闭 MCP，在重复关闭时汇入同一份
真正的清理，只在清理完成后才准入替换，并且即使较早的处理器在销毁之后恢复也阻止启动。重新检查完成顺序与
`AgentSession.reload` 钩子，而不只是幂等；运行 `sessionShutdown.test.ts`、`reloadGate.test.ts`，以及 MCP
删除/重载/进程生命周期回归测试，包括一个顽固的旧 PID 和一个在关闭期间因异步 `resources_discover` 而暂停的启动派发。
仅凭 `AgentSessionRuntime.dispose()` 不足以证明这些宿主义务消失了。

### codemode 未打包期间的暴露

**拥有：** [[submodule-server-agent-mcp]]，`normalizeExposureForHost` 与工具搜索激活。
文件配置的 `codemode` 暴露变为 `deferred`；已注册的服务器仍可通过 `tool_search` 到达。**移除门禁：** 在 CLI 与
桌面端交付 pi 的 codemode worker/WASM，然后在没有归一化的情况下保持原生暴露。运行配置/暴露测试与共享产物探针；
仅凭公开工厂可用并不能确立打包支持。

### 持久的呈现细节

**拥有：** [[submodule-server-agent-mcp]]，`results.ts`，以及 [[submodule-web-chat]]。
pi 的原始 `structuredContent` 会到达钩子，但不会被保留在最终确定的对话记录消息中。宿主存储有界的、不含 base64 的
呈现细节，使实时卡片与恢复后的卡片一致。**移除门禁：** pi 提供等价的、有界的持久表示。重新检查结果形状与完整输出
路径；运行 `mcp/results.test.ts`、`mcpEngine.test.ts`、web MCP 卡片测试与 `e2e/mcp-tool-cards.spec.ts`。绝不
仅为了删除适配器就持久化完整的原始结果。

## 其他对 pi 敏感的宿主接缝

- **仅图像的排队输入**——[[submodule-server-agent]]，队列投射。宿主弥补 pi 只支持文本的已投递消息移除
  （[上游 #8612](https://github.com/earendil-works/pi/issues/8612)），并保留被破坏性队列 API 丢失的图像内容。当已
  安装的实现原生处理该情况时移除对应的绕行；验证队列/图像回归，而不只是 issue 状态。
- **打包扩展的加载与图像处理**——[[submodule-server-agent]]、[[module-cli]]、[[module-desktop]]。强制的 Jiti
  转换、虚拟模块身份、静态提供商注册以及图像缩放覆盖，桥接了单文件产物无法发现或加载的资源。只有当 pi 提供等价的
  产物接缝时才逐个替换；运行 `check:seams` 与相关的二进制/桌面产物探针，包括扩展值导入与图像。
- **无头主题**——[[submodule-server-agent]]，`plainTextTheme`。pi 的终端主题不会由 SDK 会话创建初始化。当 pi
  提供可用的非 TUI 主题契约时移除这个子类；针对整个继承的接口运行 `webUiContext.test.ts`。
- **信任发现与排除式重载**——[[submodule-server-agent]]，`projectTrust.ts` 与 `extensions.ts`。按资源类型的发现
  镜像 pi 私有的、需要信任的路径，而排除式加载器保留可重载的扩展路径与内置排除项。在可用时优先使用公开的发现/过滤
  API；每次改动资源加载时都运行 `projectTrust.test.ts`、`extensions.test.ts` 与 `piRuntime.test.ts`。
- **会话发现与提示词模板解析**——[[submodule-server-history]]、[[submodule-server-templates]]、
  [[submodule-web-chat]]。在公开 API 无法服务其读取/编辑 UI 的地方，宿主镜像 pi 的会话目录/JSONL 发现与提示词
  模板/frontmatter 规则。当公开的发现/解析 API 满足这些需求时优先使用它们；在那之前保持历史、模板与输入框测试里的
  对等覆盖。

## 不是临时的 SDK 绕行

项目服务器审批、私有的项目/聊天覆盖、确认策略、凭据遮蔽、线上协议能力检查与 React 呈现都是刻意的 ThinkRail 行为。
它们的所有者是 [[submodule-server-agent-mcp]] 与 [[submodule-server-agent]]。一次 pi 升级不会悄悄移除或削弱它们。
复用上游策略是一个单独的兼容性/产品决策，而不是假定名称相似的 API 具有相同语义。
