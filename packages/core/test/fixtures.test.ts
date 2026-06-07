import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { convert, detectFormat, parse, stringify } from "../src/index";

function fixture(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

const ASS = fixture("breaking-bad.s01e01.ass");
const SRT = fixture("pysrt-sample.fr.srt");
const VTT = fixture("elephants-dream.en.vtt");

describe("detectFormat on real files", () => {
	it("detects the ASS fixture", () => {
		expect(detectFormat(ASS)).toBe("ass");
	});

	it("detects the SRT fixture", () => {
		expect(detectFormat(SRT)).toBe("srt");
	});

	it("detects the WebVTT fixture", () => {
		expect(detectFormat(VTT)).toBe("vtt");
	});
});

describe("breaking-bad.s01e01.ass (large bilingual ASS)", () => {
	const doc = parse(ASS);

	it("parses every Dialogue event", () => {
		expect(doc.cues).toHaveLength(695);
	});

	it("captures Script Info into meta", () => {
		expect(doc.meta.ScriptType).toBe("v4.00+");
		expect(doc.meta.PlayResX).toBe("384");
	});

	it("decodes the first cue: \\N as newline, override tags stripped", () => {
		expect(doc.cues[0]).toMatchObject({
			start: 134_330,
			end: 136_240,
			voice: "NTP",
			text: "我叫沃尔特·哈特维尔·怀特\nMy name is Walter Hartwell White.",
		});
		expect(doc.cues[0].styles?.style).toBe("duibai");
	});

	it("decodes the last cue", () => {
		const last = doc.cues.at(-1);
		expect(last).toMatchObject({
			start: 3_428_920,
			end: 3_431_140,
			text: "沃尔特  那还是你吗\nWalter is that you?",
		});
	});

	it("leaves no override braces in any decoded text", () => {
		expect(doc.cues.every((c) => !c.text.includes("{") && !c.text.includes("}"))).toBe(true);
	});

	it("round-trips through ASS preserving timing and text", () => {
		const again = parse(stringify(doc, "ass"), { format: "ass" });
		expect(again.cues.map((c) => [c.start, c.end, c.text])).toEqual(
			doc.cues.map((c) => [c.start, c.end, c.text]),
		);
	});

	it("converts to SRT that re-parses to the same cues", () => {
		const reparsed = parse(convert(ASS, "srt"), { format: "srt" });
		expect(reparsed.cues).toHaveLength(695);
		expect(reparsed.cues[0]).toMatchObject({
			start: 134_330,
			end: 136_240,
			text: "我叫沃尔特·哈特维尔·怀特\nMy name is Walter Hartwell White.",
		});
	});
});

describe("pysrt-sample.fr.srt (large SubRip, starts at index 0)", () => {
	const doc = parse(SRT);

	it("parses all cues including the index-0 promo entry", () => {
		expect(doc.cues).toHaveLength(1332);
	});

	it("keeps the original zero-based first index", () => {
		expect(doc.cues[0]).toMatchObject({
			index: 0,
			start: 1000,
			end: 4000,
			text: "Downloaded From www.AllSubs.org",
		});
	});

	it("preserves accented UTF-8 text and multi-line cues", () => {
		expect(doc.cues[1].text).toBe("CE FILM RELATE DES ÉVÉNEMENTS\nQUI ONT EXISTÉ.");
	});

	it("parses the final cue's timing", () => {
		expect(doc.cues.at(-1)).toMatchObject({ start: 5_839_634, end: 5_849_634 });
	});

	it("round-trips through SRT preserving timing and text", () => {
		const again = parse(stringify(doc, "srt"), { format: "srt" });
		expect(again.cues.map((c) => [c.start, c.end, c.text])).toEqual(
			doc.cues.map((c) => [c.start, c.end, c.text]),
		);
	});

	it("converts to WebVTT and back without losing cues", () => {
		const reparsed = parse(convert(SRT, "vtt"), { format: "vtt" });
		expect(reparsed.cues).toHaveLength(1332);
		expect(reparsed.cues.at(-1)).toMatchObject({ start: 5_839_634, end: 5_849_634 });
	});
});

describe("elephants-dream.en.vtt (WebVTT with numeric ids)", () => {
	const doc = parse(VTT);

	it("parses every cue", () => {
		expect(doc.cues).toHaveLength(78);
	});

	it("captures the numeric cue identifier", () => {
		expect(doc.cues[0]).toMatchObject({
			start: 15_000,
			end: 17_951,
			text: "At the left we can see...",
		});
		expect(doc.cues[0].styles?.id).toBe("1");
	});

	it("parses the final cue", () => {
		expect(doc.cues.at(-1)).toMatchObject({ start: 537_000, end: 539_867, text: "...it is." });
	});

	it("converts to SRT that re-parses to the same timing", () => {
		const reparsed = parse(convert(VTT, "srt"), { format: "srt" });
		expect(reparsed.cues).toHaveLength(78);
		expect(reparsed.cues[0]).toMatchObject({ start: 15_000, end: 17_951 });
	});
});
