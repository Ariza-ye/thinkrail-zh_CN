import type { Terminal } from "@xterm/xterm";

type KeyEvent = Pick<
	KeyboardEvent,
	| "type"
	| "key"
	| "code"
	| "keyCode"
	| "isComposing"
	| "ctrlKey"
	| "altKey"
	| "metaKey"
	| "preventDefault"
>;

type InputTerminal = Pick<Terminal, "input"> & {
	element: EventTarget | undefined;
	textarea: EventTarget | undefined;
	attachCustomKeyEventHandler(handler: (event: KeyEvent) => boolean): void;
};

function imeControlBytes(event: KeyEvent): string | null {
	if (event.altKey || event.metaKey) return null;
	if (event.code === "Escape") return "\x1b";
	if (!event.ctrlKey) return null;
	const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
	return letter ? String.fromCharCode(letter.charCodeAt(0) - 64) : null;
}

export function installTerminalInputCompat(term: InputTerminal): { dispose(): void } {
	const { element, textarea } = term;
	if (!element || !textarea)
		throw new Error("Terminal input compatibility requires an open terminal");
	let disposed = false;
	let composing = false;
	let pendingComposition = false;
	let pendingControlBytes = "";
	let commitTimer: ReturnType<typeof setTimeout> | undefined;

	const onCompositionStart = (event: Event): void => {
		if (event.target === textarea) composing = true;
	};
	const onCompositionEnd = (event: Event): void => {
		if (event.target !== textarea) return;
		composing = false;
		pendingComposition = true;
		clearTimeout(commitTimer);
		// 冒泡时 xterm 已排入组合文本提交任务；见 panels/SPEC.md。
		commitTimer = setTimeout(() => {
			pendingComposition = false;
			commitTimer = undefined;
			if (pendingControlBytes) {
				term.input(pendingControlBytes, true);
				pendingControlBytes = "";
			}
		}, 0);
	};
	const onBeforeInput = (event: Event): void => {
		if (event.target !== textarea) return;
		const input = event as InputEvent;
		if (
			composing ||
			pendingComposition ||
			input.isComposing ||
			input.inputType !== "deleteContentBackward"
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		term.input("\x7f", true);
	};
	const onInput = (event: Event): void => {
		if (event.target !== textarea) return;
		const input = event as InputEvent;
		if (composing || input.isComposing || input.inputType !== "insertText") return;
		event.stopPropagation();
		if (!pendingComposition && input.data) term.input(input.data, true);
	};
	term.attachCustomKeyEventHandler((event) => {
		if (disposed || composing || event.isComposing) return true;
		if (event.type !== "keydown" && event.type !== "keypress") return true;
		if (event.keyCode === 229) {
			if (event.type === "keydown") {
				const bytes = imeControlBytes(event);
				if (bytes !== null) {
					event.preventDefault();
					if (pendingComposition) pendingControlBytes += bytes;
					else term.input(bytes, true);
				}
			}
			return false;
		}
		if (event.key === "Dead" || event.key === "AltGraph") return false;
		const printable = [...event.key].length === 1;
		if (event.type === "keypress" && printable) return false;
		const handledByXterm = event.ctrlKey || event.altKey || event.metaKey || !printable;
		if (handledByXterm && event.type === "keydown" && ![16, 17, 18, 20].includes(event.keyCode)) {
			pendingComposition = false;
		}
		return handledByXterm;
	});
	element.addEventListener("beforeinput", onBeforeInput, true);
	element.addEventListener("input", onInput, true);
	element.addEventListener("compositionstart", onCompositionStart, true);
	element.addEventListener("compositionend", onCompositionEnd);
	return {
		dispose() {
			disposed = true;
			clearTimeout(commitTimer);
			element.removeEventListener("beforeinput", onBeforeInput, true);
			element.removeEventListener("input", onInput, true);
			element.removeEventListener("compositionstart", onCompositionStart, true);
			element.removeEventListener("compositionend", onCompositionEnd);
			term.attachCustomKeyEventHandler(() => true);
		},
	};
}
