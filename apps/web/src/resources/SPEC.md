---
id: submodule-web-resources
type: submodule-design
status: active
title: resources — 渲染器注册表与复查界面契约
parent: module-web
depends-on: [module-contracts]
---

## 职责

拥有引擎中立的资源描述、渲染器注册表，以及文件与差异窗格使用的复查界面契约。选择由元数据驱动：匹配的渲染器
按意图与手机支持度过滤、排序，随后是必需的文本或字节回退。当宿主 MIME 元数据缺失时，MIME 匹配使用与资源
描述相同的、由扩展名推导的回退。得到的有序列表既是派发策略，也是窗格的视图切换语法。渲染器能力还声明所选
界面是否支持复制其修改后的源码、分栏/合并布局，以及忽略空白的重算；窗格只暴露那些适用的控件。
`boundedDiff: "always"` 标记自行管理视口的差异渲染器（虚拟化表格、分页 PDF、沙箱 HTML 框架），因此需要
受限高度；`"large"` 标记那种自然铺排但在受限之后会虚拟化的渲染器，因此宿主在差异很大时给它加限；只有当差异
大到需要时，宿主才传 `virtualize`。其他所有差异都按自然高度铺排，这正是连续的 Changes 复查能把多个小节堆在
一个滚动里的原因。`HunkActions.triage` 是可选的：跟踪已保留块的界面提供已保留的键、一个 setter，以及渲染器
块内容键的接收槽；没有它的渲染器不显示 Keep 控件。

`ResourceContent` 让文本、可获取的字节，以及缺失的差异侧保持互相区别。尤其，缺失绝不由一个没有 URL 的字节
载荷来表示。`SurfaceReview` 携带权威锚点；渲染器只把选择器投射为几何。`isPlaceable` 回答是否至少有一个
已定位的选择器具备该渲染器为所请求的视图或差异意图所声明的几何，而 `anchorLabel` 是共享的紧凑引用。差异渲染
器可以通过 `ResourceViewProps.onPlacedThreadIds` 或 `ResourceDiffProps.onPlacedThreadIds` 报告它实际放置的
线程 id；窗格把能力匹配却未出现在该集合中的 id 也视为未放置，从而覆盖渲染器本地的几何，例如被移除的 JSON
指针、被删除的表格单元格，或折叠的上下文。虚拟化的分页渲染器按已知页数几何报告，而不是按临时的画布驻留，
因此释放一个离屏页面不会让它的线程变成未放置。对自身意图没有锚点能力的渲染器可以忽略它的复查 prop；窗格则
把这些线程留在它的未放置条里。

`HunkActions` 是差异引擎与其窗格之间的变更边界。渲染器只报告它算出的、引擎中立的原始/修改后 `LineSpan` 对：
`revert` 应用那一个块，`revertFile` 应用文件目标，`askAgent` 返回渲染器放到修改侧的那个 `AnchorDraft` 加
初始输入框文本。`agentWorking` 只用于展示，绝不禁用受 CAS 保护的动作。窗格拥有线上调用、scope 与预期哈希、
撤销回执、过期视图刷新，以及错误 UI。不可变的 scope 会省略 `hunkActions`；此时渲染器必须省略每一个变更控件，
而不是去仿造一个。

## 边界

- **Public surface（公开接口）：** `index.ts` 导出 `ResourceDescriptor`、`ResourceContent`、`AnchorDraft`、
  `ReviewThread`、`ReviewThreadActions`、`SurfaceReview`、`ResourceViewProps`、`ResourceDiffProps`（两者
  都包含一个可选的实际放置回调）、`HunkActions`、`ResourceRenderer` 及其支撑类型，外加
  `registerResourceRenderer`、`resolveRenderers`、`describeResource`、`anchorLabel` 和 `isPlaceable`。
- **允许的依赖：** `@thinkrail/contracts` 类型、`lib` 的 barrel，以及 React 类型。
- **绝不触碰：** store、传输层、shell、panels，以及渲染器实现。内置实现位于 `panels/resources` 之下，并从
  工作台组合边缘注册元数据与惰性加载器。

注册不拥有任何内容或标签页状态。窗格拥有传输层 URL、复查集成、所选渲染器，以及不透明的按标签页视图状态。
`anchorLabel` 优先使用结构化定位符，而不是它必需的文本回退：`table-cell` 是 `R<row>C<column>`，
`json-pointer` 是指针本身，未知方案保留 `<scheme> <ref>`；`ipynb-cell` 对旧式 `index:<zero-based>` 引用
是 `cell <n>`，对稳定 id 是 `cell <id>`，并可由渲染器提供的 id 到序号映射生成本地 `cell <ordinal>` 标签。
分页区域是 `p<page> region`；未分页的区域、行和文件保持它们现有的形式。注册只携带派发、几何、视口和具体的
差异控制能力；它没有未强制的来源或执行策略元数据。沙箱由每个渲染器实现自己负责。
