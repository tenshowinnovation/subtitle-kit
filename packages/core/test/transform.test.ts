import { describe, expect, it } from "vitest";

import {
	clip,
	filterCues,
	mapText,
	mergeOverlapping,
	renumber,
	scale,
	shift,
	sortCues,
} from "../src/transform";
import type { SubtitleDocument } from "../src/types";

function doc(): SubtitleDocument {
	return {
		format: "srt",
		meta: {},
		cues: [
			{ index: 1, start: 1000, end: 2000, text: "one" },
			{ index: 2, start: 3000, end: 4000, text: "two" },
			{ index: 3, start: 5000, end: 6000, text: "three" },
		],
	};
}

describe("shift", () => {
	it("offsets every cue by the given milliseconds", () => {
		const out = shift(doc(), 500);
		expect(out.cues.map((c) => [c.start, c.end])).toEqual([
			[1500, 2500],
			[3500, 4500],
			[5500, 6500],
		]);
	});

	it("clamps negative results to zero", () => {
		const out = shift(doc(), -1500);
		expect(out.cues[0].start).toBe(0);
		expect(out.cues[0].end).toBe(500);
	});

	it("does not mutate the input document", () => {
		const input = doc();
		shift(input, 500);
		expect(input.cues[0].start).toBe(1000);
	});
});

describe("scale", () => {
	it("multiplies timings by a factor (e.g. frame-rate change)", () => {
		const out = scale(doc(), 2);
		expect(out.cues[0]).toMatchObject({ start: 2000, end: 4000 });
	});

	it("supports an anchor so timing scales around a pivot", () => {
		const out = scale(doc(), 2, { anchor: 1000 });
		expect(out.cues[0]).toMatchObject({ start: 1000, end: 3000 });
	});
});

describe("sortCues", () => {
	it("orders cues by start time", () => {
		const d = doc();
		d.cues = [d.cues[2], d.cues[0], d.cues[1]];
		const out = sortCues(d);
		expect(out.cues.map((c) => c.text)).toEqual(["one", "two", "three"]);
	});
});

describe("filterCues", () => {
	it("keeps only cues matching the predicate", () => {
		const out = filterCues(doc(), (c) => c.text !== "two");
		expect(out.cues.map((c) => c.text)).toEqual(["one", "three"]);
	});
});

describe("mapText", () => {
	it("transforms each cue's text", () => {
		const out = mapText(doc(), (t) => t.toUpperCase());
		expect(out.cues.map((c) => c.text)).toEqual(["ONE", "TWO", "THREE"]);
	});
});

describe("renumber", () => {
	it("rewrites indexes to be sequential from 1", () => {
		const d = doc();
		d.cues[0].index = 99;
		const out = renumber(d);
		expect(out.cues.map((c) => c.index)).toEqual([1, 2, 3]);
	});
});

describe("clip", () => {
	it("keeps only cues overlapping the window and trims their bounds", () => {
		const out = clip(doc(), 1500, 5500);
		expect(out.cues.map((c) => [c.start, c.end, c.text])).toEqual([
			[1500, 2000, "one"],
			[3000, 4000, "two"],
			[5000, 5500, "three"],
		]);
	});
});

describe("mergeOverlapping", () => {
	it("merges cues that overlap or touch into one", () => {
		const d: SubtitleDocument = {
			format: "srt",
			meta: {},
			cues: [
				{ start: 1000, end: 3000, text: "a" },
				{ start: 2500, end: 4000, text: "b" },
				{ start: 8000, end: 9000, text: "c" },
			],
		};
		const out = mergeOverlapping(d);
		expect(out.cues).toHaveLength(2);
		expect(out.cues[0]).toMatchObject({ start: 1000, end: 4000, text: "a\nb" });
		expect(out.cues[1]).toMatchObject({ start: 8000, end: 9000, text: "c" });
	});
});
