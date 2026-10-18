import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { zhCNMessages } from "./index";
import chat from "./messages/chat";
import panels from "./messages/panels";
import settings from "./messages/settings";
import shell from "./messages/shell";
import transport from "./messages/transport";

function placeholders(message: string): string[] {
	return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return sources(path);
		return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
	});
}

test("Simplified Chinese messages preserve interpolation parameters", () => {
	for (const [source, translated] of Object.entries(zhCNMessages)) {
		expect(translated.trim(), source).not.toBe("");
		expect(placeholders(translated), source).toEqual(placeholders(source));
	}
});

test("one source message has exactly one Simplified Chinese translation", () => {
	const seen = new Map<string, string>();
	const conflicts: string[] = [];
	for (const catalog of [settings, panels, chat, shell, transport]) {
		for (const [source, translated] of Object.entries(catalog)) {
			const earlier = seen.get(source);
			if (earlier !== undefined && earlier !== translated) conflicts.push(source);
			seen.set(source, translated);
		}
	}
	expect(conflicts).toEqual([]);
});

test("every literal translation call has a Simplified Chinese catalog entry", () => {
	const missing: string[] = [];
	for (const directory of [
		"..",
		"../../../../packages/ui",
		"../../../../thinkrail-extensions/visualize/web",
	]) {
		for (const path of sources(resolve(import.meta.dir, directory))) {
			if (path.includes("/i18n/messages/")) continue;
			const source = ts.createSourceFile(
				path,
				readFileSync(path, "utf8"),
				ts.ScriptTarget.Latest,
				true,
			);
			const visit = (node: ts.Node) => {
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					["t", "translate"].includes(node.expression.text)
				) {
					const message = node.arguments[0];
					if (
						message &&
						ts.isStringLiteralLike(message) &&
						!Object.hasOwn(zhCNMessages, message.text)
					) {
						const line = source.getLineAndCharacterOfPosition(message.getStart()).line + 1;
						missing.push(`${path}:${line} ${message.text}`);
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
	}
	expect(missing).toEqual([]);
});
