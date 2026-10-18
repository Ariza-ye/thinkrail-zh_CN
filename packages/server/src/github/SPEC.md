---
id: submodule-server-github
type: submodule-design
status: active
title: github —— 本地 gh 认证状态
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## 职责

只读的本地 GitHub CLI（`gh`）认证状态，供新建工作区对话框的“已连接”胶囊 + 刷新使用（以及设置的
“本地 GitHub”区块）。仅通过 shell 调用，在服务端进行，使用宿主解析后的登录 PATH。

## 边界

- **拥有：** `githubAuthStatus()` → `Promise<{ connected, login?, scopes? }>`，通过 shell 调用
  `gh auth status`（解析其报告以取得账号 + token scope）；`githubRefresh()`（重新执行同一检查）。
  优雅降级 —— `gh` 缺失 / 未认证 / 无响应一律解析为 `{ connected: false }`，因此该对话框在完全
  离线时也能用。`THINKRAIL_GH_OFFLINE=1` 会强制返回断开状态而不调用 shell（e2e 走这条离线路径）。
  另外还有 `ghSetupProblem()` → `Promise<GhSetupProblem | null>` —— 直接 gh 路径不可用的*具名*
  原因（`Bun.which("gh")` 找不到二进制或探测从未启动时为 `missing`，探测以非零退出时为
  `unauthenticated`，gh 可用或离线接缝打开时为 `null`）。两个探测都在 `subprocess` 的
  `runBounded` 下、以 8s 预算（`GH_PROBE_TIMEOUT_MS`）运行同一条 `gh auth status`：`gh auth status`
  会做一次网络往返，而宿主只有一个事件循环 —— 在这里用 `spawnSync` 会让每个会话在探测期间冻结，
  而这正是 `runBounded` 存在所要排除的失败（见 `subprocess/SPEC.md`）。超时（TIMED OUT）的探测
  报告 `null`/`{ connected: false }`（一次短暂的网络卡顿不等于“已登出”—— 走静默的对比页回退，
  绝不是登录对话框）。`pr` 会消费 `ghSetupProblem`（仅在 gh 流程失败之后），使客户端能展示设置
  指引，而不是静默降级到对比页。
- **Public surface（公开接口，barrel）：** `githubAuthStatus`, `githubRefresh`, `ghSetupProblem`
- **允许的依赖：** `contracts`（`GithubAuthStatus`）；`subprocess`（`runBounded`，两个探测所基于的
  有界子进程）；Bun（`which`）。不触达 `git`/`projects` —— 它是纯 `gh` 探测。
- **绝不触碰：** `host`；兄弟特性；被打包进浏览器（`gh` 通过 shell 调用，绝不打包）。
