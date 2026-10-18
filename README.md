# ThinkRail

[![JetBrains incubator project](https://jb.gg/badges/incubator-plastic.svg)](https://confluence.jetbrains.com/display/ALL/JetBrains+on+GitHub)

ThinkRail 是那个每用一次就变得更好的 agentic IDE——今天通过活规范（living specs）学习你的项目，明天构建自己
的能力。

我们围绕 [`pi`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) 编码 agent 构建了丰富的界面，
把工作隔离到独立的工作区，并通过活规范与可复用的技能赋予 agent 持久的项目知识。接下来，我们正在加入完整的扩展
支持，让 ThinkRail 能依据你实际的工作方式创建它所需的工具。

**网站：** [thinkrail.ai](https://thinkrail.ai/) · **博客：** [thinkrail.ai/blog](https://thinkrail.ai/blog/)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/workbench-dark.png">
  <img src=".github/readme-assets/workbench-light.png" alt="ThinkRail 工作台：左侧工具轨道旁的 Projects 窗格列出工作树工作区及其 Settled 搁架，中间是一场已完成的 pi 对话及其工具步骤，旁边是它产出的差异，右侧 Specs 树位于 Changes 列表之上，各自的工具在边缘轨道上" width="900">
</picture>

*一次 `pi` 会话以及它所做的改动，范围限定在一个隔离的 git 工作树工作区里。*

## 你将得到什么

- **隔离的工作区。** 把任何 git 仓库作为项目打开，并从中切出 `git worktree` 作为工作区，每个都有自己的分支与工作
  目录。agent 并行工作而不碰你的工作副本；合并好的分支，删掉其余的。你也可以附加已有的工作树，或者明确地在项目
  文件夹本身里工作。已完成与休眠的工作区会自行归入每个项目的搁板——当它们的 pull request 被合并或关闭时，或者经
  过一个安静周之后——而你在其中工作的那一刻它们就会回来。
- **围绕 agent 的真实 IDE。** 一个可拆分的工位，包含 Monaco 编辑器标签页、实时的 git 更改视图、终端与文档——全部
  限定在活跃工作区内。在文件与差异（diff）上留下锚定的审查评论，并把它们作为结构化上下文发送到某个聊天，或者在你
  已安装的 IDE 中打开该工作树。
- **像引擎思考那样流式输出的聊天。** 每个工作区有多个并发的 `pi` 会话，各自有独立的模型以及实时的 token 与成本
  读数。引导正在运行的轮次或排队一条追加消息（follow-up），委派给子代理，并共同推进一份由 agent 更新、由你编辑的
  共享计划——每个完成的步骤都可以单独提交和审查。
- **规范作为事实来源。** 一个由 `SPEC.md` 文件构成、互连的图与代码并存；agent 通过专门的 `spec_*` 工具读取、搜索
  并维护它，因此意图能跨越会话存活。只读的 Specs 工具把该图渲染为工位里的一棵树。
- **技能与工作流。** 你为其他编码 agent 保存的可移植 Agent Skills 被就地读取，内置工作流引导项目搭建、设计头脑
  风暴以及发布一个 pull request——通过你自己的 `gh` 推送工作区分支并打开或更新它的 GitHub PR。
- **超出 shell 的 agent 工具。** Web 研究，以及直接在聊天中渲染的行内图表与选项对比。**设置 → 扩展**列出 agent
  获得的 ThinkRail 扩展，并允许你逐个关闭。
- **MCP 服务器。** 连接你 `pi` `mcp.json` 中的 MCP 服务器（或者从设置中添加它们以及一些预设）：ThinkRail 在
  服务器未标记为只读的调用之前会先询问，仓库定义的服务器在你批准之前保持停用，从设置登录到 OAuth 服务器，并在
  每个聊天中把它的服务器展示在后台命令与子代理旁边。
- **你的提供商，你的凭据。** 用 [JetBrains AI](https://www.jetbrains.com/ai/) 登录，或通过 `pi` 自己的 auth 连接
  任何提供商。ThinkRail 没有自己的账号。
- **桌面应用或浏览器。** 一个原生桌面应用，或在你浏览器中打开同一应用的 `thinkrail` CLI。两者内嵌同一个引擎宿主；
  应用状态位于 `~/.thinkrail` 下。
- **英文与简体中文。** 界面默认跟随你的系统语言。在**设置 → 外观 → 界面语言**中即时切换；该选择在此客户端上被
  记住。你的聊天、代码、文件名与模型输出永远不会被翻译。
- **你自己的界面字体。** 在**设置 → 外观 → 界面字体**中挑选本机安装的任何字体——每个候选都用它自己的字形预览，
  选择留在此设备上，中文则保持自己清晰可读的度量，而不是拉丁字母的比例。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/specs-dark.png">
  <img src=".github/readme-assets/specs-light.png" alt="从右侧边缘轨道打开的 Specs 工具，列出项目的规范树，同时产品目标规范渲染在编辑器中" width="900">
</picture>

*项目的规范图以树的形式呈现，规范本身在旁侧一起渲染。*

## 安装

ThinkRail 以两种可叠加的形式发布：原生桌面安装器与自包含的 `thinkrail` CLI。两者都在
[releases 页面](https://github.com/JetBrains/thinkrail/releases)随 `SHA256SUMS` 一起发布。

### 桌面版

下载适用于你平台的 `thinkrail-desktop-*` 产物：

- **macOS（Apple Silicon）**——打开 DMG。没有 Intel 桌面构建。
- **Windows x64**——解压完整的安装包 ZIP，然后在原地运行它的安装可执行文件，与它的载荷放在一起。
- **Linux x64 / ARM64**——解压安装包 tarball 并运行 `installer`。桌面构建需要 glibc 2.38+，以及 GTK 3、
  WebKitGTK 4.1、Ayatana AppIndicator 3 与 librsvg 2——Ubuntu 24.04 或更新版本：

  ```bash
  sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2
  ```

打包好的 stable 与 nightly 桌面构建会在后台检查更新，并在**设置 → 更新**中提供：**下载** → **正在准备更新** →
**安装并重启**。在你选择**安装并重启**之前不会应用任何东西。只有当包携带有效的 HTTPS feed 身份时才会出现更新器；
早于该身份的安装需要先做一次手动安装。

### 命令行

安装器下载正确的二进制，校验它的 SHA-256 校验和，并把 `thinkrail` 放到你的 PATH 上。

**macOS / Linux**（Windows 在 Git Bash 下同样适用）：

```bash
curl -fsSL https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.sh | bash
```

**Windows**——同一条命令在 cmd 与 PowerShell 中都能用：

```powershell
powershell -c "irm https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.ps1 | iex"
```

然后运行 `thinkrail`，可选地带上一个 git 仓库作为项目打开：

```bash
thinkrail ~/code/my-repo
```

`thinkrail` 需要 PATH 上有 `git`，以及一个模型提供商——在应用里用 JetBrains AI 登录，或使用你自己的提供商凭据。
`thinkrail --help` 列出各项开关；`thinkrail --version` 打印构建信息。

<details>
<summary><strong>Nightly 构建、锁定版本、更新与卸载</strong></summary>

安装器接受 `--channel stable|nightly` 与 `--version`；锁定的版本必须属于所选通道：

```bash
curl -fsSL https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.sh | bash -s -- --channel nightly
curl -fsSL https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.sh | bash -s -- --channel stable --version 0.1.2
curl -fsSL https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.sh | bash -s -- --channel nightly --version 0.2.0-nightly.10
```

在 Windows 上这些选项是环境变量（`THINKRAIL_CHANNEL`、`THINKRAIL_VERSION`、`THINKRAIL_PREFIX`、
`THINKRAIL_NO_MODIFY_PATH`）：

```powershell
$env:THINKRAIL_CHANNEL='nightly'; irm https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.ps1 | iex   # PowerShell
set "THINKRAIL_CHANNEL=stable" && set "THINKRAIL_VERSION=0.1.2" && powershell -c "irm https://raw.githubusercontent.com/JetBrains/thinkrail/main/install.ps1 | iex"   # cmd
```

已安装的 stable 与 nightly CLI 宿主会定期在**设置 → 更新**中提供**运行更新**。它在后台运行宿主机器上的
`thinkrail update`——即使 UI 是在另一台机器的浏览器中打开的——更新成功后要求你手动重启宿主。你可以在任何平台上
直接运行 `thinkrail update`：它会为已安装的通道重跑安装器并替换 `<prefix>/bin/thinkrail[.exe]`；只在需要明确覆盖
时才传 `--channel` 或 `--version`。

`thinkrail uninstall` 移除可执行文件、安装器添加的 PATH 条目与安装元数据，并询问是否删除你的 `~/.thinkrail`
应用状态（默认保留——`--remove-data` 会删除它，`-y` 跳过这些提问）。

更喜欢手动安装？从 releases 页面下载二进制与 `SHA256SUMS` 并校验校验和。为了让自更新生效，把它重命名为
`thinkrail`（Windows 上是 `thinkrail.exe`）并放到 `<prefix>/bin/thinkrail[.exe]`；保留发布文件名放在其他位置的
二进制必须手动替换，或者用脚本重新安装。

</details>

### 平台说明

| 平台 | 桌面版 | CLI |
| --- | --- | --- |
| macOS Apple Silicon | DMG | 已签名二进制 |
| macOS Intel | 无 Electrobun 构建 | 不预构建——[从源码构建](#开发-thinkrail) |
| Windows x64 | 已签名的安装可执行文件 | 已签名 `.exe` |
| Linux x64 / ARM64 | 安装 tarball，未签名 | 未签名 |

JetBrains 为 Windows CLI 与桌面安装可执行文件签名。macOS CLI 已签名但尚未公证。已签名且已公证的桌面 DMG 需要
协调式的 JetBrains 服务流水线；较早发布的 DMG 与本地构建的包可能仍未签名并被 Gatekeeper 拦截。Linux 产物未签名。

## 分析与隐私

ThinkRail 收集基础的使用事件——启动、创建聊天、发送消息、连接提供商——并绑定到一个随机安装 ID。使用分析绝不包含
提示词、代码、文件、凭据或账号身份。额外的产品使用情况以及你如何找到 ThinkRail，只在**分享更多使用数据**开启时
才共享；该开关在首次启动时提供，位于**设置 → 隐私**。从命令行启动时，`thinkrail --no-analytics`（或
`THINKRAIL_NO_ANALYTICS=1`）会在该次运行中关闭额外共享。在额外共享开启时，打包构建可能有一次在你的浏览器中打开
ThinkRail 博客，把你的安装与带来你的那次网站访问关联起来——仅限你在网站上接受营销 Cookie 或无需同意的场景——而
该关联在 30 天后过期。

## 引擎内部

ThinkRail 是一个薄宿主，它在进程内运行 `pi` 并把它桥接到丰富的 web UI。`pi` 拥有模型、技能、压缩（compaction）、
成本与会话状态；应用拥有工作区、编辑器与线上协议——它绝不背着你拼装提示词。三个环：

- **引擎宿主**——`packages/server`（+ `packages/shared`）：一个 `Bun.serve` HTTP+WS 宿主，每个聊天一个进程内
  `pi` 会话，由 `apps/cli` 或 `apps/desktop` 启动。
- **线上协议**——`packages/contracts`：宿主与 UI 之间类型化、带版本的协议。
- **UI 客户端**——`apps/web`：React 19 + Zustand + Tailwind v4，独立发布；它通过线上协议拨号到一个宿主，并且只
  依赖 contracts。

[`goal-and-requirements.md`](goal-and-requirements.md) 与 [`architecture.md`](architecture.md) 是权威的产品与设计
规范。ThinkRail 采用规范优先的方式开发：每个模块旁边都有一份 `SPEC.md`，而移动边界、契约或决策的改动会在同一改动
中更新规范。

## 开发 ThinkRail

你需要 **Bun** 1.4.0（锁定的包管理器与运行时）、**Node.js** ≥ 22.19（进程内 `pi` 引擎所需），以及用于 agent
工作的已认证 `pi` 提供商。

```bash
git clone https://github.com/JetBrains/thinkrail.git
cd thinkrail
bun install
bun run dev                          # host + web client together; Ctrl+C stops both
```

```bash
bun run --filter @thinkrail/cli dev  # browser launcher
bun run build:binary                 # standalone CLI artifact
bun run desktop:dev                  # package and open the Electrobun app
bun run desktop:build                # package without opening it
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) 涵盖各项检查、端到端套件、桌面打包与仓库布局。

## 参与贡献

欢迎贡献——见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。本项目与社区由[行为准则](CODE_OF_CONDUCT.md)治理。

## 许可证

按 [Apache License 2.0](LICENSE) 授权。
