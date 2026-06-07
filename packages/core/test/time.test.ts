import { describe, expect, it } from "vitest";

import { formatTimestamp, parseTimestamp } from "../src/time";
import { SubtitleParseError } from "../src/types";

describe("parseTimestamp", () => {
	it("parses an SRT timestamp (comma millis) into milliseconds", () => {
		expect(parseTimestamp("00:00:01,000")).toBe(1000);
	});

	it("parses a WebVTT timestamp (dot millis)", () => {
		expect(parseTimestamp("01:02:03.456")).toBe(3_723_456);
	});

	it("parses a WebVTT timestamp without an hours field", () => {
		expect(parseTimestamp("02:03.456")).toBe(123_456);
	});

	it("parses ASS centiseconds (2-digit fraction)", () => {
		expect(parseTimestamp("0:00:01.50")).toBe(1500);
	});

	it("parses an LRC tag body (mm:ss.xx)", () => {
		expect(parseTimestamp("01:30.25")).toBe(90_250);
	});

	it("parses bare integer milliseconds", () => {
		expect(parseTimestamp("1500")).toBe(1500);
	});

	it("ignores surrounding whitespace", () => {
		expect(parseTimestamp("  00:00:02,000  ")).toBe(2000);
	});

	it("throws on an empty timestamp", () => {
		expect(() => parseTimestamp("   ")).toThrow(SubtitleParseError);
	});

	it("throws on a malformed timestamp", () => {
		expect(() => parseTimestamp("not-a-time")).toThrow(SubtitleParseError);
	});
});

describe("formatTimestamp", () => {
	it("formats milliseconds as an SRT timestamp", () => {
		expect(formatTimestamp(1000, "srt")).toBe("00:00:01,000");
	});

	it("formats milliseconds as a WebVTT timestamp", () => {
		expect(formatTimestamp(3_723_456, "vtt")).toBe("01:02:03.456");
	});

	it("formats ASS timestamps with a single-digit hour and centiseconds", () => {
		expect(formatTimestamp(3_723_456, "ass")).toBe("1:02:03.45");
	});

	it("formats LRC tags folding hours into minutes", () => {
		expect(formatTimestamp(3_723_456, "lrc")).toBe("62:03.45");
	});

	it("clamps negative input to zero", () => {
		expect(formatTimestamp(-5, "srt")).toBe("00:00:00,000");
	});

	it("round-trips an SRT timestamp", () => {
		const ms = parseTimestamp("12:34:56,789");
		expect(formatTimestamp(ms, "srt")).toBe("12:34:56,789");
	});
});
