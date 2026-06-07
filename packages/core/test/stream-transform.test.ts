import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
	filterStream,
	mapTextStream,
	renumberStream,
	scaleStream,
	shiftStream,
	type StreamNode,
} from "../src/stream";
import type { SubtitleCue } from "../src/types";

function cue(start: number, end: number, text: string, index?: number): SubtitleCue {
	return { index, start, end, text };
}

const NODES: StreamNode[] = [
	{ type: "header", data: { title: "x" } },
	{ type: "cue", data: cue(1000, 2000, "one", 1) },
	{ type: "cue", data: cue(3000, 4000, "two", 2) },
	{ type: "cue", data: cue(5000, 6000, "three", 3) },
];

async function run(transform: NodeJS.ReadWriteStream, nodes: StreamNode[] = NODES) {
	const out: StreamNode[] = [];
	await new Promise<void>((resolve, reject) => {
		Readable.from(nodes)
			.pipe(transform)
			.on("data", (n: StreamNode) => out.push(n))
			.on("end", resolve)
			.on("error", reject);
	});
	return out;
}

function cuesOf(nodes: StreamNode[]): SubtitleCue[] {
	return nodes.filter((n) => n.type === "cue").map((n) => (n as { data: SubtitleCue }).data);
}

describe("per-cue transform streams", () => {
	it("passes the header node through untouched", async () => {
		const out = await run(shiftStream(500));
		expect(out[0]).toEqual({ type: "header", data: { title: "x" } });
	});

	it("shiftStream offsets timings and clamps at zero", async () => {
		const out = cuesOf(await run(shiftStream(-1500)));
		expect(out[0]).toMatchObject({ start: 0, end: 500 });
		expect(out[1]).toMatchObject({ start: 1500, end: 2500 });
	});

	it("scaleStream multiplies around an anchor", async () => {
		const out = cuesOf(await run(scaleStream(2, { anchor: 1000 })));
		expect(out[0]).toMatchObject({ start: 1000, end: 3000 });
	});

	it("mapTextStream rewrites text", async () => {
		const out = cuesOf(await run(mapTextStream((t) => t.toUpperCase())));
		expect(out.map((c) => c.text)).toEqual(["ONE", "TWO", "THREE"]);
	});

	it("filterStream drops non-matching cues but keeps the header", async () => {
		const out = await run(filterStream((c) => c.text !== "two"));
		expect(out[0].type).toBe("header");
		expect(cuesOf(out).map((c) => c.text)).toEqual(["one", "three"]);
	});

	it("renumberStream assigns sequential 1-based indexes after a filter", async () => {
		const filtered = await run(filterStream((c) => c.text !== "two"));
		const out = cuesOf(await run(renumberStream(), filtered));
		expect(out.map((c) => c.index)).toEqual([1, 2]);
	});
});
