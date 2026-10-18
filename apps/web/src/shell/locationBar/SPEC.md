---
id: submodule-web-shell-location-bar
type: submodule-design
status: active
title: shell/locationBar — 顶栏中带说明文字的位置分段
parent: submodule-web-shell
depends-on: [submodule-web-panels]
tags: [ui, topbar, public-surface-checked]
---

## 职责

位于 ThinkRail 标记之后那条持久的「我在哪里 / 处于什么状态」条：一行带说明文字的分段——**Project ·
Workspace · Branch · from base · Remote · Pull request**——其值正是用于切换项目或工作区、对工作区执行操作、
以及读取或重定向分支的控件。它渲染 store 与 `workspace.openReview` 已经报告的内容；它不拥有任何宿主状态。

## 边界

- **拥有：** 分段文法（说明文字位于 20px 的值行之上，分段之间仅以空格分隔）、每个值都使用的 pill/chip 类、
  项目切换菜单、工作区菜单（动作 + 同级切换器 + New workspace）、分支卡片（复制、基于、比较对象选择器、远程
  与评审行）、Remote 与 Pull request 芯片，以及响应式丢弃顺序。
- **Public surface（公开接口，`index.ts`）：**
  - `LocationBar`
- **允许的依赖：** `store`（项目、工作区、会话状态、diff 基线选择器、toast）、`transport`
  （`workspace.setDiffBase`）、`lib`（`copyText`、`platformShortcutLabel`）、`components/RunningIcon`、
  `@thinkrail/ui/*`、`@remixicon/react`、contracts 类型，以及以下按文件引入的 `panels` 文件：
  `workspaceActions`（open-in / rename / reveal / remove / `editor.list` / `workspace.list` 的唯一实现，
  与 `ProjectTree` 共享）、`RemoveWorkspaceDialog`、`BranchPicker` + `branches`、`useOpenProject`、
  `useOpenBranchReview`（`openReviewLabel`）。
- **绝不触碰：** server/shared/pi；布局引擎、意图或 frame 状态；被 `Shell` 之外的任何东西导入；
  `panels/workspaceActions` 已有的某个工作区动作的第二份实现。

## 语法

- 该条与每个分段都拉伸到头部的内容盒（39px：40px 的行减去它的底边框），绝不用固定的 `h-topbar-row`——一个
  40px 的子元素放在 39px 的盒子里会在半像素上居中，在 1x 屏幕上让文字发虚并与边框重叠。一个分段把 14px 的
  说明行（12px 句首大写 `tr-text-metadata`，位于 `text-subtle`，用它自己的 15px 行高：`leading-none` 会让
  字形盒溢出截断行）居中放在 20px 的值行之上，在说明行上方和值的 hover 填充下方各留 2.5px。分段不带细线：
  `pl-8` 加上 pill 自身的内边距（文字到文字约 42px，hover 填充之间 8px）就是分隔，因为全高的分隔线读起来像
  表格，而且永远无法与下方标签条的分隔符对齐。说明片段（`· from <base>`、`· settled`）使用说明文字自己的
  字形——绝不在说明文字里换第二种字体。
- 值是 pill（`pillClass`：20px、`window-no-drag`、hover 为 `control-bg-hovered`、打开时为
  `control-bg-selected`；chevron 静止时隐藏，在 hover、键盘焦点或打开时出现）或状态 chip（`chipClass`：
  20px、rounded-full、`tr-text-emphasis`、feedback 色调的 `-subtle` 填充配实心 feedback 文字；交互式 chip
  在 hover 时切到 `-muted` 步）。每个 pill 值都是同一种样式和同一种静止颜色，`tr-title-section` 位于
  `text-muted`——即 Projects 树中工作区名所用的颜色——只在 hover 或打开时提亮为 `text-default`：混合的静止
  灰色读起来像偶然，因此该条中唯一的静止色调层级就是说明文字（`text-subtle`）与值之别。项目首字母是中性的
  方块（`control-bg-selected` / `text-muted`），这样最不重要的字形就不是唯一带颜色的那个。等宽字体留在分支
  卡片内部——那里 ref 就是内容——不进这条条。
- 说明文字仍属于头部的拖拽区域；每个 pill、chip、链接以及内联重命名输入都用 `window-no-drag` 退出拖拽
  （有单元测试覆盖），这是外壳「按钮只放在 `topbar-actions`」规则仅对这一条条的刻意放宽。
- 窗口变窄时的丢弃顺序：低于 `sm` 丢弃项目分段，低于 `sm` 丢弃评审 chip，低于 `md` 丢弃分支与远程分段；
  工作区分段绝不隐藏（e2e `topbar-chrome` 保证 `scope-name` 在手机宽度下带内边距仍然可见）。在行内，分支
  最先收缩（`shrink-[4]`），然后是项目（`shrink-[3]`），然后才是工作区，每个都由一个 `max-w` 封顶。

## 行为

- **Project** 列出每个已打开的项目（当前项目上带勾选）、*Project home*（在那里时禁用）以及 *Add
  project…*（共享的 `useOpenProject` 选择器及其对话框）。选择一个项目会用 `reveal` 选中它并加载它的工作区
  列表，即与 Projects 树相同的迁移。
- **Workspace** 在 *Switch to* 之上显示活动工作区的动作（Open in、Rename、Copy path、Reveal、**Settle**
  或 **Keep active**——视适用者而定，经由共享的 `workspaceActions`——以及经由共享确认对话框的 Remove；
  Default 不可移除且绝不 settle），*Switch to* 列出项目的**活**同级（最近活跃的优先——不同于边栏那种稳定的
  最新创建顺序，因为切换器服务于「回到我刚才所在的地方」——agent 工作时带 `RunningIcon`），随后是一个
  **`Settled · N ›`** 子菜单，列出搁架行及其原因 chip——用的正是边栏渲染的同一个
  `selectWorkspacePartition` 与共享 `useNow` 时钟，因此在空闲边界经过时，菜单、活动的 `· settled` 说明
  文字和边栏绝不会各说各话；在 settled 协议之下，它改为保留宿主的原始遗留顺序，并省略所有搁架提示（当树尚未
  加载时，列表在首次打开时加载），以及带 `Mod+N` 标注的 *New workspace*，它打开外壳拥有的对话框。当活动
  工作区处于 settled 状态时，说明文字读作 **`Workspace · settled`**（即 `Branch · from base` 早已使用的
  说明片段文法，用警告色调），因此你打开的一个停放的工作区无需横幅就能自报身份。重命名会把 pill 替换成别处
  使用的无 chrome 内联输入，并运行在树共享的 `useWorkspaceRename` 控制器上：Enter/blur 提交、Escape 取消、
  未改变或空白绝不发起请求，而在套接字的重命名能力未知时做出的一次提交会在编辑器里保持待定，直到一个具备该
  能力的 welcome 恢复它。该派发绑定到编辑开始时的工作区，并且因为这个分段是一个持久实例（树的行是按工作区
  键控的），编辑器打开时激活另一个工作区会放弃本次编辑——包括待定的离线提交——而不是让后来的 welcome 重命名
  新激活的工作区。Remove 确认遵循同一条规则：它从选择 Remove 时快照的工作区渲染，并在活动工作区在其底下改变
  （浏览器后退、远程移除回退）时自我关闭，因此确认绝不会删除它所命名之外的工作区。在 Project home 上，该
  pill 读作「Project home」，只提供切换器与创建。
- **Branch · from base** 打开 git 卡片，把焦点移到卡片本身（而不是它的第一个按钮，那会弹出复制 tooltip），
  这样一次 Tab 就到达各个动作：分支（复制 → 成功 toast）、*Based on*（对用户拥有的工作区隐藏，其说明文字
  就是平淡的「Branch」）、*Compare to*（Changes 面板的 `BranchPicker`，绑定到 `workspace.setDiffBase`，
  因此这两个控件绝不会互相矛盾），以及——仅当宿主有评审时——*Remote*（`n commits to push · n commits
  behind origin` 或「In sync with origin」）和带链接的 PR/MR 行。
- **Remote** 只在 `unpushedCommits`（警告 chip）或 `behindCommits`（信息 chip）非零时渲染，并打开同一张
  卡片。两个计数都随 `OpenBranchReview` 到达，因此 Remote（以及卡片中的 *Remote* 行）只能与一次评审一起
  出现——没有评审的分支不显示远程状态，而不是「in sync」。**Pull request** 是 `openReviewLabel` chip——
  评审打开期间为 success，一旦 `OpenBranchReview.state` 如此表示就为 **info** 读作 *Merged #N*、为
  **neutral** 读作 *Closed #N*（v78 之前的宿主省略 `state`，chip 保持打开形式）——当提供商报告了 URL 时
  为链接。远程 chip 只为打开的评审渲染；对一个已合并分支的偏离是噪音。在 v78 上，宿主保留的
  `workspace.review` 快照对评审的存在/身份/状态具有权威性；匹配的新鲜 `workspace.openReview` 答复只覆盖
  URL 与偏离细节。因此一次合并/清除的推送不会被过期的 hook 缓存掩盖，而 `gh` 的一次抖动也绝不会让搁架仍在
  处理的 chip 变空。没有匹配的实时细节时，PR 行保留但 Remote 摘要隐藏——缺失的、只能来自查询的计数意味着
  未知，绝不是「In sync with origin」。v78 之前的宿主只用查询本身，并忽略回滚过期的快照字段。这里刻意没有
  「Open PR…」提示：`pr.open` 是计划会话动作，留在计划面板上。
