#!/usr/bin/env node
import { pipeline } from "node:stream/promises";

import {
	detectFormat,
	formatFromExtension,
	parse,
	scale,
	shift,
	stringify,
	type SubtitleDocument,
	type SubtitleFormat,
} from "@tenshowinnovation/subtitle-kit-core";
import {
	isStreamable,
	parseStream,
	scaleStream,
	shiftStream,
	stringifyStream,
} from "@tenshowinnovation/subtitle-kit-core/stream";
import { Command, CommanderError } from "commander";

/**
 * Side-effecting dependencies, injected so the CLI core is unit-testable.
 *
 * I/O is stream-oriented: `openRead` resolves any source (stdin, local file, or
 * a remote `http(s)://` URL) to a readable byte stream, and `openWrite` resolves
 * a destination (a file, or stdout when omitted) to a writable. The buffered
 * code path simply drains/fills these streams.
 */
export interface CliIO {
	openRead(source: string): Promise<NodeJS.ReadableStream>;
	openWrite(dest: string | undefined): Promise<NodeJS.WritableStream>;
	stdout(text: string): void;
	stderr(text: string): void;
}

const VERSION = "0.1.0";

/** Options shared by the subtitle subcommands, as collected by commander. */
interface CmdOptions {
	to?: string;
	from?: string;
	output?: string;
	by?: string;
	factor?: string;
	anchor?: string;
	region?: string;
	buffer?: boolean;
}

const EXTRA_HELP = `
Input sources:
  -                  read from stdin
  ./path/to/file     a local file
  https://…          any HTTP(S) URL
  s3://bucket/key    an S3 object (public or a presigned URL; see --region)

Formats: srt, vtt, ass, ssa, sbv, lrc, json, jsonl, txt

Output goes to stdout unless -o is given. Streaming is used automatically when
the source and target formats are streamable (srt/vtt/ass/sbv/jsonl/txt) and the
source format is known; otherwise the file is buffered. Use --buffer to force
buffering, or --region/$AWS_REGION to pick the S3 endpoint region.

Examples:
  subtitle-kit convert movie.srt --to vtt -o movie.vtt
  subtitle-kit shift movie.srt --by 1500 -o delayed.srt
  cat movie.ass | subtitle-kit convert - --from ass --to srt
  subtitle-kit convert s3://my-bucket/movie.srt --to vtt --region us-west-2
`;

/**
 * Translate an `s3://bucket/key` URI to a virtual-hosted HTTPS endpoint so it
 * can be fetched with the built-in `fetch` (no AWS SDK dependency). Works for
 * public objects; for private buckets, pass a presigned `https://` URL instead.
 */
export function s3ToHttps(uri: string, region?: string): string {
	const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
	if (!match) {
		throw new Error(`Invalid S3 URI: "${uri}" (expected s3://bucket/key)`);
	}
	const [, bucket, key] = match;
	const resolvedRegion = region ?? process.env.AWS_REGION ?? "us-east-1";
	const encodedKey = key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `https://${bucket}.s3.${resolvedRegion}.amazonaws.com/${encodedKey}`;
}

/** Resolve a user-supplied source into something `openRead` understands. */
function resolveSource(source: string, opts: CmdOptions): string {
	return source.startsWith("s3://") ? s3ToHttps(source, opts.region) : source;
}

/** Best-effort source format from `--from`, else the source's file extension. */
function sourceFormat(input: string, opts: CmdOptions): SubtitleFormat | undefined {
	if (opts.from) {
		return opts.from as SubtitleFormat;
	}
	const withoutQuery = input.split("?")[0];
	return formatFromExtension(withoutQuery) ?? undefined;
}

/** Resolve the target format from `--to`, else the `-o` output extension. */
function targetFormat(opts: CmdOptions): SubtitleFormat | null {
	if (opts.to) {
		return opts.to as SubtitleFormat;
	}
	if (opts.output) {
		return formatFromExtension(opts.output);
	}
	return null;
}

async function collect(readable: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of readable) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function writeAll(io: CliIO, dest: string | undefined, data: string): Promise<void> {
	const writable = await io.openWrite(dest);
	await new Promise<void>((resolve, reject) => {
		writable.on("error", reject);
		writable.end(data, () => resolve());
	});
}

/** Run a constant-memory streaming pipeline: source -> parse -> ops -> stringify -> dest. */
async function runStreaming(
	io: CliIO,
	resolvedSource: string,
	dest: string | undefined,
	from: SubtitleFormat,
	to: SubtitleFormat,
	transforms: NodeJS.ReadWriteStream[],
): Promise<void> {
	const input = await io.openRead(resolvedSource);
	const output = await io.openWrite(dest);
	await pipeline([input, parseStream(from), ...transforms, stringifyStream(to), output]);
}

/** Read the whole source, transform the document in memory, write the result. */
async function runBuffered(
	io: CliIO,
	resolvedSource: string,
	dest: string | undefined,
	from: SubtitleFormat | undefined,
	to: SubtitleFormat | undefined,
	transformDoc: (doc: SubtitleDocument) => SubtitleDocument,
): Promise<void> {
	const text = await collect(await io.openRead(resolvedSource));
	const doc = transformDoc(parse(text, { format: from }));
	await writeAll(io, dest, stringify(doc, to));
}

type TimingCommand = "convert" | "shift" | "scale";

async function doConvertLike(
	io: CliIO,
	command: TimingCommand,
	input: string,
	opts: CmdOptions,
): Promise<number> {
	const by = opts.by === undefined ? 0 : Number(opts.by);
	const factor = opts.factor === undefined ? 1 : Number(opts.factor);
	const anchor = opts.anchor === undefined ? undefined : Number(opts.anchor);

	const from = sourceFormat(input, opts);
	const explicitTarget = targetFormat(opts);
	if (command === "convert" && !explicitTarget) {
		io.stderr("error: convert requires --to <fmt> or -o <file.ext>\n");
		return 1;
	}
	// shift/scale keep the source format when no target is requested.
	const to = explicitTarget ?? (command === "convert" ? null : from);

	const resolvedSource = resolveSource(input, opts);

	const canStream =
		!opts.buffer && from !== undefined && to != null && isStreamable(from) && isStreamable(to);

	if (canStream) {
		const transforms: NodeJS.ReadWriteStream[] = [];
		if (command === "shift") {
			transforms.push(shiftStream(by));
		}
		if (command === "scale") {
			transforms.push(scaleStream(factor, { anchor }));
		}
		await runStreaming(io, resolvedSource, opts.output, from, to, transforms);
		return 0;
	}

	const transformDoc = (doc: SubtitleDocument): SubtitleDocument => {
		if (command === "shift") {
			return shift(doc, by);
		}
		if (command === "scale") {
			return scale(doc, factor, { anchor });
		}
		return doc;
	};
	await runBuffered(io, resolvedSource, opts.output, from, to ?? undefined, transformDoc);
	return 0;
}

async function doInfo(io: CliIO, input: string, opts: CmdOptions): Promise<number> {
	const text = await collect(await io.openRead(resolveSource(input, opts)));
	const format = (opts.from as SubtitleFormat | undefined) ?? detectFormat(text);
	if (!format) {
		io.stderr("error: could not detect subtitle format\n");
		return 1;
	}
	const doc = parse(text, { format });
	const totalMs = doc.cues.reduce((max, c) => Math.max(max, c.end), 0);
	io.stdout(`format: ${format}\ncues:   ${doc.cues.length}\nlength: ${totalMs} ms\n`);
	return 0;
}

/** Build the commander program, wiring every action to the injected `io`. */
function buildProgram(io: CliIO, setExitCode: (code: number) => void): Command {
	const program = new Command();
	program
		.name("subtitle-kit")
		.description("Parse, transform, and convert subtitles between every common format.")
		.version(`subtitle-kit ${VERSION}`, "-v, --version", "output the version number")
		.configureOutput({
			writeOut: (str) => io.stdout(str),
			writeErr: (str) => io.stderr(str),
		})
		.addHelpText("after", EXTRA_HELP)
		.exitOverride();

	const common = (cmd: Command): Command =>
		cmd
			.option("-f, --from <fmt>", "source format (else inferred from extension/content)")
			.option("-o, --output <file>", "write to a file instead of stdout")
			.option("--region <region>", "AWS region for s3:// sources")
			.option("--buffer", "force the buffered (non-streaming) path");

	common(program.command("convert").description("convert between subtitle formats"))
		.argument("<input>", "source file, URL, s3:// URI, or - for stdin")
		.option("-t, --to <fmt>", "target format")
		.action(async (input: string, opts: CmdOptions) => {
			setExitCode(await doConvertLike(io, "convert", input, opts));
		});

	common(program.command("shift").description("offset all cue timings"))
		.argument("<input>", "source file, URL, s3:// URI, or - for stdin")
		.requiredOption("--by <ms>", "milliseconds to add (may be negative)")
		.option("-t, --to <fmt>", "target format (default: keep the source format)")
		.action(async (input: string, opts: CmdOptions) => {
			setExitCode(await doConvertLike(io, "shift", input, opts));
		});

	common(program.command("scale").description("scale all cue timings (e.g. frame-rate fixes)"))
		.argument("<input>", "source file, URL, s3:// URI, or - for stdin")
		.requiredOption("--factor <n>", "timing multiplier (e.g. 1.001)")
		.option("--anchor <ms>", "pivot point the scaling is applied around")
		.option("-t, --to <fmt>", "target format (default: keep the source format)")
		.action(async (input: string, opts: CmdOptions) => {
			setExitCode(await doConvertLike(io, "scale", input, opts));
		});

	program
		.command("info")
		.description("print the detected format, cue count, and duration")
		.argument("<input>", "source file, URL, s3:// URI, or - for stdin")
		.option("-f, --from <fmt>", "source format (else auto-detected)")
		.option("--region <region>", "AWS region for s3:// sources")
		.action(async (input: string, opts: CmdOptions) => {
			setExitCode(await doInfo(io, input, opts));
		});

	return program;
}

/**
 * Run the CLI with the given argument list (excluding `node` and the script
 * path). Returns a process exit code. All I/O is delegated to `io`.
 */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
	let exitCode = 0;
	const program = buildProgram(io, (code) => {
		exitCode = code;
	});

	if (argv.length === 0) {
		program.outputHelp();
		return 0;
	}

	try {
		await program.parseAsync(argv, { from: "user" });
	} catch (error) {
		if (error instanceof CommanderError) {
			// Help and version are normal exits; commander already wrote output.
			if (
				error.code === "commander.helpDisplayed" ||
				error.code === "commander.help" ||
				error.code === "commander.version"
			) {
				return 0;
			}
			// Usage errors (unknown command/option, missing argument) are reported
			// by commander to stderr already.
			return 1;
		}
		// A runtime failure thrown by an action (bad file, fetch error, parse error).
		io.stderr(`error: ${(error as Error).message}\n`);
		return 1;
	}
	return exitCode;
}

/** Build the production IO wired to the real Node.js environment. */
async function createNodeIO(): Promise<CliIO> {
	const { createReadStream, createWriteStream } = await import("node:fs");
	const { Readable, Writable } = await import("node:stream");

	return {
		async openRead(source) {
			if (source === "-") {
				return process.stdin;
			}
			if (/^https?:\/\//.test(source)) {
				const response = await fetch(source);
				if (!response.ok || !response.body) {
					throw new Error(
						`fetch failed: ${response.status} ${response.statusText} (${source})`,
					);
				}
				return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
			}
			return createReadStream(source);
		},
		async openWrite(dest) {
			if (dest === undefined) {
				// Forward to stdout without ending the shared fd when the stream ends.
				return new Writable({
					write(chunk, _encoding, callback) {
						process.stdout.write(chunk, callback);
					},
				});
			}
			return createWriteStream(dest);
		},
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
}

async function main(): Promise<void> {
	const io = await createNodeIO();
	process.exitCode = await runCli(process.argv.slice(2), io);
}

// Run only when executed as a script, not when imported by tests.
if (process.argv[1] && /cli\.(m?js|ts)$/.test(process.argv[1])) {
	void main();
}
