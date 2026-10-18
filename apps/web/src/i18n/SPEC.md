---
id: submodule-web-i18n
type: submodule-design
status: active
title: 客户端 UI 语言与目录
parent: module-web
depends-on: [module-ui]
---

## 职责

拥有 UI 目录（catalog）、系统语言解析，以及客户端本地的界面语言偏好。barrel 负责初始化本地化，并暴露偏好
控件与纯解析函数。响应式翻译位于 `@thinkrail/ui/i18n`，基础组件与扩展的 web 半边无需导入应用内部即可使用。

## 边界

只依赖共享 UI 运行时、React、品牌常量，以及原生稳定偏好适配器。绝不读取宿主配置、会话状态或传输层。简体中文
目录把整条英文源消息映射为译文；插值替换其中的命名值。英文源消息是回退。没有任何 DOM 观察器去翻译任意文本。

## 行为

系统模式使用首选系统语言的最大化书写系统（maximized script）来解析简体中文（包括 zh、zh-CN、zh-SG、zh-MY 和
zh-Hans）；其他语言使用英文，包括繁体中文。显式选择英文或简体中文会覆盖系统变更。初始化先于 React 执行，并设置
文档语言。原生稳定适配器，或浏览器的 localStorage，保存所选语言；不可访问的存储绝不阻止切换。浏览器标签页通过
storage 事件收敛。已订阅的 UI 会更新，而无需重新挂载编辑器、终端或聊天。
