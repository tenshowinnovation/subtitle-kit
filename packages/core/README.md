# @tenshowinnovation/subtitle-kit-core

Parse, transform, and convert subtitles between every common format — **with zero runtime dependencies**.

Supported formats: **SRT**, **WebVTT**, **ASS/SSA**, **SBV** (YouTube), **LRC** (lyrics), **JSON**, **JSONL**, and plain **text**.

- 🪶 **0 dependencies** — pure ESM, ~7 kB, tree-shakeable, runs anywhere (Node, Deno, Bun, the browser).
- ⏱️ **One model, milliseconds everywhere** — `{ format, cues: [{ start, end, text }], meta }`.
- 🔁 **Lossless round-trips**, verified byte-for-byte against real-world subtitle files.
- 🌊 **Optional streaming** via the Node-only [`@tenshowinnovation/subtitle-kit-core/stream`](#streaming-tenshowinnovationsubtitle-kit-corestream) subpath — the main entry stays dependency-free and portable.
- 🧪 **Test-first**: 154 tests in the core package alone.

> Want a command-line tool? Install [`@tenshowinnovation/subtitle-kit-cli`](../cli) for the `subtitle-kit` / `subkit` binaries.

## Install

```sh
pnpm add @tenshowinnovation/subtitle-kit-core
```

## Quick start

```ts
import { parse, convert, shift, stringify } from "@tenshowinnovation/subtitle-kit-core";

// Auto-detect the input format and parse into a canonical model.
const doc = parse(srtText);
doc.cues[0]; // { index: 1, start: 1000, end: 4000, text: "Hello world" }

// Convert between formats in one call (source auto-detected).
const vtt = convert(srtText, "vtt");

// Transform, then serialize.
const delayed = shift(doc, 1500); // push everything 1.5s later
const out = stringify(delayed, "ass");
```

All timing is normalized to **integer milliseconds**, so arithmetic never depends on a format's textual notation.

## Data model

```ts
interface SubtitleDocument {
	format: SubtitleFormat; // "srt" | "vtt" | "ass" | "ssa" | "sbv" | "lrc" | "json" | "jsonl" | "txt"
	cues: SubtitleCue[];
	meta: Record<string, string>; // headers, [Script Info], LRC id tags …
}

interface SubtitleCue {
	index?: number;
	start: number; // ms
	end: number; // ms
	text: string; // plain text; lines joined with "\n"
	voice?: string; // <v> tag / ASS Name
	styles?: Record<string, string>; // format-specific extras (cue settings, style …)
}
```

## API

### Parsing & serialization

- `parse(input, { format? })` — parse text into a `SubtitleDocument`; auto-detects format unless one is given.
- `stringify(doc, format?)` — serialize a document, optionally to a different format.
- `convert(input, to, { from? })` — parse + serialize in one step.
- `detectFormat(input)` — return the detected `SubtitleFormat` or `null`.
- `formatFromExtension(fileOrExt)` — resolve a format from `movie.srt`, `.vtt`, `ssa`, …
- `listFormats()` / `getHandler(format)` — registry introspection.

Each format handler is also exported directly: `srt`, `vtt`, `ass`, `sbv`, `lrc`, `json`, `jsonl`, `txt` — each with `{ parse, stringify, detect }`.

### Transforms

Every transform is **pure** — it returns a new document and never mutates its input.

- `shift(doc, ms)` — offset all timings (clamped at zero).
- `scale(doc, factor, { anchor? })` — multiply timings around an optional pivot (frame-rate / drift fixes).
- `sortCues(doc)` — order by start time.
- `filterCues(doc, predicate)` — keep matching cues.
- `mapText(doc, fn)` — rewrite each cue's text.
- `renumber(doc)` — sequential 1-based indexes.
- `clip(doc, start, end)` — keep cues overlapping a window, trimming bounds.
- `mergeOverlapping(doc)` — merge overlapping/touching cues, joining text.

### Time helpers

- `parseTimestamp(str)` — any supported notation → milliseconds.
- `formatTimestamp(ms, format)` — milliseconds → a format's notation.

## Streaming (`@tenshowinnovation/subtitle-kit-core/stream`)

For large files or pipelines, a Node.js stream API processes subtitles cue-by-cue with constant memory. It is exposed under a separate, Node-only subpath so the main entry stays dependency-free and portable:

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
	parseStream,
	shiftStream,
	stringifyStream,
} from "@tenshowinnovation/subtitle-kit-core/stream";

await pipeline(
	createReadStream("in.srt"),
	parseStream("srt"), // bytes -> StreamNode objects
	shiftStream(-100), // per-cue transform
	stringifyStream("vtt"), // StreamNode objects -> bytes
	createWriteStream("out.vtt"),
);
```

A streamed subtitle is a flat sequence of nodes — `{ type: "header", data }` (document metadata) followed by `{ type: "cue", data: SubtitleCue }` — emitted as they are parsed.

- `parseStream(format)` / `stringifyStream(format)` — Transform streams.
- `shiftStream`, `scaleStream`, `mapTextStream`, `filterStream`, `renumberStream` — per-cue Transforms; header nodes pass through untouched.
- `cueTransform(fn)` — build your own per-cue Transform.
- `isStreamable(format)` — `true` for `srt`/`vtt`/`ass`/`sbv`/`jsonl`/`txt`; `json` and `lrc` are buffered-only.

Chunk boundaries, CRLF, and a leading BOM are handled transparently.

## CLI

The command-line interface ships separately as [`@tenshowinnovation/subtitle-kit-cli`](../cli), which installs the `subtitle-kit` and `subkit` binaries:

```sh
pnpm add -g @tenshowinnovation/subtitle-kit-cli
subkit convert movie.srt --to vtt > movie.vtt
```

## License

MIT
