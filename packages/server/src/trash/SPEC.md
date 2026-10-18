---
id: submodule-server-trash
type: submodule-design
status: active
title: trash —— 把路径移到操作系统回收站
parent: module-server
tags: [public-surface-checked]
---

## 职责

把一个路径移到操作系统的回收站；当宿主以编译产物运行时，经由启动器暂存的辅助程序完成。宿主里任何
东西销毁用户文件的唯一途径。

## 边界

- **拥有：** `trashFile(path, implementation?)` —— 一个路径，禁用通配（globbing），**允许抛错**：
  无法恢复该文件的调用方必须得知移动失败，而不是继承一次静默的永久删除。
  `setBundledTrashHelpers` 是启动器接缝（暂存的 `macos-trash` / `windows-trash.exe` 可执行文件，
  因为 `trash` 包自己的 `new URL(…, import.meta.url)` 在编译后会指向 `/$bunfs/` 内部）；源码模式
  与 Linux 委托给 `trash` 本身，其 Linux 路径还需要静态安装的 `@stroncium/procfs` 的
  `processMountinfo` 解析器，而编译后的 bundle 无法通过模板字符串形式的 `require` 触达它。
  `setTrashImplementationForTests` 为那些绝不能碰真实回收站的测试替换整个实现。
- **Public surface（公开接口，barrel）：** `trashFile`, `setBundledTrashHelpers`,
  `setTrashImplementationForTests`, `TrashImplementation`, `BundledTrashHelpers`
- **允许的依赖：** `trash` + `@stroncium/procfs`（外部—— 其深层导入写明了各自的 `.js` 文件，因为
  承载工作流测试装置的 Node ESM 拒绝目录形式与无扩展名的说明符）；Node 的
  `child_process`/`util`。
- **绝不触碰：** `host`；兄弟特性；任何永久 `unlink` 的回退。

## 使用方

有两个特性需要“以可恢复的方式移除这个文件”，这就是为什么它是一个独立模块，而不是其中任一特性内的
辅助函数：

- `agent` —— 聊天的删除会把 pi 的对话记录移到回收站，并在失败时回滚其墓碑记录（见
  [[submodule-server-agent]]）。
- `changes` —— 对新增/未跟踪文件的整文件还原会把工作树文件送进回收站并记录位置，因此评审中最可能
  出现的破坏性误操作在宿主自己的撤销回执消失之后依然可恢复（见 [[submodule-server-changes]]）。
