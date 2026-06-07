import { formatTimestamp, parseTimestamp } from "../time";
import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { normalizeInput, splitBlocks } from "./shared";

const TIMING = /^(\d{1,2}:\d{2}:\d{2}\.\d{1,3})\s*,\s*(\d{1,2}:\d{2}:\d{2}\.\d{1,3})$/;

/** Parse one SBV block into a cue, or `null` when it has no timing line. */
export function parseSbvBlock(block: string, fallbackIndex: number): SubtitleCue | null {
	const lines = block.split("\n");
	const timing = TIMING.exec(lines[0]?.trim() ?? "");
	if (!timing) {
		return null;
	}
	return {
		index: fallbackIndex,
		start: parseTimestamp(timing[1]),
		end: parseTimestamp(timing[2]),
		text: lines.slice(1).join("\n").trim(),
	};
}

/** Serialize one cue as an SBV block (without the trailing separator). */
export function formatSbvCue(cue: SubtitleCue): string {
	const start = formatTimestamp(cue.start, "sbv");
	const end = formatTimestamp(cue.end, "sbv");
	return `${start},${end}\n${cue.text}`;
}

function parse(input: string): SubtitleDocument {
	const cues: SubtitleCue[] = [];
	for (const block of splitBlocks(normalizeInput(input))) {
		const cue = parseSbvBlock(block, cues.length + 1);
		if (cue) {
			cues.push(cue);
		}
	}
	return { format: "sbv", cues, meta: {} };
}

function stringify(doc: SubtitleDocument): string {
	return doc.cues.map((cue) => formatSbvCue(cue)).join("\n\n") + "\n";
}

function detect(input: string): boolean {
	return /^\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{1,3}/m.test(
		normalizeInput(input),
	);
}

export const sbv: FormatHandler = {
	name: "sbv",
	extensions: ["sbv"],
	detect,
	parse,
	stringify,
};
