---
id: submodule-web-components
type: submodule-design
status: active
title: components — 共享 UI 原语
parent: module-web
tags: [ui, resilience]
---

## 职责

应用里依赖很轻的共享 React 原语：让一个失败区域不会卸载根的错误边界、项目自定义图标、功能面板（目前是
Projects 侧栏）使用的二元注意点与工作中图标处理、静默滚动框架，以及共享的加载骨架原语。共享的 shadcn 原语
住在 [[module-ui]]（`@thinkrail/ui/*`）里，不是本模块。

## 边界

- **拥有：** `ErrorBoundary.tsx`——一个类边界（`getDerivedStateFromError`），它渲染一个带主题、自包含的
  回退，而不是把抛错传播到根。它：
  - 在任一 `resetKeys` 值变化时重置已捕获的错误（接到子树的身份上——工作区/标签页 id——因此导航离开会自动
    恢复）；
  - 通过纯的、有单元测试的 **`isChunkLoadError`** 对失败的动态 `import()` 分类（过期的 Vite chunk / 504 /
    Safari 的 "module script failed"），并把它们导向页面**重载**（重新抓取该 chunk），而不是就地重试；
  - 把崩溃记录到控制台（`componentDidCatch`）——UI 本身已经优雅降级。
- **`CustomIcon.tsx`**——把 `public/custom-icons/` 里的 SVG 通过一个 CSS `mask-image` 的 span（`index.css`
  里的 `.custom-icon*` 类）渲染为可主题化的 `currentColor` 字形，因此自定义字形用 `size-*` 定尺寸、用
  `text-*` 着色，与 Remix 图标完全一致。名字是一个带类型的联合（`CustomIconName`）；目前有：
  `file-diff-line`/`file-diff-fill`（Changes 工具的字形）。
- **`QuietScrollArea.tsx`**——无 store 的溢出观察器与两个呈现界面：`QuietScrollArea` 拥有一个普通的原生
  滚动视口，而 `QuietScrollFrame` 观察某个第三方后代滚动控件，而不接管它的内容或输入，并可以接收该库权威的
  边缘状态。`styles/global.css` 拥有每个原生滚动容器唯一的那份滚动条定义：6px 的槽、透明轨道、静止时透明的
  滑块，在滚动元素被悬停或携带 `data-quiet-scroll-intent` 时为 `--border-default`，直接悬停/激活滑块时为
  `--text-muted`。显露通过一个元素级自定义属性（`--scrollbar-thumb`）传递，滑块的伪元素与 Firefox 的
  `scrollbar-color` 都读它，因为 Chromium 会把 `::-webkit-scrollbar-*` 选择器里的 `:hover` 针对滚动条部件
  而非元素求值；每个元素都会重置该属性，因此被悬停的祖先绝不会显露它的后代。内置的高对比度主题保留一条 2px
  的静止细线；OS 强制颜色保留系统色滑块并去掉幕布；减少动效会去掉过渡。因此 `QuietScrollArea` 与
  `QuietScrollFrame` 不拥有任何外观：它们增加超出悬停的意图（focus-within、带短暂宽限期的活跃滚动、离开
  框架的指针拖拽、触摸）、溢出测量，以及在被裁切方向上指针透明的 16px 边缘幕布。`QuietScrollFrame` 还会把
  xterm 的非原生滑块改成同一个滑块（底层滑块透明，6px 的视觉滑块，不透明度由意图与测得的垂直溢出把关）。
  表面颜色是一个显式的语义 prop（`sidebar` 或 `terminal`），绝不从排布推断。
- **`AttentionDot.tsx`**——无 store 的静态绿色/accent 点，其唯一的无障碍标签是 “Needs attention.”。它不
  携带原因、计数、tooltip、动效或清除行为；调用方只决定它是否出现。它是需要输入与未读结果两种注意共用的那
  一个标记。
- **`RunningIcon.tsx`**——无 store 的 **“ThinkRail is working”** 徽章：圆角方形框架内的品牌字母组合，用
  `currentColor` 绘制，因此像 Remix 图标一样用 `size-*` 定尺寸、用 `text-*` 着色，无障碍标签是
  “Agent working”。在允许动效时，框架（两半，左侧留缝、右侧相接）与字母组合的六条字母笔画在一个 3.263s 的
  周期里绘制并擦除（`index.css` 里的 `loader-*` 关键帧）；有只显示框架的一拍是设计的一部分。每条字母笔画都是
  一条宽线，被裁切到 `BRAND_MARK_SEGMENTS` 中它自己的区域，而 `BRAND_MARK_PATH` 正是由同样的段拼成的，因此
  完全绘制的徽章就是外壳的标志，而不是可能漂移的第二份拷贝。只有笔画中心线、框架，以及 R 的竖笔与顶横之间
  那道小缝（竖笔笔画提前结束）是本地动画几何。减少动效会让每条笔画停在其完全绘制的虚线上：静态、完整的
  徽章。这个加载器替代了一个带追逐列车与脉动字母组合的圆环；在那之前，行自己的身份字形会呼吸，后来被去掉，
  因为一个变暗的文件夹在 14px 下读起来像“已禁用”。调用方只传尺寸/颜色类，并从规范化的宿主状态判断某个顶层
  会话是否在运行；该图标不渲染点、spinner、计数、tooltip 或空闲状态。
- **还拥有：** `Skeleton.tsx`——`SkeletonRows`，每个加载界面都用的那一个脉动行占位，以及包在它外面的尺寸
  包装形状 `LoadingRegion`，即大多数调用点真正想要的那个（一个给区域自身内边距/尺寸的 `className`、一个
  可选的 `label`，它被串到 `SkeletonRows` 的 `role="status"` 区域上而不是另开一个，以及一个可选的
  `testId`）。完整的加载词汇及其规则见下。
- **Public surface（公开接口）：** `ErrorBoundary`、`isChunkLoadError`、`SkeletonRows`、`LoadingRegion`
  ——直接通过 `@/components/ErrorBoundary` / `@/components/Skeleton` 导入（没有 barrel）；`AttentionDot`
  通过 `@/components/AttentionDot`；`RunningIcon` 通过 `@/components/RunningIcon`；`CustomIcon`、
  `CustomIconName` 通过 `@/components/CustomIcon`；`QuietScrollArea`、`QuietScrollFrame` 和
  `QuietScrollEdges` 类型通过 `@/components/QuietScrollArea`；`useNow()` 通过 `@/components/useNow`
  （把墙上时钟作为共享 30 s 计时器上的 `useSyncExternalStore` 值，因此渲染永远不自己调用 `Date.now`）。
- **允许的依赖：** React、`@remixicon/react`、`@thinkrail/ui/utils`（`cn`）、`lib`
  （`shallowEqualArrays`——重置键的比较，共享而不是重述）、`constants`（`BRAND_MARK_SEGMENTS`——
  `RunningIcon` 裁切到的字母组合区域，与外壳标志共享而不是复制）。有意保持依赖轻，且两者都是叶子，因此
  *任何*区域（shell、panels、`main.tsx`）仍然可以包在它里面而不产生循环。
- **绝不触碰：** `store`/`transport`/`panels`/`shell`/`chat`/`contracts`；`server`/`shared`/`pi`；内联
  `style` 对象或裸十六进制（回退只用 token 工具类着色）。

## 加载词汇

应用的加载词汇恰好是**两层**——每个异步空档都渲染这两者之一，绝不渲染第三样东西、绝不渲染裸文本、绝不什么都
不渲染：

1. **`SkeletonRows`（通常经由 `LoadingRegion`）——用于*内容区域***：任何将会填满实质内容的区域，无论那个
   区域如何被框住（一个工具面板、一个对话框的列表、一个菜单的列表小节、一个标签页主体、一个恢复聊天/计划/
   编辑器的 `Suspense` 回退）。**表面尺寸决定层级，而不是容器类型**——一个居中在大片空区域里的 spinner，
   读起来比隔壁面板为完全相同的“数据在路上”情形所用的、按内容成形的骨架更沉重、更令人警觉，因此一个区域
   绝不只有 spinner，无论它住在什么控件里（对话框、下拉菜单、工作台标签页）。参考点：`panels/FileTree.tsx`、
   `panels/SpecsPanel.tsx`、`panels/ChangesPanel.tsx`、`panels/ReviewPanel.tsx`、
   `panels/PlanPane.tsx`、`panels/ProjectTree.tsx`（工作树列表）、
   `panels/ExistingWorktreeDialog.tsx`（工作树候选列表）、`panels/ChangesScopeMenu.tsx`（提交列表）、
   `panels/WelcomePanel.tsx` 的 `CardSkeleton`（一个手工塑形的变体，按它所代表的卡片定尺寸，因为通用的行
   列表会错误地体现卡片网格的占地），以及 `shell/WorkspaceWorkbench.tsx` 的 `MissingResource`（每个聊天/
   计划/编辑器的标签页主体与惰性 chunk 的 `Suspense` 回退）。
2. **`Loader2` spinner（通常挨着一个短标签）——用于钉在它控件上的*在飞动作或瞬态***：一个按钮、一个菜单
   项、一个图标——绝不是整个区域。参考点："New chat"/"Creating…" 的按钮状态、
   `shell/WorkspaceChatHistory.tsx` 的历史图标、`chat/ActivityGroup.tsx`/`chat/ToolCard.tsx` 的步骤图标、
   `panels/ProjectTree.tsx` 的 "Creating worktree…" 待处理行。这一层还有一个更窄的具名子惯用法：
   **`RefreshCw` 原地旋转**（图标不变，只是转起来），用于某个控件上的手动 "Refresh" 动作，而该控件周围的
   内容在刷新运行期间保持可见且有效（`chat/ModelEffortPicker.tsx`、`chat/ModelSelector.tsx`、
   `panels/GithubSettings.tsx`、`panels/ProvidersSettings.tsx`、`panels/BranchPicker.tsx`）——在那里换成
   通用 spinner 会白白丢弃原地旋转免费给出的“这仍然可用，只是在刷新”信号。

除了选对层级之外：

- **没有布局跳动。** 加载状态占据即将到来的内容将占据的同一片地——按它所在区域定尺寸/塑形的骨架、按它所
  在先的卡片定尺寸的 `CardSkeleton`——因此替换它的数据绝不会挪动它周围的东西。
- **重试/错误可供性绝不与活跃的加载指示器并存。** 在 spinner 或骨架旁边显示 "Retry" 会同时发出两个互相矛盾
  的信号（“这是正常的，等一下”和“这已经失败了，动手”），而对在压倒性多数情况下仍属正常加载的情形来说这是
  错的。两种合法形状：(a) 重试按钮**只在真实失败之后**出现——被拒绝的请求落进 `catch`，例如
  `panels/ChangesPanel.tsx` 的 `changes-retry`、`panels/ExistingWorktreeDialog.tsx` 的
  `existing-worktree-retry`；或者 (b) 对于某个*自动*后台进程已经在竞相恢复的资源（经由
  `shell/chatReconciliation` 的聊天会话水合），加载指示器单独显示，只有那次自动尝试在短暂的宽限期之后仍然
  停滞时才浮出重试可供性——`shell/WorkspaceWorkbench.tsx` 的 `ChatResourceBody`/`CHAT_RETRY_DELAY_MS` 是
  参考实现；在发明新的之前先照搬同样的形状。
- **条件性缺失的内容不是加载状态。** 当“仍在加载”与“这里确定什么都没有”渲染得一模一样（都是空白）*且*
  空白是正确的稳态——而不仅仅是一个未被处理的空档：在未解析时什么都不显示是正确的，不是缺陷。
  `panels/PlanRailPane.tsx` 通过它的 `plan.data === null` 分支浮出一行小小的 "Loading…"，因为侧栏工具可能
  在第一次计划读取落地之前就打开，而“空”是合法的稳态；不像 `panels/WelcomePanel.tsx` 那行最终总会填满的
  卡片那样，这里没有一个空区域在承诺内容。只有当区域保证会填满时才用骨架；只有当它可能合法地永不填满、且
  调用方已经把缺失当作缺失而不是待处理状态时，才什么都不用。
- 既不配骨架也不配 spinner 的裸 "Loading…"/"Restoring…" 文本是缺陷，没有例外。
- **已解析的内容淡入，而不是弹出。** 骨架的数据到达之后，替换它的元素携带 `motion-safe:animate-reveal`
  （`index.css` 里共享的 `reveal` 关键帧——150ms 的不透明度 + translateY，与
  `chat/tools/AskUserQuestionCard.tsx` 已经用来让卡片落位的那个原语相同；`motion-safe:` 让
  `prefers-reduced-motion` 改为瞬间替换）。它加在已解析分支自己的根上——绝不是骨架，绝不是同时也包住骨架
  分支的包装器（一个 `Suspense` 边界的*children*，不是 `Suspense` 元素本身）——因为动画在该元素挂载时只播
  一次，而包住两个分支的共享包装器会在首次绘制时就触发，那时数据（或已解析内容本身）还不存在可供淡入。它在
  普通的重新渲染时绝不再次触发（更长的待办列表、一条新的聊天消息），因为 React 在那些之间协调的是同一个持久
  DOM 节点——只有分支切换才是真正的挂载。已注册的 `RenderedDiff`/`MarkdownPreview` 根携带它——但明确**不**是
  `MonacoEditor` 的：在我们 `Suspense` 的 chunk 已经解析*之后*，`@monaco-editor/react` 会在 Monaco 自己的
  运行时启动期间于内部显示它自己的第二个 `loading={<SkeletonRows/>}`，因此在那里包住我们的 `Suspense` 边界
  淡入的是——一个仍在加载的骨架，而不是真正的编辑器，一次动效闪烁进入第二次无动效的骨架替换，读起来像两个
  不同的加载指示器在闪，而不是一个。那个堆叠情形的正确修法会住在 `MonacoEditor` 自己的 `loading` 渲染里
  （一个我们除此之外不触碰的库启动内部状态），而不是在外层调用点——在值得做之前先保持无动效。终端主体
  （`TerminalWorkbenchBody`）也跳过淡入，因为终端的 PTY 挂接由它自己的可见性挂载把关，不值得为一个装饰性
  淡入去冒险；Radix 菜单的条目同样跳过，因为把裸 `DropdownMenuItem` 包进 div 会破坏该原语按直接子节点进行的
  键盘/typeahead 遍历（`panels/ChangesScopeMenu.tsx` 的提交列表因此保持先骨架后弹出）。`chat/ChatView.tsx`
  跳过的理由更尖锐：祖先上非 `none` 的 `transform`——包括动画进行中、关键帧尚未落到 `none` 的时候——会建立
  一个新的包含块，它弄坏了嵌套其中的 `chat/activityBreadcrumbs.tsx` 面包屑条的粘性定位
  （`e2e/activity-breadcrumbs.spec.ts` 在复查中抓到了这一点）。任何带 `position: sticky`/`fixed` 后代的
  东西都被直接取消这种基于 transform 的淡入资格，不需要例外清单——在加上它之前先检查一下有没有。

## 必须做对的事

- **保护范围：** React 边界只捕获 **render + 惰性导入**的抛错——**不**捕获事件处理器、效应或已拒绝 promise
  里的错误（例如 `transport.request`）。那些经由 `transport` 的 `errorText()` 作为错误轮次/提示浮现，不在这
  里。外壳“面板不能把应用变空白”的保证说的是 render/惰性加载；异步失败是另一条路径。
- 错误边界挂在哪里（每个区域 + 兜底的根包装）由 `shell/SPEC.md` 与 `apps/web/SPEC.md` 里的父级依赖图拥有，
  这里不重述。
- 静默滚动的意图局限于它所渲染的表面，而不是工作台记住的活跃分组。滚轮/触控板手势不必移动 DOM 焦点，而记住
  的分组焦点会让一条侧栏无限期可见。因此那个第三方框架在它自己的宿主处观察焦点与指针意图，只加一个视觉/测量
  适配器；它绝不读取外壳的放置。
