import { describe, expect, it } from "vitest";

import { ass } from "../src/formats/ass";

const SAMPLE = `[Script Info]
Title: Example
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,20

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,Alice,0,0,0,,Hello {\\b1}world{\\b0}
Dialogue: 0,0:00:05.50,0:00:08.00,Default,,0,0,0,,Line one\\NLine two
`;

describe("ass.parse", () => {
	it("parses dialogue events into cues with ms timing", () => {
		const doc = ass.parse(SAMPLE);
		expect(doc.format).toBe("ass");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({ start: 1000, end: 4000 });
	});

	it("uses the Format line to locate fields by name", () => {
		const doc = ass.parse(SAMPLE);
		expect(doc.cues[0].voice).toBe("Alice");
		expect(doc.cues[0].styles?.style).toBe("Default");
	});

	it("strips override tags and converts \\N into newlines", () => {
		const doc = ass.parse(SAMPLE);
		expect(doc.cues[0].text).toBe("Hello world");
		expect(doc.cues[1].text).toBe("Line one\nLine two");
	});

	it("captures Script Info into meta", () => {
		const doc = ass.parse(SAMPLE);
		expect(doc.meta.Title).toBe("Example");
	});
});

describe("ass.stringify", () => {
	it("emits the required sections and Dialogue lines", () => {
		const out = ass.stringify(ass.parse(SAMPLE));
		expect(out).toContain("[Script Info]");
		expect(out).toContain("[Events]");
		expect(out).toContain("Dialogue: 0,0:00:01.00,0:00:04.00,Default,Alice,");
	});

	it("re-encodes newlines as \\N", () => {
		const out = ass.stringify(ass.parse(SAMPLE));
		expect(out).toContain("Line one\\NLine two");
	});

	it("round-trips cue timing and text", () => {
		const doc = ass.parse(SAMPLE);
		const reparsed = ass.parse(ass.stringify(doc));
		expect(reparsed.cues.map((c) => [c.start, c.end, c.text])).toEqual(
			doc.cues.map((c) => [c.start, c.end, c.text]),
		);
	});
});

describe("ass.detect", () => {
	it("recognizes Script Info / V4 styles content", () => {
		expect(ass.detect(SAMPLE)).toBe(true);
	});

	it("rejects SubRip content", () => {
		expect(ass.detect("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});
