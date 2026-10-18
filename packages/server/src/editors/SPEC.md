---
id: submodule-server-editors
type: submodule-design
status: active
title: editors —— 宿主编辑器/IDE 集成
parent: module-server
tags: [public-surface-checked]
---

## 职责

探测宿主实际安装了哪些编辑器/IDE，在工作树上以分离进程启动其中一个，并在宿主的文件管理器中显示某个
工作树 —— 即工作区行的“打开方式”菜单。

## 边界

- **拥有：** `listAvailableEditors()` —— 通过 `Bun.which` 探测一个固定的候选清单（VS Code `code`、
  Emacs `emacs`、Vim `vim`，以及一份按产品排列的 JetBrains 启动器垫片优先级清单 —— `idea`、
  `webstorm`、`pycharm`、`goland`、`rider`、`clion`、`phpstorm`、`rubymine` —— Toolbox 会为每个
  已安装产品在 PATH 上创建其中之一；不存在单一的“jetbrains”二进制，因此找到的第一个成为菜单里唯一
  的 `"jetbrains"` 条目，标签按其实际产品显示）。绝不用固定的客户端清单：不在 PATH 上的编辑器就
  不会出现在结果里，因此菜单不可能提供一个死条目。`openEditor(id, worktreePath)` 把 id 解析回其
  二进制（重新检查 PATH —— 针对 `list` 与点击之间发生卸载的廉价保险）并以分离进程启动
  （`@thinkrail/shared/spawn` 的 `spawnDetached`，与 `apps/cli` 的 `openBrowser` 一致）；当 id
  未知或已不再安装时抛错。`revealInFileManager
  (worktreePath)` 在该处打开操作系统自己的文件管理器：`open`（macOS）、`explorer`（Windows）、
  `xdg-open`（Linux 桌面默认）—— 即发即忘，因此 `explorer` 众所周知的“成功也非零退出”从不被检查。
- **Vim 是 `kind: "terminal"`，不在这里启动。** 它没有自己的 GUI 窗口 —— 在没有附加 TTY 的情况下
  以分离进程启动它，只会打印 “Warning: Output is not to a terminal” 然后退出。**客户端**自行处理
  这种情况：打开/聚焦所点击工作区的内嵌终端并在其中运行 `vim .`（见
  `apps/web/src/panels/SPEC.md`），绝不为此调用本模块。
- **单独用 `Bun.which(bin)` 读到的是进程启动时快照的 PATH，而不是活的 `process.env.PATH`**
  （与 `shared` 的 jbcentral 注明的同一处陷阱）—— `resolveShellEnv()` 在宿主启动时重新解析 PATH，
  因此这里每次查找都显式传入 `{ PATH: process.env.PATH }`（`defaultWhich`），否则修正后的 PATH
  永远不会被看到，一个已安装但不在快照 PATH 上的编辑器会被错误地读作缺失。
- **`WhichFn`/`SpawnFn` 是可注入的接缝**，而不是 `Bun.which`/`Bun.spawn` 的 mock：
  `listAvailableEditors`/`openEditor` 接受一个可选的 `which`，`openEditor`/`revealInFileManager`
  接受一个可选的 `spawn`（分别默认 `Bun.which` 与 `@thinkrail/shared/spawn` 的 `spawnDetached`）
  —— 因此单元测试可以伪造哪些二进制“存在”并断言会启动什么，而不依赖运行测试的机器上装了什么，也不
  真正派生进程。`revealInFileManager` 还接受一个可选的 `platform`（默认 `process.platform`），与
  `dialog` 的 `pickersFor` 用的同一套可测参数模式，因此它的 darwin/win32/linux 分支各自被直接断言，
  而不是只在恰好运行测试的那个系统上被断言。
- **Public surface（公开接口，barrel）：** `listAvailableEditors`, `openEditor`, `revealInFileManager`,
  `WhichFn`, `SpawnFn`
- **允许的依赖：** `Bun.which`、`@thinkrail/shared/spawn`（`spawnDetached`）、
  `process.env`/`process.platform`、`contracts`（`EditorInfo` 线上类型）。
- **绝不触碰：** `host`；兄弟特性（`workspaces` 在调用之前解析好 `worktreePath` —— 本模块自己绝不
  查找工作区）。
