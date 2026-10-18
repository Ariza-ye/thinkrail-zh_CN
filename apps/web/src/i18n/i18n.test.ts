import { afterEach, expect, test } from "bun:test";
import { configureMessages, getLocale, setLocale, translate } from "@thinkrail/ui/i18n";
import {
	initI18n,
	LANGUAGE_STORAGE_KEY,
	parseLanguagePreference,
	resolveLanguage,
	setLanguagePreference,
} from "./index";

class MemoryStorage implements Storage {
	private values = new Map<string, string>();
	get length() {
		return this.values.size;
	}
	clear() {
		this.values.clear();
	}
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

const originals = new Map<string, PropertyDescriptor | undefined>();
let dispose: (() => void) | undefined;

function installEnvironment(languages: string[], storage = new MemoryStorage()) {
	const target = Object.assign(new EventTarget(), { localStorage: storage });
	const root = { lang: "" };
	for (const [name, value] of Object.entries({
		window: target,
		document: { documentElement: root },
		navigator: { languages, language: languages[0] },
	})) {
		originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value });
	}
	return { target, root, storage };
}

afterEach(() => {
	dispose?.();
	dispose = undefined;
	setLocale("en");
	configureMessages({});
	for (const [name, descriptor] of originals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	originals.clear();
});

test("accepts only supported language preferences and resolves system language", () => {
	for (const value of [null, undefined, "fr", {}, "zh-TW"]) {
		expect(parseLanguagePreference(value)).toBe("system");
	}
	for (const language of ["zh", "zh-CN", "zh-SG", "zh-MY", "zh-Hans", "zh-Hans-CN"]) {
		expect(resolveLanguage("system", [language])).toBe("zh-CN");
	}
	for (const language of [
		"en-US",
		"zh-TW",
		"zh-HK",
		"zh-Hant",
		"zh-Hant-CN",
		"fr",
		"",
		"not_a_locale",
	]) {
		expect(resolveLanguage("system", [language])).toBe("en");
	}
	expect(resolveLanguage("system", [])).toBe("en");
	expect(resolveLanguage("en", ["zh-CN"])).toBe("en");
	expect(resolveLanguage("zh-CN", ["en-US"])).toBe("zh-CN");
});

test("hydrates before rendering and persists browser selection across initialization", () => {
	const { storage, root } = installEnvironment(["zh-CN"]);
	dispose = initI18n(null);
	expect(getLocale()).toBe("zh-CN");
	expect(root.lang).toBe("zh-CN");
	setLanguagePreference("en");
	expect(getLocale()).toBe("en");
	expect(root.lang).toBe("en");
	expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
	dispose();
	dispose = initI18n(null);
	expect(getLocale()).toBe("en");
});

test("system changes affect only system mode and browser storage events converge", () => {
	const languages = ["en-US"];
	const { storage, target } = installEnvironment(languages);
	dispose = initI18n(null);
	languages[0] = "zh-CN";
	target.dispatchEvent(new Event("languagechange"));
	expect(getLocale()).toBe("zh-CN");
	setLanguagePreference("en");
	target.dispatchEvent(new Event("languagechange"));
	expect(getLocale()).toBe("en");
	storage.setItem(LANGUAGE_STORAGE_KEY, "zh-CN");
	target.dispatchEvent(Object.assign(new Event("storage"), { key: LANGUAGE_STORAGE_KEY }));
	expect(getLocale()).toBe("zh-CN");
	storage.clear();
	languages[0] = "en-US";
	target.dispatchEvent(new Event("storage"));
	target.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
	expect(getLocale()).toBe("en");
});

test("native stable preferences take precedence over browser storage", () => {
	const { storage } = installEnvironment(["zh-CN"]);
	storage.setItem(LANGUAGE_STORAGE_KEY, "zh-CN");
	const adapter = new MemoryStorage();
	adapter.setItem(LANGUAGE_STORAGE_KEY, "en");
	dispose = initI18n(adapter);
	expect(getLocale()).toBe("en");
	setLanguagePreference("zh-CN");
	expect(adapter.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
	setLanguagePreference("system");
	expect(adapter.getItem(LANGUAGE_STORAGE_KEY)).toBe("system");
	expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
});

test("unavailable persistence cannot prevent language switching", () => {
	installEnvironment(["en-US"]);
	dispose = initI18n({
		getItem() {
			throw new Error("unavailable");
		},
		setItem() {
			throw new Error("unavailable");
		},
		removeItem() {
			throw new Error("unavailable");
		},
	});
	expect(getLocale()).toBe("en");
	expect(() => setLanguagePreference("zh-CN")).not.toThrow();
	expect(getLocale()).toBe("zh-CN");
	expect(translate("Unknown {value}", { value: "agent text" })).toBe("Unknown agent text");
});
