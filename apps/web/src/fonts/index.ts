import type { NativeFontBridge } from "@thinkrail/contracts";
import { useSyncExternalStore } from "react";
import { getStablePreferenceAdapter, type StablePreferenceAdapter } from "../clientPreferences";
import { STORAGE_PREFIX } from "../constants/branding";

export const INTERFACE_FONT_STORAGE_KEY = `${STORAGE_PREFIX}interface-font`;

/** The generated slot the interface family leads with — the one typography value a client may set. */
export const INTERFACE_FONT_VAR = "--tr-font-user-interface";

/** A picker row previews a candidate through this var, declared on the row itself. */
export const INTERFACE_FONT_PREVIEW_VAR = "--tr-font-preview-interface";

const SYSTEM_FONTS_GLOBAL = "__THINKRAIL_SYSTEM_FONTS__";
const MAX_FAMILY_LENGTH = 128;
const UNSAFE_FAMILY = /["\\;{}]/;

function hasControlCharacter(value: string): boolean {
	for (const character of value) if (character.charCodeAt(0) < 0x20) return true;
	return false;
}

/** `null` means the bundled default: the interface stack as written in `typography.json`. */
export type InterfaceFont = string | null;

const listeners = new Set<() => void>();
let current: InterfaceFont = null;
let persist: ((value: InterfaceFont) => void) | undefined;

export function isValidFamilyName(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const name = value.trim();
	return (
		name.length > 0 &&
		name.length <= MAX_FAMILY_LENGTH &&
		!UNSAFE_FAMILY.test(name) &&
		!hasControlCharacter(name)
	);
}

export function parseInterfaceFont(value: unknown): InterfaceFont {
	return isValidFamilyName(value) ? value.trim() : null;
}

function apply(next: InterfaceFont): void {
	current = next;
	if (typeof document !== "undefined") {
		const root = document.documentElement;
		if (next === null) root.style.removeProperty(INTERFACE_FONT_VAR);
		else root.style.setProperty(INTERFACE_FONT_VAR, `"${next}"`);
	}
	for (const listener of listeners) listener();
}

/**
 * Applies a family for this device. An invalid name is refused rather than written: a broken value in
 * the slot would make `font-family` invalid at computed-value time, which drops the whole stack.
 */
export function setInterfaceFont(value: unknown): boolean {
	if (value !== null && !isValidFamilyName(value)) return false;
	apply(value === null ? null : value.trim());
	persist?.(current);
	return true;
}

export function readInterfaceFont(): InterfaceFont {
	return current;
}

export function useInterfaceFont(): InterfaceFont {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
		() => null,
	);
}

export function getNativeFontBridge(value: unknown): NativeFontBridge | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return typeof Reflect.get(value, "list") === "function" ? (value as NativeFontBridge) : null;
}

interface LocalFontData {
	family: string;
}

type LocalFontQuery = () => Promise<LocalFontData[]>;

function localFontQuery(): LocalFontQuery | null {
	if (typeof window === "undefined") return null;
	const query = Reflect.get(window, "queryLocalFonts");
	return typeof query === "function" ? (query as LocalFontQuery).bind(window) : null;
}

/**
 * The machine's font families. The desktop host enumerates them — a system WebView has no
 * `queryLocalFonts` — a Chromium browser answers for itself, and anything else gets an empty list so
 * the picker falls back to a typed family name.
 */
export async function listInstalledFonts(): Promise<string[]> {
	const bridge = getNativeFontBridge(Reflect.get(globalThis, SYSTEM_FONTS_GLOBAL));
	const fromBridge = async (report: NativeFontBridge) => {
		try {
			return await report.list();
		} catch {
			return [];
		}
	};
	const families = bridge
		? await fromBridge(bridge)
		: await (async () => {
				const query = localFontQuery();
				if (!query) return [];
				try {
					return (await query()).map((face) => face.family);
				} catch {
					return [];
				}
			})();
	const unique = new Set(families.filter((family) => isValidFamilyName(family)));
	return [...unique].sort((left, right) => left.localeCompare(right));
}

export function initInterfaceFont(
	adapter: StablePreferenceAdapter | null = getStablePreferenceAdapter(),
): () => void {
	let storage: StablePreferenceAdapter | null = adapter;
	if (!storage) {
		try {
			storage = window.localStorage;
		} catch {}
	}
	const read = (): InterfaceFont => {
		try {
			return parseInterfaceFont(storage?.getItem(INTERFACE_FONT_STORAGE_KEY));
		} catch {
			return null;
		}
	};
	persist = (value) => {
		try {
			if (value === null) storage?.removeItem(INTERFACE_FONT_STORAGE_KEY);
			else storage?.setItem(INTERFACE_FONT_STORAGE_KEY, value);
		} catch {}
	};
	const onStorage = (event: StorageEvent) => {
		if (!adapter && (event.key === INTERFACE_FONT_STORAGE_KEY || event.key === null)) apply(read());
	};
	apply(read());
	if (!adapter) window.addEventListener("storage", onStorage);
	return () => {
		if (!adapter) window.removeEventListener("storage", onStorage);
		persist = undefined;
	};
}
