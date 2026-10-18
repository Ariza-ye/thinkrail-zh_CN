---
id: submodule-spec-graph-core
type: submodule-design
status: active
title: Spec-graph 核心（不含 pi 的模型）
parent: module-spec-graph
tags: [spec-graph, pi-extension]
---

## 职责

不含 pi 的规范模型：is-a-spec 规则、frontmatter 解析/序列化与就地编辑（经由
`yaml` 库，链接/元数据列表内联）、派生图（父树 +
`depends-on`/`references`/`implements` DAG + 反向边）、按需的内存读取索引、带元数据过滤的内容
grep、有界的图切片，以及结构校验。**不导入任何
`@earendil-works/*`**，因此它可以单独做单元测试（`core/core.test.ts`）。

## 边界

- **拥有：** 以上全部。文件系统是事实来源；模型是派生的、内存中的、
  只读的——重新校验机制位于 `module-spec-graph`（*派生的读取索引*）。
- **Public surface（公开接口）：** `index.ts` 这个 **barrel**。`tools/` 只通过它导入模型，绝不
  直接导入某个叶子文件。barrel 约束的是*使用方*；本模块自己的测试（`core/core.test.ts`）可以直接导入
  一个叶子，以触达那些刻意不公开的辅助函数——`store.ts` 中的纯路径守卫、段解析器与 glob 顺序比较器，
  它们钉住 `resolveSpecPath` 与 glob 顺序，而不触碰任何文件系统。
- **允许的依赖：** `yaml`；Node 内建模块。
- **绝不触碰：** 任何 `@earendil-works/*`（这正是 `core/` 保持隔离且可单元测试的原因）以及任何
  `@thinkrail/*` 包。

## 叶子与依赖图

无环且单向：`parse` 是根，`graph` 建立在它之上，而 `query`/`validate`/`store` 建立在
`graph` 之上。barrel 重新导出各叶子，不添加任何逻辑。

| 叶子 | 拥有 | 依赖 |
| --- | --- | --- |
| `parse.ts` | 文件 → `{ frontmatter, body }`；is-a-spec 规则；frontmatter 解析（有损的读取方言）+ 序列化；`updateFrontmatterText` 的无损就地编辑；`FIELDS` 字段注册表与有限词表元组 | — |
| `graph.ts` | 文件 → 节点 + 边（父树、DAG + 反向）；重复 id 跟踪 | `parse` |
| `query.ts` | 带元数据过滤的内容 grep；有界的图切片 | `parse`、`graph` |
| `validate.ts` | 悬空链接、重复 id、父级环路 | `parse`、`graph` |
| `store.ts` | `SpecIndex`：按需的 fs glob + 逐文件解析缓存 + 记忆化的图（`core/index` 模块）；可索引路径规则（`resolveSpecPath`） | `parse`、`graph`、`query` |

## 不变量

- `core/` 之下任何地方都没有 `@earendil-works/*` 导入。
- `buildGraph` 是纯的（相同输入 → 相同输出）；索引按 `(mtimeMs, size)` 重新校验每个文件、
  记忆化该图，并且绝不提供过期的那一个。
- glob 会**先**把每个目录的条目过滤成遍历候选——未被忽略的目录加上 `.md` 文件——然后才
  规范化并排序它们，因此一个满是无关条目的目录在每次读取时的开销，除了丢弃它们的那一趟之外
  再无其他。
- 该顺序是**全序**：候选项按其 **NFC 规范化**后的名称比较，并以原始名称按码元
  作为平局决胜。因此规范顺序——以及因此哪个文件赢得重复的 `id`——在每个文件系统上都是同一个：
  不是 `readdir` 恰好返回的顺序，也不是在那些返回分解（NFD）名称的文件系统上的另一个答案，更不是对两个
  规范等价的拼写（预组合的 `é` 与 `e\u0301`）再次取 `readdir` 的顺序——它们共享同一个 NFC 键，否则就会被
  留在一个稳定排序碰巧找到它们的位置。
  目录与 `.md` 文件留在**同一个**候选列表中，因此子目录是在它与同辈文件之间的位置上被下潜的，而不是在它们全部
  之前或之后，规范序列从头到尾都是按名称排序的。这次“先过滤再排序”的重写**保留**了这一点，而不是引入了它；
  该测试之所以存在，是因为两个分开的列表是显而易见的形态，而它会静默地改变重复 `id` 的
  胜者。
- 遇到重复 `id` 时，该顺序中的第一个文件赢得节点槽位；重复集合被记录下来供
  `validate` 使用。
- `resolveSpecPath` 是“索引究竟能否看到这个路径？”的唯一定论，并且它以**规范相对路径**
  作答，因此调用方永远无法报告一个索引不会产生的身份。
  它要求：相对于根、位于根内、`.md`、位于被忽略目录之外、根存在，且根之下任何组件处都没有
  符号链接——逐组件用 `lstat` 检查，悬空链接也算在内，因为 glob 从不下潜符号链接。在 Windows 上，含冒号的路径在
  规范化之前就被拒绝：这同时封住了驱动器相对路径（`C:..\\outside.md`，`isAbsolute` 并不
  识别它）与 NTFS 备用数据流（`file:SPEC.md`，`readdir` 看不到它）。任何在规范化之后残留的 `..`
  段也会被拒绝，而规范化后的绝对结果必须通过最后一道 `relative(root, target)` 包含性检查。这些相互重叠的门
  是刻意的：路径语法、规范化与逐组件的规范化不得能够互相削弱。可移植的
  `win32` 算术测试在每个宿主上钉住这个逃逸；Windows CI 通道还会原生运行包测试，
  包括 `resolveSpecPath` 与 `spec_create` 的集成。符号链接规则正是字符串检查与 `realpath` 比较都会漏掉的
  地方：一个链接无论是否离开项目、落在被忽略的目录中，还是指回某个已索引的目录，都会被拒绝，因为在每种情形下
  它创建的文件对每一个其他 spec 工具都不可见。
- `resolveSpecPath` 在判定或报告之前，把每个组件规范化为其**磁盘上的拼写**。
  其字节已与父目录某个条目匹配的组件按原样接受；一个在此文件系统上解析成功却*不*与任何条目逐字节匹配的
  组件——一个大小写不敏感或做 Unicode 折叠的文件系统——则成为在
  `normalize("NFC").toLowerCase()` 之下与之相等的那个父条目。零个或两个这样的条目都是**错误**：它默认拒绝，
  而不是去猜一个身份。规范化在第一个无法解析的组件处停止，其余部分
  保留调用方的拼写，因为在大小写敏感的文件系统上，一个与既有 `docs/` 相邻的新 `Docs/` 确实是一个 glob 会看到的
  新目录。`rel` 与 `abs` 是由那些规范化段组装而成，绝不是由词法拼写组装。一个词法 `rel` 正是让
  `NODE_MODULES/SPEC.md` 在一个大小写不敏感的文件系统上报告出 glob 永远不会产生的身份的原因——在那里该写入落在了
  `node_modules/` 中。`.md` 规则被判定两次：一次针对调用方的字符串，再次针对规范化后的
  `rel`，因为一个规范化到 `SPEC.MD` 的叶子，是逐字节精确的 glob 永不索引的文件。
  存在性用 `lstat` 探测，因此一个悬空符号链接也算作解析成功，并仍会触达上面的
  符号链接拒绝。
  规范化读取的是**父目录**的列表，因此每个存在的父目录都会被列出——不只是那些
  组件存在的——而一个存在但无法列出的父目录是**错误**，绝不是一次空列出。那个 `readdir` 正是 glob 在那里
  所做的调用：一个解析器无法列出的目录，正是 glob 会放弃的目录，因此写在它之下的规范会因与
  `node_modules` 中的规范相同的原因而不可见。
- **写入路径过度拒绝；读取路径保持精确。** `resolveSpecPath` 在每个组件
  `normalize("NFC").toLowerCase()` 折叠后的形态上匹配 `IGNORED_DIRS`，因此它在任何拼写下都拒绝 `NODE_MODULES/SPEC.md`；
  而 glob 仍按逐字节精确的 `readdir` 名称匹配。这两个错误的体量并不相同。拒绝过多的解析器
  会以调用方可以据以行动的理由作答；跳过过多的 glob 会把一个人们确实命名为 `Build/` 的目录
  从索引中丢掉，且毫无征兆。
  单靠规范化并没有触达写入路径，因为它只为已经存在的组件说话：在一个 `node_modules` 尚未安装的项目上，
  `NODE_MODULES/SPEC.md` 解析成功、在大小写不敏感的文件系统上创建了真正的 `node_modules`，并把其下每个
  依赖都交给 glob 去索引。把 glob 也做折叠对此毫无收益——一个已安装的
  `node_modules` 在磁盘上是小写，精确检查已经会跳过它——而且它还要以 `Build/` 那一情形为代价，因此 glob 保持精确。
  折叠完全触及不到的是：一个由 pi 自己的 `write` 写入 `NODE_MODULES/` 的规范，从不经过 `resolveSpecPath`。
- `SpecNode.type` 保持为 `string`：读取模型索引磁盘上的任何内容，因此它容忍任何 `type`；
  `SPEC_TYPES` 词表只约束 `spec_create` 的编写面，绝不约束图。
- 有限词表（`SPEC_TYPES`、`SPEC_STATUSES`、`SLICE_DIRECTIONS`、`LINK_KINDS`、`IDENTITY_FIELDS`）
  与 frontmatter 字段名（`FIELDS` 注册表）都是单一来源的 `as const`——没有重复的字面量列表，因此一次
  重命名就是一行改动。`core/` 保持不含 typebox；只有 `tools/` 把这些元组包进 `StringEnum`。
- 读取会把 frontmatter 强制为标量/字符串数组方言（有损——嵌套映射与注释被
  丢弃），这对派生模型来说没问题。写入路径（`updateFrontmatterText`）是**无损的**：
  它就地修改一个活的 `yaml` Document，因此未触碰的字段保留其顺序，任何注释/
  嵌套值都存活。字段顺序是**被保留的，绝不重新排序**——`FIELD_ORDER` 只是 `spec_create` 构建*新*
  frontmatter 时的顺序。围栏内部各行的 `\r` 剥离，正是让 CRLF 编写的文件得以解析的东西。
- 写入路径**只重写 frontmatter 块**：正文按字节原样拼回，开头的
  BOM 被放回，而应用于被重写块的行尾符是从 frontmatter 自身的第一个换行读取的（LF 或 CRLF）。
  没有任何东西从正文推断——一个散文恰好混用行尾的文件保留它原有的每一个散文字节，这正是“`spec_update` 从不编辑散文”
  对字节而不只是对字段成立的原因。
- 读取路径则以另一种方式承担同样的义务：`grepSpecs` 按 `\n` 切分、在匹配前丢掉结尾的
  `\r` 与开头的 BOM，因此一个带锚点的模式在一个 LF 规范、一个 CRLF 规范与一个带 BOM 前缀的规范上行为一致
  ——否则 BOM 会让第 1 行躲过每一个 `^` 模式。
