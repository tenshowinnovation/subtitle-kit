import { describe, expect, it } from "vitest";

import { srt } from "../src/formats/srt";

const SAMPLE = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,000
Second line one
Second line two
`;

describe("srt.parse", () => {
	it("parses cues with index, timing, and text", () => {
		const doc = srt.parse(SAMPLE);
		expect(doc.format).toBe("srt");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({
			index: 1,
			start: 1000,
			end: 4000,
			text: "Hello world",
		});
	});

	it("preserves multi-line cue text joined with newlines", () => {
		const doc = srt.parse(SAMPLE);
		expect(doc.cues[1].text).toBe("Second line one\nSecond line two");
	});

	it("tolerates CRLF line endings", () => {
		const doc = srt.parse(SAMPLE.replace(/\n/g, "\r\n"));
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0].text).toBe("Hello world");
	});

	it("tolerates a leading UTF-8 BOM", () => {
		const doc = srt.parse(`﻿${SAMPLE}`);
		expect(doc.cues[0].index).toBe(1);
	});

	it("skips blank entries and extra whitespace between cues", () => {
		const doc = srt.parse(`\n\n${SAMPLE}\n\n\n`);
		expect(doc.cues).toHaveLength(2);
	});
});

describe("srt.stringify", () => {
	it("serializes a document back to SubRip text", () => {
		const doc = srt.parse(SAMPLE);
		const out = srt.stringify(doc);
		expect(out).toContain("1\n00:00:01,000 --> 00:00:04,000\nHello world");
		expect(out).toContain("2\n00:00:05,500 --> 00:00:08,000\nSecond line one\nSecond line two");
	});

	it("renumbers cues sequentially regardless of stored index", () => {
		const doc = srt.parse(SAMPLE);
		doc.cues[0].index = 99;
		const out = srt.stringify(doc);
		expect(out.startsWith("1\n")).toBe(true);
	});

	it("round-trips parse -> stringify -> parse", () => {
		const doc = srt.parse(SAMPLE);
		const reparsed = srt.parse(srt.stringify(doc));
		expect(reparsed.cues).toEqual(doc.cues);
	});
});

describe("srt.detect", () => {
	it("recognizes SubRip content", () => {
		expect(srt.detect(SAMPLE)).toBe(true);
	});

	it("rejects WebVTT content", () => {
		expect(srt.detect("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi")).toBe(false);
	});
});
