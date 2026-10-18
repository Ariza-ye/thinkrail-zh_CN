import { type Dirent, constants as fsConstants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
import { type FontByteSource, familiesFromFont } from "./fontNames";

const FONT_EXTENSION = /\.(?:ttf|otf|ttc|otc)$/i;
const MAX_DEPTH = 4;
const MAX_FILES = 4096;
const READ_CONCURRENCY = 16;

export function systemFontDirectories(
	platform: NodeJS.Platform,
	home: string,
	env: Record<string, string | undefined>,
): string[] {
	const joinPath = platform === "win32" ? win32.join : posix.join;
	if (platform === "darwin")
		return [
			joinPath(home, "Library/Fonts"),
			"/Library/Fonts",
			"/System/Library/Fonts",
			"/System/Library/Fonts/Supplemental",
			// Apple ships many system faces — PingFang among them — as on-demand assets, not in Fonts/.
			"/System/Library/AssetsV2/com_apple_MobileAsset_Font*",
		];
	if (platform === "win32") {
		const windows = env.WINDIR ?? env.SystemRoot ?? "C:\\Windows";
		const local = env.LOCALAPPDATA ?? joinPath(home, "AppData", "Local");
		return [joinPath(windows, "Fonts"), joinPath(local, "Microsoft", "Windows", "Fonts")];
	}
	return [
		joinPath(home, ".fonts"),
		joinPath(home, ".local", "share", "fonts"),
		"/usr/local/share/fonts",
		"/usr/share/fonts",
	];
}

async function entriesAt(path: string): Promise<Dirent[]> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return [];
	}
}

/**
 * Expands one `*` segment per path, so a directory whose child names are hashes (Apple's font asset
 * bundles) can still be named once in the directory list.
 */
export async function expandWildcards(path: string): Promise<string[]> {
	const star = path.indexOf("*");
	if (star === -1) return [path];
	const slash = path.lastIndexOf("/", star);
	const prefix = slash === -1 ? "" : path.slice(0, slash);
	const next = path.indexOf("/", star);
	const segment = path.slice(slash + 1, next === -1 ? undefined : next);
	const rest = next === -1 ? "" : path.slice(next);
	const pattern = new RegExp(`^${segment.split("*").join(".*")}$`);
	const matches = (await entriesAt(prefix === "" ? "." : prefix))
		.filter((entry) => entry.isDirectory() && pattern.test(entry.name))
		.map((entry) => `${prefix}/${entry.name}${rest}`);
	return (await Promise.all(matches.map(expandWildcards))).flat();
}

async function fontFiles(directory: string, depth = 0): Promise<string[]> {
	const found: string[] = [];
	for (const entry of await entriesAt(directory)) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (depth < MAX_DEPTH) found.push(...(await fontFiles(path, depth + 1)));
		} else if (FONT_EXTENSION.test(entry.name)) found.push(path);
	}
	return found;
}

async function collectFontFiles(directory: string): Promise<string[]> {
	const expanded = await expandWildcards(directory);
	const nested = await Promise.all(expanded.map((path) => fontFiles(path)));
	return nested.flat();
}

async function readFontFamilies(path: string): Promise<string[]> {
	const handle = await open(path, fsConstants.O_RDONLY);
	try {
		const source: FontByteSource = {
			read: async (offset, length) => {
				const buffer = Buffer.alloc(length);
				const { bytesRead } = await handle.read(buffer, 0, length, offset);
				return new DataView(buffer.buffer, buffer.byteOffset, bytesRead);
			},
		};
		return await familiesFromFont(source);
	} finally {
		await handle.close();
	}
}

async function mapLimited<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;
	const worker = async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await run(items[index] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, worker));
	return results;
}

export interface SystemFontDeps {
	platform?: NodeJS.Platform;
	home?: string;
	env?: Record<string, string | undefined>;
	files?: (directory: string) => Promise<string[]>;
	readFamilies?: (path: string) => Promise<string[]>;
}

let cached: string[] | null = null;

/**
 * Every font family installed for this machine, sorted. Reads each font file's `name` table instead of
 * shelling out per platform: `system_profiler SPFontsDataType` answers this in ~11s on a font-rich macOS
 * install (past the native bridge's request timeout), and the Windows font registry yields display names
 * like "Microsoft YaHei & Microsoft YaHei UI (TrueType)" rather than families. Cost on macOS: ~400
 * families in ~30ms.
 */
export async function listSystemFonts(deps: SystemFontDeps = {}): Promise<string[]> {
	const cacheable = deps.platform === undefined && deps.files === undefined;
	if (cacheable && cached) return cached;
	const platform = deps.platform ?? process.platform;
	const home = deps.home ?? homedir();
	const readFamilies = deps.readFamilies ?? readFontFamilies;
	const collect = deps.files ?? collectFontFiles;
	const directories = systemFontDirectories(platform, home, deps.env ?? process.env);
	const files = (await Promise.all(directories.map((directory) => collect(directory))))
		.flat()
		.slice(0, MAX_FILES);
	const found = await mapLimited(files, async (file) => {
		try {
			return await readFamilies(file);
		} catch {
			return [];
		}
	});
	const families = new Set<string>();
	for (const family of found.flat()) {
		const name = family.trim();
		// A leading dot is Apple's marker for a private face the UI must never offer.
		if (name.length > 0 && !name.startsWith(".")) families.add(name);
	}
	const sorted = [...families].sort((left, right) => left.localeCompare(right));
	if (cacheable) cached = sorted;
	return sorted;
}

export function resetSystemFontCache(): void {
	cached = null;
}
