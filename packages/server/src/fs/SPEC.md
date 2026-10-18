---
id: submodule-server-fs
type: submodule-design
status: active
title: fs —— 工作树文件读取
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## 职责

读取工作区工作树内部的目录与文件（路径受约束），并判定**一个资源的字节是什么** —— 宿主里每一次内容
读取共享的唯一一层字节级分类。

## 边界

- **拥有：** `readDir`/`readFile(workspaceId, path)` —— 每个路径都被解析并约束在工作树根内；
  `.git` 隐藏；目录排在前面。（`.thinkrail/` **不**隐藏 —— 它像任何其他目录一样显示，因此未来
  宿主托管的内容在那里保持可见；其临时性的 `context/` 被挡在 git 之外，而不是挡在树之外。）
  `readFile` 回答 **`{ content, meta }`**：文件按字节读取，仅当它是文本时才解码，因此对一个纯字节
  资源 `content` 为 `""`，客户端改为通过宿主的 `/files` 路由获取这些字节，而不是收到乱码。
  **`resolveWorktreeFile(workspaceId, path)`** 返回被约束的绝对路径，供宿主通过 HTTP 流式传输
  文件的原始字节（`/files/…` 路由为 Markdown 查看器提供相对图片，`/blob` 路由的包含性检查），并
  供 `changes` 模块的原子写入使用。词法逃逸、`.git`，以及一条已存在的符号链接链（其解析后的目标
  离开工作树）都被拒绝；叶子路径缺失是被允许的，以便已删除的文件可以被恢复。`changes` 传入
  `{ followLeaf: false }`，使包含性校验经由父目录完成，并使其自身的 `lstat` 能够在不跟随的情况下
  拒绝哪怕是一个逃逸的叶子符号链接。本模块拥有路径安全；其调用方拥有流式传输与写入。
  **内容分类**（`content.ts`，纯函数，无依赖）：`CONTENT_SNIFF_BYTES` 命名共享的 8 KiB 有界头部
  大小；`classifyBytes(bytes)` → `{ text, mime? }` —— **mime** 是*字节*所证明的东西
  （png/jpeg/gif/webp/avif/bmp/ico/pdf/zip/gzip/woff/woff2 的魔数，加上对根元素为 `<svg>`（直接如此
  或位于 XML prolog 之后）的文本给出 `image/svg+xml` —— 仅有一个 prolog 不算图片；以及对一个至多
  1 KiB、内容恰为 `git lfs` 自己写出的三行指针 `version`、`oid sha256:`、`size` 的文本文件给出
  `application/vnd.git-lfs`，就这三行、按这个顺序、别无其他，因此任何仅仅引用了一段指针的散文都不会
  被误当作指针 —— 所以一个内容是指针的 `.png` 被报告为它所是的那个指针，而不是一张解码失败的图片）；
  **文本**是“没有识别出的二进制魔数、前 8 KiB 内没有 NUL 字节，且能严格按 UTF-8 解码”（BOM 算作
  文本；SVG 算作文本，因为 `image/svg+xml` 是从文本推断出来的，绝不是从魔数推断的）。魔数胜过
  可解码性：一个未压缩的 PDF 是合法的 ASCII，然而它是由 PDF 渲染器拥有的文档，而不是代码渲染器
  可以认领的源码；`hashBytes(bytes)` → 那个 sha-256 十六进制串，它**就是**一个资源在线上协议上的
  身份（`ResourceMeta.hash`、`ReviewAnchor.contentHash`、`change.*` 的比较并交换）；
  `decodeText(bytes)` → 唯一的那次 UTF-8 解码（保留 BOM，因为 BOM 是哈希所覆盖的字节的一部分）；
  `mimeFromPath(path)` 拥有任何字节检查都给不出的文件名回退
  （markdown/json/csv/yaml/html/xhtml/plain）；`resourceMeta(bytes, path)` → 线上协议的
  **`ResourceMeta`**，加入该回退，并把 `null`
  字节当作缺席（`hash`/`byteLength` 为 null，`text: true` —— 没有可解码的东西，而与它配对的空
  字符串是合法文本）。
- **Public surface（公开接口，barrel）：** `readDir`, `readFile`, `resolveWorktreeFile`,
  `classifyBytes`, `CONTENT_SNIFF_BYTES`, `mimeFromPath`, `hashBytes`, `decodeText`, `resourceMeta`
- **允许的依赖：** `persistence`（工作区查找）；`contracts`（`FileNode`、`ResourceMeta`）；Node 的
  `fs`/`path`/`crypto`。
- **绝不触碰：** `host`；兄弟特性。

## 必须做对的事

- **一份分类，一个哈希。** 一个资源的文本性、媒体类型与 sha-256 在这里判定，别处不判：`reviews` 用
  它们捕获锚点，`git` 用它们给差异两侧盖章，`changes` 用它们守护自己的写入。两份实现会让一条评论的
  `contentHash` 与一次还原的 `expect` 哈希对同一批字节给出不同结论。
- **扩展名绝不压过字节。** 一个内容是 PNG 的 `.md` 文件报告 `image/png`；只有在字节什么也没说时才
  咨询文件名，因此一个标签错误的资源不可能说服某个渲染器把它当作文本解析。
