const TAG_TTCF = 0x74746366;
const TAG_OTTO = 0x4f54544f;
const TAG_TRUE = 0x74727565;
const TAG_V1 = 0x00010000;
const TAG_NAME = 0x6e616d65;
const TYPOGRAPHIC_FAMILY = 16;
const FAMILY = 1;
const WINDOWS_ENGLISH = 0x0409;
const MAX_TTC_FONTS = 64;
const HEADER_BYTES = 12;
const SUPPORTED_PLATFORMS = new Set([0, 1, 3]);

/**
 * Random access over a font file. A `.ttc` collection can be hundreds of megabytes and its `name`
 * tables sit at arbitrary offsets, so the reader never loads a whole file.
 */
export interface FontByteSource {
	read(offset: number, length: number): Promise<DataView>;
}

export function bytesSource(bytes: Uint8Array): FontByteSource {
	return {
		read: async (offset, length) => {
			if (offset >= bytes.byteLength) return new DataView(new ArrayBuffer(0));
			const end = Math.min(offset + length, bytes.byteLength);
			return new DataView(bytes.buffer, bytes.byteOffset + offset, end - offset);
		},
	};
}

function isSfnt(tag: number): boolean {
	return tag === TAG_V1 || tag === TAG_OTTO || tag === TAG_TRUE;
}

function decodeUtf16Be(view: DataView): string {
	let out = "";
	for (let offset = 0; offset + 1 < view.byteLength; offset += 2)
		out += String.fromCharCode(view.getUint16(offset));
	return out.trim();
}

function decodeName(view: DataView, platformId: number): string {
	if (platformId === 1) {
		let latin = "";
		for (let offset = 0; offset < view.byteLength; offset += 1)
			latin += String.fromCharCode(view.getUint8(offset));
		return latin.trim();
	}
	return decodeUtf16Be(view);
}

interface NameRecord {
	nameId: number;
	platformId: number;
	languageId: number;
	length: number;
	offset: number;
}

function nameRank(record: NameRecord): number {
	if (!SUPPORTED_PLATFORMS.has(record.platformId)) return Number.POSITIVE_INFINITY;
	const english = record.platformId !== 1 && record.languageId === WINDOWS_ENGLISH;
	const macBonus = record.platformId === 1 ? 4 : 0;
	if (record.nameId === TYPOGRAPHIC_FAMILY) return macBonus + (english ? 0 : 1);
	return macBonus + (english ? 2 : 3);
}

async function pickFamilyName(
	source: FontByteSource,
	nameTableStart: number,
): Promise<string | null> {
	const head = await source.read(nameTableStart, 6);
	if (head.byteLength < 6) return null;
	const recordCount = head.getUint16(2);
	const storage = nameTableStart + head.getUint16(4);
	const table = await source.read(nameTableStart + 6, recordCount * 12);
	const records: NameRecord[] = [];
	for (let index = 0; index < recordCount; index += 1) {
		const entry = index * 12;
		if (entry + 12 > table.byteLength) break;
		records.push({
			platformId: table.getUint16(entry),
			languageId: table.getUint16(entry + 4),
			nameId: table.getUint16(entry + 6),
			length: table.getUint16(entry + 8),
			offset: table.getUint16(entry + 10),
		});
	}
	const candidates = records
		.filter((record) => record.nameId === TYPOGRAPHIC_FAMILY || record.nameId === FAMILY)
		.sort((left, right) => nameRank(left) - nameRank(right));
	for (const record of candidates) {
		const text = decodeName(
			await source.read(storage + record.offset, record.length),
			record.platformId,
		);
		if (text.length > 0) return text;
	}
	return null;
}

async function familyOfSfnt(source: FontByteSource, base: number): Promise<string | null> {
	const header = await source.read(base, HEADER_BYTES);
	if (header.byteLength < HEADER_BYTES || !isSfnt(header.getUint32(0))) return null;
	const directory = await source.read(base + HEADER_BYTES, header.getUint16(4) * 16);
	for (let index = 0; index < directory.byteLength; index += 16) {
		if (directory.getUint32(index) !== TAG_NAME) continue;
		// In a `.ttc` collection every table offset is absolute from the start of the file, not from the face.
		return pickFamilyName(source, directory.getUint32(index + 8));
	}
	return null;
}

/**
 * The family names an sfnt container declares — a bare `.ttf`/`.otf`, or every face inside a `.ttc`
 * collection. Only the table directory and the `name` tables are read.
 */
export async function familiesFromFont(source: FontByteSource): Promise<string[]> {
	const header = await source.read(0, HEADER_BYTES);
	if (header.byteLength < HEADER_BYTES) return [];
	if (header.getUint32(0) !== TAG_TTCF) {
		const family = await familyOfSfnt(source, 0);
		return family ? [family] : [];
	}
	const count = Math.min((await source.read(8, 4)).getUint32(0), MAX_TTC_FONTS);
	const offsets = await source.read(12, count * 4);
	const families: string[] = [];
	for (let index = 0; index < count; index += 1) {
		if (index * 4 + 4 > offsets.byteLength) break;
		const family = await familyOfSfnt(source, offsets.getUint32(index * 4));
		if (family) families.push(family);
	}
	return families;
}
