---
id: submodule-server-dialog
type: submodule-design
status: active
title: dialog —— 原生文件夹选择器
parent: module-server
---

## 职责

宿主的原生目录选择器，使浏览器的“打开项目”能弹出真正的操作系统对话框。

## 边界

- **拥有：** `selectDirectory()` —— 宿主的原生文件夹选择器，按操作系统分派（`pickersFor(platform)`）：
  macOS 用 `osascript`（`choose folder`），Linux 用 `zenity` 再退到 `kdialog`，Windows 用一个
  PowerShell `FolderBrowserDialog`。`THINKRAIL_PICK_DIR` 为开发/e2e 覆盖它，并在原生可用性检查
  之前被解析。它**仅**在用户取消时返回 `null`。选择器的完成状态由退出码加诊断信息分类：AppleScript
  的 `-128` 标记，以及 Linux 退出码 1 且无 stderr，属于取消；Linux 退出码 1 且有诊断信息（包括
  GTK 的 `Failed to open display`）以及每一个 PowerShell 非零退出，属于失败。Linux 在没有
  `DISPLAY` 也没有 `WAYLAND_DISPLAY` 时会在派生进程之前以可操作的无图形会话原因失败。缺失或失败的
  候选会落到下一个候选；取消则停止。如果所有候选都缺失或失败，该方法抛出所观察到的最有用的原因，
  因为静默的 `null` 就是一个死按钮。
  **文件间接：** 当 `THINKRAIL_PICK_DIR` 指向一个已存在的*文件*时，其去除首尾空白后的内容会
  **在每次调用时重新读取**。纯内容即返回的路径；`error:<message>` 会在原生可用性检查之前抛出这一
  确定性的失败。因此一个共享的源码、二进制或桌面 e2e 宿主，可以通过重写指针把不同的文件夹或失败
  交给不同的测试（目录值原样返回）。
- **Windows：对话框必须以获得焦点、位于浏览器前方的状态出现。** 宿主是后台进程，而 Windows 只允许
  *拥有*前台窗口的进程调用 `SetForegroundWindow` —— 因此一个朴素的 `ShowDialog()` 会开在浏览器
  后面、没有焦点，读起来就像“这个按钮什么也不做”。一个不可见的、总在最前的属主窗体**本身并不
  足够**：在 Windows 11 上、前方是一个无关应用时实测，对话框 3/3 次都以未聚焦状态出现 —— 可见，
  但键盘仍归浏览器。有效的是绕过前台锁的文档化做法：脚本对前台窗口的线程做 `AttachThreadInput`
  （共享其输入队列可使我们的 `SetForegroundWindow` 合法），把属主窗体带到前台，解除附加，然后显示
  **归属于**这个此刻处于前台的窗体的对话框。在 Windows 11 上实测：3/3 次均获得焦点且置顶，回车
  选中高亮的文件夹，Escape 以退出码 0 返回 `null`。整个抓取是**尽力而为**的 —— 被包裹起来，使无法
  编译 P/Invoke 的宿主，或拒绝被抢占的提权前台应用，降级为旧行为（对话框仍然打开，只是在后面），
  而不是让选择失败。
  脚本通过 `-EncodedCommand`（base64/UTF-16LE）交付，而不是 `-Command`：它是多行的，并且含有
  P/Invoke 签名里的双引号，而 Windows 的 argv 引号处理加上 PowerShell 自身的重新解析无法保留它们。
- **Public surface（公开接口，barrel）：** `selectDirectory`（外加 `pickersFor` / `Picker` 与两个
  消息构建函数 `pickerFailure` / `noPickerMessage`，为了单元测试而暴露）。
- **允许的依赖：** Bun（`Bun.spawn`，带 `windowsHide`；见 `architecture.md` 的不变量）、
  `process.env`。
- **绝不触碰：** `host`；兄弟特性；`contracts`（无需使用）。
