import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli";
import { makeIO } from "./helpers";

/** Load a real subtitle fixture that lives in the core package. */
function coreFixture(name: string): string {
	return readFileSync(
		fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url)),
		"utf8",
	);
}

const ASS = coreFixture("breaking-bad.s01e01.ass");
const VTT = coreFixture("elephants-dream.en.vtt");

describe("CLI on real fixtures", () => {
	it("converts the Breaking Bad ASS file to SRT via the -o extension", async () => {
		const io = makeIO({ "in.ass": ASS });
		const code = await runCli(["convert", "in.ass", "-o", "out.srt"], io);
		expect(code).toBe(0);
		const srt = io.files["out.srt"];
		expect(srt.startsWith("1\n00:02:14,330 --> 00:02:16,240")).toBe(true);
		expect(srt).toContain("My name is Walter Hartwell White.");
	});

	it("reports format and cue count for the ASS file via `info`", async () => {
		const io = makeIO({ "in.ass": ASS });
		const code = await runCli(["info", "in.ass"], io);
		expect(code).toBe(0);
		expect(io.out).toContain("format: ass");
		expect(io.out).toContain("cues:   695");
	});

	it("shifts the WebVTT fixture and keeps it valid WebVTT", async () => {
		const io = makeIO({ "in.vtt": VTT });
		const code = await runCli(["shift", "in.vtt", "--by", "1000"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
		// First cue 00:00:15.000 -> shifted to 00:00:16.000.
		expect(io.out).toContain("00:00:16.000 --> 00:00:18.951");
	});

	it("converts the WebVTT fixture to JSONL through stdin", async () => {
		const io = makeIO();
		io.stdin = VTT;
		const code = await runCli(["convert", "-", "--to", "jsonl"], io);
		expect(code).toBe(0);
		const lines = io.out.trim().split("\n");
		expect(lines).toHaveLength(78);
		expect(JSON.parse(lines[0])).toMatchObject({ start: 15_000, end: 17_951 });
	});
});
