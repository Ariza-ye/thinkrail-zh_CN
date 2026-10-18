import { useSyncExternalStore } from "react";

export type Locale = "en" | "zh-CN";
export type MessageParams = Readonly<Record<string, string | number>>;
export type Messages = Readonly<Record<string, string>>;
export type Translator = (message: string, params?: MessageParams) => string;

let locale: Locale = "en";
let messages: Partial<Record<Locale, Messages>> = {};
const listeners = new Set<() => void>();

export function formatMessage(message: string, params?: MessageParams): string {
	return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
		params && Object.hasOwn(params, key) ? String(params[key]) : placeholder,
	);
}

export function configureMessages(catalogs: Partial<Record<Locale, Messages>>): void {
	messages = catalogs;
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

export function translate(message: string, params?: MessageParams): string {
	return formatMessage(messages[locale]?.[message] ?? message, params);
}

const translators: Record<Locale, Translator> = {
	en: (message, params) => formatMessage(messages.en?.[message] ?? message, params),
	"zh-CN": (message, params) => formatMessage(messages["zh-CN"]?.[message] ?? message, params),
};

export function useI18n(): { locale: Locale; t: Translator } {
	const current = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
	return { locale: current, t: translators[current] };
}
