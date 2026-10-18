import { afterEach, expect, test } from "bun:test";
import { configureMessages, setLocale, useI18n } from "@thinkrail/ui/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../chat/Markdown";
import { errorText } from "../transport";
import { zhCNMessages } from "./index";

afterEach(() => {
	setLocale("en");
	configureMessages({});
});

test("localizes chrome without translating agent prose, code, paths or external errors", () => {
	configureMessages({ "zh-CN": zhCNMessages });
	setLocale("zh-CN");
	function Content() {
		const { t } = useI18n();
		return (
			<>
				<button type="button">{t("Settings")}</button>
				<Markdown text={"Settings\n\n`Settings`\n\n[Settings](https://example.com/Settings.ts)"} />
			</>
		);
	}
	const html = renderToStaticMarkup(<Content />);
	expect(html).toContain(">设置</button>");
	expect(html).toContain("<p>Settings</p>");
	expect(html).toContain(">Settings</code>");
	expect(html).toContain('href="https://example.com/Settings.ts"');
	expect(errorText(new Error("Settings"))).toBe("Settings");
	expect(errorText("Settings")).toBe("Settings");
	expect(errorText(null)).toBe("请求失败。");
});
