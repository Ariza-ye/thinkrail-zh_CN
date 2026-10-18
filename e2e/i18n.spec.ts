import { expect, type Page, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openFixtureProject,
	visibleTerminal,
	waitTerminalReady,
} from "./fixtures/app";

async function openAppearance(page: Page) {
	await page.getByTestId("open-settings").click();
	await page.getByTestId("settings-nav-appearance").click();
	return page.getByRole("radiogroup").filter({
		has: page.getByRole("radio", { name: "简体中文", exact: true }),
	});
}

test.describe("interface language", () => {
	test.use({ locale: "en-US" });

	test("switches immediately, preserves mounted UI and persists without host writes", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("websocket", (socket) => {
			socket.on("framesent", ({ payload }) => {
				if (typeof payload === "string" && payload.includes('"settings.update"'))
					writes.push(payload);
			});
		});
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		const languages = await openAppearance(page);
		await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
		await page.getByTestId("settings-dialog").evaluate((element) => {
			element.setAttribute("data-i18n-mount-probe", "preserved");
		});
		await languages.getByTestId("language-zh-CN").click();
		await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
		await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
		await expect(page.getByTestId("settings-nav-appearance")).toContainText("外观");
		await expect(page.getByTestId("settings-dialog")).toHaveAttribute(
			"data-i18n-mount-probe",
			"preserved",
		);
		await expect(page.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
		const restored = await openAppearance(page);
		await expect(restored.getByRole("radio", { name: "简体中文", exact: true })).toBeChecked();
		await restored.getByTestId("language-en").click();
		await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
		expect(writes).toEqual([]);
	});

	test("switching preserves the terminal and an untranslated chat draft", async ({ page }) => {
		await openFixtureProject(page);
		await createWorkspaceViaDialog(page);
		await waitTerminalReady(page);
		const input = page.getByTestId("chat-input");
		const draft = "Settings Open project src/Settings.ts 用户内容";
		await input.fill(draft);
		await input.evaluate((element) => element.setAttribute("data-i18n-mount-probe", "composer"));
		const terminal = visibleTerminal(page).locator(".xterm");
		await terminal.evaluate((element) => element.setAttribute("data-i18n-mount-probe", "terminal"));
		const languages = await openAppearance(page);
		await languages.getByTestId("language-zh-CN").click();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("settings-dialog")).toBeHidden();
		await expect(input).toHaveValue(draft);
		await expect(input).toHaveAttribute("data-i18n-mount-probe", "composer");
		await expect(terminal).toHaveAttribute("data-i18n-mount-probe", "terminal");
	});

	test("browser tabs converge on the same local language preference", async ({ page, context }) => {
		await page.goto("/");
		const languages = await openAppearance(page);
		const other = await context.newPage();
		await other.goto("/");
		await languages.getByTestId("language-zh-CN").click();
		await expect(other.locator("html")).toHaveAttribute("lang", "zh-CN");
		await other.close();
	});
});

test.describe("system language", () => {
	test.use({ locale: "zh-CN" });

	test("defaults to Simplified Chinese and restores it after an explicit override", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
		const languages = await openAppearance(page);
		await languages.getByTestId("language-en").click();
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await languages.getByTestId("language-system").click();
		await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
	});
});
