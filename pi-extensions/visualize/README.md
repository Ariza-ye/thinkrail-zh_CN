# @thinkrail/pi-visualize

一个 [pi](https://pi.dev) 扩展，为 agent 提供 `visualize` 工具，用于**图**（Mermaid）与**选项对比**，
使它在解释架构、流程或取舍时拿出图来，而不是 ASCII 图或 markdown 表格。

```bash
pi install npm:@thinkrail/pi-visualize
```

## 你将得到什么

- **`visualize` 工具** —— `type: "diagram"` 配原始 Mermaid 源码，或 `type: "comparison"` 配选项（名称、
  描述、优点、缺点、`recommended`、可选的内联 Mermaid），外加可选的 `title`。
- **终端渲染。** 流程图、状态图、时序图、类图与 ER 图、饼图、思维导图、时间线与 git 图都以 Unicode 制表符
  直接画在 pi TUI 里，使用你 pi 主题的配色（通过
  [`lovely-mermaid`](https://github.com/xl0/lovely-mermaid)，即 pi 在聊天消息中渲染 Mermaid 所用的同一
  引擎家族）。当图比你的终端更宽、只能画出一部分，或属于渲染器不认识的家族（gantt、xychart …）时，工具改为
  在代码围栏里显示 Mermaid 源码 —— 它绝不折行图。展开工具结果即可在图画下面看到源码。对比以 markdown 渲染。
- **在任何地方都可读。** 工具的文本结果是 markdown —— 一个 ```mermaid 围栏或分节的对比 —— 所以在 `pi -p`、
  JSON/RPC 模式或任何没有渲染器的宿主里也读得通。

## 校验 —— 工具检查什么

工具会拒绝空源码与形状错误（没有 `mermaid` 的 diagram、没有 `options` 的 comparison），并用一条告诉模型
如何修正该调用的消息说明原因。

Mermaid 语法用渲染器自己的解析器做**尽力而为**的检查：对于它能画出来的那些家族，工具会拒绝未知的流程图方向
（`flowchart XX`）、什么都解析不出来的源码，以及解析器不得不丢掉的任何片段（悬空的 `A -->`、未闭合的
`[label`、无法读取的行），并指出丢掉的究竟是什么。超出终端渲染器上限（超过 128 个节点）的图不会被拒绝 ——
它们以源码形式渲染。它**不**运行真正的 Mermaid 解析器：语法是宽松的，所以有些畸形输入仍会通过，而
`accTitle`/`accDescr` 行会被拒绝，尽管 Mermaid 接受它们。其他家族（gantt、xychart …）不做检查地通过并以
源码渲染。在 TUI 里源码永远只差一次按键，所以什么都不会被藏起来。

自己渲染 Mermaid 的宿主可以插入一个严格校验器：

```ts
import { createVisualizeExtension } from "@thinkrail/pi-visualize";

export default createVisualizeExtension({
  // Throw to reject; the message is returned to the model with the field location.
  validateMermaid: async (source) => { await mermaid.parse(source); },
});
```

注入的校验器会**替换**默认检查。

## 要求

pi ≥ 本包 `package.json` 中 `devDependencies` 下列出的版本（pi SDK 包是 peer 依赖，由你的 pi 安装提供）。
在 Node（原版 pi）与 Bun 下都能工作。

## 许可

Apache-2.0 —— 是 [ThinkRail](https://thinkrail.ai) 的一部分。
