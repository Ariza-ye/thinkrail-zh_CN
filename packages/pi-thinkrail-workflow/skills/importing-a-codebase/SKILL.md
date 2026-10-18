---
name: importing-a-codebase
description: "当被要求为一个已有源码但没有规范的既有代码库创建初始规范图时使用。通常经由 setting-up-a-project 到达。"
---

# 导入代码库

工作区里有真实的代码，但没有规范。**逆向工程出这个项目本应拥有的规范图。** 当仓库里已经带有真正
像规范一样的文档时，围绕它们来搭建规范图，而不是另建一套与之平行的。尽可能自己从文件里做掉大部分
工作；只有当代码确实无法告诉你、而这个答案又会改变某份规范时，才去问用户。

**守住 writing-specs 的标准。** 起草之前先读那个概念技能 —— 这条流程里的一切都是推断而来而非
确认的，因此它的诚实规则（用户评审前保持 draft、未确认的内容就地标记）在这里约束最紧。

## 1. 先读，最后才问

在提出第一个问题之前先勘察。按大致如下的顺序读：

- **Agent 文件（先挖这些 —— 它们直接陈述意图与约定）：** `AGENTS.md`、`CLAUDE.md`、
  `.cursor/rules/*`、`.cursorrules`、`.github/copilot-instructions.md`、`GEMINI.md`、
  `.windsurfrules`。
- **文档：** `README`、`docs/`、`CONTRIBUTING`、ADR。
- **清单与布局：** `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml`、工作区 glob、
  `tree` 风格的结构、入口点、构建/测试脚本。
- **代码：** 各个候选模块的入口点与开头部分 —— 足以看出各自的职责以及它们之间的依赖边。

阅读过程中，收集**采纳候选**：那些持久、陈述式的文档，它们把世界的现状写在里面 —— 架构/设计文档、
ADR / 决策记录、领域术语表、协议/契约文档。绝不作为候选（仅作输入）：README、CONTRIBUTING、
更新日志、路线图、TODO、实现计划（已完成的或计划中的）、自动生成的 API 文档。

用规范工具（`spec_grep` / `spec_graph`）确认目前还没有规范图。如果规范已经存在，停下并交回
`setting-up-a-project` 这个分派器 —— 这条流程是给还没有规范的仓库用的。

## 2. 建立工作模型

根据你读到的东西，形成一份关于这个项目**是什么**、以及它**如何成形**的工作模型 —— 它保存在对话
里，不写进任何文件（这条流程不声明任何工作文件）：

```
what:       one-sentence purpose (the job the codebase does)
domain:     the space it's in
stack:      languages / frameworks / runtime
modules:    the real boundaries + the dependency edges between them (who imports whom)
invariants: rules the code already enforces (layering, "X never imports Y", public surfaces)
decisions:  non-obvious choices visible in the code (and where the "why" is missing)
```

Agent 文件与 README 通常白白送给你 `what`、`invariants` 和 `decisions` —— 优先用它们，而不是从
代码里重新推导。

## 3. 只访谈空白处

**只**问文件回答不了、且会改变某份规范的东西 —— 典型的是：主要用途 / 它是给谁用的、明确写出的
非目标，以及某个非显然决策背后的*原因*。按 **asking-user-questions** 概念技能的要求分轮访谈它们；
给出一个具体的推断答案让用户来纠正，而不是问开放式问题。

只要文件没有回答，就有两类问题属于这一轮 —— 代码展示的是*什么*，很少展示*为什么*：

- **你的工作模型里每个非显然决策背后的原因**，而文件没有解释的 —— “我看到 X 是这样做的 ——
  为什么？” —— 把你推断出的理由作为选项。答案写进拥有该决策的那份规范。
- **已知限制** —— 一个 multiSelect，列出你看到的空白（未处理的情形、TODO、缺失的测试、慢路径）
  让用户确认；被确认的记录进拥有它的规范。

如果存在采纳候选，就往同一轮里加一个问题：一个列出它们的 multiSelect（多的时候分组 —— 一整套
`adr/` 算一个选项）—— 哪些应该成为规范图节点？此刻已发现的、候选与代码之间的矛盾也放进这一轮
（确认纠正）。被跳过或被拒绝 → 一个都不采纳；候选仍作为输入，在交接时注明。

如果文件已回答了所有实质内容 —— 包括那些原因和限制 —— 就**跳过访谈**并说明这一点；不要制造问题
（仅有采纳候选也仍然构成一轮 —— 这个提议绝不会因为“没有空白”而被取消）。被跳过或被拒绝的问题
不是阻塞项：把假设就地记录在规范里，并标记为未确认。

## 4. 自上而下起草规范图

边做边用规范工具保存（每个节点一次 `spec_create`，散文用 `edit`）。顺序：

1. **`goal-and-requirements.md`**（`type: goal-and-requirements`）—— 产品是什么、为什么，用
   `writing-specs` 规定的目标文档形态来写；能力就是代码已经做到的事。这是规范图的根；已确认的
   意图住在这里。
2. **`architecture.md`**（`type: architecture-design`，`parent: <goal id>`）—— 拓扑、模块边界、
   真实的依赖边（只有携带真实信息时才画一个小 DAG），以及代码所执行的不变量。
3. **每个真正的模块一份简短的 `SPEC.md`**（`type: module-design`，包内目录级的模块则用
   `submodule-design`；`parent:` 为包住它的模块或 `architecture`）。每份都写明它的**职责**和它的
   **边界**（允许的依赖 / 绝不触碰）。

**被采纳的文档就地成为节点。** 首先，对每个被接受的候选：仔细读一遍，然后在文件所在的位置加上规范
frontmatter（`id`、`type`、`title`、`status: draft`、`parent`；`depends-on`/`references` 只在确
有其事时才加）—— 内容不动。被采纳文档填上的位置不再重复起草：被采纳的架构文档*就是*
`architecture-design` 节点，被采纳的模块设计文档*就是*那个模块的节点，一份 ADR 只有在它的决策仍然
有效时才挣得一个节点。围绕它们搭建规范图的其余部分，用 id 链接。对“内容不动”的唯一例外：当被采纳
的文档表述不清或已与代码脱节时，在采纳过程中改正那些内容，并把这次纠正指出来（来得及就在访谈轮里
指出，否则在交接时指出）。

用 `parent` 来映射代码的层次结构，`depends-on` 只用在代码确实展示出来的边上。**你起草**的每个文件
都要达到 **writing-specs** 的标准 —— 它的粒度规则与“每件事只说一次”的规则决定了什么算一个模块、
共享的边住在哪里。如果某个边界确实不清楚，去问，或者把那份规范留作 `draft` 并附一行备注 ——
不要大费周章地猜。

## 5. 校验并交接

- 运行 `spec_validate`；修掉悬空链接、重复 id、父级环路。
- 告诉用户规范已起草在这个工作区的分支上 —— **在 Changes 里评审它们；在他们批准之前，什么都不会
  合并** —— 并总结哪些是你推断的、哪些是他们确认的，哪些文档被采纳了、哪些留作输入，以及所做的
  任何脱节纠正。
- 之后的 feature、行为变更和 bug 修复走 `brainstorming`；不改变行为的工作直接继续。**本工作流
  在此结束**。
