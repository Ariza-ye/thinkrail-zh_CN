---
description: "对某个文件或目录做代码评审"
argument-hint: "[路径] [关注点]"
---
评审 $1 的正确性、清晰性与可维护性，重点关注 ${2:-the riskiest parts}。
用 `file:line` 引用列出具体的发现，按严重程度排序，并为每条提出修复方案。
