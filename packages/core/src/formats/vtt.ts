import { formatTimestamp, parseTimestamp } from "../time";
import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { SubtitleParseError } from "../types";
import { normalizeInput, splitBlocks } from "./shared";

const TIMING = /^(\S+)\s*-->\s*(\S+)(?:\s+(.*))?$/;
const VOICE = /<v(?:\.\S+)?\s+([^>]+)>/;

/** Whether a block is the leading WEBVTT signature block. */
export function isVttSignature(block: string): boolean {
	return /^﻿?WEBVTT(?:[ \t\n]|$)/.test(block.trimStart());
}

/** Extract header metadata from the leading WEBVTT block. */
export function parseVttHeader(block: string): Record<string, string> {
	const meta: Record<string, string> = {};
	const header = block.trimStart().slice("WEBVTT".length).trim();
	if (header) {
		meta.header = header.replace(/^-\s*/, "");
	}
	return meta;
}

/** Parse one non-header VTT block into a cue, or `null` for NOTE/STYLE/etc. */
export function parseVttBlock(block: string, fallbackIndex: number): SubtitleCue | null {
	const lines = block.split("\n");

	// NOTE blocks and STYLE/REGION blocks are not cues.
	if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) {
		return null;
	}

	// An optional identifier line precedes the timing line.
	let cursor = 0;
	let id: string | undefined;
	if (!TIMING.test(lines[0]) && lines[1] !== undefined && TIMING.test(lines[1])) {
		id = lines[0].trim();
		cursor = 1;
	}

	const timing = TIMING.exec(lines[cursor] ?? "");
	if (!timing) {
		return null;
	}
	cursor++;

	const rawText = lines.slice(cursor).join("\n");
	const styles: Record<string, string> = {};
	if (id) {
		styles.id = id;
	}
	if (timing[3]) {
		styles.settings = timing[3].trim();
	}

	const voice = VOICE.exec(rawText)?.[1]?.trim();
	return {
		index: fallbackIndex,
		start: parseTimestamp(timing[1]),
		end: parseTimestamp(timing[2]),
		text: stripMarkup(rawText),
		...(voice ? { voice } : {}),
		...(Object.keys(styles).length > 0 ? { styles } : {}),
	};
}

/** The WEBVTT signature line for the given document metadata. */
export function vttHeaderLine(meta: Record<string, string>): string {
	return meta.header ? `WEBVTT - ${meta.header}` : "WEBVTT";
}

/** Serialize one cue as a WebVTT block (without the trailing separator). */
export function formatVttCue(cue: SubtitleCue): string {
	const lines: string[] = [];
	if (cue.styles?.id) {
		lines.push(cue.styles.id);
	}
	const start = formatTimestamp(cue.start, "vtt");
	const end = formatTimestamp(cue.end, "vtt");
	const settings = cue.styles?.settings ? ` ${cue.styles.settings}` : "";
	lines.push(`${start} --> ${end}${settings}`);
	lines.push(cue.voice ? `<v ${cue.voice}>${cue.text}</v>` : cue.text);
	return lines.join("\n");
}

function parse(input: string): SubtitleDocument {
	const text = normalizeInput(input);
	if (!isVttSignature(text)) {
		throw new SubtitleParseError("Missing WEBVTT signature");
	}

	const blocks = splitBlocks(text);
	const meta = blocks.length > 0 ? parseVttHeader(blocks[0]) : {};
	const cues: SubtitleCue[] = [];

	for (const block of blocks.slice(1)) {
		const cue = parseVttBlock(block, cues.length + 1);
		if (cue) {
			cues.push(cue);
		}
	}

	return { format: "vtt", cues, meta };
}

function stripMarkup(text: string): string {
	return text.replace(/<\/?[^>]+>/g, "").trim();
}

function stringify(doc: SubtitleDocument): string {
	const header = vttHeaderLine(doc.meta);
	const body = doc.cues.map((cue) => formatVttCue(cue)).join("\n\n");
	return body ? `${header}\n\n${body}\n` : `${header}\n`;
}

function detect(input: string): boolean {
	return /^﻿?WEBVTT(?:[ \t\n]|$)/.test(normalizeInput(input).trimStart());
}

export const vtt: FormatHandler = {
	name: "vtt",
	extensions: ["vtt"],
	detect,
	parse,
	stringify,
};
