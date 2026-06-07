import { describe, expect, it } from "vitest";

import { convert, listFormats, parse, stringify } from "../src/index";
import type { SubtitleFormat } from "../src/index";

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,000
Second line
`;

// Formats that fully preserve start/end/text through a serialize round-trip.
const TIMED: SubtitleFormat[] = ["srt", "vtt", "ass", "sbv", "json", "jsonl"];

describe("cross-format conversion", () => {
	it("exposes every promised format", () => {
		expect(listFormats().sort()).toEqual(
			["ass", "json", "jsonl", "lrc", "sbv", "srt", "ssa", "txt", "vtt"].sort(),
		);
	});

	for (const target of TIMED) {
		it(`converts SRT -> ${target} and preserves timing + text`, () => {
			const out = convert(SRT, target);
			const doc = parse(out, { format: target });
			expect(doc.cues.map((c) => [c.start, c.end, c.text])).toEqual([
				[1000, 4000, "Hello world"],
				[5500, 8000, "Second line"],
			]);
		});
	}

	it("performs a full round-trip across the timed formats", () => {
		let doc = parse(SRT);
		for (const format of TIMED) {
			doc = parse(stringify({ ...doc, format }, format), { format });
		}
		expect(doc.cues.map((c) => [c.start, c.end, c.text])).toEqual([
			[1000, 4000, "Hello world"],
			[5500, 8000, "Second line"],
		]);
	});

	it("converts to plain text by dropping timing", () => {
		expect(convert(SRT, "txt")).toBe("Hello world\n\nSecond line\n");
	});
});
