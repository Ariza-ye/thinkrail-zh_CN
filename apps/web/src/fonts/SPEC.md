---
id: submodule-web-fonts
type: submodule-design
status: active
title: 界面字体 — 设备已安装的字体族与所选的那一个
parent: module-web
depends-on: [module-contracts]
references: [web-typography, submodule-web-i18n]
tags: [ui, typography]
---

# 界面字体

## 职责

拥有按设备的界面字体偏好，以及本机已安装的字体族列表。它只写入恰好一个 CSS 自定义属性——`typography.json`
用来生成其界面字体族的那个运行时槽位——别的什么都不写：字体族、字号、字重与行距仍由 [[web-typography]] 拥有。

## 边界

- **拥有：** `readInterfaceFont()` / `setInterfaceFont()` / `useInterfaceFont()`；`initInterfaceFont()`；
  `listInstalledFonts()`；`isValidFamilyName()` 以及字体族名加引号的规则。
- **Public surface（公开接口，barrel）：** 上述各项，外加 `INTERFACE_FONT_STORAGE_KEY`、`INTERFACE_FONT_VAR`
  和 `InterfaceFont` 类型。
- **允许的依赖：** `contracts`（`NativeFontBridge` 类型）、`clientPreferences`（稳定偏好适配器）、品牌常量，
  以及 React。
- **绝不触碰：** 传输层、宿主配置、服务端同步的 `AppConfig`、它自己的任何 `font-family` 声明，以及任何第二份
  字体栈副本。

## 必须做对的事

- **按设备，就像界面语言。** 该选择经由原生稳定偏好适配器持久化（品牌前缀下的 `interface-font`），回退到
  `localStorage`；浏览器标签页通过 storage 事件收敛。字体的可用性是机器的属性，因此它绝不经由设置传递。
- **一个值，一个槽位。** 该偏好是一个字体族名，绝不是字体栈。它作为 `--tr-font-user-interface` 应用到
  `documentElement` 上，生成的界面字体族以它打头——它后面的中日韩与拉丁回退完全按 `typography.json` 写下的
  样子保留。
- **无效的名字被拒绝，而不是被清洗。** 携带 `"`、`\`、`;`、`{`、`}` 或控制字符的名字会破坏带引号的值，而
  槽位里的无效值会让 `font-family` 在计算值阶段失效——整个字体栈，包括中文回退，都会被丢弃。
- **三个列表来源，一个答案。** 先是桌面宿主的 `__THINKRAIL_SYSTEM_FONTS__` 桥（系统 WebView 没有
  `queryLocalFonts`），然后是 Chromium 浏览器里的 `window.queryLocalFonts`，最后是空列表——选取器会把它变成
  “输入一个字体族名”。每个来源都通过同一个校验器去重。
- **空是有效答案。** 无法枚举的宿主（缺工具、目录不可读）产出零行；该设置及其手动输入仍然可用。
