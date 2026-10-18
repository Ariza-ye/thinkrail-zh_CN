---
id: module-cli
type: module-design
status: active
title: CLI 宿主启动器
parent: architecture
depends-on: [module-server, module-shared]
tags: [host]
references: [module-artifact-tests]
---

## 职责

保留的浏览器启动器与独立回滚产物：`thinkrail` bin。它在本进程内启动引擎宿主，并在其 URL 上打开浏览器 UI。
它是 `apps/desktop` 的瘦兄弟；所有引擎与进程启动逻辑都位于 `packages/server`。

## 流程

1. 把 argv + env 解析为选项（`src/args.ts`，一个纯函数）；`--help` 打印用法并退出。
2. 解析静态目录（`THINKRAIL_STATIC_DIR`，否则为随 bin 一起发布的已构建 web 应用），并在缺失时告警。
3. 等待 `bootHost({ portMode: "free", resolveShellEnv: true, … })`。共享启动路径会安装崩溃日志、修复登录
   shell 环境、初始化当前 PI 运行时/Central 监视器、在请求端口或其之上解析出一个空闲服务端口，并把宿主嵌入
   这个 Bun 进程。另一个使用同一数据目录的 CLI 或桌面宿主不会阻塞启动；每个进程服务自己的端点。
4. 在交互式 stdout 上渲染共享的递归 ThinkRail 启动标记，带诚实的 `host ready` 状态 + 已解析端点，保留可
   解析而稳定的 `thinkrail → <url>` 行，并在那里打开浏览器（跨平台：`open` / `start` / `xdg-open`，
   尽力而为），除非指定 `--no-open`。仅退出的命令与重定向输出会省略该标记。
5. SIGINT / SIGTERM 在退出前等待共享幂等的 `server.shutdown()`；它们不重复 agent、analytics 或资源拆卸。

## 接口

`bin` = `./src/index.ts`（bun 直接运行 TS 源码）。前导的 `update` 或 `uninstall` 位置参数是一个**子命令**
（`thinkrail update [--channel stable|nightly]
[--version X.Y.Z|X.Y.Z-nightly.N|latest]`、
`thinkrail uninstall [--remove-data|--keep-data] [-y]`）在启动标志之前被拦截 —— 见下文
*自更新* / *卸载*。该集合位于 `args.ts`（`parseSubcommand`）中，因为编译后的入口也需要它：子命令绝不
启动宿主，因此它不必为已暂存的资源缓存付出代价（而在 `uninstall` 的情况下，也不必重新创建它）。其余启动
参数：`--port`（稳定默认 24242，冲突时向上扫描到下一个空闲端口）、`--host`（默认 `localhost`）、
`--no-open`、`--no-analytics`（**仅对附加 analytics 做单次运行抑制** —— 基础事件保持开启；持久的附加数据
选择在 Settings → Privacy，见 [[submodule-server-analytics]]）、`--verbose`（debug 级日志 —— 作为
`verbose: true` 传给 `bootHost`；`<dataDir>/logs` 下的日志文件及其环境开关 `THINKRAIL_LOG_LEVEL` 属于
`submodule-server-log`，其模块是该变量唯一的读取者 —— 与 `THINKRAIL_NO_ANALYTICS` 同样的模式，因此
`dev.ts` 也遵守它）、`-v`/`--version`（打印烘焙版本并退出）、`-h`/`--help`，以及一个位置参数
`project-dir`（一个 git 仓库，启动时作为项目打开，尽力而为）。环境默认值：`THINKRAIL_PORT` /
`THINKRAIL_HOST` / `THINKRAIL_STATIC_DIR`（flag > env > default）。`THINKRAIL_NO_ANALYTICS` 在 `--help`
中有记录，但这里刻意**不**解析它 —— 宿主的 analytics 模块是它唯一的读取者（见下文）。

## 更新提示

处于受支持 `<prefix>/bin/thinkrail[.exe]` 布局下的已编译 `stable`/`nightly` 二进制会向 `bootHost` 提供
一个可选的周期性更新提示生产者；source 与 `dev` 身份以及手动放置的二进制不暴露该能力。宿主就绪后，它在
烘焙频道上立即执行一次有界查询，之后每六小时一次，使用与安装器相同的 GitHub 规则：stable 读取
`releases/latest`，而 nightly 从 `releases?per_page=20` 中选取第一个 `vX.Y.Z-nightly.N` 标签。只有严格
更新的版本才产出 `{ currentVersion, availableVersion, channel }` 状态；发现失败与无更新都是静默的。另一个
更新的发布可以替换 available 或 failed 状态，但成功执行会锁存直到宿主重启，因此仍在运行的旧进程既不能重新
发现也不能安装另一个发布。

共享更新表面为已编译宿主提供 **Run Update**，并为较旧的客户端/宿主或失败运行保留固定的
`thinkrail update` 指引。该动作异步调用这同一个已安装二进制的不带参数更新子命令；浏览器无法选择命令、
路径、频道、版本或 URL。有界的 running/succeeded/failed 状态让每个客户端收敛，且成功要求用户手动重启这个
无人监督的宿主，而不是中止活动工作。发现与执行在 `update`/`uninstall`/help/version 退出以及所有
source/dev 启动中仍然缺席。

## 自更新（`thinkrail update`）

`src/update.ts` 移植了旧仓库的 `thinkrail upgrade`（已改名）：它为二进制的频道重新调用 **已发布的安装器**
—— macOS/Linux 上的 `install.sh`，Windows 上的 `install.ps1` —— 因此安装器仍是下载 → 校验和 → 替换 →
PATH 逻辑的唯一来源。对于已安装的二进制，正在运行的 `<prefix>/bin` 布局具有权威性；显式频道标志优先，
其次是来自同一安装的元数据，再次是其烘焙频道。没有运行中二进制布局的 source 调用可以使用
`~/.config/thinkrail/install.json`，并回退到 `stable` / `~/.local`。

- **Unix：**`curl` 该脚本，把它喂给 `bash -s -- --channel … --prefix … [--version …]`。
- **Windows：**获取 `install.ps1`，写入临时 `.ps1`，并通过第一个可用的 PowerShell 宿主
  （`powershell.exe`，否则 `pwsh.exe`）以
  `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File <tmp> -Channel … -Version … -Prefix …` 运行它。
  `-File`（不是 `irm | iex`，那需要一个 shell 来管道传递，也不是 `-Command`，它的引号处理是雷区）通过
  argv 传递安装器自己的参数。三个参数都**始终**传递，包括 `-Version latest`：install.ps1 的参数*默认来自
  `THINKRAIL_*` 环境变量*，子进程会继承它们，因此显式指定才是让更新对设置了这些变量的用户具有确定性的
  原因。替换*正在运行*的 exe 之所以可行，是因为 install.ps1 的 `Install-ThinkRailBinary` 会把被锁定的
  `thinkrail.exe` 改名到一旁成为 `thinkrail.exe.<rand>.old`（Windows 拒绝*删除*运行中的镜像，但允许
  *改名*它），再把新的放进去；下一次安装会清扫残留物。

任何 Windows 失败（获取失败、没有 PowerShell 宿主、安装器返回非零）都回退到*打印*每个 shell 的手动命令
（`windowsManualUpdateMessage`），并在其下给出 releases 页面：cmd 的 `set "X=v" &&` 与 PowerShell 的
`$env:X='v';` 不可互换。更新规划在信任其前缀或频道之前，把元数据绑定到正在运行的
`<prefix>/bin/thinkrail[.exe]`；陈旧/无关的元数据无法更新一个不同的副本。缺失元数据回退到那个运行中的
布局，包括规范化后的遗留 Git-Bash `/c/...` 与 `/cygdrive/c/...` 前缀。前缀可表示性遵循
[[module-ci-release]]，而不是仅 ASCII 的路径策略：Unicode 与良性标点仍然有效。位于可表示布局之外的手动
二进制 —— 包括直接运行的发布资源，例如 `thinkrail-linux-x64` —— 会以手动指引失败关闭，而不是安装到
`.local` 下；该预检也会扣留宿主更新能力。版本/频道组合在解析之后被校验。规划函数保持纯粹并有单元测试；
只有安装器的获取与执行会触碰 IO。
`THINKRAIL_INSTALL_SCRIPT_URL` / `THINKRAIL_INSTALL_PS1_URL` 覆盖安装器 URL（测试 / fork）。安装器本身
见 `module-ci-release`。

## 卸载（`thinkrail uninstall`）

`src/uninstall.ts` 是安装器的逆操作，且仅针对它们：它移除**可执行文件、安装器所做的 PATH 修改、
`install.json`，以及该二进制的暂存缓存** —— 然后*询问*用户的 app 状态（数据目录），后者**默认保留**，
因为它持有工作区 git 工作树以及其中任何未提交的工作。pi 自己的状态（`~/.pi`）绝不被触碰：那不是我们的。

- **先规划，再确认，再行动。**`resolveUninstallTargets` 是纯的（平台 + home + 安装元数据 +
  `process.execPath` → 路径）；一次检查趟次把它缩小到实际存在的内容（以及哪些 rc 文件真的带有安装器的块），
  因此打印出来的计划是*真实的*；然后是提示；然后是移除，每一项报告为 `removed` / `kept` / `not found` /
  `failed`（任何 `failed` → 退出 1）。
- **提示**（`node:readline/promises`）：数据目录问题（默认*保留*），然后一次最终确认。`-y`/`--yes` 跳过
  两者，`--keep-data`/`--remove-data` 以非交互方式回答第一个；没有 TTY 且没有 `--yes` 时，命令拒绝而不是
  猜测。
- **哪些可执行文件：**来自安装元数据的 `<prefix>/bin/thinkrail[.exe]`（否则用安装器的 `~/.local` 默认值）
  **加上 `process.execPath`，当它本身就是一个 `thinkrail` 二进制时** —— 这覆盖了 `install.json` 已丢失的
  自定义前缀。无论元数据说什么，绝不删除其它任何东西。
- **PATH 修改，按平台接缝：**在 Unix 上，安装器的块是*自识别的*（`# >>> thinkrail PATH >>>` …
  `# <<< thinkrail PATH <<<`），因此 `stripRcPathBlock` 会从每个带有它的候选 rc 文件中移除它（bash/zsh/
  `$ZDOTDIR`/`.profile`，而 fish 的 `conf.d` 文件在除该块之外别无内容时会被删除）—— 并且拒绝触碰块没有结束
  标记的文件，而不是截断它。在 Windows 上，注册表项是*不透明的*（没有什么把它标记为我们的），因此
  install.ps1 会**记录它是否添加了该项**（`install.json` 的 `path_entry_added`，在同一前缀的重装之间保持
  —— 一次更新看到 `already` 恰恰是因为我们更早的一次运行添加了它），而卸载器**只针对该标志、且只针对记录时
  对应的前缀**移除它。已安装并不等于添加过该项：`-NoModifyPath`、原本就已存在的项、失败的注册表写入，以及
  一次 Git-Bash 的 `install.sh` 安装，都会记录一次未触碰 Windows PATH 的安装，而遗留元数据早于该标志 ——
  所有这些都*不是我们的*，因此 PATH 被保持原样，并告知用户去检查哪个目录。该修改本身作为内嵌 PowerShell
  脚本运行 —— 它是 install.ps1 的 `Add-ThinkRailToUserPath` 的精确逆操作（同样的 `HKCU\Environment`
  处理、保留值的 `REG_EXPAND_SZ` 类型、对条目做原始*以及* `%VAR%` 展开后的比较，然后广播
  `WM_SETTINGCHANGE`）—— 因为通过管道往返原始 PATH 值会有在控制台代码页中弄坏非 ASCII 条目的风险。
- **删除正在运行的程序：**Unix 可以痛快地 unlink 一个正在运行的二进制。Windows 不能，因此 exe 会被改名
  为 install.ps1 清理逻辑已经识别的同一个 `thinkrail.exe.<rand>.old` 名称，并在我们退出后由一个分离的
  PowerShell 重试删除几秒钟；报告会说明发生了什么。bin 目录里陈旧的 `.old`/`.new` 残留也会被清扫。
- `src/powershell.ts` 是两条 Windows 路径的共享接缝（找到一个宿主、通过它运行脚本文本、把值用 `psQuote`
  转成单引号字面量）。`src/paths.ts` 拥有*已安装*布局 —— `install.json`（由 `update` + `uninstall` 读取）
  与暂存缓存根（由 `compiled-entry` 写入、由 `uninstall` 删除）—— 因此这三者按构造成立地一致。

## 版本烘焙（发布接缝）

`@thinkrail/shared/version` 导出 `{ version, channel, commit, posthogProjectKey }`，带一个永久的
from-source 默认值（`0.0.0-dev`，空 key）。发布流水线在构建 CLI 与桌面之前，在一次性 CI checkout 中覆写那
一个模块，因此两者报告相同身份，且只有发布构建携带 analytics key。`bootstrap.ts` 为 `--version` 打印共享
版本，把它传给 `bootHost` 作为 `server.welcome.appVersion`，并把 key、频道、`build: "binary" | "source"`
以及单次运行的附加数据抑制穿入 analytics。当正常打开被启用时，它还为打包二进制的一次性归因声明提供既有的
`openBrowser` 启动器回调，先打开本地 UI，然后显式发出 `server.startAttributionClaim()` 信号。`--no-open`
省略该能力且绝不发出就绪信号，因此它不会消耗一次尝试。source 运行仍然不合格。

## 启动入口 + 构建来源

`src/bootstrap.ts` 拥有启动序列（argv → 子命令或宿主启动 → 打开浏览器），并导出
`launch(build: BuildKind)`，它承载唯一的错误退出路径。两个入口*只*在它们声明的来源上不同，且各自通过构造
而非检查运行时来知道自己的来源：

- `src/index.ts` —— `bin`，即**从源码**运行：`launch("source")`。
- `src/compiled-entry.ts` —— **编译后二进制**的入口（先做暂存 + pi 注册）：
  `launch("binary")`。

`build` 作为普通属性搭乘 analytics，因此 `channel = dev` 的运行仍可区分为本地编译二进制与源码运行（见
`submodule-server-analytics`）。刻意*不*从 Bun 的 `/$bunfs/` 模块路径嗅探：那是 Bun 升级可能改动的实现
细节，并且会静默地错标。`src/args.ts` 把 `--no-analytics` 解析为 `CliOptions.noAnalytics`，但**不**读取
`THINKRAIL_NO_ANALYTICS` —— 宿主的 analytics 模块是该变量唯一的读取者，因此每个入口点都遵守它来抑制附加
数据（包括 `packages/server/src/dev.ts`，它不解析 argv）。两种写法都不抑制基础事件；两者在帮助条目中都
披露该范围，而不是承诺零 analytics 流量。CI/测试抑制仍由宿主拥有，并覆盖两个层级。

## 单文件二进制（`build:binary`）

`bun run build:binary` 通过 `bun build --compile` 产出一个**独立的 `thinkrail` 可执行文件** —— 每个平台
一个自包含文件。Bun 会打包宿主，*并且*透明地内嵌 `bun-pty` 原生库；额外的步骤是 **web UI**（一个宿主通常
服务的目录）、**打包的 pi 扩展**（在 dev 中 server 从 `node_modules` 路径加载它们 —— 在二进制内部
不可能），以及 `trash` 的**原生 helper sidecar**（macOS/Windows 必须从真实文件系统路径执行它们）：

- `scripts/build-binary.ts` 消费 `@thinkrail/server/build-support`，写出三个**瞬态**生成模块，在
  `src/compiled-entry.ts` 上运行
  `bun build --compile --no-compile-autoload-bunfig --target=<host|--target>`，然后删除它们（因此产物无法
  在 ThinkRail 启动之前执行项目本地的 `bunfig.toml` preload，且工作树 + `tsc` 保持干净）；每个生成模块都
  有一个已提交的 `.d.ts` 类型契约，在 `.ts` 缺失时由 `tsc` 解析：
  - `src/web-assets.generated.ts` —— 枚举 `apps/web/dist`：每个资源一个 Bun 文件属性导入 +
    一个 `{ route, data }[]` 清单 + 一个内容哈希版本。
  - `src/bundled-extensions.generated.ts` —— **按值导入四个打包的 pi 包入口**（`pi-web-access`、
    `pi-spec-graph`、`pi-thinkrail-workflow`、`pi-todos`），从*server 包的*模块上下文解析（绝对路径 ——
    它们不是 `cli` 的依赖），因此 Bun 会把原始 `.ts` 及其真实依赖（`yaml`、`unpdf`、…）编译进二进制；
    `pi-web-access` 工厂由 `BuildRuntimeSources.webAccessIndex` 命名，而不是按位置。列在 server 注册表中的
    ThinkRail 扩展（[[submodule-server-extensions]]）不会得到生成的入口 —— `@thinkrail/server` 静态导入
    它们，因此 `bun build --compile` 会经由普通 server 图携带它们（以及诸如 `linkedom` 的依赖）。外加
    每个 `BuildRuntimeSources.skillRoots` 目录（`pi-spec-graph`/`pi-thinkrail-workflow`/`pi-todos` 的
    `skills/`、server 自己在 `packages/server/skills` 中的宿主技能，以及任何注册表扩展的
    `skillPackages` 根）像 web 资源一样被内嵌（与 dev 通过 `additionalSkillPaths` 接线的内容匹配 —— 是对
    等，而不是超集）。它的 `.d.ts` 通过 server 导出的 `BundledExtensionFactory` 为工厂提供类型，因此
    `cli` 仍然绝不导入 `@earendil-works/pi-coding-agent`。
  - `src/runtime-assets.generated.ts` —— 把 `trash` 的 `macos-trash` 与 `windows-trash.exe` helper 二进制
    （从 server 包的依赖上下文解析）内嵌为内容哈希清单。
- `src/compiled-entry.ts` 是二进制的入口：启动时它把内嵌的 web + 技能 + 运行时 helper 文件暂存到按构建的
  缓存目录（`$XDG_CACHE_HOME`/`~/.cache`/temp；文件直接写入带版本的目录，然后一个同级的 `<dir>.complete`
  标记**最后**写入 —— 就绪以该标记为门禁，因此被杀掉的首次运行会留下一个不完整缓存，下次启动时重新解出。
  **没有先暂存再改名**：Bun 对一个全新的非空目录做 `renameSync` 在 Windows 上会 `EPERM`，因此标记取代了
  目录改名的发布），让 macOS helper 可执行，设置 `THINKRAIL_STATIC_DIR`，然后**等待** server 的
  **`registerBundledRuntime`** 接缝 —— 它注入工厂 + 已暂存技能目录 + 真实 trash-helper 路径，**并且**执行
  pi 的仅二进制注册（静态打包的 OAuth 流程 + Bedrock 提供商模块，取代 pi 敌视二进制的动态导入 —— 见 server
  agent 规范）—— 然后交接给 `index.ts`。（`bun-pty` 会自动解出；**没有 photon wasm** —— agent 的读取
  工具被设置为在 server 侧原样发送图像。技能必须暂存到*真实*文件系统：pi 通过普通 fs 读取 `SKILL.md`
  并把路径内嵌进系统提示词。）
- 用 `--target=bun-darwin-arm64|bun-linux-x64|bun-windows-x64|…` 交叉编译；每个都会打包该平台匹配的
  `bun-pty` 库。二进制是平台特定的，并在首次运行时自动解出几 MB。
- **通过启动产物来验证**（而不只是构建它）：扩展接线回归只在运行时浮现 —— 例如，在二进制构建首次落地
  之后添加的每个扩展都曾静默地路径加载失败。[[module-artifact-tests]] 的 CLI 冒烟（根：
  `bun run smoke:binary`，在 `build:binary` 之后）针对一次性 data/agent/cache 目录启动构建出的二进制。
  它的 CLI 适配器运行共享测试工作区的共享宿主断言，桌面也使用这些断言；仅 CLI 的断言另外证明暂存缓存与
  命令行形态。它们共同断言：项目本地的 `bunfig.toml` preload **不**执行、`/health` 有应答、`/` 服务已
  暂存的 UI、打包的技能被暂存到缓存目录、**一个外部合成 PI 扩展在 `PATH` 上没有 `pi` 可执行文件的情况下
  通过编译产物的公开 PI 加载器按绝对路径加载**，且在默认与自定义 `PI_CODING_AGENT_DIR` 下都如此（仅测试
  自有源码；不提交、复制、读取或快照任何 Central 生成的产物）、**一次 OAuth 登录能抵达其 auth URL**
  （Codex 提供商的一次 WS `provider.loginStart` 必须应答方法选择并推送一个 `authUrl` 帧 —— 离线且无需
  凭据，因为 pi 的流程在通知该 URL 之前只做 PKCE + 一个本地回调服务器；这钉住了静态注册的 OAuth 流程，
  它们只能在产物内部坏掉 —— 帧是手工拼的 JSON，从而把 `contracts` 挡在 cli 之外）、**把一个预置的 pi
  对话记录经 `session.delete` 移入 OS 回收站**（钉住静态 `processMountinfo` 解析器的包含，`trash` 的
  Linux 实现否则会通过一个对二进制不透明的 CommonJS require 触达它；夹具预置在**宿主报告的
  `worktreePath`**，绝不是冒烟自己的临时路径，因为宿主存储的是 git 符号链接解析后的根 —— macOS 的
  `/var` → `/private/var`、Windows 的 8.3 `TEMP` —— 因此在未解析路径写入的夹具会落进宿主从不扫描的编码
  会话目录，删除随后会真实地 no-op 而文件留在原处）、创建一个离线会话以让每个打包工厂都被求值、验证
  macOS/Windows 两个 helper 都已从产物暂存，并且 SIGTERM 退出 0。CI 在每个 PR 上在 **ubuntu 与
  windows**（各用其宿主目标）构建 + 冒烟该二进制，ubuntu 上还跑 `e2e:binary`；macOS 二进制覆盖仅限发布
  矩阵。Windows 腿不是可选的润色：只有当其 Central 检查显示 *已安装且受支持* 时宿主才会抵达那个扩展，
  因此整个断言是 Windows 可执行形态的，而仅 ubuntu 的冒烟让 #255 发布了一个发布矩阵，它在两天里失败且
  什么都没发布（见 `module-ci-release`）。它不提示提供商；真实轮次行为留在 `e2e:agent`。冒烟的**广网
  兄弟**是 `bun run e2e:binary`（根 `playwright.binary.config.ts`）：整个 no-agent e2e 套件针对这个
  二进制执行 —— 也在 CI 中每个 PR 上。而 `bun run check:seams`（根 `scripts/check-binary-seams.ts`）是该
  接缝类别的构建期金丝雀：当 pi 升级引入一个新的、server 的 `registerBundledRuntime` 未静态注册的、打包器
  不可见的动态导入时，它会失败。该扫描**排除 `pi-coding-agent/dist/bundle/`**（在脚本中记录为被跳过的
  目录，像 allowlist 一样做陈旧检查）：pi ≥ 0.84.3 在那里为其自己的 CLI `bin` 与 `./rpc-entry` 导出发布
  了一个打包运行时 —— 那是抵达它的仅有的两种方式 —— 而进程内库导入（`.` → `dist/index.js`）仍留在模块化
  运行时上，因此该 bundle 的不透明导入（allowlist 中模块化接缝的内容哈希分块副本）在 ThinkRail 中是死代码，
  而按分块名把它们加入 allowlist 会在每个 pi 发布时产生抖动。
- **冒烟的夹具是宿主 OS 形态的，而不是 POSIX 形态的。**它们每一个都曾是绿在 Linux 的套件中的 Windows 失败：
  - **假的 Central CLI 是编译出来的**（`bun build --compile` 到 `central`/`central.exe`），而不是写成一个
    `#!/bin/sh` 脚本：只有当 `inspectJbcentral` 解析*并生成*一个报告受支持版本的 `central` 时，宿主才会
    把合成扩展喂给 PI，而 Windows 既不能把无扩展名文件解析为可执行文件，也不能 `CreateProcess` 一个 shell
    脚本。`.cmd` 垫片被否决了 —— `Bun.spawn` 在没有 `cmd.exe` 包装的情况下无法启动批处理文件，而它会按
    shell 方言拆分夹具。它的 argv 表面保持经过评审的那一套：`--version` 打印合成的 `central <semver>`，
    其余一律以非零退出（因此后台 `status` 探测保持为一个 `unknown` 观察）。
  - **无 pi 的 `PATH` 由活的 `PATH` 推导**：丢弃持有 `pi` 可执行文件的条目，然后前置假的 bin 目录 —— 绝
    不是硬编码的 `/usr/bin:/bin` 骨架，那在 Windows 上会让宿主失去 `git.exe` 或 System32
    （`project.open` 会 shell out 到裸 `git`）。冒烟仍断言无法触达任何 `pi`，并额外断言 `git` 在过滤后
    存活。
  - **`HOME` *与* `USERPROFILE` 都指向冒烟的临时 home**，在每个派生的宿主中如此，因为 `homedir()` ——
    pi 的 `getAgentDir()` 使用的函数 —— 在 Windows 上读取 `USERPROFILE` 并忽略 `HOME`。没有它，默认
    agent 目录探测会写进运行者（或 Windows 开发者）真实的 `%USERPROFILE%\.pi\agent`，而不是沙箱。
  - **每个派生宿主的环境都由 `hostEnv` 构建，它会丢弃它所覆盖的键的继承大小写变体。**Windows 环境名
    大小写不敏感，而运行者拼作 `Path`，因此熟悉的 `{...process.env, PATH: x}` 会同时带上*两个*键，子进程
    读到继承的那个 —— 宿主随后用机器的真实 PATH 运行，看不到假的 `central`，报告 `absent`，且从不加载
    该扩展，而夹具本身是可证明完好的。
  - **两条腿都要求 `provider.status` 的 `jbcentral` 为 `configured`**，而不只是模型存在：产物位于*默认*
    agent 目录内，因此只检查 `model.list` 的腿原则上可能经由 pi 自己的 agent 目录发现通过，而不是经由该
    门禁所钉住的、由 Central 喂入的绝对路径。状态读取会等待一个瞬态的 `configuring`（一个启动期监视器
    事件）。
  - **两个宿主一次只跑一个**：默认 agent 探测在派生自定义 agent 宿主之前先启动、断言并退出。它们加载
    *同一个*磁盘上的扩展，而并发的初次加载会在加载器的转译缓存上竞争 —— 在 POSIX 上无害，在 Windows 上是
    EPERM 类失败，那里失败者会静默回退到一个没有该扩展的运行时（`prepareInitialRuntime` 的普通运行时
    路径）。失败的*重建*会保留已加载的世代，因此只有启动加载能以这种方式失去提供商 —— 这就是为什么断言在
    失败时报告 `provider.status` 的 `jbcentral` 状态：`load-failed` 指明该原因，`absent` 指明一个从未
    跑起来的夹具。

## 边界

- **拥有：**`src/args.ts`（纯 `parseArgs(argv, env) → CliOptions` + `parseSubcommand` + `USAGE`）、
  `src/index.ts`（从源码运行的 `bootstrap()`：shell env → server → 打开浏览器 → 信号处理器），
  以及二进制构建（`scripts/build-binary.ts`、
  `scripts/artifactName.ts` —— 作为 `@thinkrail/cli/artifact` 暴露，且是产物文件名规则唯一的所在，包括 Bun
  为 Windows 目标追加的 `.exe`，因此构建的输出路径与冒烟的默认输入无法像在 Windows 上那样不一致；发布
  动作在 bash 中重新推导同一个名称，因为它也是已发布资源的契约，见 `module-ci-release`）、
  `src/compiled-entry.ts`、`src/web-assets.generated.*`、`src/bundled-extensions.generated.*`、
  `src/runtime-assets.generated.*`）、
  `src/update.ts`（`update` 子命令加上为宿主提示做同频道 GitHub 发布发现）、`src/uninstall.ts`
  （`uninstall` 子命令）、`src/paths.ts`（已安装布局：`install.json` + 暂存缓存根），以及
  `src/powershell.ts`（Windows PowerShell 接缝）。Central 集成仍是 server/auth 的功能；启动器没有 Central
  子命令或协议实现。
- **允许的依赖：**`@thinkrail/server`（`bootHost`、`registerBundledRuntime`、build-support、`dataDir` ——
  卸载器必须能命名 app 状态目录，且必须命名宿主使用的*同一个*）、`@thinkrail/shared/startupMark`（共享
  启动签名渲染器）+ `@thinkrail/shared/version`（共享发布身份）、Bun/Node；生成的构建模块可以按值导入
  打包扩展包的入口（经由 server 包解析 —— 仅构建期，编译后删除）。
- **绝不触碰：**产品功能/领域逻辑；伸手去碰 server 的内部（只用它的公开接口）；导入 web、桌面或
  `contracts` UI 层；直接导入 `@earendil-works/pi-coding-agent`；导入 artifact 测试工作区。它的冒烟适配器
  与共享探测属于 [[module-artifact-tests]]。普通产品功能绝不应需要一份 CLI 实现。

## 必须做对的事

- 对一个你会反复重跑的 CLI 而言，稳定的默认端口比 `port:0` 更友好，但你必须知道解析出的端口才能打开 URL
  —— 因此从请求的端口向上扫描到第一个空闲端口，然后打开解析出的 origin。（`Bun.serve` 不会为一个繁忙端口
  暴露 `EADDRINUSE`，因此空闲端口靠探测找到，而不是靠捕获绑定错误 —— 见 `@thinkrail/shared/freePort`。）
- 浏览器是一等客户端，不是回退方案 —— 同一套 UI 可以指向一个远程宿主。
- agent 在这个进程中运行 —— 一次致命故障会把应用干掉（被接受的进程内取舍）。
- `resolveShellEnv()` 在任何 `AgentSession` 之前只运行一次。
- 启动标记是对已解析启动结果的呈现，绝不是第二个就绪信号：`bootHost` 必须先返回，且可解析而稳定的
  `thinkrail → <url>` 行在其下方保持不变。

## 后续

一个 headless 的 `serve` 模式（用于远程/自动化的常开宿主）。已发布的桌面兄弟在同一套 `bootHost()` 生命周期
上把“打开浏览器”换成了“打开原生 webview”。
