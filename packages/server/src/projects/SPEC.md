---
id: submodule-server-projects
type: submodule-design
status: active
title: projects —— 把 git 仓库作为项目
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## 职责

维护一份已知 git 仓库的稳定登记表，暴露其已打开与最近视图，并在不破坏其工作区身份的前提下打开/关闭
一个项目。对于还不是仓库的文件夹，对它分类并引导它成为一个仓库，以便它能被打开。

## 边界

- **拥有：** 在检查或改动任何项目文件夹输入之前，先把它对着**宿主的文件系统**解析：宿主绝对路径直接
  通过，精确的 `~` 与 `~/…` 对宿主账号展开，其他每一种相对路径都被拒绝，而不是对着宿主进程的 cwd
  解释。同一解析后的路径喂给 `openProject`、`inspectProjectPath` 与 `initProject`，因此它们的分类
  与动作不可能互相矛盾。随后它校验路径是一个仓库（`git rev-parse --show-toplevel`；非仓库以具名的
  `NOT_GIT` 码拒绝），按根去重，并分配一个稳定、唯一、可读的 `slug`；`getProjects` 返回所有已知
  记录并回填 slug，`listProjects` 按 `lastOpened` 返回已打开记录，`listRecentProjects` 按
  `lastOpened` 返回已打开 + 已关闭记录。一个持久化的可选 **`Project.closed: true`** 就是成员资格的
  全部状态：缺失即表示打开，因此既有记录迁移后即为打开。**`openProject`** 即使项目已关闭也能找到已知
  根，清除 `closed`，推进 `lastOpened`，保留其 id，持久化并发布完整快照；**`closeProject`** 把同一条
  记录标记为已关闭并发布它，而不删除项目、仓库、工作区记录或活着的运行时。**一个 cwd，一个 ThinkRail
  身份：** `openProject` 会拒绝（具名 `ALREADY_OPEN`）一个已经被某个工作区的 `worktreePath` 持有的
  根 —— pi 按*目录*索引聊天对话记录，因此一个被拥有的文件夹上的第二个身份会把那个工作区的聊天当作
  自己的来服务，并在任一侧归档时把它们清除。比较是**规范化的**（一个受管工作树存储的路径是拼接出来
  的，而 `--show-toplevel` 给出的是符号链接解析后的结果），并且只在上面的重新打开**之后**进行，因为
  它自己的 Default 工作区合法地持有项目文件夹。同一扇门的工作区侧那一半是 `openExistingWorktree`
  （[[submodule-server-workspaces]]）；为它读取工作区记录仍留在 `persistence` 依赖之内 —— 本模块
  仍然绝不导入它的兄弟。`setProjectPublisher` 是宿主注入的推送接缝；本模块绝不导入 `host`。
  它还拥有 **`inspectProjectPath`**（对一个路径分类 —— `repo` / `initable` / `missing` /
  `notDirectory` —— 使 UI 能在打开、提供初始化、或报错之间选择）与 **`initProject`**（引导一个普通
  目录：`git init` + `git add -A` + 一次 **allow-empty** 的初始提交 —— 提交该文件夹的内容，或在它
  为空时做一次空提交，使仓库得到一个 HEAD 且 `git worktree add` 可用；已经是一个仓库的路径会短路到
  `openProject`；缺失/非目录路径抛错）。该提交**只对 git 尚未配置的字段**提供回退的
  `user.name`/`user.email`，因此真实的全局身份绝不会被覆盖。（“这个项目有规范吗？”**不**在这里计算
  —— `host` 通过 `spec.projectHasSpecs` 回答惰性的 `project.hasSpecs` 查询，使本模块不依赖任何规范
  模块。）项目记录还拥有持久化的项目级技能准入状态：信任被显式且可撤销地授予；该授予会把当前发现的
  项目别名快照为已确认，使后续到达的别名保持待定；而禁用的技能/分组集合构成任何工作区覆盖之下的项目
  基线。宿主把发现与这些改动操作组合起来；本模块不存任何技能目录，也不导入任何 agent 代码。项目记录
  还携带 pi 级信任状态 `piResourceTrust`（对该项目原生 `.pi/` 资源的信任 —— 设置、扩展、技能、提示词、
  主题、`SYSTEM.md`、子代理定义 —— 与别名技能授予相区别）。新加入的项目以 `untrusted` 开始，或在 pi
  本身已经信任其路径时为 `granted`；该答案经由宿主注入的 `setPiTrustSeed` 到达（本模块不导入任何 pi
  代码）。**没有祖父条款**：一条早于该字段的记录按存储原样保留并读作不可信，因此一个在 pi 级信任存在
  之前加入的项目会通过信任提示询问一次，而不是保留没人同意过的、可执行代码的资源（用户决策，PR #690
  评审）。pi 级信任本身绝不启用 MCP：该记录还携带 `mcpApprovals`（仓库定义的 MCP 服务器名 → 整个原始
  项目文件条目的指纹）与 `mcpOverrides`（按项目对用户级服务器的启用/暴露，保持在受跟踪的
  `.pi/mcp.json` 之外）。`setProjectMcpOverride` 同步地只把所提供的字段合并进最新存储的覆盖，因此
  重叠的启用与暴露补丁不会互相丢失。空补丁是 no-op；`null` 清除该覆盖。它在持久化之前拒绝非布尔的
  启用，以及不在 `deferred`、`direct`、`hidden` 之内的暴露。
  `setProjectTrust(id, trusted, acknowledged?, { resources? })` 让两种授予保持分离，因为它们同意的是
  不同的事：pi 级资源包含代码（扩展、设置包），因此只有点名它们的界面才会请求它们。`trusted: true`
  设置别名授予，并且只在 `resources: true` 时设置 `piResourceTrust: "granted"`，否则不动它；
  `trusted: false` 撤销两者。一次信任变更会持久化并发布该记录，因此即使发出它的宿主请求随后失败
  （一个打开的聊天无法重载），每个客户端也都会显示持久化后的信任。
- **Public surface（公开接口，barrel）：** `openProject`, `listProjects`, `listRecentProjects`,
  `closeProject`, `getProjects`, `setProjectPublisher`, `inspectProjectPath`, `initProject`,
  `setProjectTrust`, `setProjectSkillEnabled`, `setProjectGroupEnabled`,
  `acknowledgeProjectSkills`, `approveProjectMcpServer`, `setProjectMcpOverride`, `setPiTrustSeed`
- **允许的依赖：** `persistence`；`git` 子模块（共享的 `git()` 运行器，它现在拥有其子进程派生的环境
  —— 本模块不传任何环境）；`contracts`（`Project`、`ProjectPathStatus`）；`shared/codedError`
  （两个具名的打开失败）；Node/Bun。
- **绝不触碰：** `host`；除 `git` 之外的兄弟特性（`workspaces` 依赖 `projects`，绝不反向）。
