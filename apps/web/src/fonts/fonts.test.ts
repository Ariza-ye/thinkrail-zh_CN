import { describe, expect, it } from "bun:test";
import {
	getNativeFontBridge,
	INTERFACE_FONT_STORAGE_KEY,
	initInterfaceFont,
	isValidFamilyName,
	listInstalledFonts,
	parseInterfaceFont,
	readInterfaceFont,
	setInterfaceFont,
} from "./index";

const SYSTEM_FONTS_GLOBAL = "__THINKRAIL_SYSTEM_FONTS__";

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
	};
}

describe("family names", () => {
	it("accepts an ordinary installed family", () => {
		for (const name of ["PingFang SC", "Inter", "Noto Sans SC", "思源黑体", "IBM Plex Sans"])
			expect(isValidFamilyName(name), name).toBe(true);
	});

	it("refuses anything that would break the quoted CSS value", () => {
		for (const name of [
			"",
			"   ",
			'Bad " quote',
			"Bad \\ escape",
			"Bad; declaration",
			"Bad { block",
			"Bad\u0000control",
			"x".repeat(129),
			null,
			42,
		])
			expect(isValidFamilyName(name), String(name)).toBe(false);
	});

	it("trims a valid name and turns an invalid one into the default", () => {
		expect(parseInterfaceFont("  Inter  ")).toBe("Inter");
		expect(parseInterfaceFont("Bad; injection")).toBeNull();
		expect(parseInterfaceFont(undefined)).toBeNull();
	});
});

describe("the preference", () => {
	it("applies a family, refuses an invalid one, and restores the default", () => {
		expect(setInterfaceFont("PingFang SC")).toBe(true);
		expect(readInterfaceFont()).toBe("PingFang SC");
		expect(setInterfaceFont('Bad " quote')).toBe(false);
		expect(readInterfaceFont()).toBe("PingFang SC");
		expect(setInterfaceFont(null)).toBe(true);
		expect(readInterfaceFont()).toBeNull();
	});

	it("persists through the adapter and clears the key for the default", () => {
		const storage = memoryStorage();
		storage.values.set(INTERFACE_FONT_STORAGE_KEY, "Songti SC");
		const dispose = initInterfaceFont(storage);
		expect(readInterfaceFont()).toBe("Songti SC");
		setInterfaceFont("PingFang SC");
		expect(storage.values.get(INTERFACE_FONT_STORAGE_KEY)).toBe("PingFang SC");
		setInterfaceFont(null);
		expect(storage.values.has(INTERFACE_FONT_STORAGE_KEY)).toBe(false);
		dispose();
	});

	it("falls back to the default when the stored value is not a family name", () => {
		const storage = memoryStorage();
		storage.values.set(INTERFACE_FONT_STORAGE_KEY, "Bad; injection");
		const dispose = initInterfaceFont(storage);
		expect(readInterfaceFont()).toBeNull();
		dispose();
	});
});

describe("the installed font list", () => {
	it("takes the host bridge when the desktop shell provides one", async () => {
		const bridge = {
			list: async () => ["Songti SC", "Inter", "Inter"],
		};
		Object.defineProperty(globalThis, SYSTEM_FONTS_GLOBAL, { value: bridge, configurable: true });
		try {
			expect(getNativeFontBridge(bridge)).toBe(bridge);
			expect(await listInstalledFonts()).toEqual(["Inter", "Songti SC"]);
		} finally {
			Reflect.deleteProperty(globalThis, SYSTEM_FONTS_GLOBAL);
		}
	});

	it("answers with no rows when the bridge fails or no source exists", async () => {
		Object.defineProperty(globalThis, SYSTEM_FONTS_GLOBAL, {
			value: {
				list: async () => {
					throw new Error("host gone");
				},
			},
			configurable: true,
		});
		try {
			expect(await listInstalledFonts()).toEqual([]);
		} finally {
			Reflect.deleteProperty(globalThis, SYSTEM_FONTS_GLOBAL);
		}
		expect(await listInstalledFonts()).toEqual([]);
	});

	it("uses queryLocalFonts in a browser without a native bridge", async () => {
		const globals = globalThis as typeof globalThis & { window?: unknown };
		const previous = globals.window;
		globals.window = {
			queryLocalFonts: async () => [
				{ family: "Inter" },
				{ family: "Inter" },
				{ family: "思源黑体" },
			],
		};
		try {
			expect(await listInstalledFonts()).toEqual(["Inter", "思源黑体"]);
		} finally {
			if (previous === undefined) Reflect.deleteProperty(globals, "window");
			else globals.window = previous;
		}
	});
});
