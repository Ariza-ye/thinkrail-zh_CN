---
name: managing-mcp-servers
description: 当用户要求添加、修改、删除、启用或禁用 MCP server，或某个 MCP 工具缺失、需要登录、失败、被阻止时使用。ThinkRail 在进程内运行 pi，因此没有可调用的 `pi` 命令。
---

# 在 ThinkRail 中管理 MCP 服务器

ThinkRail 使用 pi 内置的 MCP 支持，但没有 `pi` 可执行文件。绝不运行 `pi mcp add`、
`pi mcp login` 或其他 `pi` 命令；改为编辑配置文件，并把凡是需要动手的事情都指向
**Settings › MCP servers**。

## 服务器在哪里配置

- **用户级** —— pi 的 agent 目录，通常是 `~/.pi/agent/mcp.json`：在每个项目中都可用。
- **本仓库** —— 工作树中的 `.pi/mcp.json`，由 git 跟踪。这里定义的服务器在用户在 Settings 中批准之前
  不会运行，之后对其条目的任何改动都需要重新批准。只有当用户信任该项目时它才会加载。

两个文件都使用 pi 的格式：

```json
{
  "mcpServers": {
    "docs": { "url": "https://example.com/mcp" },
    "browser": { "command": "npx", "args": ["-y", "@playwright/mcp@0.0.83"] }
  }
}
```

- 在 `args` 中固定包版本；绝不用 `@latest`。
- 绝不把密钥写入这两个文件中的任何一个。改为引用 `${ENV_VAR}`（来自宿主的环境变量）或
  `!command`（该命令的输出，例如 `!gh auth token`），或者让用户登录。
- `exposure`：`deferred`（此处的默认值 —— 先用 `tool_search` 加载该服务器的工具）、
  `direct`（少量始终有用的工具），或 `hidden`。`codemode` 按 `deferred` 处理。
- 个人服务器优先放在用户级文件里；只有当用户希望某个服务器与仓库共享时，才把它放进 `.pi/mcp.json`。

## GitHub

GitHub 是一份配方，不是预设：使用它的托管服务器，用用户的 GitHub CLI 登录来认证。
把它加到用户级文件里（Settings › MCP servers 在 Paste JSON 下也提供同样的条目）：

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/readonly",
      "headers": { "Authorization": "!t=$(gh auth token) && echo \"Bearer $t\"" }
    }
  }
}
```

- `/readonly` 是 GitHub 有文档记载的只读模式（等同于 `X-MCP-Readonly: true` 头）。仅当用户要求
  会修改数据的工具时，才使用 `https://api.githubcopilot.com/mcp/`。
- 该 header 命令在每次聊天连接时运行。`gh` 处于登出状态时它会失败，而不是发送空 token；
  用户需在终端中运行 `gh auth login`。
- 未经验证：GitHub 是否对每个工具集都接受 GitHub CLI token 的 scope。如果服务器拒绝了它，
  请用户提供环境变量中的 token：`"Authorization": "Bearer ${GITHUB_TOKEN}"`。

## 编辑之后

宿主会自行重载空闲的聊天，忙碌的聊天会在空闲时接上这次改动。当某一步需要用户来做时，要告知用户：
批准一个仓库服务器，或者为使用 OAuth 的服务器点 **Sign in**（两者都在 Settings › MCP servers 中）。
不要让他们重启 ThinkRail。

## 使用 MCP 工具

- 工具命名为 `mcp__<server>__<tool>`。对于 `deferred` 服务器，调用 `tool_search` 来加载它们。
- 子代理不能调用 MCP 工具：由你自己调用，并把子代理需要的内容写进它的任务里。
- 对于可能改动数据的调用，ThinkRail 会先询问用户。被拒绝或取消的调用对该次调用是最终结果；
  未经先询问用户，不得重试。
