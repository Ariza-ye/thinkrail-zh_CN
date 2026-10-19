import { expect, test } from "bun:test";
import { installTerminalInputCompat } from "./terminalInputCompat";

type TerminalPort = Parameters<typeof installTerminalInputCompat>[0];
type KeyEvent = Parameters<Parameters<TerminalPort["attachCustomKeyEventHandler"]>[0]>[0];

function key(overrides: Partial<KeyEvent> = {}): KeyEvent {
	return {
		type: "keydown",
		key: "m",
		code: "KeyM",
		keyCode: 229,
		isComposing: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		preventDefault() {},
		...overrides,
	};
}

class TextareaEvent extends Event {
	blocked = false;
	constructor(
		type: string,
		private readonly source: EventTarget,
		readonly data = "",
		readonly inputType = "insertText",
		readonly isComposing = false,
	) {
		super(type, { bubbles: true, cancelable: true });
	}
	override get target(): EventTarget {
		return this.source;
	}
	override stopPropagation(): void {
		this.blocked = true;
		super.stopPropagation();
	}
}

class FakeTerminal implements TerminalPort {
	element = new EventTarget();
	textarea = new EventTarget();
	value = "";
	writes: { data: string; user: boolean | undefined }[] = [];
	handler: (event: KeyEvent) => boolean = () => true;
	input(data: string, user?: boolean): void {
		this.writes.push({ data, user });
	}
	attachCustomKeyEventHandler(handler: (event: KeyEvent) => boolean): void {
		this.handler = handler;
	}
	text(data: string, inputType = "insertText", isComposing = false): TextareaEvent {
		this.value += data;
		const event = new TextareaEvent("input", this.textarea, data, inputType, isComposing);
		this.element.dispatchEvent(event);
		return event;
	}
	composition(type: "compositionstart" | "compositionend"): void {
		this.element.dispatchEvent(new TextareaEvent(type, this.textarea));
	}
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

for (const inputFirst of [true, false]) {
	test(`${inputFirst ? "input before key" : "key before input"}: overlapping 229 keys have one input owner`, () => {
		const term = new FakeTerminal();
		const compat = installTerminalInputCompat(term);
		for (const char of "moon") {
			const sendKey = () => expect(term.handler(key({ key: char }))).toBe(false);
			if (!inputFirst) sendKey();
			const event = term.text(char);
			if (inputFirst) sendKey();
			expect(event.blocked).toBe(true);
			expect(event.defaultPrevented).toBe(false);
			expect(term.handler(key({ type: "keypress", key: char }))).toBe(false);
		}
		expect(term.writes).toEqual([..."moon"].map((data) => ({ data, user: true })));
		expect(term.value).toBe("moon");
		compat.dispose();
	});
}

test("229 Backspace emits one DEL from beforeinput even for an empty textarea", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	expect(term.handler(key({ key: "Backspace", code: "Backspace" }))).toBe(false);
	const event = new TextareaEvent("beforeinput", term.textarea, "", "deleteContentBackward");
	term.element.dispatchEvent(event);
	expect(event.blocked).toBe(true);
	expect(event.defaultPrevented).toBe(true);
	term.text("", "deleteContentBackward");
	expect(term.writes).toEqual([{ data: "\x7f", user: true }]);
	compat.dispose();
});

test("ordinary printable keys and repeats also belong to input, not keydown/keypress", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	for (let i = 0; i < 3; i += 1) {
		expect(term.handler(key({ keyCode: 77 }))).toBe(false);
		expect(term.handler(key({ type: "keypress", keyCode: 109 }))).toBe(false);
		term.text("m");
	}
	expect(term.writes.map((write) => write.data)).toEqual(["m", "m", "m"]);
	compat.dispose();
});

test("Chinese composition and its trailing input belong only to xterm's delayed commit", async () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	term.composition("compositionstart");
	expect(term.handler(key())).toBe(true);
	expect(term.text("中", "insertCompositionText", true).blocked).toBe(false);
	setTimeout(() => term.input(term.value, true), 0);
	term.composition("compositionend");
	const tail = new TextareaEvent("input", term.textarea, "中");
	term.element.dispatchEvent(tail);
	expect(tail.blocked).toBe(true);
	expect(term.writes).toEqual([]);
	expect(term.handler(key({ keyCode: 77 }))).toBe(false);
	term.text("m");
	await tick();
	expect(term.writes).toEqual([{ data: "中m", user: true }]);
	term.text("中");
	expect(term.writes.map((write) => write.data)).toEqual(["中m", "中"]);
	compat.dispose();
});

test("IME control bytes follow xterm's pending composition commit", async () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	term.composition("compositionstart");
	term.text("中", "insertCompositionText", true);
	setTimeout(() => term.input(term.value, true), 0);
	term.composition("compositionend");
	expect(term.handler(key({ ctrlKey: true, code: "KeyC" }))).toBe(false);
	expect(term.writes).toEqual([]);
	await tick();
	expect(term.writes.map((write) => write.data)).toEqual(["中", "\x03"]);
	compat.dispose();
});

test("dead keys and modified printable keypresses cannot acquire a second text owner", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	for (const name of ["Dead", "AltGraph"]) {
		expect(term.handler(key({ keyCode: 0, key: name }))).toBe(false);
	}
	for (const modifier of [{ altKey: true }, { ctrlKey: true, altKey: true }]) {
		expect(term.handler(key({ type: "keypress", keyCode: 233, key: "é", ...modifier }))).toBe(
			false,
		);
	}
	term.text("é");
	expect(term.writes.map((write) => write.data)).toEqual(["é"]);
	compat.dispose();
});

test("composition event flags and local composition state both protect Ctrl229", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	const ctrl = key({ ctrlKey: true, code: "KeyC" });
	expect(term.handler({ ...ctrl, isComposing: true })).toBe(true);
	term.composition("compositionstart");
	expect(term.handler(ctrl)).toBe(true);
	expect(term.handler(key({ code: "Escape" }))).toBe(true);
	expect(term.writes).toEqual([]);
	compat.dispose();
});

test("229 Ctrl letters and Escape use public input with user-input semantics", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	let prevented = 0;
	for (const letter of ["A", "C", "Z"]) {
		expect(
			term.handler(
				key({
					ctrlKey: true,
					code: `Key${letter}`,
					preventDefault: () => {
						prevented += 1;
					},
				}),
			),
		).toBe(false);
	}
	expect(prevented).toBe(3);
	expect(term.handler(key({ code: "Escape" }))).toBe(false);
	expect(term.handler(key({ type: "keyup", ctrlKey: true, code: "KeyC" }))).toBe(true);
	expect(term.writes).toEqual(
		["\x01", "\x03", "\x1a", "\x1b"].map((data) => ({ data, user: true })),
	);
	compat.dispose();
});

test("ordinary shortcuts, modifiers, navigation and paste remain xterm-owned", () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	for (const event of [
		key({ keyCode: 67, ctrlKey: true }),
		key({ keyCode: 67, altKey: true }),
		key({ keyCode: 67, metaKey: true }),
		key({ keyCode: 16, key: "Shift" }),
		key({ keyCode: 37, key: "ArrowLeft" }),
		key({ keyCode: 13, key: "Enter" }),
		key({ keyCode: 27, key: "Escape" }),
	])
		expect(term.handler(event)).toBe(true);
	for (const modifier of [{ altKey: true }, { metaKey: true }]) {
		expect(term.handler(key({ ...modifier, ctrlKey: true, code: "KeyC" }))).toBe(false);
	}
	expect(term.text("paste", "insertFromPaste").blocked).toBe(false);
	expect(term.text("preedit", "insertText", true).blocked).toBe(false);
	const unrelated = new TextareaEvent("input", new EventTarget(), "other");
	term.element.dispatchEvent(unrelated);
	expect(unrelated.blocked).toBe(false);
	expect(term.writes).toEqual([]);
	compat.dispose();
});

test("dispose removes listeners, cancels the commit-window timer and leaves an inert handler", async () => {
	const term = new FakeTerminal();
	const compat = installTerminalInputCompat(term);
	term.composition("compositionstart");
	term.composition("compositionend");
	compat.dispose();
	compat.dispose();
	await tick();
	expect(term.text("m").blocked).toBe(false);
	expect(term.handler(key({ ctrlKey: true, code: "KeyC" }))).toBe(true);
	expect(term.writes).toEqual([]);
});
