import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { normalizeInput, splitBlocks } from "./shared";

/** Build an untimed cue from one text block. */
export function parseTxtBlock(block: string, fallbackIndex: number): SubtitleCue {
	return { index: fallbackIndex, start: 0, end: 0, text: block.trim() };
}

function parse(input: string): SubtitleDocument {
	const cues: SubtitleCue[] = splitBlocks(normalizeInput(input)).map((text, i) =>
		parseTxtBlock(text, i + 1),
	);
	return { format: "txt", cues, meta: {} };
}

function stringify(doc: SubtitleDocument): string {
	return doc.cues.map((cue) => cue.text).join("\n\n") + "\n";
}

/**
 * Plain text is the universal fallback: it carries no timing markers, so it is
 * never auto-detected (it would shadow every other format). Use it explicitly.
 */
function detect(): boolean {
	return false;
}

export const txt: FormatHandler = {
	name: "txt",
	extensions: ["txt"],
	detect,
	parse,
	stringify,
};
