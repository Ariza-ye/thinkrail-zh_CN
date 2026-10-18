import { describe, expect, it } from "bun:test";
import { bytesSource, familiesFromFont } from "./fontNames";

interface NameSpec {
	platformId?: number;
	languageId?: number;
	nameId?: number;
	text: string;
}

function utf16be(text: string): Uint8Array {
	const bytes = new Uint8Array(text.length * 2);
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		bytes[index * 2] = code >> 8;
		bytes[index * 2 + 1] = code & 0xff;
	}
	return bytes;
}

function latin1(text: string): Uint8Array {
	return Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);
}

function nameTable(names: NameSpec[]): Uint8Array {
	const strings = names.map((name) =>
		(name.platformId ?? 3) === 1 ? latin1(name.text) : utf16be(name.text),
	);
	const storageOffset = 6 + names.length * 12;
	const total = storageOffset + strings.reduce((sum, bytes) => sum + bytes.byteLength, 0);
	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	view.setUint16(0, 0);
	view.setUint16(2, names.length);
	view.setUint16(4, storageOffset);
	let stringOffset = 0;
	names.forEach((name, index) => {
		const entry = 6 + index * 12;
		view.setUint16(entry, name.platformId ?? 3);
		view.setUint16(entry + 2, name.platformId === 1 ? 0 : 1);
		view.setUint16(entry + 4, name.languageId ?? 0x0409);
		view.setUint16(entry + 6, name.nameId ?? 1);
		view.setUint16(entry + 8, (strings[index] as Uint8Array).byteLength);
		view.setUint16(entry + 10, stringOffset);
		stringOffset += (strings[index] as Uint8Array).byteLength;
	});
	let cursor = storageOffset;
	for (const bytes of strings) {
		out.set(bytes, cursor);
		cursor += bytes.byteLength;
	}
	return out;
}

const SFNT_HEADER_AND_DIRECTORY = 12 + 16;

function sfnt(table: Uint8Array, base = 0): Uint8Array {
	const out = new Uint8Array(SFNT_HEADER_AND_DIRECTORY + table.byteLength);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x00010000);
	view.setUint16(4, 1);
	view.setUint32(12, 0x6e616d65);
	// In a collection every table offset is absolute from the start of the file.
	view.setUint32(20, base + SFNT_HEADER_AND_DIRECTORY);
	view.setUint32(24, table.byteLength);
	out.set(table, SFNT_HEADER_AND_DIRECTORY);
	return out;
}

function collection(tables: Uint8Array[]): Uint8Array {
	const headerSize = 12 + tables.length * 4;
	const offsets: number[] = [];
	let cursor = headerSize;
	for (const table of tables) {
		offsets.push(cursor);
		cursor += SFNT_HEADER_AND_DIRECTORY + table.byteLength;
	}
	const out = new Uint8Array(cursor);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x74746366);
	view.setUint32(4, 0x00010000);
	view.setUint32(8, tables.length);
	tables.forEach((table, index) => {
		const offset = offsets[index] as number;
		view.setUint32(12 + index * 4, offset);
		out.set(sfnt(table, offset), offset);
	});
	return out;
}

describe("familiesFromFont", () => {
	it("reads the typographic family of a bare font file", async () => {
		const bytes = sfnt(nameTable([{ nameId: 16, text: "Geist Variable" }]));
		expect(await familiesFromFont(bytesSource(bytes))).toEqual(["Geist Variable"]);
	});

	it("prefers the typographic family over the legacy family", async () => {
		const bytes = sfnt(
			nameTable([
				{ nameId: 1, text: "Avenir Legacy" },
				{ nameId: 16, text: "Avenir Next" },
			]),
		);
		expect(await familiesFromFont(bytesSource(bytes))).toEqual(["Avenir Next"]);
	});

	it("falls back to the legacy family when no typographic name exists", async () => {
		const bytes = sfnt(nameTable([{ nameId: 1, text: "Avenir" }]));
		expect(await familiesFromFont(bytesSource(bytes))).toEqual(["Avenir"]);
	});

	it("decodes a Macintosh-platform record as single-byte text", async () => {
		const bytes = sfnt(nameTable([{ platformId: 1, languageId: 0, nameId: 1, text: "Helvetica" }]));
		expect(await familiesFromFont(bytesSource(bytes))).toEqual(["Helvetica"]);
	});

	it("reads every face of a collection and keeps non-Latin names intact", async () => {
		const bytes = collection([
			nameTable([{ nameId: 16, text: "Songti SC" }]),
			nameTable([{ nameId: 16, text: "华文宋体" }]),
		]);
		expect(await familiesFromFont(bytesSource(bytes))).toEqual(["Songti SC", "华文宋体"]);
	});

	it("returns nothing for a file that is not a font", async () => {
		expect(await familiesFromFont(bytesSource(new Uint8Array(64)))).toEqual([]);
		expect(await familiesFromFont(bytesSource(Uint8Array.from([1, 2])))).toEqual([]);
	});
});
