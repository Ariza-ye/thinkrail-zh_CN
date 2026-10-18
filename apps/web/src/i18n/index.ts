import { configureMessages, type Locale, setLocale } from "@thinkrail/ui/i18n";
import { useSyncExternalStore } from "react";
import { getStablePreferenceAdapter, type StablePreferenceAdapter } from "../clientPreferences";
import { STORAGE_PREFIX } from "../constants/branding";
import chat from "./messages/chat";
import panels from "./messages/panels";
import settings from "./messages/settings";
import shell from "./messages/shell";
import transport from "./messages/transport";

export type LanguagePreference = "system" | Locale;
export const LANGUAGE_STORAGE_KEY = `${STORAGE_PREFIX}interface-language`;
let preference: LanguagePreference = "system";
let persist: ((value: LanguagePreference) => void) | undefined;
let systemLanguages: readonly string[] = ["en"];
const listeners = new Set<() => void>();

export const zhCNMessages = { ...settings, ...panels, ...chat, ...shell, ...transport };

export function parseLanguagePreference(value: unknown): LanguagePreference {
	return value === "en" || value === "zh-CN" ? value : "system";
}

export function resolveLanguage(value: LanguagePreference, languages: readonly string[]): Locale {
	if (value !== "system") return value;
	try {
		const language = new Intl.Locale(languages[0] ?? "en");
		return language.language === "zh" && language.maximize().script === "Hans" ? "zh-CN" : "en";
	} catch {
		return "en";
	}
}

function applyPreference(value: LanguagePreference): void {
	preference = value;
	const locale = resolveLanguage(value, systemLanguages);
	setLocale(locale);
	if (typeof document !== "undefined") document.documentElement.lang = locale;
	for (const listener of listeners) listener();
}

export function setLanguagePreference(value: LanguagePreference): void {
	applyPreference(value);
	persist?.(value);
}

export function useLanguagePreference(): LanguagePreference {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => preference,
		() => "system",
	);
}

export function initI18n(
	adapter: StablePreferenceAdapter | null = getStablePreferenceAdapter(),
): () => void {
	configureMessages({ "zh-CN": zhCNMessages });
	let storage: StablePreferenceAdapter | null = adapter;
	if (!storage) {
		try {
			storage = window.localStorage;
		} catch {}
	}
	const read = () => {
		try {
			return parseLanguagePreference(storage?.getItem(LANGUAGE_STORAGE_KEY));
		} catch {
			return "system" as const;
		}
	};
	persist = (value) => {
		try {
			storage?.setItem(LANGUAGE_STORAGE_KEY, value);
		} catch {}
	};
	const onLanguage = () => {
		systemLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
		applyPreference(preference);
	};
	onLanguage();
	applyPreference(read());
	const onStorage = (event: StorageEvent) => {
		if (!adapter && (event.key === LANGUAGE_STORAGE_KEY || event.key === null)) {
			applyPreference(read());
		}
	};
	window.addEventListener("languagechange", onLanguage);
	if (!adapter) window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener("languagechange", onLanguage);
		window.removeEventListener("storage", onStorage);
		persist = undefined;
	};
}
