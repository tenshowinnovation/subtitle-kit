import { ass } from "./formats/ass";
import { json } from "./formats/json";
import { jsonl } from "./formats/jsonl";
import { lrc } from "./formats/lrc";
import { sbv } from "./formats/sbv";
import { srt } from "./formats/srt";
import { txt } from "./formats/txt";
import { vtt } from "./formats/vtt";
import type { FormatHandler, SubtitleDocument, SubtitleFormat } from "./types";
import { SubtitleParseError } from "./types";

/**
 * All format handlers, in auto-detection priority order. More specific or
 * signature-bearing formats come first so they win over looser matchers.
 */
const HANDLERS: readonly FormatHandler[] = [vtt, srt, sbv, ass, lrc, json, jsonl, txt];

const BY_NAME = new Map<SubtitleFormat, FormatHandler>(HANDLERS.map((h) => [h.name, h]));
// SSA is an alias of the ASS handler.
BY_NAME.set("ssa", ass);

/** Every format name the library can read or write. */
export function listFormats(): SubtitleFormat[] {
	return [...BY_NAME.keys()];
}

/** Look up a handler by format name; throws if the format is unknown. */
export function getHandler(format: SubtitleFormat): FormatHandler {
	const handler = BY_NAME.get(format);
	if (!handler) {
		throw new SubtitleParseError(`Unknown subtitle format: "${format}"`);
	}
	return handler;
}

/** Resolve a format from a filename or extension (e.g. `movie.srt`, `.vtt`). */
export function formatFromExtension(fileOrExt: string): SubtitleFormat | null {
	const ext = fileOrExt.split(".").pop()?.toLowerCase().trim() ?? "";
	for (const handler of HANDLERS) {
		if (handler.extensions.includes(ext)) {
			return handler.name;
		}
	}
	return null;
}

/** Heuristically detect the format of subtitle text, or `null` if unknown. */
export function detectFormat(input: string): SubtitleFormat | null {
	for (const handler of HANDLERS) {
		if (handler.detect(input)) {
			return handler.name;
		}
	}
	return null;
}

/**
 * Parse subtitle text into the canonical document model.
 * Auto-detects the format unless `options.format` forces one.
 */
export function parse(input: string, options: { format?: SubtitleFormat } = {}): SubtitleDocument {
	const format = options.format ?? detectFormat(input);
	if (!format) {
		throw new SubtitleParseError("Could not detect subtitle format; pass `format` explicitly");
	}
	return getHandler(format).parse(input);
}

/** Serialize a document to text, optionally targeting a different format. */
export function stringify(doc: SubtitleDocument, format?: SubtitleFormat): string {
	return getHandler(format ?? doc.format).stringify(doc);
}

/**
 * Convert subtitle text from one format to another in a single call.
 * The source format is auto-detected unless `options.from` is given.
 */
export function convert(
	input: string,
	to: SubtitleFormat,
	options: { from?: SubtitleFormat } = {},
): string {
	const doc = parse(input, { format: options.from });
	return getHandler(to).stringify({ ...doc, format: to });
}
