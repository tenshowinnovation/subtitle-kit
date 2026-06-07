import { describe, expect, it } from "vitest";

import { lrc } from "../src/formats/lrc";

const SAMPLE = `[ti:Example Song]
[ar:The Artist]
[00:01.00]Hello world
[00:04.50]Second line
[00:08.00][00:12.00]Repeated line
`;

describe("lrc.parse", () => {
	it("parses lyric lines with millisecond start times", () => {
		const doc = lrc.parse(SAMPLE);
		expect(doc.format).toBe("lrc");
		expect(doc.cues[0]).toMatchObject({ start: 1000, text: "Hello world" });
		expect(doc.cues[1].start).toBe(4500);
	});

	it("captures id tags into meta", () => {
		const doc = lrc.parse(SAMPLE);
		expect(doc.meta.ti).toBe("Example Song");
		expect(doc.meta.ar).toBe("The Artist");
	});

	it("expands a line with multiple time tags into multiple cues", () => {
		const doc = lrc.parse(SAMPLE);
		const repeated = doc.cues.filter((c) => c.text === "Repeated line");
		expect(repeated.map((c) => c.start)).toEqual([8000, 12000]);
	});

	it("sets each cue end to the next cue's start", () => {
		const doc = lrc.parse(SAMPLE);
		expect(doc.cues[0].end).toBe(4500);
	});

	it("sorts cues by start time after expansion", () => {
		const doc = lrc.parse(SAMPLE);
		const starts = doc.cues.map((c) => c.start);
		expect(starts).toEqual([...starts].sort((a, b) => a - b));
	});
});

describe("lrc.stringify", () => {
	it("emits id tags then timed lyric lines", () => {
		const out = lrc.stringify(lrc.parse(SAMPLE));
		expect(out).toContain("[ti:Example Song]");
		expect(out).toContain("[00:01.00]Hello world");
	});

	it("round-trips start times and text", () => {
		const doc = lrc.parse(SAMPLE);
		const reparsed = lrc.parse(lrc.stringify(doc));
		expect(reparsed.cues.map((c) => [c.start, c.text])).toEqual(
			doc.cues.map((c) => [c.start, c.text]),
		);
	});
});

describe("lrc.detect", () => {
	it("recognizes bracketed time tags", () => {
		expect(lrc.detect(SAMPLE)).toBe(true);
	});

	it("rejects SubRip content", () => {
		expect(lrc.detect("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});
