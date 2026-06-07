import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { assHeaderPrefix, createAssLineParser, formatAssDialogue } from "./formats/ass";
import { formatJsonlCue, parseJsonlLine } from "./formats/jsonl";
import { formatSbvCue, parseSbvBlock } from "./formats/sbv";
import { formatSrtCue, parseSrtBlock } from "./formats/srt";
import { parseTxtBlock } from "./formats/txt";
import {
	formatVttCue,
	isVttSignature,
	parseVttBlock,
	parseVttHeader,
	vttHeaderLine,
} from "./formats/vtt";
import type { SubtitleCue, SubtitleFormat } from "./types";
import { SubtitleParseError } from "./types";

/**
 * A streamed subtitle is a flat sequence of nodes: at most one `header`
 * (document metadata) followed by `cue` nodes, emitted as they are parsed.
 * This mirrors the design popularized by subtitle.js and lets transforms run
 * with constant memory.
 */
export type StreamNode =
	| { type: "header"; data: Record<string, string> }
	| { type: "cue"; data: SubtitleCue };

/** Formats that can be parsed/serialized incrementally. */
const STREAMABLE: readonly SubtitleFormat[] = ["srt", "vtt", "sbv", "txt", "ass", "jsonl"];

/** Whether a format supports the streaming API (JSON and LRC do not). */
export function isStreamable(format: SubtitleFormat): boolean {
	return STREAMABLE.includes(format);
}

// --------------------------------------------------------------------------
// Incremental parsers: feed text records, get nodes. One factory per format.
// --------------------------------------------------------------------------

interface IncrementalParser {
	/** How the raw text is chunked before being fed to `push`. */
	readonly granularity: "block" | "line";
	push(unit: string): StreamNode[];
	flush(): StreamNode[];
}

/** Build a block-granularity parser from a `block -> cue | null` function. */
function blockParser(
	parseBlock: (block: string, fallbackIndex: number) => SubtitleCue | null,
): () => IncrementalParser {
	return () => {
		let count = 0;
		return {
			granularity: "block",
			push(block) {
				const cue = parseBlock(block, count + 1);
				if (!cue) {
					return [];
				}
				count++;
				return [{ type: "cue", data: cue }];
			},
			flush: () => [],
		};
	};
}

function vttParser(): IncrementalParser {
	let count = 0;
	let headerSeen = false;
	return {
		granularity: "block",
		push(block) {
			if (!headerSeen) {
				headerSeen = true;
				if (!isVttSignature(block)) {
					throw new SubtitleParseError("Missing WEBVTT signature");
				}
				return [{ type: "header", data: parseVttHeader(block) }];
			}
			const cue = parseVttBlock(block, count + 1);
			if (!cue) {
				return [];
			}
			count++;
			return [{ type: "cue", data: cue }];
		},
		flush() {
			if (!headerSeen) {
				throw new SubtitleParseError("Missing WEBVTT signature");
			}
			return [];
		},
	};
}

function assParser(): IncrementalParser {
	const lineParser = createAssLineParser();
	const meta: Record<string, string> = {};
	let headerEmitted = false;
	return {
		granularity: "line",
		push(line) {
			const result = lineParser.line(line);
			if (!result) {
				return [];
			}
			if (result.meta) {
				Object.assign(meta, result.meta);
			}
			if (!result.cue) {
				return [];
			}
			const nodes: StreamNode[] = [];
			if (!headerEmitted) {
				headerEmitted = true;
				nodes.push({ type: "header", data: { ...meta } });
			}
			nodes.push({ type: "cue", data: result.cue });
			return nodes;
		},
		flush() {
			if (!headerEmitted && Object.keys(meta).length > 0) {
				return [{ type: "header", data: { ...meta } }];
			}
			return [];
		},
	};
}

function jsonlParser(): IncrementalParser {
	let count = 0;
	return {
		granularity: "line",
		push(line) {
			const cue = parseJsonlLine(line, count + 1);
			count++;
			return [{ type: "cue", data: cue }];
		},
		flush: () => [],
	};
}

const PARSERS: Partial<Record<SubtitleFormat, () => IncrementalParser>> = {
	srt: blockParser(parseSrtBlock),
	sbv: blockParser(parseSbvBlock),
	txt: blockParser(parseTxtBlock),
	vtt: vttParser,
	ass: assParser,
	jsonl: jsonlParser,
};

// --------------------------------------------------------------------------
// Incremental serializers: feed nodes, get text. One codec per format.
// --------------------------------------------------------------------------

interface SerializeCodec {
	/** Prefix written before the first cue (e.g. `WEBVTT`); may be empty. */
	header(meta: Record<string, string>): string;
	/** Separator written between consecutive cues. */
	readonly separator: string;
	/** Serialize one cue given its 1-based display index. */
	cue(cue: SubtitleCue, displayIndex: number): string;
	/** Text appended after the last cue. */
	readonly trailing: string;
}

const SERIALIZERS: Partial<Record<SubtitleFormat, SerializeCodec>> = {
	srt: {
		header: () => "",
		separator: "\n\n",
		cue: (cue, i) => formatSrtCue(cue, i),
		trailing: "\n",
	},
	sbv: {
		header: () => "",
		separator: "\n\n",
		cue: (cue) => formatSbvCue(cue),
		trailing: "\n",
	},
	txt: {
		header: () => "",
		separator: "\n\n",
		cue: (cue) => cue.text,
		trailing: "\n",
	},
	jsonl: {
		header: () => "",
		separator: "\n",
		cue: (cue) => formatJsonlCue(cue),
		trailing: "\n",
	},
	vtt: {
		header: (meta) => `${vttHeaderLine(meta)}\n\n`,
		separator: "\n\n",
		cue: (cue) => formatVttCue(cue),
		trailing: "\n",
	},
	ass: {
		header: (meta) => assHeaderPrefix(meta),
		separator: "\n",
		cue: (cue) => formatAssDialogue(cue),
		trailing: "\n",
	},
};

// --------------------------------------------------------------------------
// Text chunking that survives chunk boundaries (CRLF, BOM, partial records).
// --------------------------------------------------------------------------

function createChunker(granularity: "block" | "line") {
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	let pendingCr = "";
	let first = true;
	const splitter = granularity === "block" ? /\n[ \t]*\n+/ : /\n/;

	function normalize(input: string | Buffer): string {
		let raw = pendingCr + (typeof input === "string" ? input : decoder.write(input));
		pendingCr = "";
		// Hold a trailing CR in case the LF arrives in the next chunk.
		if (raw.endsWith("\r")) {
			pendingCr = "\r";
			raw = raw.slice(0, -1);
		}
		return raw.replace(/\r\n?/g, "\n");
	}

	return {
		push(input: string | Buffer): string[] {
			let text = normalize(input);
			if (first) {
				text = text.replace(/^﻿/, "");
				first = false;
			}
			buffer += text;
			const parts = buffer.split(splitter);
			buffer = parts.pop() ?? "";
			return parts;
		},
		flush(): string[] {
			const tail = decoder.end();
			let text = pendingCr + tail;
			pendingCr = "";
			buffer += text.replace(/\r\n?/g, "\n");
			const remaining = buffer;
			buffer = "";
			return remaining === "" ? [] : buffer === "" ? [remaining] : [remaining];
		},
	};
}

/**
 * A Transform that parses a byte/text stream of `format` into `StreamNode`
 * objects. Throws if the format is not streamable.
 */
export function parseStream(format: SubtitleFormat): Transform {
	const factory = PARSERS[format];
	if (!factory) {
		throw new SubtitleParseError(`Streaming parse is not supported for "${format}"`);
	}
	const parser = factory();
	const chunker = createChunker(parser.granularity);

	return new Transform({
		readableObjectMode: true,
		transform(chunk, _encoding, callback) {
			try {
				for (const unit of chunker.push(chunk)) {
					if (unit.trim() === "") {
						continue;
					}
					for (const node of parser.push(unit)) {
						this.push(node);
					}
				}
				callback();
			} catch (error) {
				callback(error as Error);
			}
		},
		flush(callback) {
			try {
				for (const unit of chunker.flush()) {
					if (unit.trim() === "") {
						continue;
					}
					for (const node of parser.push(unit)) {
						this.push(node);
					}
				}
				for (const node of parser.flush()) {
					this.push(node);
				}
				callback();
			} catch (error) {
				callback(error as Error);
			}
		},
	});
}

// --------------------------------------------------------------------------
// Per-cue transform streams. Header nodes pass through untouched; cue nodes
// are mapped (or dropped) by `fn`, which receives a running 0-based cue index.
// --------------------------------------------------------------------------

function clampTime(ms: number): number {
	return Math.max(0, Math.round(ms));
}

/**
 * Build an object-mode Transform that applies `fn` to each cue node's data.
 * Returning `null` drops the cue; header nodes always pass through.
 */
export function cueTransform(
	fn: (cue: SubtitleCue, index: number) => SubtitleCue | null,
): Transform {
	let index = 0;
	return new Transform({
		objectMode: true,
		transform(node: StreamNode, _encoding, callback) {
			if (node.type !== "cue") {
				callback(null, node);
				return;
			}
			const next = fn(node.data, index++);
			callback(null, next ? ({ type: "cue", data: next } satisfies StreamNode) : undefined);
		},
	});
}

/** Stream equivalent of `shift`: offset every cue by `ms` (clamped at zero). */
export function shiftStream(ms: number): Transform {
	return cueTransform((cue) => ({
		...cue,
		start: clampTime(cue.start + ms),
		end: clampTime(cue.end + ms),
	}));
}

/** Stream equivalent of `scale`: multiply timings around an optional anchor. */
export function scaleStream(factor: number, options: { anchor?: number } = {}): Transform {
	const anchor = options.anchor ?? 0;
	return cueTransform((cue) => ({
		...cue,
		start: clampTime(anchor + (cue.start - anchor) * factor),
		end: clampTime(anchor + (cue.end - anchor) * factor),
	}));
}

/** Stream equivalent of `mapText`: rewrite each cue's text. */
export function mapTextStream(fn: (text: string, cue: SubtitleCue) => string): Transform {
	return cueTransform((cue) => ({ ...cue, text: fn(cue.text, cue) }));
}

/** Stream equivalent of `filterCues`: keep cues for which `predicate` is true. */
export function filterStream(predicate: (cue: SubtitleCue, index: number) => boolean): Transform {
	return cueTransform((cue, index) => (predicate(cue, index) ? cue : null));
}

/** Stream equivalent of `renumber`: rewrite indexes to a 1-based run. */
export function renumberStream(): Transform {
	return cueTransform((cue, index) => ({ ...cue, index: index + 1 }));
}

/**
 * A Transform that serializes a stream of `StreamNode` objects into `format`
 * text. Throws if the format is not streamable.
 */
export function stringifyStream(format: SubtitleFormat): Transform {
	const codec = SERIALIZERS[format];
	if (!codec) {
		throw new SubtitleParseError(`Streaming stringify is not supported for "${format}"`);
	}
	let meta: Record<string, string> = {};
	let started = false;
	let count = 0;

	return new Transform({
		writableObjectMode: true,
		transform(node: StreamNode, _encoding, callback) {
			if (node.type === "header") {
				meta = node.data;
				callback();
				return;
			}
			let out = "";
			if (!started) {
				out += codec.header(meta);
				started = true;
			} else {
				out += codec.separator;
			}
			out += codec.cue(node.data, ++count);
			callback(null, out);
		},
		flush(callback) {
			let out = "";
			if (!started) {
				out += codec.header(meta);
			}
			out += codec.trailing;
			callback(null, out);
		},
	});
}
