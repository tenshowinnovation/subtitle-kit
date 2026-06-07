import { Readable, Writable } from "node:stream";

import type { CliIO } from "../src/cli";

export interface TestIO extends CliIO {
	/** Captured stdout (textual messages + data written without `-o`). */
	out: string;
	/** Captured stderr. */
	err: string;
	/** Content delivered when the source is `-` (stdin). */
	stdin: string;
	/** In-memory filesystem: source reads and `-o` writes. */
	files: Record<string, string>;
	/** In-memory remote store keyed by resolved `http(s)://` URL. */
	remote: Record<string, string>;
}

/**
 * Build an in-memory {@link CliIO} for tests. Sources resolve to `Readable`s
 * and destinations to collecting `Writable`s, so both the streaming and
 * buffered code paths run end-to-end without touching the real filesystem,
 * network, or stdio.
 */
export function makeIO(
	files: Record<string, string> = {},
	remote: Record<string, string> = {},
): TestIO {
	const store = { ...files };
	const rem = { ...remote };

	const io: TestIO = {
		out: "",
		err: "",
		stdin: "",
		files: store,
		remote: rem,
		async openRead(source) {
			if (source === "-") {
				return Readable.from([io.stdin]);
			}
			if (/^https?:\/\//.test(source)) {
				if (!(source in rem)) {
					throw new Error(`no such remote: ${source}`);
				}
				return Readable.from([rem[source]]);
			}
			if (!(source in store)) {
				throw new Error(`no such file: ${source}`);
			}
			return Readable.from([store[source]]);
		},
		async openWrite(dest) {
			const chunks: Buffer[] = [];
			return new Writable({
				write(chunk, _encoding, callback) {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
					callback();
				},
				final(callback) {
					const data = Buffer.concat(chunks).toString("utf8");
					if (dest === undefined) {
						io.out += data;
					} else {
						store[dest] = data;
					}
					callback();
				},
			});
		},
		stdout(text) {
			io.out += text;
		},
		stderr(text) {
			io.err += text;
		},
	};

	return io;
}
