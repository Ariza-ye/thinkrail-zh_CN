import { afterEach, expect, test } from "bun:test";
import { configureMessages, formatMessage, setLocale, subscribeLocale, translate } from "./i18n";

afterEach(() => {
	setLocale("en");
	configureMessages({});
});

test("uses English fallback and substitutes values without retranslating content", () => {
	configureMessages({ "zh-CN": { "Open {name}": "打开 {name}" } });
	setLocale("zh-CN");
	expect(translate("Open {name}", { name: "Settings {name}" })).toBe("打开 Settings {name}");
	expect(translate("Missing {count}", { count: 2 })).toBe("Missing 2");
	expect(formatMessage("{x} {missing}", { x: "$&" })).toBe("$& {missing}");
	setLocale("en");
	expect(translate("Open {name}", { name: "file.ts" })).toBe("Open file.ts");
});

test("notifies only effective locale changes and supports cleanup", () => {
	let calls = 0;
	const dispose = subscribeLocale(() => { calls += 1; });
	setLocale("zh-CN");
	setLocale("zh-CN");
	expect(calls).toBe(1);
	dispose();
	setLocale("en");
	expect(calls).toBe(1);
});
