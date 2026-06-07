import { describe, expect, it } from "vitest";

import { sbv } from "../src/formats/sbv";

const SAMPLE = `0:00:01.000,0:00:04.000
Hello world

0:00:05.500,0:00:08.000
Second line one
Second line two
`;

describe("sbv.parse", () => {
	it("parses comma-separated start,end timing into cues", () => {
		const doc = sbv.parse(SAMPLE);
		expect(doc.format).toBe("sbv");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({ start: 1000, end: 4000, text: "Hello world" });
	});

	it("preserves multi-line text", () => {
		const doc = sbv.parse(SAMPLE);
		expect(doc.cues[1].text).toBe("Second line one\nSecond line two");
	});
});

describe("sbv.stringify", () => {
	it("serializes back to SBV with dotted timestamps", () => {
		const out = sbv.stringify(sbv.parse(SAMPLE));
		expect(out).toContain("0:00:01.000,0:00:04.000\nHello world");
	});

	it("round-trips parse -> stringify -> parse", () => {
		const doc = sbv.parse(SAMPLE);
		expect(sbv.parse(sbv.stringify(doc)).cues).toEqual(doc.cues);
	});
});

describe("sbv.detect", () => {
	it("recognizes SBV timing lines", () => {
		expect(sbv.detect(SAMPLE)).toBe(true);
	});

	it("rejects SubRip content", () => {
		expect(sbv.detect("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});
