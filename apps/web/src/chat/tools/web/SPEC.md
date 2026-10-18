---
id: submodule-web-chat-tools-web
type: submodule-design
status: active
title: web 工具渲染器（搜索 / 抓取 / 已存储内容）
parent: submodule-web-chat-tools
depends-on: [module-contracts]
tags: [chat, web-tools]
---

## 职责

为精确锁定的 **`pi-web-access`** 扩展所暴露的全部三个工具提供展示型渲染器，并通过**工具名**与该能力接合：
`WebSearchCard`（`web_search`）、`WebFetchCard`（`fetch_content`）和 `WebStoredContentCard`
（`get_search_content`）。`register.ts` 通过 `registerToolRenderer`（外加折叠头部摘要）接线这三者，并由父级
`tools/register` 以副作用方式导入。

## 边界

- **拥有：** `WebSearchCard`（查询 + 提供商 + 合成的回答/来源）、`WebFetchCard`（抓取的 URL 或本地视频路径 +
  提取出的内容）、`WebStoredContentCard`（响应 id + 选中的查询/URL + 恢复出的完整内容）、它们共享的折叠
  Markdown 结果体，以及注册。
- **Public surface（公开接口）：** 除副作用 `register` 之外没有别的（没有 barrel——chat 会引入 shiki；与它的
  兄弟模块一样按文件导入）。
- **允许的依赖：** 兄弟/父级的 chat 原语（`toolRegistry`、`ToolFileLink`、`Collapsible`、`Markdown`）；
  `@thinkrail/extension-api/web`（`ToolRenderProps`/`ToolStatus` + 纯辅助函数）；`@remixicon/react`。
- **绝不触碰：** 值导入任何 `pi` 包或 `pi-web-access`；`store`/`transport`（渲染器保持展示型——随时可抽取进
  `packages/chat-ui`）。

## 必须做对的事

- **防御式渲染。** `pi-web-access` 的 `details` 形状不是稳定的公开 API，因此尽力读取 `result`（提供商名经由
  可选链获取），否则渲染工具的**文本内容**（`resultText`）——绝不要硬依赖某个 `details` 字段。参数驱动
  头部/摘要：搜索用第一个查询；抓取用第一个 URL/本地路径；已存储内容用选中的查询/URL 再加响应 id。
- 成功的文本内容被折叠并作为 Markdown 渲染，因此合成的引用与抓取的链接是真正安全的新标签页链接，而不是高亮的
  Markdown 源码。错误文本保持纯文本。
- `fetch_content` 只把 HTTP(S) 当作外部锚点。任何其他输入都是结构化的本地路径候选，并使用父级的工作树门禁；
  外来的绝对路径保持惰性，而不是变成失效的同源链接。
- 只用 token 工具类样式（不用裸十六进制 / 内联 `style`）。
- 工具名 `web_search` / `fetch_content` / `get_search_content` 必须与扩展完全一致。
