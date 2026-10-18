# 为 ThinkRail 做贡献

感谢你对 ThinkRail 的关注！各类贡献都受欢迎——bug 报告、修复、功能、文档与反馈。

参与贡献即表示你同意你的贡献按 [Apache License 2.0](LICENSE) 授权，并且你同意遵守我们的
[行为准则](CODE_OF_CONDUCT.md)。

## 报告 bug 与请求功能

开一个 GitHub issue。提交之前先搜索已有 issue，避免重复。bug 报告请包含：

- 你做了什么、你期望什么，以及实际发生了什么
- 你的 OS、Bun 与 Node 版本
- 相关日志或一个最小复现

## 开发环境搭建

**前置要求：** [Bun](https://bun.sh) 1.4.0（本仓库锁定的包管理器与运行时）、Node.js ≥ 22.19（进程内 `pi`
引擎所需），以及用于 agent 工作的已认证 `pi` 提供商。

```bash
git clone <repo-url>
cd thinkrail
bun install
bun run dev
```

`bun run dev` 同时启动宿主与 web 客户端，并在 `Ctrl+C` 时清理。源码/dev 运行以及本地未盖章的构建不提供应用
更新器：用 Git 更新工作副本并重新构建它。从源码运行 `thinkrail update` 会安装已发布的二进制；它不会拉取代
码、安装依赖，也不会重建工作副本。磁盘上的应用状态（项目、工作区、工作树）位于 `~/.thinkrail` 下。

要运行启动器：

```bash
bun run --filter @thinkrail/cli dev  # browser launcher
bun run build:binary                 # standalone CLI artifact
bun run desktop:dev                  # package and open the Electrobun app
bun run desktop:build                # package without opening it
```

桌面相关命令使用标准的 Electrobun CLI/配置。它的构建前钩子构建共享 UI 并暂存 ThinkRail 的 PI/原生资源；
Electrobun 拥有 preload 打包与安装器创建。用 `bun run desktop:package:stable` 或
`bun run desktop:package:canary` 创建宿主原生安装器；`canary` 是 Electrobun 对公开 **nightly** 通道的内部叫法。
原生/安装器冒烟测试与共享的 CLI/桌面探针位于 `packages/artifact-tests`，在应用包之外。dev 构建之后运行
`bun run smoke:desktop`；安装器冒烟测试通过 `bun run smoke:desktop:installer <path> <stable|canary>` 接收产物路径
与通道。本地安装器冒烟测试不是公证验证：协调式的 macOS 发布流水线会为 Electrobun 展开后的应用归档签名并最终
确定 DMG，而那个中间归档不是公开下载。

## 仓库布局

[`architecture.md`](architecture.md) 列出每个应用与包及其角色和允许的依赖；每个模块都带有自己的 `SPEC.md`。

## 测试与 lint

打开 PR 之前运行快速门禁（它们也作为 husky pre-commit 钩子运行）：

```bash
bun run lint        # biome
bun run typecheck   # tsc across all packages
bun run test        # unit tests (root tooling + each package)
```

每一个触及应用的改动都由端到端套件针对真实 UI 验证。无 agent 的门禁只构建一次，并自动使用隔离的并行分片
（可用 CPU 的一半，上限为八）：

```bash
bunx playwright install chromium                    # one-time
bun run e2e                                         # complete no-agent gate
bun run e2e -- e2e/changes.spec.ts                  # focused iteration
bun run e2e -- --last-failed                        # repair loop
bun run e2e:serial                                  # one-host debugging fallback
bun run e2e -- --shards=12                          # explicit 1–16 override
bun run e2e:binary                                  # packaged CLI host (build first)
bun run e2e:desktop                                 # packaged desktop host (build first)
bun run e2e:full                                    # everything; needs pi auth
bun run e2e:agent                                   # only @agent; remains serial
```

迭代期间使用聚焦运行或 last-failed 运行，然后在交接之前完整跑一次 `bun run e2e`。在 macOS 上，每个公开的
浏览器 E2E 命令都会在 runner 的生命周期内阻止系统空闲休眠，同时允许显示器正常休眠。agent 驱动的规范标记为
`@agent`，在**隔离的** `pi` agent 目录上针对真实提供商运行——绝不是你真实的 `~/.pi/agent`。

## 模块边界

ThinkRail 被构建为一组边界清晰、分形的模块：每个包是一个模块，包内的目录也是模块。子模块通过 `index.ts`
barrel 暴露它的公开接口；同级模块通过那个 barrel 导入，绝不导入它的内部实现。每个模块都有一份 `SPEC.md`，
写明它拥有什么、暴露什么，以及绝不触碰什么。把改动保持在这些边界之内，并在可行时用测试覆盖模块的公开接口。

## 规范驱动开发

ThinkRail 采用规范优先的方式开发：分层的、互相连接的规范与代码一起放在仓库里——顶层的规范在仓库根目录
（[`goal-and-requirements.md`](goal-and-requirements.md)、[`architecture.md`](architecture.md)），每个模块则在
它旁边有一份 `SPEC.md`。**规范先于代码：** 移动或模糊某个边界、契约或决策的改动，先更新相关的 `SPEC.md`，
再更新代码以及钉住它的测试。规范工作流见 [`AGENTS.md`](AGENTS.md)。

## 提交改动

1. [Fork 仓库](https://docs.github.com/articles/fork-a-repo) 并从 `main` 开一个分支。
2. 做出你的改动，保持聚焦。与周边代码风格以及 `AGENTS.md` 中的约定保持一致。
3. 新增或更新测试与规范，并运行上面的检查。
4. 针对 `main` 开一个 [pull request](https://docs.github.com/articles/creating-a-pull-request)，
   清晰描述改动了*什么*以及*为什么*。

提交信息与 PR 描述要解释改动背后的理由，而不只是操作步骤。维护者会复查你的 PR，并可能在合并前提出调整
建议。
