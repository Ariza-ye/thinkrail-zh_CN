---
id: submodule-web-chat-tools-mcp
type: submodule-design
status: active
title: mcp 渲染器（mcp__* 调用、资源工具、tool_search）
parent: submodule-web-chat-tools
depends-on: [module-contracts]
tags: [chat, mcp]
---

## 职责

为 pi 内置的 MCP 引擎提供展示型渲染器，按工具名接合：`McpToolCard` 用于每一个 `mcp__<server>__<tool>` 调用
（注册表唯一的前缀注册）、`McpResourceListCard`（`list_mcp_resources`、`list_mcp_resource_templates`）、
`McpReadResourceCard`（`read_mcp_resource`）、`ToolSearchCard`（`tool_search`），以及纯的 `mcpResult` 读取器。
`register.ts` 把它们接线为常规的卡片 chrome 工具，并由父级 `tools/register` 以副作用方式导入。

## 卡片读取什么

- 定稿后的结果只保留 `content`、`details` 和 `isError`。卡片按顺序渲染 `content` 文本块，像 pi 那样用换行
  连接：pi 已经把资源链接、内嵌资源、音频和已保存的 blob 变成文本行。卡片绝不绘制图像块——父级公共的
  result-content 层会在每个渲染器之后追加那一条图像条。
- `details` 携带 pi 的 `McpToolDetails` 和宿主的 `details.thinkrail` `McpResultSummary`。每个字段都过一道
  守卫；任何缺失或畸形的字段都按更旧对话记录的方式来渲染（标题取自名字，文本取自 `content`）。摘要的
  `blocks` 不被绘制，因为 pi 的文本已经携带了它们；卡片读取 `structuredContent`、
  `structuredContentTruncated` 和 `isError`。
- 标题是 `details.server` / `details.tool`（pi 未清洗过的名字），否则就是工具名在 `mcp__` 之后的第一个 `__`
  处切开——抛出的调用携带 `details: {}`。被哈希缩短过的名字按尽力而为的方式解析。
- 参数是一个键/值列表（字符串原样，其他值作为缩进 JSON，即 pi 展开后的形式）；折叠摘要就是 pi 的
  `key=JSON` 单行式，在 100 个字符处截断。
- 结构化内容只是一个可折叠的 JSON 树；表格视图被推迟。它折叠在一个 disclosure 之下。打开时，至多 40 个
  节点的树完全展开，更大的树只展开顶层，而一个分支在 “Show all” 之前列出 100 个子项。每个 disclosure 都以
  JSON-pointer id 记录在共享的 fold 缓存中，因此状态能熬过虚拟化。`structuredContentTruncated` 显示的是
  “Structured content too large to keep.”。
- 失败的调用（`status: "error"`，或摘要的 `isError`）像其他工具错误那样给它的输出上色。

## 动作

两者都通过 `ChatActions` 到达（绝不经过 store/transport）。`null` 的提供商（子代理对话记录、独立渲染）或
比 MCP 更旧的宿主会把它们隐藏起来。

- 当 `details.fullOutputPath` 被记录、且提供商提供 `readMcpOutput` 时，出现 **Full output**；`ChatView` 把
  它实现为 `mcp.readOutput({ workspaceId, sessionId, toolCallId })`。卡片绝不发送或链接该路径——宿主读取的
  正是结果所记录的那个文件。文本在按内容定尺寸的对话框里打开（最多 85vh），而不是内联，因为一行里最多
  1 MiB 会扭曲虚拟化对话记录的几何。状态：加载中、文本（注明宿主截断）、*已过期*（pi 的临时文件已消失）、
  *不可用*，以及带 Try again 的请求失败。加载过的答案在卡片保持挂载期间被保留；失败会在下次打开时重新读取。
  与共享的图像预览一样，对话框属于卡片所在的行，而不是 `ChatView`（与子代理对话记录不同，它不需要集成状态），
  因此把该行滚出虚拟化范围的运行会关闭它。
- **Sign in / Open MCP settings** 用一个调用 `openMcpSettings` 的按钮替换 pi 面向 CLI 的说明
  （`requires sign-in`、`needs sign-in`、`mcp login`、`Run /mcp …`），该按钮打开 Settings › MCP servers；
  当该按钮被提供时，所显示的失败文本（调用输出与列表的逐服务器错误都一样）会去掉
  `Run /mcp …` / `Run /login <provider> …` / `pi mcp login …` 那句（`stripMcpCliInstruction`，经由
  `useMcpFailureText`）并保留服务器的消息，而没有 `ChatActions` 的独立渲染则逐字保留 pi 的文本。由提供商
  支撑的错误（`Run /login <provider>`）是另一回事：它们的动作打开 Settings › Providers，绝不是 MCP OAuth，
  且其文本在非 CLI 的说明里保留提供商身份。没有那个提供商动作时，原始说明仍然可见。登录类短语优先于裸的
  `/mcp` 说明。检测只在失败的结果和列表的逐服务器 `errors` 上运行，那正是 pi 发出这些短语的地方；仅仅提到
  登录的成功服务器输出仍保持为文本。

## 资源卡片与 tool_search 卡片

- **列表**给出服务器名，对全量列表调用则是 "All servers"，pi 用 `details.server: ""` 这样报告。行来自宿主的
  结构化载荷（整份列表最多 64 KiB），否则来自 JSON 文本。pi 会在文本超过 20 KB 时从中间截断，因此无法解析
  的文本回退为原始输出并配上 Full output。全量列表会多一列服务器；显示 20 行之后是 "Show all"；
  `nextCursor` 表示还有更多；逐服务器的 `errors` 渲染为携带登录动作的错误行。
- **读取**显示服务器和 URI，然后是内容文本；图像走共享的图像条。
- **`tool_search`** 显示查询（以及 limit），然后是 `details.loaded`，附上来自 pi `- name: description`
  行的单行描述。无匹配或未知 details 时逐字显示 pi 的文本。

## 边界

- **拥有：** 这些渲染器、`mcpResult` 读取器，以及它们的注册。
- **Public surface（公开接口）：** 只有副作用 `register`（按文件导入，与父级一致）。
- **允许的依赖：** 父级 chat 原语（`toolRegistry`、`ChatActions`、`foldState`）、兄弟 `Collapsible`；
  `@thinkrail/extension-api/web`；`contracts`（仅类型——`McpToolDetails`、`McpResultSummary`、
  `McpContentBlockSummary`、`McpReadOutputResult`）；`@thinkrail/ui/*`；`@remixicon/react`。
- **绝不触碰：** 值导入 pi 或任何 MCP 包；`store`/`transport`。列表行是 pi 文本 JSON 的本地解析视图，不是
  线上协议契约。

## 必须做对的事

- MCP 调用像任何其他工具一样保持**常规**：需要登录的失败折叠进活动运行里，而 chat 资源的注意标记仍是那个
  一眼可辨的信号。
- `tool_search` 与那三个资源工具都是精确注册；只有 `mcp__` 按前缀解析。
- 只用 token 工具类样式（不用裸十六进制 / 内联 `style`）。
