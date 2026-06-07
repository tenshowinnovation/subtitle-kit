import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { SubtitleParseError } from "../types";

/** Coerce an arbitrary parsed object into a well-formed cue. */
export function toCue(value: unknown, fallbackIndex: number): SubtitleCue {
	const obj = (value ?? {}) as Record<string, unknown>;
	const cue: SubtitleCue = {
		index: typeof obj.index === "number" ? obj.index : fallbackIndex,
		start: Number(obj.start ?? 0),
		end: Number(obj.end ?? 0),
		text: typeof obj.text === "string" ? obj.text : String(obj.text ?? ""),
	};
	if (typeof obj.voice === "string") {
		cue.voice = obj.voice;
	}
	if (obj.styles && typeof obj.styles === "object") {
		cue.styles = obj.styles as Record<string, string>;
	}
	return cue;
}

function parse(input: string): SubtitleDocument {
	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch (cause) {
		throw new SubtitleParseError("Invalid JSON", { cause });
	}

	if (Array.isArray(data)) {
		return { format: "json", cues: data.map(toCue), meta: {} };
	}

	const obj = (data ?? {}) as Record<string, unknown>;
	const cues = Array.isArray(obj.cues) ? obj.cues.map(toCue) : [];
	const meta =
		obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, string>) : {};
	return { format: "json", cues, meta };
}

function stringify(doc: SubtitleDocument): string {
	return JSON.stringify({ format: "json", meta: doc.meta, cues: doc.cues }, undefined, 2) + "\n";
}

function detect(input: string): boolean {
	const trimmed = input.trimStart();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
		return false;
	}
	// A JSON array document spans multiple lines or holds multiple objects;
	// distinguish from JSONL by requiring it to parse as a single value.
	try {
		const data = JSON.parse(input);
		if (Array.isArray(data)) {
			return true;
		}
		return typeof data === "object" && data !== null && "cues" in data;
	} catch {
		return false;
	}
}

export const json: FormatHandler = {
	name: "json",
	extensions: ["json"],
	detect,
	parse,
	stringify,
};
