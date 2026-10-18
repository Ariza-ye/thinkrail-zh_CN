import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandWildcards, listSystemFonts, systemFontDirectories } from "./systemFonts";

describe("systemFontDirectories", () => {
	it("covers the user, local and system font locations per platform", () => {
		expect(systemFontDirectories("darwin", "/Users/me", {})).toEqual([
			"/Users/me/Library/Fonts",
			"/Library/Fonts",
			"/System/Library/Fonts",
			"/System/Library/Fonts/Supplemental",
			"/System/Library/AssetsV2/com_apple_MobileAsset_Font*",
		]);
		expect(systemFontDirectories("win32", "C:\\Users\\me", { WINDIR: "D:\\Windows" })).toEqual([
			"D:\\Windows\\Fonts",
			"C:\\Users\\me\\AppData\\Local\\Microsoft\\Windows\\Fonts",
		]);
		expect(systemFontDirectories("linux", "/home/me", {})).toEqual([
			"/home/me/.fonts",
			"/home/me/.local/share/fonts",
			"/usr/local/share/fonts",
			"/usr/share/fonts",
		]);
	});
});

describe("listSystemFonts", () => {
	const deps = (families: Record<string, string[]>) => ({
		platform: "darwin" as const,
		home: "/Users/me",
		env: {},
		files: async (directory: string) =>
			Object.keys(families).filter((path) => path.startsWith(`${directory}/`)),
		readFamilies: async (path: string) => families[path] ?? [],
	});

	it("dedupes, sorts and drops Apple's private faces", async () => {
		const families = await listSystemFonts(
			deps({
				"/System/Library/Fonts/a.ttc": ["Songti SC", "PingFang SC", ".Hiragino Interface"],
				"/System/Library/Fonts/b.ttf": ["PingFang SC", "Avenir"],
			}),
		);
		expect(families).toEqual(["Avenir", "PingFang SC", "Songti SC"]);
	});

	it("survives a font file that cannot be read", async () => {
		const families = await listSystemFonts({
			platform: "linux",
			home: "/home/me",
			env: {},
			files: async (directory) =>
				directory === "/usr/share/fonts"
					? ["/usr/share/fonts/ok.ttf", "/usr/share/fonts/x.ttf"]
					: [],
			readFamilies: async (path) => {
				if (path.endsWith("x.ttf")) throw new Error("EACCES");
				return ["Inter"];
			},
		});
		expect(families).toEqual(["Inter"]);
	});

	it("returns an empty list when no font directory exists", async () => {
		expect(
			await listSystemFonts({
				platform: "linux",
				home: "/home/me",
				env: {},
				files: async () => [],
				readFamilies: async () => [],
			}),
		).toEqual([]);
	});
});

describe("expandWildcards", () => {
	it("resolves one star segment against the real directory listing", async () => {
		const root = await mkdtemp(join(tmpdir(), "tr-fonts-"));
		try {
			await mkdir(join(root, "com_apple_MobileAsset_Font8", "AssetData"), { recursive: true });
			await mkdir(join(root, "com_apple_MobileAsset_Other", "AssetData"), { recursive: true });
			await writeFile(join(root, "com_apple_MobileAsset_Font8", "AssetData", "PingFang.ttc"), "x");
			expect(await expandWildcards(`${root}/com_apple_MobileAsset_Font*`)).toEqual([
				`${root}/com_apple_MobileAsset_Font8`,
			]);
			expect(await expandWildcards(`${root}/nothing*`)).toEqual([]);
			expect(await expandWildcards(`${root}/com_apple_MobileAsset_Font8`)).toEqual([
				`${root}/com_apple_MobileAsset_Font8`,
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
