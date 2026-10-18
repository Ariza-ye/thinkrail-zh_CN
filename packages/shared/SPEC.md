---
id: module-shared
type: module-design
status: active
title: 服务端共享工具
parent: architecture
depends-on: [module-contracts]
references: [central-integration]
tags: [host]
---

## 职责

引擎宿主及其启动器使用的横切运行时工具。仅在服务端使用——绝不打进 `apps/web`。
通过显式的子路径导出的方式暴露，而不是一个 barrel。

## 边界

- **拥有：** 宿主侧运行时助手，它们既不属于引擎，也不属于传输层。
- **Public surface（公开接口）：** `@thinkrail/shared/shellEnv` → `resolveShellEnv()`、`mergePath()`、
  `loginShellImports()`、`parseLoginShellEnv()`、`LOGIN_ENV_MARKER`、`localeRepair()`；
  `@thinkrail/shared/freePort` → `findFreePort()`、`isPortFree()`；
  `@thinkrail/shared/startupMark` → 静态的递归字标，加上每个启动器都会用到的纯响应式/ANSI 渲染器
  与交互式输出门控；
  `@thinkrail/shared/version` → 由 CLI、
  桌面端与宿主出处共享的、已烘焙的 `{ version, channel, commit }` 发布身份（源码中带有已提交的
  `0.0.0-dev` 默认值）；
  `@thinkrail/shared/paths` → 工作树相对的路径约定（`WORKSPACE_INTERNAL_DIR`、
  `WORKSPACE_CONTEXT_DIR`、`WORKSPACE_TODOS_DIR`）；
  `@thinkrail/shared/codedError` → `CodedError` + `errorCodeOf()`；
  `@thinkrail/shared/removeTree` → `removeTree()`，即对“子进程曾在其上运行过的树”的每一次拆除都会经过的、
  带重试的递归删除；
  `@thinkrail/shared/spawn` → `spawnSyncCaptured()` + `spawnSyncCapturedBytes()` + `spawnDetached()`，
  即宿主或 CLI 启动的每一个控制台子进程都会经过的隐藏子进程接缝；
  `@thinkrail/shared/jbcentral` → 原生 Central CLI 适配器：绝对路径的可执行文件/版本/状态
  探测；最低支持版本与全局不透明的 PI 扩展路径；单向的认证
  判定；产物位置监视器；`add pi` / `remove pi` / `login` / `update --install` 操作；以及
  按 OS 的官方安装计划。它绝不编辑 PI 的模型或凭证配置。
- **/spawn**——`spawnSyncCaptured()`（同步捕获 → `{ launched, exitCode, stdout, stderr }`）、
  `spawnSyncCapturedBytes()`（相同的启动与退出语义，但**把 `stdout` 保留为字节**，供
  需要读取二进制子进程输出的调用方使用——那类输出会被 UTF-8 解码器替换；stderr 保持为已解码文本，因为
  诊断信息只会被当作文本读取）以及
  `spawnDetached()`（即发即忘的 `unref`），建立在 `Bun.spawnSync` / `Bun.spawn` 之上，始终带
  `windowsHide: true`。Bun 1.4.0 把该选项映射为 libuv 的 `UV_PROCESS_WINDOWS_HIDE`；这个接缝
  防止后台控制台启动遗漏它。两个定制的有界运行器（`server/subprocess`
  的 `runBounded`、`jbcentral` 的版本/配额运行器）直接设置它。
- **允许的依赖：** Bun/Node 运行时（`@types/bun`）；`contracts` 的**类型**（`JbcentralInstall`，即
  `jbcentralInstall` 返回的线上协议形态——保留在线上协议中，以便服务端逐字将其带到卡片上）。
- **绝不触碰：** 导入 `server` / `web` / 任何 `pi` 包；被 `web` 导入（它携带
  Bun/Node 代码，绝不能进入浏览器 bundle）。

## 目录

- **/shellEnv**——`resolveShellEnv()`：让宿主的环境对它启动的各个 shell 安全，因为一个
  由 GUI 启动的宿主（Finder/Dock、launchd、systemd unit、容器）继承的是一个被裁剪过的环境。四项
  独立的修复：
  - **`PATH`**——始终采用用户的登录 PATH，使进程内 agent 的 bash/工具以及它们触发的 git 钩子
    能找到 `git`/`node`/`bun` 等，同时保留启动终端额外添加的任何内容。
  - **登录 shell 环境**——在启动时一次性导入用户登录 shell 环境的其余部分，
    类似 VS Code，因为由 GUI 启动的宿主否则看不到提供商 API key
    和 `models.json` / `mcp.json` 中 `${VAR}` 引用（常从厂商文档复制而来）所依赖的任何变量。当
    `TERM` 已设置时跳过（从终端启动的宿主已经携带该 shell 的环境）。已为进程设置好的变量
    优先；`PATH` 保留上面它自己的修复；`PWD`/`OLDPWD`/`SHLVL`/`_` 以及
    `PI_*` / `THINKRAIL_*` 永不导入。一次带标记分隔的登录 shell `env -0` 探测
    （先 `-l -i`，再 `-l`）同时服务于这次导入和 PATH 修复；标记（`LOGIN_ENV_MARKER`）之前的
    rc 文件噪声会被忽略。已记录的权衡：宿主、它启动的每个进程（包括 stdio MCP
    服务器）以及每次 `!command` 解析随后都能看到 shell 导出的机密——那是用户自己的，
    与在终端中一样，并不是隔离。
  - **locale**——当*完全没有*配置任何 locale 时（`LC_ALL`、`LC_CTYPE`
    和 `LANG` 全部未设置），把 `LANG` 设为一个 UTF-8 locale。没有它，bash/readline 是
    **面向字节**而非面向字符的，因此对一个多字节字符（西里尔文、变音符、中日韩）按一次退格会删掉它的一半，并让该行
    失步。只设置 `LANG`，绝不设置 `LC_ALL`，因此用户按类别的设置（`LC_NUMERIC`、`LC_TIME`、……）
    得以保留。
  - **`SSH_AUTH_SOCK`**（仅 darwin）——缺失时，通过
    `launchctl getenv SSH_AUTH_SOCK` 恢复 launchd 的 ssh-agent socket（3 秒超时，从不抛出，当 launchd 报告没有时
    无操作）。
    没有它，宿主自己的 git 推送（`pr`）和每个内嵌终端都会失去用户的
    ssh-agent：在 ThinkRail 终端里执行 `ssh-add` 会回答 "Could not open a connection to your
    authentication agent"，而在 Terminal.app 中加载的密钥永远到不了宿主的推送。

  所有修复都落在 `process.env` 上，这正是它们能到达宿主启动的*每一个* shell 的原因：PTY
  终端会复制它（`server/src/terminal`），进程内 agent 自己的 bash 也一样。
- **/freePort**——`findFreePort(preferred, host?)`：在 `preferred` 或以上的第一个空闲端口，使
  宿主可以挑一个开放的端口，而不是与已在运行的那个冲突。`isPortFree(port, host?)`：
  底层单端口检查。
- **/startupMark**——各启动器共用的唯一启动签名：一个由
  循环的 `THINKRAIL·` 字段构成的、已提交的 42×20 `TR` 轮廓，与产品标识、调用方提供的诚实状态及其
  解析后的端点组合在一起。在 72+ 列时它是右侧的组合标记；42–71 列时改为堆叠，低于 42 列时
  只用标识/状态，而不对图形折行。
  渲染量相当于一次同步写入的文本：允许 ANSI 时为终端调色板的绿色 + 稀疏的明亮信号 +
  暗淡的分隔符；`NO_COLOR`/`TERM=dumb` 时为纯 UTF-8；非交互式 stdout 则完全不输出标记。
  根目录的开发运行器在启动并发任务之前调用它（`starting`）；
  源码/编译后的 CLI 在 `bootHost` 解析出实际 URL 之后调用它（`host ready`）。SVG/图像
  转换从来不是运行时关注点。
- **/version**——那一个永久的发布盖章接缝。从源码运行时报 `0.0.0-dev`；发布 CI
  在构建任一产物族之前，会在其一次性检出中覆盖本模块，使 CLI 的
  `--version`、桌面包元数据、分析（analytics）以及 `server.welcome.appVersion` 不会漂移。它
  包含身份数据，加上仅发布版才有的公开 `posthogProjectKey`（源码中为空，因此
  未盖章的构建从不上报），并且不依赖任何启动器。
- **/codedError**——`CodedError(code, message)` + `errorCodeOf(err)`：一个携带线上协议
  `WsErrorCode` 的错误，因此客户端必须*具体*反应的失败以名称而非一个待模式匹配的字符串
  传输。它放在这里，是因为接缝两端都需要它，而两者都不能导入对方：
  知道该失败的模块抛出它（目前是 `server/src/git`，针对一个已消失的提交 scope），而
  宿主的请求处理器把它读进 `WsResponse.errorCode`。
- **/removeTree**——`removeTree(path, options?)`：删除子进程曾在其上运行过的树，并持续
  重试，只要该失败是短暂等待就能解决的（`EBUSY`、`EMFILE`、`ENFILE`、`ENOTEMPTY`、
  `EPERM`、`EACCES`）——默认十次尝试，线性 100 ms 退避。它之所以存在，是因为 Windows
  在子进程退出后异步释放可执行文件句柄，所以对一个 smoke/e2e 临时树做裸的递归删除会在每条断言都
  已通过*之后*抛出 `EBUSY`，也因为 **`rmSync` 自带的 `maxRetries`/`retryDelay` 在 Bun 下是失效的**
  ——nightly 运行 33166583594 在一个要求数秒退避的策略下，于打印 `installer smoke OK` 之后 252 ms
  抛出了 `EBUSY`。`EACCES` 是在 nightly 运行 33949193053 之后加入可重试集合的：在 Windows 上，同一个
  尚未释放的句柄以 `EACCES` 出现的频率与 `EBUSY` 相当。重试是拆除阶段的韧性，而不是错误抑制：一个越过退避仍然
  被锁住的树会抛出，而任何延迟都无法修复的失败（`ENOTDIR`、……）在第一次
  尝试时就抛出。`options.remove` 是单元测试驱动的注入式删除器接缝；`attempts`/`delayMs` 让
  调用方以耐心换速度。
- **/paths**——ThinkRail 拥有的工作树相对路径约定，在此命名一次，使当前与未来
  的使用方保持一致（目前：`workspaces` *创建*那个草稿目录，而 git *忽略*它）：
  `WORKSPACE_INTERNAL_DIR`（`.thinkrail`——仓库本地、由宿主管理的目录，目前存放临时
  草稿，是未来宿主文件（例如缓存的 spec 索引）的预期归宿；**不**对文件树隐藏）、
  `WORKSPACE_CONTEXT_DIR`（其 `context/` 草稿目录，用于临时文档）以及 `WORKSPACE_TODOS_DIR`
  （`context/todos/`——聊天 TODO 计划，每个会话一个 JSON，因此它们与草稿的其余部分一样是临时的）。
  不含 pi 的 `pi-todos/core` 不能导入本包（它要保持可用纯 `pi` 安装），
  因此它保留一份 todos 路径的本地镜像；本模块是宿主侧的事实来源。它与
  *主目录*状态目录 `~/.thinkrail`（服务端 `persistence`）不同。（宿主播入草稿目录的 `.gitignore` *正文*
  ——一个孤零零的 `*`——是在那个调用点内联的一次性内容，而不是路径，因此它住在
  那里，不在这里。）
- **/jbcentral**——**唯一的 Central 进程/文件系统边界**。它以绝对路径解析 Central，
  把一个有界的 `central --version` 结果解析为兼容性裁决，暴露
  全局不透明的产物路径（`~/.pi/agent/extensions/jetbrains-central.ts`，以及 `~/.local/bin/`
  安装器回退路径）及其存在性，且只调用经复查的 argv：`status`、`quota --json`、
  `add pi`、`remove pi`、`login`、`update --install` 与 `proxy start --ensure-updated`。支持策略是
  **只有下限版本**（`MINIMUM_CENTRAL_VERSION`，
  `1.4.0`——第一个带有原生 PI 界面的 Central 版本）：等于或高于它的都支持，
  更低的版本需要更新，而畸形的输出即
  不支持。这里刻意**没有上限**——更新的 Central 被假定与此适配器调用的 argv 向前兼容，
  而对它设门会把用户困在每一个 Central 版本之后。

  **认证与代理健康是来自同一次状态探测的两项独立、单向的观察。** 在 Central 所要求的 JSON 状态界面
  发布之前，`central status` 在这些状态下都退出 0，并输出带样式的
  呈现行。因此 `Auth` 裁决只信任它那唯一一个否定标记：`not connected`
  意味着**已登出**，该行的其他任何渲染（账号、许可、受管服务器，或我们尚未见过的措辞）都
  意味着**已连接**，而缺少该行或探测失败意味着**未知**。`Proxy`
  裁决同样只信任确切的已停止标记为**已停止**；运行中、缺失或无法识别的
  呈现都归为**未知/未停止**。只有那些被正面观察到的否定事实才可以驱动
  一个恢复要求。这是唯一读取呈现输出的地方，而这份共享观察从不
  返回原始文本、端口、PID、URL、账号、许可、公司、服务器细节或诊断信息。日后改用
  JSON 仍属于本边界的内部事务；其他每个命令的输出仍永不被解析。
  按 Central 的设计，该探测是昂贵的（一次代理健康检查加一次网络更新检查，约 1.3s，且每次调用产生一个
  CLI 分析事件），因此 `JBCENTRAL_STATUS_TTL_MS` 限定调用方可以
  在多长时间内提供一份观察结果而无需重新探测；这里没有任何轮询。

  **配额是一次结构化的、仅含数字的读取。** `readJbcentralQuota()` 解析同一个绝对可执行文件，
  并以有界的 stdout 和一个截止时间只运行 `quota --json`。它在内部解析 JSON，只接纳
  有限的 `tariffQuota.available` / `tariffQuota.maximum` 值（数字字符串或数字）作为周期性的
  `remaining` / `total`；其他所有字段都被忽略。无效的 JSON/形态/金额、超时、超大输出、
  启动失败或非零退出码都会变成一条封闭的原因。这里没有文本输出的回退，也没有缓存或
  轮询。原始输出以及账号、套餐、已用、加油、补满与诊断数据都被丢弃，
  永不返回、记录或持久化。

  **被启动的登录不等于已开始的登录。** `central login` 从一个终端 UI 驱动其浏览器交接，
  因此在没有 TTY 时它会立即退出且不会发生登录——而 spawn 本身却是成功的。启动
  因此会等待一段宽限时间以观察是否早退，并在任何非零退出时报告 `launch-failed`，使
  调用方可以改为提供那条要在宿主上运行的命令，而不是承诺一个从未打开的浏览器。一次
  立即的*零*退出是 Central 的“已登录”短路，计为已启动；一次真正开始的流程在宽限期结束时仍在运行，
  因为它在等待浏览器同意。依赖接缝只暴露子进程的退出——绝不暴露它的输出。

  **超时限定的是等待，而不仅仅是子进程。** 杀死一个子进程并不会关闭它自己的
  孙进程仍然持有着的管道——而 Central 会启动一个代理守护进程——因此截止时间直接
  结束该调用，而不是先发一个 kill 再去 await 读取。这一点是承重的，因为版本
  探测位于宿主的启动路径上：在那里无界等待意味着没有端口、没有 UI，也没有可显示的错误。
  版本 stdout 在内存中有界；操作的 stdout/stderr 被忽略。没有任何子进程输出被记录或返回，且只有退出成功加上安全的
  后置条件才映射为一个封闭的适配器结果。`watchJbcentralArtifact(onChange)` 只观察那个
  经复查的位置，并为新增、删除与替换报告失效事件；它通过从最近的既有父级重新武装来处理一个尚不
  存在的扩展目录，而一次仅检查存在性的轮询会修复丢失的新增/删除文件系统事件。它从不打开或对生成的
  文件做指纹。调用方对事件做防抖，并通过常规的检查 API 重新检查存在性。

  **目录事件不是产物事件。** `fs.watch` 是按目录的，而上面的重新武装意味着
  被监视的目录经常是一个*祖先*——当产物目录尚未创建时，监视器可能落在 `~/.pi/agent`，即 pi 的整个状态目录。
  因此失效通知以产物本身为门控：只有当某个事件指名了产物自己目录中的
  产物条目时才被转发，来自其他任何地方的具名事件（祖先的变动、某个同胞扩展）最多只会
  重新武装并重新检查存在性。指名该条目——而不是对该文件做 stat 指纹——正是让
  “替换”可被观察到而无需读取任何生成产物的原因。

  **事件是按其发出者那个监视器来分类的，绝不按当前的那个。** 被监视的目录是可变状态，
  重新武装会改变它，因此一个已由后来被关闭的监视器排入队列的回调，否则就会被
  拿去对照其继任者的目录来判定——把祖先的变动读成产物替换，或把一个产物事件读成祖先的变动。
  因此每个 `arm()` 把它自己的目录和一个单调的代次绑定进它所安装的回调，而关闭句柄会退役那个
  代次，于是被取代的回调会被丢弃，而不是被重新分类。

  **未命名事件是按范围处理的，既非一律信任也非一律丢弃。** `fs.watch` 可能省略文件名，而一个
  监视器错误也以同样方式浮现，因此 `null` 不携带关于*什么*改变的信息——只关于我们当时在哪里监视。
  在产物自己的目录上，它被当作一次可能的替换：句柄被关闭（它可能就是某个错误背后那个已死的监视器），
  且调用方被置为失效，因为对一次就地重写而言存在性是不变的，仅检查存在性的轮询因此无法恢复它。
  来自祖先时，它则回退为只检查存在性。这种不对称是刻意的：信任来自祖先的 `null` 会在任何省略文件名的平台上
  恢复那种活锁，而在产物目录上丢弃它则会静默地把一个过期的 Central 运行时搁置到重启为止。

  跨模块的活性义务与事后分析见 [[central-integration]]；监视器的机制由
  `packages/shared/src/jbcentral.test.ts` 钉住。

  本适配器刻意不为此前未发布的集成提供迁移路径：它从不读取或
  编辑 `models.json`、`auth.json`、备份，或任何无关的 PI 状态。

  **安装指引是按 OS 的，且只有一个来源：** `jbcentralInstall(platform)` 返回被带到卡片上的官方宿主 OS
  计划；远端浏览器从不猜自己的 OS。**服务端的 `auth` 模块是唯一的调用方**，
  它把这些宿主本地操作与监视器失效通知，与 `agent` 的运行时代次接缝组合起来。

## 必须做对的事（shellEnv）

- 在启动时**只运行一次，且在任何 `AgentSession` 创建之前**。
- 在 win32 上无操作（GUI 进程已经继承注册表 PATH）。其他平台上它**总是**探测：启动
  一个登录 shell `[$SHELL||/bin/zsh, -l, -i, -c, <print LOGIN_ENV_MARKER>; env -0]`（非零退出时
  去掉 `-i` 重试），并把 PATH 重置为 OS 基础目录（使 rc 文件计算其规范 PATH，而不是叠加到启动器传入的任何内容
  之上），5s 超时，解析标记之后以 `\0` 分隔的条目，然后 `mergePath(current, login)`——登录 PATH，
  前置那些它缺少的当前条目（一个已激活的 venv、`nix develop`、direnv），使从终端启动时保留其显式新增项在前。
  从不抛出——任何失败时它都不动 PATH。
- 没有“PATH 看起来已经完整”的短路。曾经有一个，以用户目录标记为键，而
  `/usr/local/bin` 就在其中；它位于 macOS `/etc/paths` 之首，也是每个 Linux 默认 PATH 的一员，因此该探测
  对 Dock 启动的宿主从不运行，每个会话都失去 Homebrew/bun（`command not found`、git 钩子失败、
  子代理卡住）。每次应用启动一次性约 100–300 ms 的探测，比猜测要便宜。

## 必须做对的事（jbcentral）

- **以绝对路径检测并调用 Central（`resolveJbcentralBin`），绝不用裸命令。** 把实时的
  `process.env.PATH` 传给查找，并保留官方 `~/.local/bin` 回退，因为一个长期运行的
  宿主必须能在不重启的情况下看到一个刚安装的可执行文件。**回退路径指名每个 OS 的
  安装器实际写出的文件**——Windows 上是 `central.exe`，其他地方是 `central`（`install.ps1` 安装的是
  `$HOME\.local\bin\central.exe`）——而 PATH 查找保留裸名称，因为 `Bun.which` 自己会尝试
  Windows 的可执行扩展名，并在那里拒绝无扩展名的文件。Windows 上一个无扩展名的回退永远无法匹配真实安装，
  而这恰恰是该回退存在的场景：Central 是通过应用内指引安装的，而宿主已经以一个过期的 PATH 在运行。
  其单元测试钉住确切的路径，绝不用一个对一切都回答 true 的 `exists` 桩。
- **`~` 在 Windows 上是 `USERPROFILE`，在其他任何地方是 `HOME`**——按平台从实时环境变量读取，
  只在回退时用 `homedir()`。这就是 pi 为 `getAgentDir()` 解析的*同一个*主目录，而这正是
  要点：适配器与 pi 必须指名同一个产物。两种被否决的写法，都是真实 bug：
  `env.HOME ?? homedir()`（最初的写法）在 Windows 上静默失效，因为那里 `HOME` 被 pi 忽略，却*确实*会被
  Git Bash 设为一个 MSYS 路径——Central 会被安装并配置好，而 ThinkRail 会报告
  `absent`；而单纯的 `homedir()` 在 Bun 下无法在进程内被重定向，它在**启动时解析一次**，
  而不是每次调用都解析（Node 会重新读取），因此那些重定向主目录的测试与 e2e/smoke 宿主
  会静默读到开发者真实的主目录。平台是一个可注入的依赖（`platform`），因此
  两个分支都能在任何宿主 OS 上被单元测试钉住。
- **受机密源码启发，只使用公开界面。** 被跟踪的产物只包含经复查的 argv、
  兼容性边界、那个不透明的路径、带类型的结果，以及独立编写的假件。绝不要复制或
  改写 Central 的源码/输出，也绝不要读取、解析、哈希、快照、复制、记录、上传、持久化到别处
  或提供那个生成的扩展。
- **不依赖独立的 PI。** Central 写全局 PI 配置；ThinkRail 把它的路径加载进
  内嵌的 PI 运行时，包括在 `PI_CODING_AGENT_DIR` 指向别处且不存在任何 `pi` 命令时。
  监视器事件只是提示：每次重建都会重新检查版本 + 存在性，而应用内操作在其后置条件之后显式
  请求同一次重建，因此一个被丢弃/合并的文件系统事件无法丢失一次
  状态转换。
- **绝不返回或抛出原始的子进程/加载器数据。** 适配器错误是封闭的错误码，不含任何自由格式的子进程
  文本。配额成功只携带周期性的 `remaining` / `total` 数字；调用方只能报告通用
  指引。
- **不做旧版迁移。** 这是第一个受支持的原生集成；适配器从不触碰先前的
  提供商覆盖，也不维护备份/回滚机制。

## 必须做对的事（freePort）

- 通过**用 TCP 连接探测**来检测占用，而不是靠捕获绑定错误：`Bun.serve` 并非在每个平台上
  都会为一个被占用的 `localhost` 端口报告 `EADDRINUSE`（它可以通过
  `SO_REUSEPORT` 共享该端口），因此“先绑定再捕获”的检查并不可靠。连接被拒绝意味着空闲。
- `findFreePort` 从 `preferred` 向上扫描（可预测：`24242 → 24243 → …`），如果整段扫描范围都被占用，
  则回退到一个由 OS 分配的临时端口。
