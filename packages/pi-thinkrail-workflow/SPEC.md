---
id: module-thinkrail-workflow
type: module-design
status: active
title: pi-thinkrail-workflow —— 交付工作流系统的 pi 扩展
parent: architecture
depends-on: [module-spec-graph]
tags: [pi-extension, workflow, skill, workflow-system]
references: [module-workflow-tests]
---

## 职责

`pi-thinkrail-workflow` 是一个 pi 扩展，交付 ThinkRail 的**工作流系统** —— 那套把 agent 应当
*如何完成一件工作*编纂下来的技能。（对比：`pi-spec-graph` 定义规范模型*是什么*；`visualize` 是一个
渲染工具。）它恰好贡献两样东西，由 `package.json` 的 pi 清单接线
（`pi: { extensions: ["./index.ts"], skills: ["./skills"] }`）：

- **`index.ts`** —— 一个 `ExtensionFactory`，注册一条始终启用的 `before_agent_start` 规则：在一件
  新工作开始时，把项目上手、PR 生命周期工作，以及对产品行为的一切改动（一个功能、一次行为变更或一个
  bug 修复）送到根路由器技能（`choosing-a-workflow`）；入口模型及其理由住在
  [[submodule-workflow-skills]]（规则 4）。已经被路由过的工作续跑它当前的工作流；不改变任何行为的
  工作直接继续，既不加载也不声明任何工作流。
- **`skills/`** —— 工作流技能族：分类出符合工作流条件的工作的根路由器，以及从它到达的工作者技能与
  概念技能。**权威名册是 [[submodule-workflow-skills]] 里的族表**，与系统的设计 —— 概念模型、技能
  角色、元规则、逐技能理由 —— 放在一起。本规范不保留自己的名册（第二份列表会漂移 —— 这个项目符号
  原先替换掉的局部枚举已经过时了，它漏掉了概念技能），并且只在某个包级别的决策与某个具体技能相关时
  才点名它（上面的根路由器；边界之下的编写清单）。

这个包通过添加 `skills/<name>/` 子模块来生长（如果将来需要，新的工具会放进一个 `tools/`
子模块）；布局 —— 以及系统的形态 —— 不会为了添加下一个技能而改变（[[submodule-workflow-skills]] 中的
元规则 12）。

## 知识传递

机制与 `pi-spec-graph` 相同（[[module-spec-graph]]）：每个工作流住在它自己的技能里，经由
`pi.skills` 清单 / `additionalSkillPaths` 自动发现。`before_agent_start` 规则镜像
`pi-spec-graph` 的 `SPEC_RULE` —— 包括它的机制：处理函数在 `pi-thinkrail-workflow` 标签下修改
`systemPromptOptions.sections` 并返回空，因此 pi 只修补那一个小节，而不是强制整份提示词
（[[module-spec-graph]] 拥有该理由）。简短且字节稳定，好让它随每一次运行而不搅动提供商的提示词缓存；
它是一根指针，不是复述 —— 它只在新的工作开始时生效，而已经路由过的续跑会恢复它当前的工作流。路由规则
只在路由器技能里存在一次；每个工作流的步骤只在它自己的技能里存在一次。setting-up-a-project 这一族
不携带自己的规则 —— 根路由器把项目上手路由到分发器（它的 `description` 也会自触发），在应用内，
Welcome 屏幕的 "Set up project" 卡片会播下 `/skill:setting-up-a-project` 命令 —— 那是 pi 的技能
命令语法，它**强制**分发器加载，而不是依赖描述匹配（见 [[module-web]]）。

## 边界

- **允许的依赖：** `@earendil-works/pi-coding-agent`（**仅类型** —— `ExtensionAPI`/`ExtensionFactory`），
  作为 `peerDependency`。没有 `typebox`：这个包不注册任何自定义工具，只有一条 `before_agent_start`
  规则和技能内容。
- **绝不触碰：** 任何 `@thinkrail/*` 包、`apps/web`、`packages/server` 内部 —— 只按工具*名字*
  （`ask_user_question`、`spec_*`）到达，绝不通过导入。
- **不可移植，并且对此诚实。** 与 `pi-spec-graph` 和 `@thinkrail/pi-visualize` 不同，这个包的技能
  内容假设宿主的 `ask_user_question` 工具（`packages/server/src/agent/askUserQuestion.ts`）存在于
  会话中 —— 那个工具只存在于 thinkrail。这个包不声称能在原生 `pi` 下运行；它是工作区内部的模块，
  不是可移植的能力。它仍然保持为独立的包、而不是折进 `packages/server`，理由与 `packages/shared`
  不折进 `server` 相同：不可移植并不等于与基础设施运行时耦合。一份 `SKILL.md` 与 WS/会话层没有
  运行时耦合 —— 它只需要一条交给 `additionalSkillPaths` 的路径。
- **编写清单随产品一起交付 —— 这是有意的。** `writing-workflow-skills` 是面向开发者的（它编辑这个
  包），但它仍像这一族的其他成员一样被暂存进每个 ThinkRail 项目：排除一个技能会让暂存路径变复杂，而
  收益很小，何况它的触发面很窄。技能正文携带相应的
  工作区守卫 —— 当 `packages/pi-thinkrail-workflow` 不在工作区时（一个由 ThinkRail 管理的项目，那里
  这些技能只是一份只读的暂存缓存），它用一行说明这一点并停下；这一族只在其源头 thinkrail 仓库
  扩展。

## thinkrail 集成

`packages/server/src/agent/extensions.ts` 用与 `pi-spec-graph` 相同的方式加入这个包：
`require.resolve("pi-thinkrail-workflow/index.ts")` 放在 `additionalExtensionPaths` 上，它的
`skills/` 目录放在 `additionalSkillPaths` 上。

## 测试

`index.test.ts` 钉住这个包拥有的唯一一处运行时行为：工厂注册一个 `before_agent_start` 处理函数，
它把 `WORKFLOW_RULE` 放进 `systemPromptOptions.sections` 并返回空 —— 对由用户提示词启动的运行和由
自定义消息启动的运行都一样（pi 1.2 对两者都发出该事件，用 `messageType` 区分）—— 而 pi 自己的渲染器
（`buildSystemPromptSections` / `buildSystemPrompt`）把这些被修改的选项变成一个
`<pi-thinkrail-workflow>` 块，排在 `cwd` 之后并结束整份提示词 —— 即旧的自由文本追加所处的尾部位置。
pi 不从它的包根或 `core/index.ts` 重新导出那个渲染器（只有它的
`BuildSystemPromptOptions`/`NormalizedBuildSystemPromptOptions` 类型是从根导出的），因此测试按解析后
的路径触达 `dist/core/system-prompt.js`；一个挪动了它的 pi 会大声地打断导入，而不是静默削弱断言。
选项字面量被标注为 `NormalizedBuildSystemPromptOptions`，因此形态变化就是编译错误。这条规则的*措辞*
是散文，不是契约，因此保持不钉。

技能行为由**工作流测试装置**以无头方式测试 —— 设计、判据模型、套件与覆盖率住在
[[module-workflow-tests]]（`bun run test:workflows`；按需运行 —— 需要 pi 认证、会消耗真实 token，
绝不是提交/CI 门禁）。逐技能的观察状态住在族表里（[[submodule-workflow-skills]]）。切片 3（工作者
流程端到端）已部分落地：`importing-a-codebase` 跑在测试装置的 importing 套件里（采纳 + 回归场景，
随文档采纳工作一起加入）。剩余的后续 —— 只有场景定义，没有新机器：经用户模拟器跑
`starting-a-new-project` / `brainstorming` 的完整流程（设计记录：[[module-workflow-tests]]）。

导入分支还**通过应用**被一个打了标记的 `@agent` 浏览器 e2e 覆盖
（`e2e/setting-up-a-project.live.spec.ts`）：它把一个工作区工作树变成只有代码的项目，驱动 Welcome
卡片上确切的 `/skill:setting-up-a-project` 命令，并断言该流程起草出 `goal-and-requirements.md`
（在 Specs 侧栏里渲染）—— 证明按钮的 `/skill:` 种子在 `session.prompt` 路径上驱动了这条流程，而
那是没有任何无头场景覆盖的。

## 非目标

- 一个可在原生 pi 下移植的工作流包 —— 那将需要用一个最低公约数的提问机制替换 `ask_user_question`；
  对一个只属于 thinkrail 的宿主特性来说不值得（见边界）。
- 工作流的任何运行时/引擎层 —— 见 [[submodule-workflow-skills]] 中的“没有运行时机器”。
- 重新实现旧 thinkrail 的 `claude-plugin` **工单/看板工程工作流**（它的
  ticket-orchestrator、ticket-implement、bug-fix、spec-review 等技能 —— thinkrail 团队曾用它来构建
  thinkrail 自身）。那是给另一个基于工单的产品的开发工具，而这里没有看板或工单系统可供它运行。
  移植单个*面向产品*的技能仍然没问题 —— `setting-up-a-project` 就是这样来的
  （[[submodule-workflow-skills]]）。
