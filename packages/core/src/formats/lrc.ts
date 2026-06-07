import { formatTimestamp, parseTimestamp } from "../time";
import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { normalizeInput } from "./shared";

const TIME_TAG = /\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const ID_TAG = /^\[([a-zA-Z#]+):(.*)\]$/;

function parse(input: string): SubtitleDocument {
	const meta: Record<string, string> = {};
	const cues: SubtitleCue[] = [];

	for (const rawLine of normalizeInput(input).split("\n")) {
		const line = rawLine.trim();
		if (line === "") {
			continue;
		}

		// Identifier tags (e.g. [ti:...]) have a non-numeric key.
		const idMatch = ID_TAG.exec(line);
		if (idMatch && !/^\d/.test(idMatch[1])) {
			meta[idMatch[1]] = idMatch[2].trim();
			continue;
		}

		const times = [...line.matchAll(TIME_TAG)].map((m) => parseTimestamp(m[1]));
		if (times.length === 0) {
			continue;
		}
		const text = line.replace(TIME_TAG, "").trim();
		for (const start of times) {
			cues.push({ start, end: start, text });
		}
	}

	cues.sort((a, b) => a.start - b.start);
	for (let i = 0; i < cues.length; i++) {
		cues[i].index = i + 1;
		cues[i].end = cues[i + 1]?.start ?? cues[i].start;
	}

	return { format: "lrc", cues, meta };
}

function stringify(doc: SubtitleDocument): string {
	const tags = Object.entries(doc.meta).map(([k, v]) => `[${k}:${v}]`);
	const lines = doc.cues.map((cue) => `[${formatTimestamp(cue.start, "lrc")}]${cue.text}`);
	return [...tags, ...lines].join("\n") + "\n";
}

function detect(input: string): boolean {
	return /^\s*(\[[a-zA-Z#]+:.*\]\s*)*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(
		normalizeInput(input),
	);
}

export const lrc: FormatHandler = {
	name: "lrc",
	extensions: ["lrc"],
	detect,
	parse,
	stringify,
};
