---
id: module-ci-release
type: module-design
status: active
title: CI 与发布流水线
parent: architecture
depends-on: [module-cli, module-desktop, module-shared, module-repo-scripts, module-artifact-tests]
---

## 职责

公开的 PR 门禁、贡献模板与可复用的原生构建配方。发布编排、签名/公证凭据、源码授权、标签、校验和与发布属于
`JetBrains/thinkrail-signing`。本模块拥有公开 action 的输入/输出，以及被那条私有流水线消费的产物/版本契约。

## 边界

- **拥有：** 公开 CI/站点工作流、贡献模板、原生构建配方、版本计算，以及被私有发布控制器消费的产物接口。
- **消费：** CLI 与桌面构建命令、[[module-artifact-tests]] 的 smoke 入口点、共享版本盖章、根一致性/单元/浏览器
  命令、git，以及原生平台工具。
- **绝不触碰：** 产品运行时逻辑；第二个公开发布控制器；公开签名凭据；在必需的签名与验证之前发布；对签名前的
  字节计算校验和；或绕过正常包命令、仅供发布使用的应用程序构建路径。

## CI

工作流里的 Bun 安装通过 `bun-version-file` 读取根 `package.json` 的 `packageManager` 锁定版本。桌面包内的运行时
仍归 Electrobun 所有（见 [[module-desktop]]）。

PR 与合并队列门禁覆盖依赖/边界/接缝/spec 公开接口的一致性、lint/typecheck、单元测试与无 agent 的浏览器测试。
Linux 与 Windows 运行原生 CLI 产物 smoke；Linux 还针对编译后的二进制运行浏览器测试。桌面 PR 覆盖构建 Linux
目标，在 Xvfb 下用仅测试用的软件渲染开关运行原生窗口与共享产物探针，并运行由桌面支撑的浏览器测试。真实提供商的
测试保持显式授权且彼此独立。

三套浏览器套件主导了墙上时间，所以每一套都在独立 runner 上以 Playwright 分片矩阵运行（[[module-browser-e2e]]
拥有切片方式）。规则集要求的检查名 "E2E (no-agent)"、"Binary smoke & e2e" 与 "Desktop smoke & e2e" 属于聚合
门禁任务，只有它们矩阵的每个分片都成功时才会成功；改了门禁名却不更新规则集，会阻塞合并队列。分片数量用 runner
分钟换取墙上时间，并依据观测到的每任务时长来调。原生产物 smoke 只在分片 1 运行：对每个分片重复一次相同的探针
不会增加任何覆盖，却会成倍放大对 runner 环境故障的暴露。

Linux 桌面任务把 Xvfb 作为自己的步骤启动，并且只在有 X 客户端连接到导出的 `DISPLAY` 之后才继续；始终不响应的
服务器会被重试有限次数，然后让该任务失败。只有虚拟显示会被重试，绝不重试 smoke 或浏览器测试：一旦显示被证明
可用，任何应用失败都会让 CI 失败。

一个平台的原生行为只在该平台上得到证明。Windows 保持为 PR 门禁，因为它的可执行文件、环境、路径与 trash 行为
与 POSIX 宿主有实质差异。它的子进程单元门禁还会检验原生的后代控制台行为，这是 Linux 的单元运行无法证明的；它的
桌面窗口装饰单元门禁会绑定无边框标题栏所依赖的 `user32.dll` 边框符号（[[module-desktop]]）；两者都不需要
Electrobun 开发套件。原生 macOS 与 Linux ARM64 的验收属于发布矩阵。

## 原生构建契约

私有原生矩阵检出一个显式的公开源码提交，并调用 `.github/actions/build-binary`。该 action 接受 `version`、
`channel` 以及匹配宿主机的 `target`。它稳定的公开输出是：

- `artifact-name` / `artifact-path` —— 原生 CLI；
- `desktop-artifact-name` / `desktop-artifact-path` —— 首次安装用的桌面产物；
- `desktop-app-archive-path` —— Electrobun 展开后的 macOS app 归档，在非 macOS 目标上为空；
- `desktop-update-manifest-path` / `desktop-update-archive-path` —— Electrobun 的更新器元数据与完整应用归档，
  在每个桌面目标上都非空。

该配方盖上共享版本戳、构建并 smoke CLI、调用正常的 Electrobun dev 与 channel 构建、运行展开 app 与首次安装的
smoke，然后收集确切的目标/channel 输出。更新输出保留 Electrobun 生成的文件名主干与压缩后的字节。manifest 就是
确切的 `<stable|canary>-<macos|win|linux>-<arm64|x64>-update.json`。它的 `artifact.file` 是归档的文件名主干：
stable 为 `stable-<platform>-ThinkRail[.app].tar.zst`，nightly 为
`canary-<platform>-ThinkRail-canary[.app].tar.zst`，其中 `<platform>` 是 manifest 的操作系统-架构对，而 `.app`
只出现在 macOS 上。收集时会为所请求的 channel 与 target 解析出这两个名字，而不是接受第一个 glob 匹配。这些路径
直接指向 Electrobun 的输出树；更新器载荷不会改变仅用于安装器的 dist 别名。在 macOS 上，更新归档可能就是通过
`desktop-app-archive-path` 暴露的同一个展开 app 归档；该配方不会复制或重新打包它。[[module-artifact-tests]] 拥有
隔离的打包调用与收集器契约测试；本模块拥有该 action 与交付契约。

支持的桌面资产：

| 目标 | 原生 runner | 发布的资产 |
| --- | --- | --- |
| `bun-darwin-arm64` | `macos-14` | `thinkrail-desktop-darwin-arm64.dmg` |
| `bun-windows-x64` | `windows-latest` | `thinkrail-desktop-windows-x64.zip` |
| `bun-linux-x64` | `ubuntu-24.04` | `thinkrail-desktop-linux-x64.tar.gz` |
| `bun-linux-arm64` | `ubuntu-24.04-arm` | `thinkrail-desktop-linux-arm64.tar.gz` |

Windows 与 Linux 的别名指向未经改动的框架安装器。Windows 的 ZIP 含其安装可执行文件与相邻载荷；Linux 的 tarball
含安装器与 README。对 macOS 而言，私有 SRE 流程会把未签名的框架 DMG 替换为包含已签名展开 app 的常规 DMG，且
沿用同一个已发布的别名。app 归档是私有的签名中间产物，绝不是公开的发布资产。

在 Windows 上，打包调用把 System32 放在最前面，使 Hutch 的裸 `tar` 解析到 Windows bsdtar；Git 的 GNU tar 会把
盘符路径解释为远程 `host:path` 操作数。收集器解析确切的框架文件名。stable 安装器省略 `stable-` 前缀；nightly
使用 Electrobun 的 `canary` 前缀/后缀。完整的更新器归档与元数据以其原始框架名交给私有流水线；补丁生成保持禁用。
Electrobun 2.0.1 没有 macOS x64 内核。Linux 需要 Ubuntu 24.04+/glibc 2.38 以及声明的 GTK、WebKitGTK、
AppIndicator 与 librsvg 依赖。CEF 与额外的安装器格式不在本契约之内。

## 发布身份与信任

发布控制器提供一个显式的公开 `source_sha`。公开配方只往 `packages/shared/src/version.ts` 盖上
`{ version, channel, commit, posthogProjectKey }`；CLI、桌面配置、分析（analytics）与 `server.welcome.appVersion`
消费同一份身份。该 action 必需的 `posthog-project-key` 输入是应用分析密钥的唯一来源 —— 仓库不携带任何密钥 ——
当它为空或 channel 不是 `nightly|stable` 时，盖章以失败关闭（fail closed）。它是公开的摄取键，不是服务凭据，
所以托管的原生任务可以收到它；私有工作流从自己的密钥库传入它，盖章步骤绝不会回显它。私有工作流自身的提交永远
不是产品身份。

签名凭据与对 `codesign.labs.jb.gg` 的访问留在受保护的私有流水线里。托管的原生任务不接收任何服务凭据；受保护的
内部任务执行服务调用，但不构建产品源码，也不组装归档。CodeSign 与 checksum 两个 action 是私有的，并与发布工作流
一起做版本管理。

流水线以失败关闭（fail closed）：它构建每个目标、对要求的产物签名并验证、对最终字节计算校验和、对照公开 main
授权源码提交、创建幂等标签，然后才发布。中间产物绝不进入公开发布内容。一份显式的未签名允许清单只接纳 Linux
产物；任何新平台或意料之外的文件都会阻塞发布，直到它的签名策略被决定。

## 签名与公证

Windows 签名覆盖 CLI 与安装 stub；以哈希为键的相邻载荷保持字节一致。macOS CLI 保留它独立的 Developer ID 签名
路径。

桌面 macOS 签名消费 Electrobun 展开后的 `.app.tar.zst`，因为 Hutch 在 `postBuild` 之后写入最终版本元数据，并在
`postWrap` 之前压缩内部 app。托管的 macOS 准备原生传输；受保护的内部任务给每个 Mach-O 文件签名、封装完成后的
app ZIP，并在一个独立操作中公证它。托管的 macOS 装订（staple）app 票据并创建 DMG。受保护的任务另行对那个 DMG
签名、公证并装订票据。

发布要求对 app 与容器做原生 macOS 验证：JetBrains 签名身份、hardened runtime、Bun 权限项（entitlements）、
严格签名检查、Gatekeeper 评估、公证票据与首次安装 smoke。签名与公证是不同的服务操作，并保留显式的内容类型。
权限项提取在解析 plist 之前先请求 XML。

## 桌面更新器资格认定与发布

自动更新范围包括上面矩阵中的每个当前原生桌面目标。Canary 资格认定先于 stable；每个目标在被启用之前都需要观测到
一次从已安装版本 A 到版本 B 的升级。公开构建交接现在已包含原始 Electrobun manifest 与完整归档；私有运行时
分发与发布自动化尚未上线。运行时策略属于 [[module-desktop]]。

私有流水线消费那些原始文件名，通过既有签名流程把 macOS 应用最终化，并用这些最终字节创建它的更新归档。它给每个
最终化后的归档分配一个不可变、带版本限定、协议兼容的文件名主干，并在发布前只改动对应框架 manifest 里的
`artifact.file`。其他 manifest 身份字段保持框架生成。载荷先被上传并变为可公开获取，然后才是它们的 channel
manifest。这次更新器交接不新增任何签名、公证、验证或发布门禁；既有平台要求继续有效。

原生更新验收是**手动优先**。它使用一次性安装中的最终化发布字节，记录两个版本与每个目标的结果，并覆盖：检查在
"有可用更新"处停止、显式下载、可区分的传输/准备、通过关闭 Settings 而推迟、**Install & Restart**、channel
隔离、传输中断/重试、更新后的版本/宿主健康，以及本地状态的恢复。正在运行的 agent 与终端命令不被期望在宿主
重启后存活。Windows 资格认定使用一次性的 VM/runner，因为安装的集成范围超出 HOME。当 Electrobun、打包、签名或
重启处理发生变化时，相关检查会重复。这限制了为一项不常变化的集成投入一套宽泛的新更新器套件；它不取消既有的
签名、产物 smoke、快速或完整的无 agent 浏览器门禁。新的自动化覆盖保持狭窄，围绕应用自有的生命周期回归与既有的
公开产物输出契约测试；不需要专门的更新器 CI 矩阵。

## CLI 安装与其他自动化

根 `install.sh` 与 `install.ps1` 保持为仅 CLI 的使用方：校验 channel/版本身份、解析所请求的发布、在构造任何产物
URL 之前按所选 channel 的确切语法校验它的标签、下载原生 CLI 与 `SHA256SUMS`、校验它，并在原子重命名之前于目标
目录中准备好替换文件。前缀检查基于表示形式而非仅 ASCII：Unicode 与无害的 `@`/`+` 组成部分仍然有效，而每个平台
拒绝那些会破坏元数据或启动 shell 语法的字符。Git Bash 写入原生可读的 Windows 元数据；畸形的 shell PATH 块会被
保留而不是重写。CLI 自更新把元数据绑定到正在运行的可执行文件，并调用这些安装器，而不是复制下载/校验逻辑。受控的
脚本测试拥有这些回归；最终化的 Windows PowerShell/Git-Bash 与自定义卷行为仍属发布资格认定。

网站部署不含任何签名凭据。CODEOWNERS 与 main 分支规则保护公开配方；本地构建与公开 PR 任务绝不发布面向用户的
发布产物。
