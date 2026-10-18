import { useSyncExternalStore } from "react";

export type Locale = "en" | "zh-CN";
export type MessageParams = Readonly<Record<string, string | number>>;
export type Messages = Readonly<Record<string, string>>;
export type Translator = (message: string, params?: MessageParams) => string;

let locale: Locale = "en";
let revision = 0;
let messages: Partial<Record<Locale, Messages>> = {};
const listeners = new Set<() => void>();

export function formatMessage(message: string, params?: MessageParams): string {
	return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
		params && Object.hasOwn(params, key) ? String(params[key]) : placeholder,
	);
}

export function configureMessages(catalogs: Partial<Record<Locale, Messages>>): void {
	messages = catalogs;
	revision += 1;
	for (const listener of listeners) listener();
}

export function getLocale(): Locale {
	return locale;
}

export function setLocale(next: Locale): void {
	if (locale === next) return;
	locale = next;
	for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function translateForLocale(current: Locale, message: string, params?: MessageParams): string {
	const catalog = messages[current];
	const translated = catalog && Object.hasOwn(catalog, message) ? catalog[message] : undefined;
	return formatMessage(translated ?? message, params);
}

export function translate(message: string, params?: MessageParams): string {
	return translateForLocale(locale, message, params);
}

const translators: Record<Locale, Translator> = {
	en: (message, params) => translateForLocale("en", message, params),
	"zh-CN": (message, params) => translateForLocale("zh-CN", message, params),
};

function localeSnapshot(): string {
	return `${locale}:${revision}`;
}

export function useI18n(): { locale: Locale; t: Translator } {
	const snapshot = useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
	const current: Locale = snapshot.startsWith("zh-CN:") ? "zh-CN" : "en";
	return { locale: current, t: translators[current] };
}
