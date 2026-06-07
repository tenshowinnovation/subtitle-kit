import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { SubtitleParseError } from "../types";
import { toCue } from "./json";

/** Parse one JSONL line into a cue. Throws on invalid JSON. */
export function parseJsonlLine(
	line: string,
	fallbackIndex: number,
	lineNumber?: number,
): SubtitleCue {
	try {
		return toCue(JSON.parse(line), fallbackIndex);
	} catch (cause) {
		const where = lineNumber === undefined ? "" : ` on line ${lineNumber}`;
		throw new SubtitleParseError(`Invalid JSON${where}`, { line: lineNumber, cause });
	}
}

/** Serialize one cue as a compact JSON object (one JSONL line). */
export function formatJsonlCue(cue: SubtitleCue): string {
	return JSON.stringify({
		index: cue.index,
		start: cue.start,
		end: cue.end,
		text: cue.text,
		...(cue.voice ? { voice: cue.voice } : {}),
		...(cue.styles ? { styles: cue.styles } : {}),
	});
}

function parse(input: string): SubtitleDocument {
	const cues: SubtitleCue[] = [];
	const lines = input.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === "") {
			continue;
		}
		cues.push(parseJsonlLine(line, cues.length + 1, i + 1));
	}

	return { format: "jsonl", cues, meta: {} };
}

function stringify(doc: SubtitleDocument): string {
	return doc.cues.map((cue) => formatJsonlCue(cue)).join("\n") + "\n";
}

function detect(input: string): boolean {
	const lines = input.split("\n").filter((l) => l.trim() !== "");
	if (lines.length === 0) {
		return false;
	}
	// Every non-blank line must independently parse as a JSON object.
	return lines.every((line) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) {
			return false;
		}
		try {
			const value = JSON.parse(trimmed);
			// A cue object, not a wrapping document (which carries a `cues` array).
			return (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value) &&
				!("cues" in value)
			);
		} catch {
			return false;
		}
	});
}

export const jsonl: FormatHandler = {
	name: "jsonl",
	extensions: ["jsonl", "ndjson"],
	detect,
	parse,
	stringify,
};
