import { describe, expect, it } from "vitest";

import { runCli, s3ToHttps } from "../src/cli";
import { makeIO } from "./helpers";

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,000
Second
`;

describe("runCli convert", () => {
	it("converts a file to another format and writes to stdout", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["convert", "in.srt", "--to", "vtt"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
		expect(io.out).toContain("00:00:01.000 --> 00:00:04.000");
	});

	it("infers the target format from the -o output extension", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["convert", "in.srt", "-o", "out.vtt"], io);
		expect(code).toBe(0);
		expect(io.files["out.vtt"].startsWith("WEBVTT")).toBe(true);
	});

	it("reads from stdin when input is '-'", async () => {
		const io = makeIO();
		io.stdin = SRT;
		const code = await runCli(["convert", "-", "--to", "json"], io);
		expect(code).toBe(0);
		expect(JSON.parse(io.out).cues).toHaveLength(2);
	});
});

describe("runCli shift", () => {
	it("shifts timings by milliseconds", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["shift", "in.srt", "--by", "1000"], io);
		expect(code).toBe(0);
		expect(io.out).toContain("00:00:02,000 --> 00:00:05,000");
	});
});

describe("runCli scale", () => {
	it("scales timings by a factor", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["scale", "in.srt", "--factor", "2"], io);
		expect(code).toBe(0);
		expect(io.out).toContain("00:00:02,000 --> 00:00:08,000");
	});
});

describe("runCli info", () => {
	it("reports the detected format and cue count", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["info", "in.srt"], io);
		expect(code).toBe(0);
		expect(io.out).toContain("srt");
		expect(io.out).toContain("2");
	});
});

describe("runCli errors and help", () => {
	it("prints help and exits 0 for --help", async () => {
		const io = makeIO();
		const code = await runCli(["--help"], io);
		expect(code).toBe(0);
		expect(io.out).toMatch(/usage/i);
	});

	it("prints the version (not help) for --version", async () => {
		const io = makeIO();
		const code = await runCli(["--version"], io);
		expect(code).toBe(0);
		expect(io.out).toMatch(/^subtitle-kit \d/);
		expect(io.out).not.toMatch(/usage/i);
	});

	it("exits non-zero on an unknown command", async () => {
		const io = makeIO();
		const code = await runCli(["frobnicate"], io);
		expect(code).not.toBe(0);
		expect(io.err).toMatch(/unknown command/i);
	});

	it("exits non-zero when convert has no target format", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["convert", "in.srt"], io);
		expect(code).not.toBe(0);
		expect(io.err).toMatch(/--to/);
	});
});

describe("streaming vs buffered selection", () => {
	it("streams when source and target formats are both streamable", async () => {
		// chunked stdin proves the streaming path reassembles boundaries
		const io = makeIO();
		io.stdin = SRT;
		const code = await runCli(["convert", "-", "--from", "srt", "--to", "vtt"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
		expect(io.out).toContain("00:00:05.500 --> 00:00:08.000");
	});

	it("falls back to buffering for non-streamable targets like json", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["convert", "in.srt", "--to", "json"], io);
		expect(code).toBe(0);
		expect(JSON.parse(io.out).cues).toHaveLength(2);
	});

	it("honors --buffer to force the buffered path", async () => {
		const io = makeIO({ "in.srt": SRT });
		const code = await runCli(["convert", "in.srt", "--to", "vtt", "--buffer"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
	});

	it("produces the same output whether streamed or buffered", async () => {
		const streamed = makeIO({ "in.srt": SRT });
		await runCli(["convert", "in.srt", "--to", "vtt"], streamed);
		const buffered = makeIO({ "in.srt": SRT });
		await runCli(["convert", "in.srt", "--to", "vtt", "--buffer"], buffered);
		expect(streamed.out).toBe(buffered.out);
	});
});

describe("s3ToHttps", () => {
	it("maps an s3:// URI to a virtual-hosted endpoint with a default region", () => {
		expect(s3ToHttps("s3://my-bucket/subs/movie.srt")).toBe(
			"https://my-bucket.s3.us-east-1.amazonaws.com/subs/movie.srt",
		);
	});

	it("honors an explicit region", () => {
		expect(s3ToHttps("s3://b/k.vtt", "eu-west-1")).toBe(
			"https://b.s3.eu-west-1.amazonaws.com/k.vtt",
		);
	});

	it("throws on a malformed S3 URI", () => {
		expect(() => s3ToHttps("s3://bucket-only")).toThrow(/invalid s3 uri/i);
	});
});

describe("remote entry (http/s3)", () => {
	it("reads a subtitle from an http(s) URL and converts it", async () => {
		const url = "https://cdn.example.com/movie.srt";
		const io = makeIO({}, { [url]: SRT });
		const code = await runCli(["convert", url, "--to", "vtt"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
	});

	it("resolves an s3:// source through the virtual-hosted endpoint", async () => {
		const httpsUrl = "https://bucket.s3.us-east-1.amazonaws.com/movie.srt";
		const io = makeIO({}, { [httpsUrl]: SRT });
		const code = await runCli(["convert", "s3://bucket/movie.srt", "--to", "vtt"], io);
		expect(code).toBe(0);
		expect(io.out.startsWith("WEBVTT")).toBe(true);
	});

	it("infers the source format from the remote URL extension", async () => {
		const url = "https://cdn.example.com/clip.srt?token=abc";
		const io = makeIO({}, { [url]: SRT });
		const code = await runCli(["shift", url, "--by", "1000"], io);
		expect(code).toBe(0);
		expect(io.out).toContain("00:00:02,000 --> 00:00:05,000");
	});
});
