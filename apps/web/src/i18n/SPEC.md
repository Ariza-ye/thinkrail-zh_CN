---
id: submodule-web-i18n
type: submodule-design
status: active
title: Client UI language and catalogs
parent: module-web
depends-on: [module-ui]
---

## Responsibility

Owns UI catalogs, system-language resolution and the client-local interface language preference. The
barrel initializes localization and exposes preference controls and pure resolution. Reactive translation
lives in `@thinkrail/ui/i18n`, usable by primitives and extension web halves without app imports.

## Boundary

Depends only on the shared UI runtime, React, branding constants and the native stable preference
adapter. Never reads host configuration, session state or transport. Simplified Chinese catalogs map
whole English source messages to translations; interpolation substitutes named values. English source
messages are the fallback. No DOM observer translates arbitrary text.

## Behavior

System mode resolves zh, zh-CN, zh-SG and zh-Hans to Simplified Chinese; other languages use English,
including Traditional Chinese. Explicit English or Simplified Chinese overrides system changes.
Initialization precedes React and sets the document language. The native stable adapter, or browser
localStorage, saves selection; inaccessible storage never prevents switching. Browser tabs converge
through storage events. Subscribed UI updates without remounting editors, terminals or chats.
