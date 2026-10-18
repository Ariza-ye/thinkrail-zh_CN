---
id: submodule-web-fonts
type: submodule-design
status: active
title: Interface font — the device's installed families and the chosen one
parent: module-web
depends-on: [module-contracts]
references: [web-typography, submodule-web-i18n]
tags: [ui, typography]
---

# Interface font

## Responsibility

Owns the per-device interface-font preference and the list of families installed on this machine. It
writes exactly one CSS custom property — the runtime slot `typography.json` generates its interface
family with — and nothing else: families, sizes, weights and leading stay owned by [[web-typography]].

## Boundary

- **Owns:** `readInterfaceFont()` / `setInterfaceFont()` / `useInterfaceFont()`; `initInterfaceFont()`;
  `listInstalledFonts()`; `isValidFamilyName()` and the family-name quoting rule.
- **Public surface (barrel):** the above plus `INTERFACE_FONT_STORAGE_KEY`, `INTERFACE_FONT_VAR` and the
  `InterfaceFont` type.
- **Allowed deps:** `contracts` (the `NativeFontBridge` type), `clientPreferences` (the stable preference
  adapter), branding constants, and React.
- **Forbidden:** transport, host configuration, the server-synced `AppConfig`, any `font-family`
  declaration of its own, and any second copy of a font stack.

## Get right

- **Per device, like the interface language.** The choice persists through the native stable preference
  adapter (`interface-font` under the branding prefix), falling back to `localStorage`; browser tabs
  converge through storage events. Font availability is a property of the machine, so it never travels
  through settings.
- **One value, one slot.** The preference is a family name, never a stack. It is applied as
  `--tr-font-user-interface` on `documentElement`, which the generated interface family leads with —
  the CJK and Latin fallbacks behind it stay exactly as `typography.json` writes them.
- **An invalid name is refused, not sanitized.** A name carrying `"`, `\`, `;`, `{`, `}` or a control
  character would break the quoted value, and an invalid value in the slot makes `font-family` invalid
  at computed-value time — the whole stack, Chinese fallbacks included, would be dropped.
- **Three list sources, one answer.** The desktop host's `__THINKRAIL_SYSTEM_FONTS__` bridge (a system
  WebView has no `queryLocalFonts`), then `window.queryLocalFonts` in a Chromium browser, then an empty
  list — which the picker turns into "type a family name". Every source is deduped through the same
  validator.
- **Empty is a valid answer.** A host that cannot enumerate (missing tool, unreadable directory) yields
  no rows; the setting and its manual input still work.
