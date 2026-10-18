# ThinkRail

围绕 `pi` 编码 agent 构建、每用一次就变得更好的 agentic IDE。应用是一个运行 `pi` 并把它桥接到丰富 UI 的
薄宿主；模型、技能、压缩（compaction）、成本与会话状态都归 `pi` 所有。

## 按比例读取上下文

- 产品的目标、原则、能力与非目标，读 `goal-and-requirements.md`。
- 系统拓扑、跨模块决策与仓库级不变量，读 `architecture.md`。
- 升级 pi，或围绕 pi 做宿主侧绕行时，读 `pi-compatibility.md`：对照已安装的 SDK 验证每一条适用的移除门禁，
  更新登记表，并报告移除了什么、保留了什么。
- 当工作受某个模块的边界、契约、不变量、已记录行为或架构决策约束，或可能改变它们时，读拥有它的那份
  `SPEC.md`。
- 局部化的改动不需要读无关的规范，也不需要完整的仓库地图。

## 模块结构与边界

清晰、分形的模块边界是优先级最高的要求：

- 每个包以及每个有意义的目录级子模块都有一份 `SPEC.md`，写明它的职责、公开接口、允许的依赖与绝不触碰的
  范围。
- 子模块以 `index.ts` barrel 作为它唯一的公开接口；同级模块通过 barrel 导入，绝不导入内部实现。只有在
  barrel 会破坏代码分割或库的惯例时，才保留逐文件导入，例如 `apps/web/src/panels` 与 `packages/ui`。
- 同级子模块之间的依赖边写在父模块的 `SPEC.md` 里，而不是每个叶子模块里。
- 移动或模糊边界的改动先更新拥有该边界的规范。在可行时用测试覆盖公开接口与边界规则，但不要为局部化改动
  硬造覆盖率。

## 引擎与架构

- 通过 `@earendil-works/pi-coding-agent`（`createAgentSession`）在进程内运行 `pi`，绝不作为子进程运行，也
  绝不通过第二个 agent 运行时运行。提供商/agent 的致命故障可能拖垮宿主；这种缺少崩溃隔离的状态是被接受的。
- 三个环是引擎宿主（`packages/server` + `packages/shared`）、类型化线上协议（`packages/contracts`），以及可
  独立发布的 UI（`apps/web`）。`apps/cli` 与 `apps/desktop` 是同一宿主之上的薄启动器。
- 只使用 `@earendil-works/*` 包作用域。`@mariozechner/*` 已废弃。

## 仓库级不变量

- `apps/web` 只依赖 `contracts`、`ui`、`extension-api/web` 与 `thinkrail-extensions/*/web`，绝不依赖
  `server` 或 `shared`。
- 绝不把 `pi` 值导入到浏览器打包的代码里。类型只从 `pi-ai` / `pi-agent-core` 包根导入；
  `@earendil-works/pi-coding-agent` 仅限服务端使用。
- 单一 id 模型：UI 标签页 id 与 `session.sessionId`；不存在单独的 pi UUID。
- `pi` 拥有状态。宿主暴露 pi 报告的内容，而不是重新计算成本、统计或状态。
- 流式语义：`text_delta` / `thinking_delta` 追加；`tool_execution_update.partialResult` 替换。
- 会话处于流式状态时 `prompt()` 会抛错；改用 `steer()` / `followUp()`。错误通过事件流与被抛出的方法结果
  转发，而不是被当作崩溃信号。
- 自动工作以 `agent_settled` 结束，绝不是 `agent_end`；在尝试级的 `agent_end` 之后，可能还有重试、压缩
  （compaction）、恢复或排队中的后续执行。
- UI 面板与布局无关；由外壳来排布它们。
- 传输层的宿主端点是参数，默认同源；`server.welcome` 携带协议版本。

### Web UI 上下文

做 Web UI 相关工作时，读 `apps/web/SPEC.md` 以及拥有该部分的子模块规范。样式使用 Tailwind v4 工具类，这些
工具类映射到生成出来的语义化 CSS-var token：绝不使用内联 style 对象、裸十六进制色值、内部调色板名称或未知的
token 工具类。颜色相关工作读 `apps/web/src/styles/COLOR.md`，间距相关工作读 `apps/web/src/styles/SPACING.md`。
使用 `@remixicon/react` 图标（默认 Line，激活时 Fill）以及来自 `@thinkrail/ui/<primitive>` 的自有
shadcn/Radix 原语；`cn()` 位于 `@thinkrail/ui/utils`。这些规则同样适用于 `packages/ui` 与扩展的 web 半边。

做对话记录渲染或工具呈现时，读 `apps/web/src/chat/SPEC.md`。呈现型渲染器保持 props 驱动；只有 `ChatView`
集成 store 与传输层。服务端能力与它的 UI 渲染器通过工具名经 `registerToolRenderer` 连接在一起；未注册的
工具使用默认渲染器。

## 规范与注释

规范是意图、决策、不变量、权衡与复盘的长期归宿。保持它们简洁，避免复述代码或另一份规范。注释趋近于零：
lint/type 指令与罕见的单行危险提示是可以接受的；理由与叙述属于拥有该部分的规范。

## 验证

本地测试使用一次性夹具（fixture），不接触生产环境。运行受影响的测试，修复由所请求改动导致的失败，并在每
一步都不必请求批准地重跑它们。

- 用最小的相关单元或聚焦的 E2E 目标迭代。
- 对于已发布应用行为或集成类的改动，在合并后的实现完成之后、最终交接或 PR 之前，完整跑一次无 agent 的
  浏览器套件（`bun run e2e`）——不是每个 TODO 项或每次提交跑一次。
- 当改动触及真实 agent 行为时，还要运行覆盖它的聚焦 live 规范，例如
  `bun run e2e:full e2e/agent-naming.live.spec.ts`；这不需要批准。运行完整的 `bun run e2e:full` 套件之前要先
  问用户：它会消耗真实的提供商 token，并花掉多得多的时间。
- 仅文档/规范类改动与仅测试装置类改动使用针对性的检查，除非它们会影响已发布的运行时。
- 快速门禁：`bun run check:deps`、`bun run check:boundaries`、`bun run check:seams`、`bun run lint` 与
  `bun run typecheck`。单元测试是 `bun run test`；`bun run check:spec-surface` 校验已登记的规范/barrel 公开
  接口；当某个 web 函数相对已提交的盘点基线新退出 React Compiler（或开始被编译）时，`bun run check:compiler`
  会失败。
- `bun run test:workflows` 按需运行：它使用真实的提供商 token，不是提交/CI 门禁。
- 二进制产物模式与桌面产物模式有各自的门禁；改动这些产物时使用它们。

所有 runner 模式、隔离保证、凭据处理、取消行为与调试命令都在 `e2e/SPEC.md` 里；工作流测试装置的细节在
`e2e/workflows/SPEC.md` 里。

## 交接卫生

门禁全绿是必要的，但不充分：

- 本地交接之前，复查任务范围内的工作树与提交。打开或更新 PR 之前，复查完整分支相对其基线的差异（diff）再
  加上工作树。
- 对于非平凡实现，做一轮减法：移除可避免的抽象、状态所有者、依赖、兼容层与回退路径。报告实质性的移除，并
  为保留下来的层给出理由；不要为局部化改动增加仪式感。
- 绝不只是为了让门禁通过就添加 `biome-ignore`、`@ts-expect-error`、`@ts-ignore`、`eslint-disable` 或
  `as any`。把错误当作设计信号。若确实需要抑制，先取得用户的明确批准。
- 在正在复查的同一 diff 范围内审计新增的注释与抑制。不要让先前无关的分支历史污染任务本地的交接。
- 集中重复的非平凡推导。在 web 应用里，派生的 store 状态属于选择器，总是同时发生的写入属于一个原子 action。
- 替换某个模式或状态模型时，搜索每一处旧的出现并迁移它，或者点名那些有意保留的幸存者。
- `README.md` 是面向用户的首页。对于新增、移除或重命名用户可见能力，或改变安装、分析（analytics）行为的
  改动，复查它的陈述并在同一改动中更新受影响的那些；当它描绘的 UI 发生实质变化时，刷新
  `.github/readme-assets/` 下的截图。
- 在已批准的范围内做安全的清理。只在破坏性、超出范围或产品级决策上提问。
- PR 生命周期相关的工作使用 `shipping-a-pr` 技能，包括截图期望与 PR 模板。以程序方式创建 issue 时，复现所
  选的 issue 模板并传入它的 frontmatter 标签。

## 技术栈

Bun + Turbo 工作区 · TypeScript strict · React 19 + Zustand + Tailwind v4 · 进程内 `pi`（Node >= 22.19）。
应用状态位于 `~/.thinkrail` 下。

依赖锁定精确版本。横切依赖在根 `workspaces.catalog` 中只锁定一次，并通过 `catalog:` 引用；peer 依赖与本地
协议是唯一的例外。`architecture.md` 的决策 #10 拥有其理由。
