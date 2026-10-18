---
description: "根据暂存的差异（diff）写一条 Conventional Commit 提交信息"
argument-hint: "[scope]"
---
阅读暂存的改动（`git diff --cached`），写一条 Conventional Commits 格式的提交信息。
选择最合适的 type（feat/fix/refactor/docs/test/chore），scope 用 `${1:-infer it from the files}`，
subject 用 72 字符以内的祈使句，当原因不明显时用一段简短的 body 说明原因。
只回复这条提交信息。
