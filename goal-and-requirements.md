---
id: goal-and-requirements
type: goal-and-requirements
status: active
title: ThinkRail — 产品目标与范围
covers: [product-goal, product-audience, product-principles, product-capabilities, product-non-goals, engine-decision]
tags: [product, scope]
---

## 目标

ThinkRail 是那个每用一次就变得更好的 agentic IDE。它是一个运行 `pi` 并把它桥接到丰富 UI 的薄宿主，把工作隔离到
独立的工作区，并通过活规范与可复用的技能赋予 agent 持久的项目知识——因此 agent 工作不必碰终端就能上手，并保持
隔离、可审查与以规范为依据：用 agent 构建而不失去控制。

本文档描述产品当前的样子以及它为何存在，并随产品一起变化：落地的能力加到这里，改变了的决策在这里重写。它不持有
任何版本号或路线图。

## 问题

`pi` 是一个刻意保持极简、可扩展的 agent harness。这种灵活性要花时间：新手需要花很长时间学会驾驭它，而有经验的
用户仍然觉得终端在为 agent 服务的那部分工作上很笨拙。

- **并行的 agent 在同一个工作树里相互碰撞**——既彼此碰撞，也与用户自己的编辑碰撞。
- **从 CLI 审查 agent 改动很困难**：读 diff、在确切的行上评论，再把那些反馈交回给 agent。
- **意图会蒸发。** 在聊天中做出的决策随会话结束而结束；下一个会话会重新推导它们，或者与之矛盾。

## 面向谁

在真实 git 仓库上用 `pi` 构建的人——想要可视化上手坡道的新手、想要围绕 agent 的 IDE 又不想放弃 pi 深度的有经验
用户，以及想快速前进又不失去对 agent 所做之事控制的 agent 优先构建者。

## 价值

- **默认隔离。** ThinkRail 创建的工作区是一个带自己分支与 cwd 的 git 工作树：agent 并行运行，主分支在用户合并之前
  保持干净。直接在项目文件夹（默认工作区）里工作是显式的选择，绝不是默认。
- **围绕 agent 的真实 IDE。** 编辑器、diff、终端与审查在一个工位里，因此用户能看到并引导 agent 的工作，而不是
  从回滚缓冲里重建它。
- **规范作为事实来源。** 项目的意图住在代码旁的规范图里，agent 读取、搜索并维护它，因此意图能跨越会话存活。
- **pi 的全部，没有任何隐藏。** 模型、技能、扩展与会话状态仍归 pi 所有；ThinkRail 增加的是一个界面，不是第二个
  agent。

## 原则

每个功能都遵循的长期决策；[[architecture]] 承载强制它们的结构。

- **pi 是唯一的引擎**，以进程内方式运行——没有第二个运行时（没有 `claude-agent-sdk`）。`pi` 拥有模型登记表、
  系统提示词、技能/扩展、压缩（compaction）、成本与会话状态。
- **通过喂入来影响，绝不通过拼装。** 功能只能通过它们喂给 `pi` 的东西——提示词上下文、文件、pi 自己的技能/扩展
  ——以及会话启动时的标志来塑造 agent。
- **暴露，不重算。** 宿主展示 `pi` 报告的内容，而不是推导自己的副本。
- **用户自己的工具与凭据。** Git、GitHub 与模型访问通过用户的 `git`、`gh`、`central` CLI 以及 pi 的提供商认证
  进行；ThinkRail 不保留自己的账号或 token。
- **信任是显式的。** 一个克隆下来的仓库可能向 agent 注入什么——它提交的技能别名、pi 自己的项目资源（`.pi/` 设置、
  扩展、技能、提示词、子代理定义），以及它定义的 MCP 服务器——只有在为每个项目授予信任之后才会加载；仓库定义的
  MCP 服务器还需要每一项的批准，条目改变时该批准失效。
- **规范优先。** ThinkRail 以规范优先的方式构建，并帮助它打开的项目也这样工作。

## 能力

ThinkRail 在做什么，产品层面的说明；细节归链接的规范所有。

- **两个启动器，一个应用**——原生桌面应用与在浏览器中打开同一 UI 的 `thinkrail` CLI，两者内嵌同一个宿主；状态
  位于 `~/.thinkrail` 下（[[module-desktop]]、[[module-cli]]）。
- **项目 → 工作区**——一个 git 仓库就是一个项目；一个工作区就是一个 git 工作树，另外还有内置的默认工作区（项目
  文件夹本身）与就地附加的已有工作树（[[submodule-server-workspaces]]）。
- **工位**——文件、diff、文档、聊天与终端的可拆分布局，带有可移动的侧边与底部工具面板，且本地于每个窗口
  （[[submodule-web-shell-layout]]）。
- **界面语言**——英文与简体中文，默认跟随系统，可在设置中即时切换并作为客户端本地偏好；用户与 agent 的内容保持
  不变（[[submodule-web-i18n]]）。
- **聊天**——每个工作区并发的 `pi` 会话，各自拥有自己的模型、pi 上报的 token/成本、运行中的引导（steer）与追加
  消息（follow-up）、技能与提示词模板补全，以及历史搜索（[[submodule-web-chat]]、[[submodule-server-agent]]）。
- **复用已有技能**——为其他编码 agent 保存的可移植 Agent Skills 被就地读取；`pi` 仍是解析器与运行时
  （[[submodule-server-agent]]）。
- **带每步审查的计划**——一份由 agent 推进、由用户编辑的共享 TODO 计划；当一个已完成步骤的改动可证明是它自己的
  时候，该步骤会单独提交，并可由独立审查者审查（[[module-pi-todos]]、[[submodule-server-todos]]、
  [[submodule-server-host-plan-review]]）。
- **子代理**——委派到隔离的子会话，可前台、并行或后台（[[module-pi-subagents]]）。
- **审查**——在文件与 diff 上的锚定评论，收集时不启动 agent，并作为结构化上下文发送给能解决它们的聊天；这是
  本地审查，不是 forge 集成（[[submodule-server-reviews]]）。
- **打开 PR**——推送工作区分支，并通过用户的 `gh` 打开或更新它的 GitHub PR，回退到预填的 compare URL
  （[[submodule-server-pr]]）。
- **规范**——agent 通过 `spec_*` 工具搜索、导航并维护规范图；只读的 Specs 工具把它渲染为树
  （[[module-spec-graph]]、[[submodule-server-spec]]）。
- **工作流**——内置的工作流技能，用于项目搭建、设计头脑风暴与发布 PR（[[module-thinkrail-workflow]]）。
- **提供商**——通过 pi 的认证在应用内登录与使用 API key，以及通过用户的 `central` CLI 使用 JetBrains AI
  （[[submodule-server-auth]]、[[central-integration]]）。
- **agent 工具**——Web 研究，以及聊天中的行内图表与对比（[[submodule-web-chat-tools-web]]、
  [[module-ext-visualize]]）。
- **MCP 服务器**——pi 内置的 MCP，从用户的 `mcp.json` 读取，从设置中管理，并在每个聊天中与后台命令和子代理一起
  可见；在可能改变数据的调用之前会先确认（[[submodule-server-agent]]、[[submodule-web-panels]]）。
- **工作区周边**——在已安装的编辑器或 IDE 中打开工作树，以及让应用本身保持最新
  （[[submodule-server-editors]]、[[submodule-web-updates]]）。
- **品牌**——ThinkRail 绿色强调色（深色主题上明亮，浅色主题上加深，使两边都通过 AA）、Darcula 家族的深色背景、
  用于品牌展示角色的 Orbitron，以及用于 UI 与代码的 Geist 与 JetBrains Mono（[[submodule-web-themes]]、
  [[web-typography]]）。

## 非目标

只有这些是被决策排除的。既未在上面列出、也未在此排除的任何东西都是开放的，而不是被禁止的。

- **第二个 agent 运行时**，或任何宿主侧的 agent 循环或提示词拼装（见原则）。
- **ThinkRail 账号或登录 UI。** 谁能到达一个宿主由网络决定——Tailscale ACL 与设备身份（[[architecture]]）。
