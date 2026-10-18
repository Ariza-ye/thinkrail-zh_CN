---
id: submodule-server-templates
type: submodule-design
status: active
title: templates —— 对 pi 提示词模板目录的文件 CRUD
parent: module-server
depends-on: [module-contracts]
tags: [templates, public-surface-checked]
---

## 职责

对 pi 两个受认可的提示词模板目录（全局 + 项目范围）做文件 CRUD：列出 / 获取 / 保存 / 删除 `.md` 文件，
并把 pi 自己的 frontmatter（`description`、`argument-hint`）作为元数据暴露出来。由 `template.*` 宿主
处理器使用；本模块自己不拥有任何 WS 接口 —— 一个可选的 `cwd` 由调用方在解析出一个活工作区或一个
会话前项目的当前检出之后传入，绝不在这里查找。

## pi 事实（`@earendil-works/pi-coding-agent`，目录里钉定的版本）

通过阅读已安装包中的 `dist/core/prompt-templates.js`（`loadTemplateFromFile` / `loadTemplatesFromDir` /
`loadPromptTemplates`）、`dist/core/resource-loader.js`（`dedupePrompts`、`updatePromptsFromPaths`），
以及 `dist/utils/frontmatter.js` + `dist/utils/text.js` 核实过 —— 以源码而非假设为准；每次升级 pi
时重新核实。

- **目录：** 全局 = `join(agentDir, "prompts")`；项目 = `resolve(cwd, CONFIG_DIR_NAME,
  "prompts")`（`CONFIG_DIR_NAME = ".pi"`，pi 的根导出）—— 恰好是 `templateDirs` 的两个字段。
- **Frontmatter 键：** `description`（字符串）与 `argument-hint`（kebab-case；pi 自己的加载器通过
  `...(frontmatter["argument-hint"] && { argumentHint:
  frontmatter["argument-hint"] })` 把它映射到一个 camelCase 的 `argumentHint` 字段）。pi 的加载器
  不读取任何其他 frontmatter 键。
- **名字推导：** `basename(filePath).replace(/\.md$/, "")` —— 文件名去掉一个尾部 `.md` 后缀，只去
  一次（像 `foo.bar.md` 这样含内嵌点的名字推导出 `foo.bar`）。
- **pi 的加载器里根本没有名字校验，一点也没有。** `loadTemplatesFromDir` 接受任何满足
  `entry.isFile()`（或一个解析到文件的符号链接）`&& entry.name.endsWith(".md")` 的目录条目 ——
  没有正则，没有穿越护栏，也没有点开头的过滤（pi 会列出一个人工放进去的 `.hidden.md`）。对**我们的**
  按名路径（`saveTemplate` / `getTemplate` / `deleteTemplate`）的路径穿越安全，完全由本模块自己的
  `isValidTemplateName` 门控负责；pi 在这方面没给我们任何可依赖的东西。
- **`loadTemplatesFromDir` 的错误处理是两层的，处于两种不同的粒度。** 整个 `readdirSync` 调用加上围绕
  它的循环位于一个 `try { … } catch { return { templates,
  diagnostics }; }` 之内 —— 一个不可读的目录会返回已经收集到的内容，而不是从函数里抛出。独立地，
  每个文件经过 `loadTemplateFromFile`，它现在有*两个*独立的内层 `try/catch` —— 一个围绕读取，一个围绕
  `parseFrontmatter` —— 任一失败都返回
  `{ template: null, diagnostics: [{ type: "warning", message, path }] }`，而不是静默返回 `null`
  （上游 PR #9830：一个格式错误的文件过去会毫无痕迹地消失；自 0.87 起它产生一条资源诊断，pi 自己的
  调用方可以把它呈现出来）。本模块的 `listDir` 只镜像这一两层*结构* —— 它自己逐文件/逐扫描的
  `catch {}` 仍然静默吞掉，因为本模块从不调用 `loadPromptTemplates`/`loadTemplatesFromDir`，也没有
  可填充的诊断通道；见下面的“设计”。整个扫描的包裹，才是保护 `listTemplates` 不因一个 EACCES
  （或类似情况）把所有 scope 的结果都清空（而不只是坏掉那一个）的东西。
- **`parseFrontmatter` 的真实签名**（`dist/utils/frontmatter.d.ts`）：`parseFrontmatter<T extends
  Record<string, unknown> = Record<string, unknown>>(content: string): { frontmatter: T; body: string
  }` —— 一个普通的同步函数，对 frontmatter 形状泛型化（运行时不校验；该泛型是调用方自己的断言，
  正如 pi 自己的加载器信任它那样）。我们使用默认的 `Record<string, unknown>`，并在把一个值当作
  `string` 信任之前用 `typeof` 收窄。
- **没有 frontmatter 的文件解析为 `{ frontmatter: {}, body: <normalized content> }`。** 阅读
  `frontmatter.js` 本身：在围栏检测之前，一个前导 UTF-8 BOM 被剥掉，换行被规范化（`\r\n`/`\r` →
  `\n`）；如果剩余内容不是以 `"---"` 开头，或者一个 `"---"` 开头符永远找不到闭合的 `"\n---"`，
  那段规范化后的内容就成为 `body`，不做 trim。只有*成功闭合*的 frontmatter 块才产出一个被
  `.trim()` 过的 `body`。本模块完全不读 pi 的 `body`（见下面“content”），因此那些 BOM/trim/
  规范化行为一点也不会渗进 `Template.content` —— 它只对元数据提取路径有意义。
- **pi 的加载器会合成一个回退的 `description`**，取自正文第一行非空内容（截断到 60 字符 + `"…"`），
  当 frontmatter 没有它时 —— 用于 pi 自己 `/` 菜单的简介。我们刻意**不**复制这一点：
  `TemplateInfo.description` 在线上协议上是可选的（`contracts/domain.ts`），因此一个没有
  `description` frontmatter 键的模板暴露为 `description: undefined`（键被省略），绝不是 pi 从未写过
  磁盘的伪造值。
- **优先级不是在 `loadPromptTemplates` 自身内部决定的。** 它的 `includeDefaults` 分支只是拼接
  `[...global, ...project]`，在那一层**完全不去重**。真正的优先级在之后由 `resource-loader.js` 的
  `dedupePrompts` 解析 —— 一个以名字为键的 `Map`，其中为一个名字注册的**第一个**提示词胜出（后续
  同名条目变成一条 `collision` 诊断，而不是覆盖）—— 而它作用在一个由项目配置合并顺序构建的
  `promptPaths` 列表之上，我们没有进一步追踪该顺序（属于本模块有界调查之外，而且无关：
  `loadPromptTemplates` / `dedupePrompts` 都没有根导出 —— 密封的导出映射只给我们
  `parseFrontmatter` / `stripFrontmatter` / `getAgentDir` / `CONFIG_DIR_NAME`，因此即使我们想，也
  无法调用 pi 的版本）。这里的**“项目遮蔽全局”是我们自己的产品决策**（设计规范 §2.2，“scope 省略
  → pi 优先级：项目胜于全局” —— 与任务简报一致），由 `listTemplates`/`getTemplate` 用一个以名字为键
  的 `Map` 独立实现，其中全局先插入、项目后插入（对一个既有键 `Map.set` 会覆盖其值）—— 这正是 pi 自己
  的“先到者胜”`dedupePrompts` 的镜像，之所以这样选，是因为“更具体的 scope 胜出”是产品规范所要求的
  行为，而不是因为 pi 的内部实现替我们这样解析。
- **本模块不使用 `stripFrontmatter`（同样是根导出）。** `Template.content` 是“文件的完整文本：
  frontmatter + body”（`contracts/domain.ts`），而设计规范 §2.4 从头到尾确认了这一点：“客户端组装
  Markdown（frontmatter + body）；服务端原样写入。”因此 `content` 始终是原始的 `readFileSync` 结果
  —— 绝不是 pi 解析/剥离后的 `body` —— 而 `stripFrontmatter` 没有字段可供喂养。（后续某个任务的
  槽位解析器，在 `apps/web` 那边，如果它想要 pi 的 `body` 形状，将需要自己的一个小型非 pi 的
  frontmatter 剥离；按根架构不变量，它完全无法导入 pi 的版本，浏览器打包代码也一样。）

## 设计

- `templateDirs(cwd?, agentDir = getAgentDir())` → `{ globalDir, projectDir? }` —— 纯粹的路径算术，
  不访问文件系统。`agentDir` 的默认值是一个**默认参数表达式**，在调用时求值，而不是模块级常量 ——
  `getAgentDir()` 活读 `PI_CODING_AGENT_DIR`（history/SPEC.md 为 pi 的 `SessionManager` 路径钉定
  了同一事实），因此在导入时缓存它，会在这个模块已经加载之后某个测试（或 e2e 播种器）设置该环境变量
  的那一刻变得过期。
- `listTemplates` **在每次调用时**重读两个目录 —— 本模块任何地方都没有缓存。这是“/ 菜单新鲜度”规则
  （设计规范 §2.2）：pi 自己的 `session.promptTemplates` getter 经由 `ResourceLoader.getPrompts()` 读取，
  后者在会话加载时填充一次，且只由一次显式的资源重载刷新 —— 一个**创建时快照**，在会话进行中保存一个
  模板的那一刻就过期了（通过阅读 `agent-session.js` 的 `get promptTemplates()` /
  `resource-loader.js` 的 `updatePromptsFromPaths` 确认）。一个经 `template.save` 保存的模板必须在
  任何客户端下一次询问时出现（`template.list`、web 的 `/` 菜单、Templates 设置面板），因此本模块绝不
  做记忆化；代价是每次调用几 次小的 `readdir`，那已经足够便宜。
- `isValidTemplateName` 是**穿越门控**：在 `getTemplate`、`saveTemplate` 与 `deleteTemplate` 中一律
  在把每个由调用方提供的 `name` `join()` 进路径之前应用它。它的职责是路径穿越的*安全*，不是命名风格，
  因此它只拒绝那些作为单个文件名段不安全的形状 —— 空、前导 `.`（一条规则同时覆盖 `.`、`..` 与
  `.hidden` 式点文件）、名字中任何位置有路径分隔符（`/` 或 `\`），或内嵌 NUL 字节 —— 其他一切都被
  接受，包括内部点（`foo.bar`）、大写、空格与 unicode。这之所以重要，是因为 pi 自己的加载器在从
  文件名推导名字时**完全不做事任何净化**（见上面“pi 事实”），因此一条更窄的规则会破坏**列表/获取
  对等性**：一个 `listTemplates` 能显示而 `getTemplate`/`saveTemplate`/`deleteTemplate` 拒绝的名字
  是用户可见的 bug，而不是安全性的改进。（这个门控最初用一个 `/^[a-z0-9][a-z0-9-_]*$/i` 白名单
  正则 —— 安全，但限制过度：它拒绝任何含内部点的名字，因此一个完全普通、pi 合法的名为 `foo.bar` 的
  模板会出现在列表里但在 get/save/delete 上 404。发现之后已修复 —— 那个白名单形状解决的是错误的问题，
  是审美而不是穿越。）`listTemplates`（经由 `listDir`）**确实**按这同一个门控过滤 —— 不是为了镜像
  pi（pi 自己的扫描器没有这种过滤，会愉快地列出一个人工放进去的 `.hidden.md`），而是为了让列表/获取
  对等性在*结构上*成立：复用那个守护 get/save/delete 的同一个谓词，而不是一个可能日后悄悄偏离它的
  手工点检查，意味着被门控拒绝的任何名字对 `listTemplates` 也一样不可见，而不只是无法经由它获取。
  （这个过滤本身也是一次修复：更早的版本无条件列出每个 `.md` 文件，因此一个人工放进去的 `.hidden.md`
  会出现在 `template.list` 里，然后在 `template.get` 上 404。）
- **不跟随门控（符号链接遏制）：** 上面的穿越门控约束的是*名字*；这一个约束的是名字可以*解析到*什么。
  每个按名操作都 `lstat` 目标（绝不跟随），并把任何不是普通文件的东西 —— 首当其冲的是符号链接 ——
  当作**不是模板**：`getTemplate` 报告它缺席，`saveTemplate` 拒绝经由它写入（显式错误，磁盘上什么
  也没被碰），`deleteTemplate` 报告它未找到；`listDir` 在结构上已经跳过符号链接（一个符号链接
  dirent 的 `isFile()` 为 false，且不再做后续的 `stat`）。这是**对 pi 自己扫描器的刻意偏离**，后者
  显式跟随一个文件符号链接（`loadTemplatesFromDir` 对它做 stat 并加载文件目标 —— 上面“pi 事实”）：
  pi 的加载器是一个只读的本地便利设施，而本模块是一个*经由线上协议的、可写的 CRUD 面* —— 跟随
  `.pi/prompts/linked.md → ~/somewhere` 会让 `template.get` 泄露目标，让 `template.save` 覆盖它，
  因此一个被检出的仓库可以种下一个链接，把一次例行的模板编辑变成一次工作树之外的文件写入。代价：一个
  合法地符号链接的单个模板，pi 自己的 `/` 菜单会提供它，但在 ThinkRail 的中不会出现 —— 可接受，而且
  在这个门控存在之前列表就已经是这样了。同一条规则适用于**上一层**：一个符号链接的 `<cwd>/.pi` 或
  `<cwd>/.pi/prompts` *目录*（仓库控制着那些路径分量）会让项目目录对**每一个**项目范围的操作用
  不可穿越 —— `listTemplates`/`getTemplate` 把它当作没有任何模板（列表与获取共享同一个谓词
  `readableProjectDir`，因此它们永远不会互相矛盾），而 `saveTemplate`/`deleteTemplate` 显式拒绝
  （一次写入必须可见地失败，绝不能静默 no-op）。没有读取的那一半，`template.list`/`template.get`
  仍会经由线上协议泄露该链接目标的 `.md` 文件 —— 与文件级门控所关闭的是同一处逃逸。**全局**目录被
  刻意豁免：`~/.pi/agent/prompts` 是用户拥有的（已经写到那里的攻击者早就赢了），且点文件管理器经常
  对它做符号链接。`lstat` 之后写入之间的空隙是一个只有并发的本地进程才可能利用的 TOCTOU 竞态 ——
  对一个属主范围的宿主属于范围之外（这样的进程可以直接写目标）。由 `templates.test.ts` 里的符号链接
  用例固定。
- **有界列表 + 大小上限：** `listTemplates` 是**仅元数据**的（`TemplateInfo`，无 `content`），且无论
  一个检出往目录里丢进什么，对每个文件都做有界的工作：`readTemplateMeta` 复用不跟随的 `lstat` 作为
  大小门控（一个超过 **`MAX_TEMPLATE_BYTES`**（1 MiB）的文件被静默跳过 —— 列表/获取对等性：两者都
  不会把它有意义地暴露出来），并且只读头部的前 `FRONTMATTER_SCAN_BYTES`（8 KiB）用于 frontmatter
  —— pi 的 `extractFrontmatter` 把一个没有闭合围栏的截断块当作普通内容，因此一段病态的 >8 KiB
  frontmatter 会降级为“无元数据”，绝不是一个错误或整文件读取（按名路径仍然能看到这样的元数据 ——
  一个有文档记载的有界列表的不对称，由测试固定）。**完整文本**只在按名的 `template.get`/
  `template.save` 路径（`Template`）上传输，那里一个超大文件/负载会**显式**失败（读取：在
  `readFileSync` 之前；保存：在任何东西触及磁盘之前）—— 一个直接具名的操作值得一个显式的回答，与
  格式错误的 frontmatter 同属那种显式-vs-跳过的非对称。正是这一点，使一个巨大的、被检入的
  `.pi/prompts/*.md` 无法在每次 `/` 菜单打开时阻塞共享的进程内宿主，也无法让单个 WS 响应因每个文件
  的正文而膨胀。
- `listDir` 内（`listTemplates` 调用两次的目录扫描）有两层失败遏制，各自在不同粒度镜像一种不同的 pi
  行为：**(1)** 一次逐文件的读取/解析失败（不可读文件、格式错误的 YAML frontmatter）被捕获，那一个
  文件被跳过 —— 镜像 pi 自己 `loadTemplateFromFile` 的*形状*（它逐文件的 catch 在失败时仍返回 null
  模板；自 0.87 起它们额外推入一条警告诊断，但本模块没有诊断通道，只是像以前一样丢弃该文件）。
  **(2)** *目录扫描本身* —— `readdirSync` 调用加上围绕它的循环 —— 也被包裹，因此一个不可读的目录
  （EACCES，或者确定地说，一个最终根本不是目录的路径）会返回已经收集到的内容，而不是从
  `listTemplates` 整体抛出 —— 镜像 pi 自己的 `loadTemplatesFromDir`，其 try/catch 包裹的是*整个*
  扫描，而不是每个文件。 （第 (2) 层本身就是一次修复：更早的版本只有第 (1) 层，因此一个不可读的目录
  径直穿过 `listTemplates` 传播，可能把*另一个* scope 的结果也一起清空，而不只是坏掉那一个。）
  `getTemplate` 对一个*直接具名*的文件不做这种让步：那里的解析失败会传播，因为调用方专门要的就是
  那一个文件，理应知道它有问题（由专门的测试覆盖 —— 即那个有文档记载的、相对 `listTemplates` 吞掉的
  不对称）。
- `saveTemplate` 在写入任何东西*之前*解析传入 `content` 的 frontmatter。构建返回值在写入之后已经
  通过 `readTemplateFile` 调用了 `parseFrontmatter` —— 那意味着一个语法非法的 `---` 围栏块会先落到
  磁盘上、*然后*才抛错，把一个对 `listTemplates`（上面的第 (1) 层吞掉它）不可见、且无法 `get`
  （按设计在那里会传播）的文件变成孤儿 —— 存在于磁盘上却无法经由本模块触达。先校验会把一次被拒绝的
  保存变成文件系统上的 no-op：什么也不写，`mkdirSync`/`writeFileSync` 从不运行。成功写入之后的回读
  原则上仍可能失败，但那时只可能是一次文件系统竞态，而不是内容问题 —— 这是本函数不去试图消除的一个
  可接受残留。
- `listTemplates` 的结果按 `name` 排序 —— `readdir` 的顺序跨平台没有保证，而模板*列表*的每个使用方
  （`/` 菜单、Templates 设置面板）对稳定顺序的需求，胜过对文件系统到达顺序的需求。

## 边界

- **拥有：** 恰好那两个受认可目录（`TemplateDirs.globalDir` / `.projectDir`）里的文件 CRUD；作为
  穿越门控的名字校验；为 `description` / `argumentHint` 而做的 frontmatter → 元数据提取。绝不碰任何
  其他路径 —— 没有对调用方输入的 `resolvePath` / 符号链接跟随，只有在 `name` 通过
  `isValidTemplateName` 之后的 `join(dir, \`${name}.md\`)`。
- **Public surface（公开接口，barrel）：** `templateDirs`, `TemplateDirs`, `listTemplates`,
  `getTemplate`, `saveTemplate`, `deleteTemplate`, `isValidTemplateName`
- **允许的依赖：** `@earendil-works/pi-coding-agent`（`getAgentDir`、`CONFIG_DIR_NAME`、
  `parseFrontmatter` —— 仅根导出）、`@thinkrail/contracts`（`TemplateInfo`、`TemplateScope`）、
  `node:fs`、`node:path`。
- **绝不触碰：** 导入 `workspaces` / `projects` —— 像 `history` 一样保持不依赖登记表；`template.*`
  处理器把读请求那一个可选的 `workspaceId` / `projectId` 位置解析为 `cwd` 并传递进 `templateDirs`
  本身。两个 id 同时给出会被拒绝；没有任何位置保持仅全局。跨调用缓存列表。读或写 `globalDir` /
  `projectDir` 之外的任何东西。

## 必须做对的事

- **`content` 是完整的文件文本，不是 pi 解析后的 `body`。** `TemplateInfo.content` 经
  `saveTemplate` → 磁盘 → `getTemplate` / `listTemplates` 逐字节往返，不受 `parseFrontmatter` 的
  trim/换行规范化怪癖影响 —— 它们只影响元数据提取，绝不影响 `content` 字段。
- **每次调用都新读。** 本模块任何地方都没有内存缓存（见上面“设计”）—— 这是刻意的，不是疏忽；不要
  在未重读它所要满足的新鲜度理由之前加上一个。
- **列表/获取对等性，双向 —— 是结构性的，不是约定。** `isValidTemplateName` 只排除那些作为文件名段
  不安全的形状（空、前导 `.`、分隔符、NUL），绝不排除像 `foo.bar` 这样普通的 pi 合法名字 —— 因此
  不要收紧它而不检查它仍然接纳 pi 自己加载器会列出的一切（一条更窄的“干净 slug”正则评审时看着安全，
  却会静默破坏这一点；它确实破坏过，一次 —— 见上面“设计”）。反方向同样在构造上成立：`listDir` 用
  这*同一个*门控函数过滤每个目录条目，而不是一个部分或手工的复查，因此一个像人工放进去的
  `.hidden.md` 那样的点开头文件被扫描整体忽略，根本不会出现在 `listTemplates` 里。门控与扫描不可能
  漂离，因为它们共享同一个谓词 —— 不要为任一方向重新引入第二个并行的检查。
- **`deleteTemplate` 在目标已经消失时抛错**，而不是把缺失的文件当作一次成功的 no-op —— 这是 Task B3
  应当在其上构建的处理器契约。一个删除请求能到达本模块，只因为调用方的 UI 点名了一个在其认知范围内
  存在的特定模板；如果文件已经没了，那个视图是过期的，而 `template.*` 处理器应把它呈现为一个错误
  （例如“已被删除，请刷新”），而不是为一件没有发生的事报告成功。对过期的 UI，显式胜过静默。
