import { describe, expect, it } from "vitest";

import { vtt } from "../src/formats/vtt";

const SAMPLE = `WEBVTT - Some title

NOTE this is a comment that should be ignored

intro
00:00:01.000 --> 00:00:04.000 line:90% align:center
<v Alice>Hello world</v>

00:00:05.500 --> 00:00:08.000
Second line one
Second line two
`;

describe("vtt.parse", () => {
	it("requires a WEBVTT signature", () => {
		expect(() => vtt.parse("00:00:01.000 --> 00:00:02.000\nhi")).toThrow();
	});

	it("parses cue timing in milliseconds", () => {
		const doc = vtt.parse(SAMPLE);
		expect(doc.format).toBe("vtt");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({ start: 1000, end: 4000 });
	});

	it("captures the cue identifier as the index-less id", () => {
		const doc = vtt.parse(SAMPLE);
		expect(doc.cues[0].styles?.id).toBe("intro");
	});

	it("captures cue settings after the timing arrow", () => {
		const doc = vtt.parse(SAMPLE);
		expect(doc.cues[0].styles?.settings).toBe("line:90% align:center");
	});

	it("extracts the voice tag and strips inline markup from text", () => {
		const doc = vtt.parse(SAMPLE);
		expect(doc.cues[0].voice).toBe("Alice");
		expect(doc.cues[0].text).toBe("Hello world");
	});

	it("ignores NOTE comment blocks", () => {
		const doc = vtt.parse(SAMPLE);
		expect(doc.cues.some((c) => c.text.includes("comment"))).toBe(false);
	});

	it("supports timestamps without an hours component", () => {
		const doc = vtt.parse("WEBVTT\n\n00:01.000 --> 00:02.000\nhi");
		expect(doc.cues[0]).toMatchObject({ start: 1000, end: 2000 });
	});
});

describe("vtt.stringify", () => {
	it("emits a WEBVTT header and dotted timestamps", () => {
		const doc = vtt.parse(SAMPLE);
		const out = vtt.stringify(doc);
		expect(out.startsWith("WEBVTT")).toBe(true);
		expect(out).toContain("00:00:01.000 --> 00:00:04.000");
	});

	it("re-emits cue settings and voice tags", () => {
		const out = vtt.stringify(vtt.parse(SAMPLE));
		expect(out).toContain("00:00:01.000 --> 00:00:04.000 line:90% align:center");
		expect(out).toContain("<v Alice>Hello world</v>");
	});

	it("round-trips parse -> stringify -> parse", () => {
		const doc = vtt.parse(SAMPLE);
		const reparsed = vtt.parse(vtt.stringify(doc));
		expect(reparsed.cues).toEqual(doc.cues);
	});
});

describe("vtt.detect", () => {
	it("recognizes content starting with WEBVTT", () => {
		expect(vtt.detect(SAMPLE)).toBe(true);
	});

	it("rejects SubRip content", () => {
		expect(vtt.detect("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});
