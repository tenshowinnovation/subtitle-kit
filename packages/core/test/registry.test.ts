import { describe, expect, it } from "vitest";

import {
	convert,
	detectFormat,
	formatFromExtension,
	getHandler,
	listFormats,
	parse,
	stringify,
} from "../src/registry";

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world
`;

describe("detectFormat", () => {
	it("detects SubRip", () => {
		expect(detectFormat(SRT)).toBe("srt");
	});

	it("detects WebVTT", () => {
		expect(detectFormat(VTT)).toBe("vtt");
	});

	it("detects ASS", () => {
		expect(
			detectFormat("[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,,,,,,,hi"),
		).toBe("ass");
	});

	it("detects JSON Lines", () => {
		expect(detectFormat(`{"start":0,"end":1,"text":"hi"}`)).toBe("jsonl");
	});

	it("returns null for unrecognized input", () => {
		expect(detectFormat("just some prose with no timing")).toBeNull();
	});
});

describe("parse", () => {
	it("auto-detects when no format is given", () => {
		expect(parse(SRT).format).toBe("srt");
	});

	it("honors an explicit format override", () => {
		const doc = parse("Hello\n\nWorld", { format: "txt" });
		expect(doc.cues).toHaveLength(2);
	});

	it("throws a helpful error when detection fails", () => {
		expect(() => parse("no timing here")).toThrow(/could not detect/i);
	});
});

describe("stringify", () => {
	it("serializes using the document's own format by default", () => {
		const doc = parse(SRT);
		expect(stringify(doc)).toContain("-->");
	});

	it("serializes to an explicit target format", () => {
		const doc = parse(SRT);
		expect(stringify(doc, "vtt").startsWith("WEBVTT")).toBe(true);
	});
});

describe("convert", () => {
	it("converts SRT text to WebVTT text", () => {
		const out = convert(SRT, "vtt");
		expect(out.startsWith("WEBVTT")).toBe(true);
		expect(out).toContain("00:00:01.000 --> 00:00:04.000");
	});

	it("converts with an explicit source format", () => {
		const out = convert("Hello\n\nWorld", "srt", { from: "txt" });
		expect(out).toContain("1\n00:00:00,000 --> 00:00:00,000\nHello");
	});
});

describe("handler lookup helpers", () => {
	it("lists every supported format", () => {
		expect(listFormats()).toEqual(
			expect.arrayContaining(["srt", "vtt", "ass", "sbv", "lrc", "json", "jsonl", "txt"]),
		);
	});

	it("resolves a format from a file extension", () => {
		expect(formatFromExtension("movie.SRT")).toBe("srt");
		expect(formatFromExtension(".vtt")).toBe("vtt");
		expect(formatFromExtension("ssa")).toBe("ass");
		expect(formatFromExtension("unknown")).toBeNull();
	});

	it("exposes a handler by name", () => {
		expect(getHandler("srt").name).toBe("srt");
		expect(() => getHandler("nope" as never)).toThrow();
	});
});
