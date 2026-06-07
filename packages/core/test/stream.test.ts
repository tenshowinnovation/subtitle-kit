import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { convert, parse, stringify } from "../src/index";
import { isStreamable, parseStream, type StreamNode, stringifyStream } from "../src/stream";
import type { SubtitleCue, SubtitleFormat } from "../src/types";

function fixture(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

/** Drive a Readable of chunks through the parse stream and collect nodes. */
async function parseNodes(
	chunks: Array<string | Buffer>,
	format: Parameters<typeof parseStream>[0],
) {
	const nodes: StreamNode[] = [];
	await new Promise<void>((resolve, reject) => {
		Readable.from(chunks)
			.pipe(parseStream(format))
			.on("data", (node: StreamNode) => nodes.push(node))
			.on("end", resolve)
			.on("error", reject);
	});
	return nodes;
}

function cuesOf(nodes: StreamNode[]): SubtitleCue[] {
	return nodes.filter((n) => n.type === "cue").map((n) => (n as { data: SubtitleCue }).data);
}

/** Drive cue nodes through the stringify stream and collect the text. */
async function stringifyNodes(nodes: StreamNode[], format: Parameters<typeof stringifyStream>[0]) {
	const out: string[] = [];
	await new Promise<void>((resolve, reject) => {
		Readable.from(nodes)
			.pipe(stringifyStream(format))
			.on("data", (chunk: Buffer | string) => out.push(chunk.toString()))
			.on("end", resolve)
			.on("error", reject);
	});
	return out.join("");
}

/** Split a string into N roughly-equal byte chunks (to stress boundaries). */
function chunkify(text: string, size: number): Buffer[] {
	const buf = Buffer.from(text, "utf8");
	const chunks: Buffer[] = [];
	for (let i = 0; i < buf.length; i += size) {
		chunks.push(buf.subarray(i, i + size));
	}
	return chunks;
}

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,000
Second line one
Second line two
`;

describe("parseStream(srt)", () => {
	it("emits a cue node per block, matching the buffered parser", async () => {
		const nodes = await parseNodes([SRT], "srt");
		expect(cuesOf(nodes)).toEqual(parse(SRT).cues);
	});

	it("reassembles cues split across tiny chunk boundaries", async () => {
		const nodes = await parseNodes(chunkify(SRT, 7), "srt");
		expect(cuesOf(nodes)).toEqual(parse(SRT).cues);
	});

	it("handles CRLF line endings split mid-sequence", async () => {
		const crlf = SRT.replace(/\n/g, "\r\n");
		const nodes = await parseNodes(chunkify(crlf, 5), "srt");
		expect(cuesOf(nodes)).toEqual(parse(SRT).cues);
	});

	it("strips a leading BOM that arrives in the first chunk", async () => {
		const nodes = await parseNodes([`﻿${SRT}`], "srt");
		expect(cuesOf(nodes)[0].index).toBe(1);
	});
});

describe("stringifyStream(srt)", () => {
	it("round-trips: parse -> stringify stream -> parse", async () => {
		const nodes = await parseNodes([SRT], "srt");
		const text = await stringifyNodes(nodes, "srt");
		expect(parse(text, { format: "srt" }).cues).toEqual(parse(SRT).cues);
	});

	it("produces byte-identical output to the buffered stringifier", async () => {
		const nodes = await parseNodes([SRT], "srt");
		const text = await stringifyNodes(nodes, "srt");
		expect(text).toBe(stringify(parse(SRT)));
	});
});

describe("isStreamable", () => {
	it("marks line/block formats streamable and JSON/LRC not", () => {
		const streamable: SubtitleFormat[] = ["srt", "vtt", "sbv", "txt", "ass", "jsonl"];
		expect(streamable.every(isStreamable)).toBe(true);
		expect(isStreamable("json")).toBe(false);
		expect(isStreamable("lrc")).toBe(false);
	});
});

describe("parseStream throws for non-streamable formats", () => {
	it("rejects json", () => {
		expect(() => parseStream("json")).toThrow(/not supported/i);
	});
});

// Parity across all streamable formats, including the large real fixtures.
const CASES: Array<{ format: SubtitleFormat; sample: string }> = [
	{ format: "ass", sample: fixture("breaking-bad.s01e01.ass") },
	{ format: "srt", sample: fixture("pysrt-sample.fr.srt") },
	{ format: "vtt", sample: fixture("elephants-dream.en.vtt") },
];

describe("streaming parity with buffered parse on real fixtures", () => {
	for (const { format, sample } of CASES) {
		it(`parseStream(${format}) matches buffered parse, even in tiny chunks`, async () => {
			const nodes = await parseNodes(chunkify(sample, 13), format);
			expect(cuesOf(nodes)).toEqual(parse(sample, { format }).cues);
		});

		it(`stringifyStream(${format}) byte-matches the buffered stringifier`, async () => {
			const doc = parse(sample, { format });
			const nodes: StreamNode[] = [
				{ type: "header", data: doc.meta },
				...doc.cues.map((data): StreamNode => ({ type: "cue", data })),
			];
			const text = await stringifyNodes(nodes, format);
			expect(text).toBe(stringify(doc));
		});

		it(`full stream pipeline ${format} -> srt matches buffered convert`, async () => {
			const nodes = await parseNodes([sample], format);
			const srtText = await stringifyNodes(nodes, "srt");
			expect(srtText).toBe(convert(sample, "srt", { from: format }));
		});
	}
});
