import { formatTimestamp, parseTimestamp } from "../time";
import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { normalizeInput, splitBlocks } from "./shared";

const TIMING = /^(.+?)\s*-->\s*(.+?)\s*$/;

/**
 * Parse a single blank-line-delimited SubRip block into a cue, or `null` when
 * the block has no timing line. Shared by the buffered parser and the
 * streaming parser so both behave identically.
 */
export function parseSrtBlock(block: string, fallbackIndex: number): SubtitleCue | null {
	const lines = block.split("\n");
	let cursor = 0;

	// An optional numeric index line precedes the timing line.
	let index: number | undefined;
	if (/^\d+$/.test(lines[cursor]?.trim() ?? "")) {
		index = Number(lines[cursor].trim());
		cursor++;
	}

	const timing = TIMING.exec(lines[cursor] ?? "");
	if (!timing) {
		return null;
	}
	cursor++;

	return {
		index: index ?? fallbackIndex,
		start: parseTimestamp(timing[1]),
		end: parseTimestamp(timing[2]),
		text: lines.slice(cursor).join("\n").trim(),
	};
}

/** Serialize one cue as a SubRip block (without the trailing separator). */
export function formatSrtCue(cue: SubtitleCue, displayIndex: number): string {
	const start = formatTimestamp(cue.start, "srt");
	const end = formatTimestamp(cue.end, "srt");
	return `${displayIndex}\n${start} --> ${end}\n${cue.text}`;
}

function parse(input: string): SubtitleDocument {
	const cues: SubtitleCue[] = [];
	for (const block of splitBlocks(normalizeInput(input))) {
		const cue = parseSrtBlock(block, cues.length + 1);
		if (cue) {
			cues.push(cue);
		}
	}
	return { format: "srt", cues, meta: {} };
}

function stringify(doc: SubtitleDocument): string {
	return doc.cues.map((cue, i) => formatSrtCue(cue, i + 1)).join("\n\n") + "\n";
}

function detect(input: string): boolean {
	const text = normalizeInput(input).trimStart();
	if (text.startsWith("WEBVTT")) {
		return false;
	}
	// SubRip timing uses comma decimal separators in the cue arrow line.
	return /\d{1,2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{3}/.test(text);
}

export const srt: FormatHandler = {
	name: "srt",
	extensions: ["srt"],
	detect,
	parse,
	stringify,
};
