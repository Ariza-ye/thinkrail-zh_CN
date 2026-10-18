import { readFileSync } from "node:fs";

const GENERATED = readFileSync(
	new URL("../../apps/web/src/styles/generated/typography.css", import.meta.url),
	"utf8",
);

function bundledFace(id: string): string {
	const match = GENERATED.match(new RegExp(`--tr-font-family-${id}:\\s*([^;]+);`));
	if (!match) throw new Error(`--tr-font-family-${id} is not in the generated typography CSS`);
	const value = (match[1] as string).trim();
	// A `userSelectable` family leads with `var(--…-font-user-<id>, "<bundled face>")`.
	const slot = value.match(/^var\(\s*[^,]+,\s*([^)]+)\)/);
	const head = slot ? (slot[1] as string) : (value.split(",")[0] as string);
	return head.trim().replace(/^"|"$/g, "");
}

export const INTERFACE_FACE = bundledFace("interface");
export const CODE_FACE = bundledFace("code");
export const BRAND_FACE = bundledFace("brand");
