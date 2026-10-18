---
id: submodule-server-terminal
type: submodule-design
parent: module-server
status: active
title: terminal —— 工作区 PTY
depends-on: [module-contracts]
---

## 职责

以工作树 cwd 为根的、工作区范围的 `bun-pty` 终端，以及每个工作区的终端身份目录。一个标签页的 shell
比每个查看它的客户端活得都久；每个前端各自从本地的 workspace-view 放置里引用它的 `tabKey`，而本模块
从不接收该放置。

## 边界

- **拥有：** 持久化的每工作区终端目录（稳定的存在性/元数据顺序，而不是可视工作台放置）与每个标签页
  背后的 PTY，以 `(workspaceId, tabKey)` 为键；`terminal.data` 上的批量输出，加上
  `terminal.exit` / `terminal.detached`（定向）与 `terminal.tabs`（广播），经由注入的发布器；在附加
  时重放的、每个终端有界的输出记录器。
- **Public surface（公开接口，barrel）：** `reserveTerminal`, `attachTerminal`, `listTerminals`,
  `writeTerminal`, `resizeTerminal`, `closeTerminalTab`, `resumeClientTerminals`,
  `closeWorkspaceTerminals`, `persistTerminalSessions`, `reviveTerminalSessions`,
  `closeAllTerminals`, `clearTerminalClient`, `resetTerminalState`（测试接缝）,
  `setTerminalPublisher`, `setTerminalTabsPublisher`；一次被接受的 `writeTerminal` 返回其所属的
  工作区 id（一个被顶替的调用方返回 `null`），因此宿主只把真正到达 PTY 的输入算作工作区活动；以及
  与宿主发布器适配器共享的 `TerminalDeliveryResult` 类型。
- **允许的依赖：** `persistence`、`contracts`（`WS_CHANNELS`、`TerminalWindowsShell`）、`bun-pty`、
  `Bun.which`、`process.env`。
- **绝不触碰：** `host`；兄弟特性。没有 WebSocket 类型跨过这条边界 —— 客户端是不透明的键。

## 决策

- **shell 的选择是终端本地的**，而 Windows 的选择额外可由用户配置（`AppConfig.terminalWindowsShell`、
  `apps/web/src/panels/TerminalSettings.tsx` 的 Windows 专用选择器；
  [[task-windows-default-terminal-shell]]）。优先级从高到低：一个显式的 `SHELL` 环境变量永远胜出
  （未变 —— 宿主不会在 Windows 上凭空造一个全局 `SHELL`，因为那是 Unix 登录 shell 的约定，改动它
  会影响进程内的 agent 与每个无关的子进程，仅仅为了配置本模块的 PTY 可执行文件）；然后，仅在
  Windows 上，是 `terminalWindowsShell`：
  - `"auto"`（默认）：如果 `Bun.which` 能在 PATH 上解析出 `pwsh.exe`（PowerShell 7+）就用它，否则
    用 `powershell.exe`。不再进一步回退到 `cmd.exe` —— `powershell.exe` 随每个受支持的 Windows 版本
    发布，因此它已经是保底值。`defaultWhich` 传入显式的 `{ PATH: process.env.PATH }`，而不是裸调
    `Bun.which`，这正是 `editors` 的 `defaultWhich` 所防的同一处陷阱：单独用 `Bun.which` 读到的是
    进程启动时快照的 PATH，而不是 `resolveShellEnv()` 稍后修好的活 `process.env.PATH`。
  - `"pwsh"` / `"powershell"` / `"cmd"`：字面钉死到 `pwsh.exe` / `powershell.exe` / `cmd.exe` ——
    没有存在性检查，没有静默替换。一个最终缺失的钉死项派生失败的方式，与一个过期的自定义 `SHELL`
    已经失败的方式相同，而唯一带优雅替换的模式是 `auto`。同步的 PTY 派生是权威的可用性检查：它那个
    不透明的原生失败被包裹进由所选 shell 来源推导出的稳定指引中。客户端收不到任何原生错误文本、可执行
    文件路径或原始 `SHELL` 值。
  - 非 Windows 平台不受影响：无论 `terminalWindowsShell` 是什么，都用 `/bin/bash`。
  `cmd.exe` 曾是无条件的先前默认值；`"auto"` 的基线是 `powershell.exe`，一次朴素的回退替换（随每个
  受支持的 Windows 版本发布，因此没有新依赖），因为它比 `cmd.exe` 更有功能（行编辑、tab 补全、VS
  Code 自己的默认），而对默认安装没有坏处。**Windows 的默认值刻意从不咨询 `ComSpec`/`COMSPEC`**：
  该变量几乎总是操作系统自己的 `cmd.exe` 路径 —— 它为 `cmd /c`/批处理调用指定解释器，而不是一个有
  文档的“挑选我的交互式 shell”旋钮 —— 因此在 `powershell.exe` 之前尊重它，会让几乎所有安装的默认值
  保持不变；一个刻意换过命令解释器的用户已经有 `SHELL` 覆盖，而第二个更弱的覆盖只会是死代码。VS Code
  自己的默认 Windows 终端配置探测做了同样的选择。
- **已知且被接受的限制：PowerShell 会削弱忙碌关闭检测。** `closeTerminalTab` 的忙碌检查
  （`shellBusy.ts`）统计 shell 的操作系统子进程。许多 PowerShell cmdlet 在进程内完成工作而不是去
  shell 调用 —— `sleep` 是 `Start-Sleep` 的内置别名，它在 `powershell.exe` 自身内部阻塞并派生零个
  子进程，不像 `cmd.exe` 的外部 `sleep.exe` —— 因此一个确实忙于原生 cmdlet（`Start-Sleep`、
  `Invoke-WebRequest`、`Copy-Item`、一个被点源引入的脚本）的 PowerShell 终端可能被读作空闲，并在
  没有警告的情况下被强制关闭。日常的开发工具调用（`git`、`npm`、`bun`、`python`、`docker`、`node`、
  ...）仍是外部可执行文件，仍被正确检测 —— 这是一个真实但狭窄的缺口，与 `shellBusy.test.ts` 里
  “无法作答的平台报告为不忙碌”属于同一类被接受的限制。撞上它的用户可以选 **Command Prompt (cmd)**
  并把此前那套完全可检测的行为原样拿回来。
- **不构建一个 `listAvailableShells` 式的宿主探测**来在 Settings 选择器里把未安装的选项置灰，这与
  `editors` 的 `listAvailableEditors` 相反：`auto` 已经给出大多数用户想要的优雅替换，而一个探测
  无法证明 ConPTY 的可启动性，还会复制真实的派生检查。一次失败的启动反而通过客户端的 Settings 与
  重试动作保持可恢复。
- **macOS 的 PTY 以登录模式（`-l`）启动用户的 shell**，以匹配 Terminal.app 与该平台的终端约定；
  其他平台保持一个朴素交互式 shell。PTY 自身提供交互性，因此不需要显式的 `-i`。
- **一个 shell 以 `(workspaceId, tabKey)` 为键**，绝不以 socket、客户端或组件为键。`tabKey` 是持久
  的且由客户端提供；PTY id 是每次运行各自的且**绝不持久化**（附加到一个比其进程活得久的 id 就是
  Theia 的 `Couldn't attach - can't find terminal with id`）。
- **目录预留与 PTY 附加是分开的。** `reserveTerminal` 幂等地记录一个由客户端铸造的标签页身份而不
  派生进程。一次新的预留是事务性的：校验并插入，持久化完整目录，然后发布成员资格；持久化失败会移除
  内存中的插入且不发布任何东西。`attachTerminal` 仍是幂等的 get-or-create，也是 PTY 诞生的唯一
  途径。这不是活性拆分：客户端仍然绝不持有指向一个运行中 shell 的唯一指针。
- **默认终端是由宿主组合出的创建握手，而不是布局播种。** `host` 看到工作区那个持久化的挂起标记，用
  其确定性的键调用 `reserveTerminal`，并且只在目录持久化成功之后才请 `workspaces` 清除该标记。重试
  是幂等的；之后关闭那个终端无法重建它，因为标记已经被清除了。本模块绝不导入工作区登记表，也不选择
  前端放置。
- **持久化的终端身份是有界的。** 一个工作区目录至多持有 256 个标签页；一个键非空且至多 500 个字符，
  一个标题非空且至多 1000 个字符。预留与新的附加共享这些检查。复活会截断超大的目录、丢弃无效的键，
  并在暴露宿主权威的成员资格之前修复无效的标题。
- **终端输入与网格尺寸在任何 PTY 或目录工作之前就被校验。** 终端输入必须是字符串，因为 PTY 的
  `write` 会把数字变成原生 `TypeError`，把数字数组变成原始字节。附加（当它提供尺寸时）与 resize 要求
  `cols` 与 `rows` 是从 1 到 32,767 的整数。xterm 的 fit 至少发送 2x1，而 32,767 是 Windows ConPTY
  有符号 16 位尺寸字段所能持有的最大值，因此真实屏幕永远不会触及两端。这不是安全边界：一个能 resize
  的客户端同样能敲命令。
- **受跟踪网格的更新只做变更。** 每个活条目跟踪在派生时或由最后一次成功 resize 所应用的网格。附加与
  显式 resize 只在它变化时推进该网格，失败的调用不推进它。一次重新附加仍可能执行一次*瞬时的*重绘
  轻推（见下），而它不触动受跟踪的网格。即便是同网格的 resize 也可能通过 `SIGWINCH` 唤醒 shell；
  在附加快照之后发出的一次重绘可能覆盖刚刚重放的行。
- **附加到未变的网格仍会轻推前台应用**（`nudgePtyRedraw`、`ptyGrid.ts`）：`TIOCSWINSZ` 到同一尺寸
  是内核的 no-op —— 没有 `SIGWINCH`，因此一个全屏 alt-screen 应用（vim、htop、一个交互式 CLI）被
  留在某个标签页之后、切换走再切回来，得不到重绘信号，而记录器也从未捕获它的 alt-screen 内容来代为
  重放（见下）—— 该标签页否则会显示一段冻结的 alt-screen 之前的内容。`attachTerminal` 的重新附加
  分支只在上面那次真实 resize 是 no-op 时 resize 到 `cols - 1`，强制一次真正的 `SIGWINCH`；而把
  尺寸恢复回 `cols` 的那次 resize 是**延迟的**（`NUDGE_RESTORE_DELAY_MS`、`setTimeout`），不与第一次
  背靠背触发。从子进程的视角看，同一 tick 里的两次 `pty.resize()` 调用是一次可观察的转换 —— 它自己的
  事件循环在两者之间从未被调度 —— 因此一个 ncurses 风格的应用最终看到的是“与之前相同的尺寸”，并做
  它正常的*增量*刷新（与其上次绘制的内容做差异），而不是一次完整的清屏重绘；那会把新内容涂在客户端
  当前显示的任何过期/空白缓冲区之上，而不是替换它 —— 肉眼可见的乱码，不只是过期，比什么都不做还糟。
  延迟的恢复给子进程一个真实的调度机会，在第二次 resize 落地之前去观察那个中间尺寸，并在其上完整
  重绘。恢复在触发之前检查活性（`terminals.get(id) === entry`），因为标签页可能在那段间隔里被关闭
  或重新派生，它还检查受跟踪的网格仍是它捕获的那一个：一次在延迟期间落地的真实 resize 否则会被恢复
  撤销，让 PTY 停在旧尺寸而受跟踪的网格却报告另一个 —— 而只做变更的规则随后会让重试新尺寸变成 no-op。
  这与上面那条已经接受的“附加快照之后重绘”属于同一类竞态，只是被刻意在每次重新附加时触发，而不是
  只在偶然情况下发生。
- **属主是宿主的属主，而不是浏览器页面。** 任何客户端都可以附加；与 `history`、`todos` 和 `templates`
  一致，它们已经假定单一属主的宿主。结果：shell 在重载、关闭浏览器与换一个浏览器之后仍然存活。
- **附加是排他的，伴随接管。** 一个 PTY 只有一个尺寸，因此一次新的附加成为接收者，前一个客户端收到
  `terminal.detached`。如果将来需要镜像，那是可加的。
- **只有已附加的客户端可以驱动一个终端。** `writeTerminal`/`resizeTerminal` 接受调用方，否则
  no-op：一个被顶替的客户端仍持有一个有效的 PTY id，而一次重连会重放它排队的帧，那些帧会落进现在
  持有该标签页的人那里。回收是一个显式动作，如同 `tmux attach -d`。这样的调用方会**再次被告知它已
  分离** —— 最初的告知是即发即忘的，可能丢失（一个在接管期间正在重连的客户端会重放它的附加并拿回
  缓存的成功），因此在第一次按键时得知，正是阻止一个标签页看起来活着却什么都没发生的原因。客户端还
  用一个附加世代守护相反的顺序，因此一个过期的附加响应绝不可能清除一次更新的分离。
- **输出保持定向**，绝不广播 —— 一帧只会到达一个已附加的客户端。标签页*目录*是例外：哪些终端存在是
  共享的领域状态（架构 #12），因此每次预留或移除都以幂等的每工作区快照在 `terminal.tabs` 上扇出。
- **一个 shell 恰好因五个原因而死：** 标签页关闭、工作区归档、自然退出、宿主停止、附加时的孤儿清扫。
  卸载一个视图不杀死任何东西。
- **没有空闲清理。** 终端的“活动”只能意味着最后一次 PTY I/O，因此一个安静的长跑命令会在飞行中被清理
  （Jupyter 的 `cull_inactive_timeout` 正是这么做的）。**也没有抛弃客户端回收。**
- **跨宿主重启用复活，而不是重连。** shell 无法存活这个过程。**成员资格在每次变更时都被持久化**
  （打开 / 关闭 / 归档），而不只在 `stop()` 时 —— 宿主没有崩溃隔离，因此一次非优雅退出是常规路径，
  而一个只在关闭时写的文件会复活一个已关闭的标签页并为它派生一个 shell。`stop()` 额外在
  `closeAllTerminals()` 之前捕获一整套录制；`reviveTerminalSessions()` 恢复那些标签页，其第一次成功
  附加会派生一个显示旧画面的新 shell。一次失败的派生不消耗挂起的录制，因此改对 shell 并重试同一个
  标签页仍能恢复它。录制是尽力而为的，因此一次不干净的退出会还回正确的标签页、空白的屏幕。
- **不用 tmux。** 它会以我们无法在 Windows 上假定的依赖、一个竞争的标签页模型、环境变量传播的破坏与
  `capture-pane` 轮询为代价，换来重启存活。我们已经接受没有崩溃隔离。

## 限制

- **`attachTerminal` 及其处理器必须保持同步。** 在同一个 tick 里查找并插入，是让附加在 Bun 的单事件
  循环上成为原子的原因；两者之间的一次 `await` 会重新引入双重派生。
- **`closeTerminalTab` 在同一次同步过程中检查 `busy` 并击杀。** 分开询问一次，会让一个在两次之间启动
  的进程在无人告知的情况下死去。
- 记录器规则：原始字节（不是序列化的网格）；绝不重放 resize 事件；重新发出观察到的私有模式**除了
  鼠标跟踪（1000/1002/1003/1006）**—— 那些属于一个活的前台程序，而一个退出时未发出自己的 `DECRST`
  的 TUI 会把最后观察到的值卡在 `on`，因此把它重新发进一个停在裸提示符前的全新 xterm，会把每一次
  鼠标移动变成一次 SGR 报告，被 shell 回显成垃圾；**绝不记录 alt 屏幕**，把它当作*流*来跟踪，因为
  一次切换可能跨 PTY 读取分裂，两个屏幕可能出现在同一次读取里；**绝不记录模式序列本身**（重放
  `?1049h` 会把全新终端翻到 alt 屏幕）；在绑定时一次写入应用。**`restore()` 解析它所收到的东西，而
  不是复制它** —— 持久化的字符串是一个 `snapshot()`，因此逐字复制会把它的模式前奏搬进主体，在那里它
  不再是可重新推导的摘要，而是变成字面字节，被之后每一次快照重放并重新持久化：一个坏模式随后会比观察
  到它的那次运行活得更久，跨重启存续。
- 附加交回录制，然后**丢弃**batcher 持有的输出 —— 重放已经包含它。

## 验证

- `outputRecorder.test.ts` —— 界限、行/转义安全的裁剪、alt 屏幕排除（含一次跨读取分裂的切换与一次
  读取内的进入+退出）、模式恢复、鼠标跟踪绝不恢复，以及 `restore()` 把模式序列挡在主体之外（含一条由
  仍在重放它们的宿主持久化的录制）。
- `outputBatcher.test.ts` —— 批处理、背压、截断、`reset`。
- `shellBusy.test.ts` —— 子进程检测，包括一个无法作答的平台报告为*不*忙碌。
- `shellArgs.test.ts` —— 跨 Unix 与 Windows 的 shell 可执行文件优先级，以及平台特定的参数；`auto`
  经注入的 `WhichFn` 的 pwsh-then-powershell 解析；每个显式偏好都是字面钉死，无论 `which` 报告什么；
  `ComSpec`/`COMSPEC` 不再影响结果。
- `terminalManager.test.ts` —— 无派生的、事务性持久预留，目录界限，对格式错误的写入数据与 resize 及
  附加时越界或非整数网格尺寸的拒绝，附加的幂等性（含并发），接管，被顶替客户端的拒绝，标签页列表
  广播，关闭/忙碌，复活。重放持久化与自然退出用例使用有界的、由发布器观察到的数据/退出条件作为就绪
  边沿，绝不用流逝时间；其期望的输出标记绝不在命令输入里连续出现，因此终端回显无法冒充命令执行。
- `e2e/terminals.spec.ts` —— 快速重进回归、重载存活、第二客户端接管、跨客户端标签页收敛。
