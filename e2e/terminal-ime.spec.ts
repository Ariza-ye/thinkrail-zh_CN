import { expect, type Page, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openFixtureProject,
	visibleTerminal,
	waitTerminalReady,
} from "./fixtures/app";

async function captureTerminalInput(page: Page): Promise<string[]> {
	const writes: string[] = [];
	await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
		const server = socket.connectToServer();
		socket.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as {
				method?: string;
				params?: { data?: string };
			};
			if (frame.method === "terminal.write" && frame.params?.data) {
				writes.push(frame.params.data);
			}
			server.send(message);
		});
	});
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await waitTerminalReady(page);
	await visibleTerminal(page).locator(".xterm-helper-textarea").focus();
	return writes;
}

for (const [order, yieldBetweenKeys] of [
	["input-first", true],
	["keydown-first", true],
	["input-first", false],
	["keydown-first", false],
] as const) {
	test(`IME English preserves overlapping keys exactly once (${order}, yield=${yieldBetweenKeys})`, async ({
		page,
	}) => {
		const writes = await captureTerminalInput(page);
		const text = "mmmo ABC09!?";
		await visibleTerminal(page)
			.locator(".xterm-helper-textarea")
			.evaluate(
				async (element, { order, text, yieldBetweenKeys }) => {
					if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea");
					for (const key of text) {
						const keydown = () =>
							element.dispatchEvent(
								new KeyboardEvent("keydown", {
									key,
									code: `Key${key.toUpperCase()}`,
									keyCode: 229,
									repeat: key === "m",
									bubbles: true,
									cancelable: true,
								}),
							);
						const input = () => {
							element.value += key;
							element.dispatchEvent(
								new InputEvent("input", {
									data: key,
									inputType: "insertText",
									bubbles: true,
									composed: true,
								}),
							);
						};
						if (order === "input-first") {
							input();
							keydown();
						} else {
							keydown();
							input();
						}
						if (yieldBetweenKeys) await new Promise((resolve) => setTimeout(resolve, 0));
					}
					element.dispatchEvent(new KeyboardEvent("keyup", { keyCode: 229, bubbles: true }));
					await new Promise((resolve) => setTimeout(resolve, 0));
				},
				{ order, text, yieldBetweenKeys },
			);
		await expect.poll(() => writes.join("")).toBe(text);
		await page.keyboard.type("next");
		await page.keyboard.press("Control+c");
		await expect.poll(() => writes.join("")).toBe(`${text}next\x03`);
	});
}

test("native English typing, repeated keys, paste and editing retain their bytes", async ({
	page,
}) => {
	const writes = await captureTerminalInput(page);
	await page.keyboard.type("abcABC09!? ");
	await page.keyboard.down("m");
	await page.keyboard.down("m");
	await page.keyboard.up("m");
	await page.keyboard.insertText("pasted text");
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Control+c");
	await expect.poll(() => writes.join("")).toBe("abcABC09!? mmpasted text\x7f\x03");
});

test("IME Backspace deletes shell history even with an empty textarea", async ({ page }) => {
	const writes = await captureTerminalInput(page);
	const textarea = visibleTerminal(page).locator(".xterm-helper-textarea");
	await page.evaluate(() => {
		document.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Backspace") {
					Object.defineProperty(event, "keyCode", { value: 229 });
				}
			},
			true,
		);
	});
	await page.keyboard.type("echo TR_IME_HISTORY");
	await page.keyboard.press("Enter");
	await expect(textarea).toHaveValue("");
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Control+c");
	await expect
		.poll(() => writes.join("").replace("\x1bOA", "\x1b[A"))
		.toBe("echo TR_IME_HISTORY\r\x1b[A\x7f\x03");
});

test("rescued IME control keys do not also perform native text editing", async ({ page }) => {
	const writes = await captureTerminalInput(page);
	const textarea = visibleTerminal(page).locator(".xterm-helper-textarea");
	await page.evaluate(() => {
		document.addEventListener(
			"keydown",
			(event) => {
				if (event.ctrlKey && event.code === "KeyH") {
					Object.defineProperty(event, "keyCode", { value: 229 });
				}
			},
			true,
		);
	});
	await page.keyboard.type("m");
	await page.keyboard.press("Control+h");
	await expect(textarea).toHaveValue("m");
	await page.keyboard.press("Control+c");
	await expect.poll(() => writes.join("")).toBe("m\x08\x03");
});

test("dead keys and macOS Option text do not duplicate text or swallow controls", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
	});
	const writes = await captureTerminalInput(page);
	await visibleTerminal(page)
		.locator(".xterm-helper-textarea")
		.evaluate((element) => {
			if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea");
			element.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Dead", keyCode: 222, bubbles: true }),
			);
			element.dispatchEvent(
				new KeyboardEvent("keypress", {
					key: "é",
					keyCode: 233,
					charCode: 233,
					altKey: true,
					bubbles: true,
				}),
			);
			element.value += "é";
			element.dispatchEvent(
				new InputEvent("input", {
					data: "é",
					inputType: "insertText",
					bubbles: true,
					composed: true,
				}),
			);
		});
	await page.keyboard.press("Control+c");
	await page.keyboard.press("Control+c");
	await expect.poll(() => writes.join("")).toBe("é\x03\x03");
});

test("navigation commits composition before the next text input", async ({ page }) => {
	const writes = await captureTerminalInput(page);
	await visibleTerminal(page)
		.locator(".xterm-helper-textarea")
		.evaluate(async (element) => {
			if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea");
			element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
			element.value += "你";
			element.dispatchEvent(
				new CompositionEvent("compositionupdate", { data: "你", bubbles: true }),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			element.dispatchEvent(new CompositionEvent("compositionend", { data: "你", bubbles: true }));
			element.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowLeft",
					code: "ArrowLeft",
					keyCode: 37,
					bubbles: true,
					cancelable: true,
				}),
			);
			element.value += "m";
			element.dispatchEvent(
				new InputEvent("input", {
					data: "m",
					inputType: "insertText",
					bubbles: true,
					composed: true,
				}),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	await expect.poll(() => writes.join("").replace("\x1bOD", "\x1b[D")).toBe("你\x1b[Dm");
});

test("IME control keys follow a pending composition commit", async ({ page }) => {
	const writes = await captureTerminalInput(page);
	await visibleTerminal(page)
		.locator(".xterm-helper-textarea")
		.evaluate(async (element) => {
			if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea");
			element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
			element.value += "你";
			element.dispatchEvent(
				new CompositionEvent("compositionupdate", { data: "你", bubbles: true }),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			element.dispatchEvent(new CompositionEvent("compositionend", { data: "你", bubbles: true }));
			element.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "c",
					code: "KeyC",
					keyCode: 229,
					ctrlKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	await expect.poll(() => writes.join("")).toBe("你\x03");
});

test("composition commit and immediate English input are emitted once and in order", async ({
	page,
}) => {
	const writes = await captureTerminalInput(page);
	await visibleTerminal(page)
		.locator(".xterm-helper-textarea")
		.evaluate(async (element) => {
			if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea");
			const prefix = element.value;
			element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
			element.value = `${prefix}ni`;
			element.dispatchEvent(
				new CompositionEvent("compositionupdate", { data: "ni", bubbles: true }),
			);
			element.dispatchEvent(
				new InputEvent("input", {
					data: "ni",
					inputType: "insertCompositionText",
					isComposing: true,
					bubbles: true,
					composed: true,
				}),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			element.value = `${prefix}你`;
			element.dispatchEvent(
				new CompositionEvent("compositionupdate", { data: "你", bubbles: true }),
			);
			element.dispatchEvent(new CompositionEvent("compositionend", { data: "你", bubbles: true }));
			element.dispatchEvent(
				new InputEvent("input", {
					data: "你",
					inputType: "insertText",
					bubbles: true,
					composed: true,
				}),
			);
			element.value += "m";
			element.dispatchEvent(
				new InputEvent("input", {
					data: "m",
					inputType: "insertText",
					bubbles: true,
					composed: true,
				}),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	await expect.poll(() => writes.join("")).toBe("你m");
	await page.keyboard.type("o");
	await page.keyboard.press("Control+c");
	await expect.poll(() => writes.join("")).toBe("你mo\x03");
});
