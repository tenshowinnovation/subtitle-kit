import { formatTimestamp, parseTimestamp } from "../time";
import type { FormatHandler, SubtitleCue, SubtitleDocument } from "../types";
import { normalizeInput } from "./shared";

const DEFAULT_EVENT_FORMAT = [
	"Layer",
	"Start",
	"End",
	"Style",
	"Name",
	"MarginL",
	"MarginR",
	"MarginV",
	"Effect",
	"Text",
];

/** Result of feeding one line to the incremental ASS parser. */
export interface AssLineResult {
	/** A `[Script Info]` key/value pair to merge into document metadata. */
	meta?: Record<string, string>;
	/** A parsed `Dialogue` cue. */
	cue?: SubtitleCue;
}

/**
 * Create a stateful line consumer that tracks the current section and the
 * `[Events]` Format line. Shared by the buffered and streaming parsers so both
 * resolve Dialogue fields identically.
 */
export function createAssLineParser(): { line(rawLine: string): AssLineResult | null } {
	let section = "";
	let eventFormat = DEFAULT_EVENT_FORMAT;
	let count = 0;

	return {
		line(rawLine: string): AssLineResult | null {
			const line = rawLine.trim();
			if (line === "" || line.startsWith(";")) {
				return null;
			}

			const sectionMatch = /^\[(.+)\]$/.exec(line);
			if (sectionMatch) {
				section = sectionMatch[1].toLowerCase();
				return null;
			}

			const colon = line.indexOf(":");
			if (colon === -1) {
				return null;
			}
			const key = line.slice(0, colon).trim();
			const value = line.slice(colon + 1).trim();

			if (section === "script info") {
				return { meta: { [key]: value } };
			}
			if (key === "Format") {
				if (section === "events") {
					eventFormat = value.split(",").map((f) => f.trim());
				}
				return null;
			}
			if (section === "events" && key === "Dialogue") {
				return { cue: parseDialogue(value, eventFormat, ++count) };
			}
			return null;
		},
	};
}

function parse(input: string): SubtitleDocument {
	const parser = createAssLineParser();
	const meta: Record<string, string> = {};
	const cues: SubtitleCue[] = [];

	for (const rawLine of normalizeInput(input).split("\n")) {
		const result = parser.line(rawLine);
		if (result?.meta) {
			Object.assign(meta, result.meta);
		}
		if (result?.cue) {
			cues.push(result.cue);
		}
	}

	return { format: "ass", cues, meta };
}

function parseDialogue(value: string, format: string[], index: number): SubtitleCue {
	// The trailing Text field may itself contain commas, so split only up to
	// the number of fields the Format line declares.
	const parts = value.split(",");
	const fields: Record<string, string> = {};
	for (let i = 0; i < format.length; i++) {
		fields[format[i]] = i === format.length - 1 ? parts.slice(i).join(",") : (parts[i] ?? "");
	}

	const styles: Record<string, string> = {};
	if (fields.Style) {
		styles.style = fields.Style;
	}
	if (fields.Layer) {
		styles.layer = fields.Layer;
	}

	const voice = fields.Name?.trim();
	return {
		index,
		start: parseTimestamp(fields.Start ?? "0"),
		end: parseTimestamp(fields.End ?? "0"),
		text: decodeText(fields.Text ?? ""),
		...(voice ? { voice } : {}),
		...(Object.keys(styles).length > 0 ? { styles } : {}),
	};
}

function decodeText(text: string): string {
	return text
		.replace(/\{[^}]*\}/g, "") // drawing/override blocks
		.replace(/\\N/g, "\n")
		.replace(/\\n/g, "\n")
		.replace(/\\h/g, " ")
		.trim();
}

function encodeText(text: string): string {
	return text.replace(/\n/g, "\\N");
}

/** Serialize one cue as an ASS `Dialogue:` line. */
export function formatAssDialogue(cue: SubtitleCue): string {
	const start = formatTimestamp(cue.start, "ass");
	const end = formatTimestamp(cue.end, "ass");
	const style = cue.styles?.style ?? "Default";
	const layer = cue.styles?.layer ?? "0";
	const name = cue.voice ?? "";
	return `Dialogue: ${layer},${start},${end},${style},${name},0,0,0,,${encodeText(cue.text)}`;
}

/**
 * The `[Script Info]` + `[Events]` header block that precedes Dialogue lines,
 * ending with a newline so a Dialogue line can follow directly.
 */
export function assHeaderPrefix(meta: Record<string, string>): string {
	const scriptInfo = Object.entries(meta)
		.map(([k, v]) => `${k}: ${v}`)
		.join("\n");
	const eventsHeader = `Format: ${DEFAULT_EVENT_FORMAT.join(", ")}`;
	return `[Script Info]\n${scriptInfo || "ScriptType: v4.00+"}\n\n[Events]\n${eventsHeader}\n`;
}

function stringify(doc: SubtitleDocument): string {
	const dialogues = doc.cues.map((cue) => formatAssDialogue(cue)).join("\n");
	return `${assHeaderPrefix(doc.meta)}${dialogues}\n`;
}

function detect(input: string): boolean {
	const text = normalizeInput(input);
	return (
		/\[Script Info\]/i.test(text) || /\[V4\+? Styles\]/i.test(text) || /^Dialogue:/m.test(text)
	);
}

export const ass: FormatHandler = {
	name: "ass",
	extensions: ["ass", "ssa"],
	detect,
	parse,
	stringify,
};
