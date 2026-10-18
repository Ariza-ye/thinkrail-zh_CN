# 发布 pi 包

`pi-extensions/*` 下各包的操作指南：它们以 `@thinkrail/pi-<name>` 的名字发布到 npm，并且可以在不带
ThinkRail 的原版 `pi` 中使用。决策与理由见 [SPEC.md](SPEC.md)；本文件是检查清单。

## 新增一个包

1. 在它的前身**旁边**创建 `pi-extensions/<name>/`（如果 `packages/` 下存在这样的前身）；绝不在同一个 PR 里
   修改或删除旧包 —— 接线 PR 稍后再做这件事。
2. `package.json`：复制 `visualize/package.json` 并调整。不可妥协的地方：
   - `name: "@thinkrail/pi-<name>"`、`version: "0.0.0"`（第一个 changeset 产生第一个真实版本）、
     `private` 缺席、`license: "Apache-2.0"`、`repository.directory`、
     `publishConfig: { access: "public", provenance: true }`。
   - `keywords` 包含 `"pi-package"`，并且**仅**对可安装扩展才带 `pi` manifest（`extensions`、`skills` …）。
     可移植库（没有 factory）两者都不要。
   - `files`：入口点与 `exports` 传递性 import 到的一切，测试除外。对等门禁从 tarball 安装，所以漏掉一项就会
     在那里失败。
   - Pi SDK 包（`@earendil-works/pi-ai`、`pi-coding-agent`、`pi-tui`、`pi-agent-core`、`typebox`）都是
     `peerDependencies: "*"` 与 `devDependencies: "catalog:"`。其他运行时依赖：精确锁定版本。
3. 从仓库根复制 `LICENSE`。写一个 `README.md`，开头几行是 `pi install npm:@thinkrail/pi-<name>` 以及这个包
   增加了什么。
4. 创建 `SPEC.md`（`parent: module-pi-extensions`），并把该包加到 [SPEC.md](SPEC.md) 的成员表里。
5. 在 `scripts/check-module-boundaries.ts` 中注册该包（`{ root: "pi-extensions/<name>", allowed: [] }`，或它
   所依赖的兄弟包），并在 `scripts/checkModuleBoundaries.test.ts` 的夹具中注册。
6. 把它的预期加到 `scripts/check-pi-packages.ts` 的 `EXPECTATIONS`：工具名、技能名，以及若干可执行用例
   （一次合法调用、一次被拒绝的调用、一次 TUI 渲染）。在 `session_start` 内部注册的工具需要 session-bound
   模式 —— 在出现第一个这样的包时一并加上。
7. 运行 `bun install`，然后跑下面的门槛。

## 原版对等门槛（首次发布之前）

- `bun run check:pi-packages` 是绿的 —— 它打包、安装到一个**仓库之外**的隔离 pi 夹具里，并在 **Node**
  （原版 pi 的运行时）下加载，所以只有 Bun 才有的 API 与漏掉的 `files` 会在这里失败。
- 发布的代码是双运行时：只用 `node:` 内建模块与标准 ESM；没有 `Bun.*`、`bun:*`、`import.meta.dir`。
- 每个纯文本结果读起来糟糕的工具都有 `renderCall`/`renderResult`；每次 UI 调用都在 `ctx.hasUI` 之后。
- 在真实终端里手动检查，包括在 `tmux` 内：
  ```bash
  node_modules/.bin/pi -e pi-extensions/<name>/index.ts
  ```
- 没有 `~/.thinkrail` 路径，没有宿主线上协议，除兄弟 `pi-extensions/*` 外没有 `@thinkrail/*` import。

## 发布一个版本

1. **在改动已发布包的那个 PR 里**添加 changeset：
   ```bash
   bun changeset            # pick the package(s), bump type, one-paragraph summary
   ```
   把生成的 `.changeset/<name>.md` 与改动一起提交。当依赖发布时，依赖方（`subagents` → `delegation`）会被
   自动升版本。
2. **要切发布**，维护者在一个新分支上运行
   ```bash
   GITHUB_TOKEN="$(gh auth token)" bun run release:version  # changeset version + bun install (lockfile)
   ```
   （GitHub 变更日志生成器需要 token 才能查找 PR/作者链接；它自己不会读取 `gh` 的凭据）
   然后开一个普通的 PR `chore(release): version pi packages`。它带上版本提升与 `CHANGELOG.md` 条目，并消费掉
   changeset 文件。普通 CI 会跑在它上面。
3. **合并到 `main` 时**，`.github/workflows/release-pi-packages.yml` 重新运行对等门禁，发布每个版本还不在 npm
   上的包（先发布依赖），并在当前所有版本都上了 npm 之后推送 `name@version` 标签 —— 包括手动发布（bootstrap）
   的版本，以及早先推送失败而漏掉的标签。该任务运行在带 OIDC 的 `npm-release` GitHub 环境里 —— 任何地方都
   没有 npm token。只要还有任何 changeset 待处理，任务就会以 "nothing to publish" 提前退出，并且什么标签都
   不打。

`bun run release:publish -- --dry-run` 在本地显示该工作流会发布什么。

## 新包的首次发布（一次性 bootstrap）

npm Trusted Publishing 只能在已经存在的包上配置，所以最初的版本由拥有 `thinkrail` npm 组织的人来发布：

```bash
bun run release:pack <dir>                      # e.g. visualize → dist/pi-packages/<name>-<version>.tgz
npm login                                       # org owner, 2FA
npm publish dist/pi-packages/<tarball> --access public --provenance=false
```

`--provenance=false` 是这次手动发布所必需的：manifest 的 `publishConfig` 要求 provenance，而只有 CI 提供商才能
生成它。自动化发布保留 provenance。

然后，在 npmjs.com → 该包 → **Settings → Trusted Publisher → GitHub Actions**：

| 字段 | 值 |
| --- | --- |
| Organization / user | `JetBrains` |
| Repository | `thinkrail` |
| Workflow filename | `release-pi-packages.yml` |
| Environment | `npm-release` |

首次 OIDC 发布成功之后，把该包的发布访问权限设为 *Require two-factor authentication and disallow tokens*。

## 排查

- **`check:pi-packages` 在夹具内部报 module not found 而失败** —— 某个运行时 import 不在 `dependencies` 里，
  或某个文件不在 `files` 里。
- **"uses a Bun-only API"** —— 把该调用移进 `*.test.ts`，或换成一个 `node:` 等价物。
- **发布任务跳过了所有内容** —— `main` 上的版本已经在 npm 上了（无事可做），或 changeset 仍在待处理
  （先切版本 PR）。
- **发布失败并报 `ENEEDAUTH`/403** —— 该包的 Trusted Publisher 还没配置（见 bootstrap），或工作流/环境名称与
  npm 配置不完全一致。
