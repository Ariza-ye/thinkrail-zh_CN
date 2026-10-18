import { expect, type Page, test } from "@playwright/test";
import { openAppFresh } from "./fixtures/app";

const FAMILIES = ["Inter", "PingFang SC", "Songti SC"];

/** The desktop host's font bridge, which the system WebView cannot get from `queryLocalFonts`. */
async function stubSystemFonts(page: Page, families: string[] = FAMILIES): Promise<void> {
	await page.addInitScript((list: string[]) => {
		Reflect.set(
			globalThis,
			"__THINKRAIL_SYSTEM_FONTS__",
			Object.freeze({ list: async () => list }),
		);
	}, families);
}

async function openFontSettings(page: Page) {
	await page.getByTestId("open-settings").click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await page.getByTestId("settings-nav-appearance").click();
	await page.getByTestId("interface-font-trigger").click();
	await expect(page.getByTestId("interface-font-panel")).toBeVisible();
}

/** The family the app actually renders with, read off the document element's runtime slot. */
function appliedFamily(page: Page): Promise<string> {
	return page.evaluate(() => {
		const slot = getComputedStyle(document.documentElement).getPropertyValue(
			"--tr-font-user-interface",
		);
		return slot.trim().replace(/^"|"$/g, "");
	});
}

function renderedFamily(page: Page): Promise<string> {
	return page.evaluate(() => {
		const family = getComputedStyle(document.body).fontFamily;
		return (family.split(",")[0] ?? "").trim().replace(/^"|"$/g, "");
	});
}

test("applies a chosen family to the whole interface and keeps it across reloads", async ({
	page,
}) => {
	await stubSystemFonts(page);
	await openAppFresh(page);
	expect(await appliedFamily(page)).toBe("");

	await openFontSettings(page);
	await page.getByTestId("interface-font-row-PingFang SC").click();
	await expect(page.getByTestId("interface-font-row-PingFang SC")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(await appliedFamily(page)).toBe("PingFang SC");
	expect(await renderedFamily(page)).toBe("PingFang SC");

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	expect(await appliedFamily(page)).toBe("PingFang SC");

	await openFontSettings(page);
	await page.getByTestId("interface-font-default").click();
	expect(await appliedFamily(page)).toBe("");
	expect(await renderedFamily(page)).toBe("Geist Variable");
});

test("filters the installed list by the search query", async ({ page }) => {
	await stubSystemFonts(page);
	await openAppFresh(page);
	await openFontSettings(page);
	await expect(page.locator('[data-testid^="interface-font-row-"]')).toHaveCount(FAMILIES.length);

	await page.getByTestId("interface-font-search").fill("song");
	await expect(page.locator('[data-testid^="interface-font-row-"]')).toHaveCount(1);
	await expect(page.getByTestId("interface-font-row-Songti SC")).toBeVisible();
});

test("previews each row in its own face instead of restating a font stack", async ({ page }) => {
	await stubSystemFonts(page);
	await openAppFresh(page);
	await openFontSettings(page);
	const preview = await page.getByTestId("interface-font-row-Songti SC").evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			slot: style.getPropertyValue("--tr-font-preview-interface").trim(),
			family: (style.fontFamily.split(",")[0] ?? "").trim().replace(/^"|"$/g, ""),
		};
	});
	expect(preview.slot).toBe('"Songti SC"');
	expect(preview.family).toBe("Songti SC");
});

test("refuses a name that would break the CSS value", async ({ page }) => {
	await stubSystemFonts(page);
	await openAppFresh(page);
	await openFontSettings(page);
	await page.getByTestId("interface-font-manual-input").fill("Bad; font");
	await page.getByTestId("interface-font-manual-input").press("Enter");
	await expect(page.getByTestId("interface-font-error")).toBeVisible();
	expect(await appliedFamily(page)).toBe("");
});

test("accepts a typed family when the host lists no fonts at all", async ({ page }) => {
	await stubSystemFonts(page, []);
	await openAppFresh(page);
	await openFontSettings(page);
	await expect(page.getByTestId("interface-font-unsupported")).toBeVisible();
	await expect(page.locator('[data-testid^="interface-font-row-"]')).toHaveCount(0);

	await page.getByTestId("interface-font-manual-input").fill("思源黑体");
	await page.getByTestId("interface-font-manual-input").press("Enter");
	expect(await appliedFamily(page)).toBe("思源黑体");
	expect(await renderedFamily(page)).toBe("思源黑体");
});
