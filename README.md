# subtitle-kit

**The subtitle toolkit for Node.js.** Parse, transform, and convert subtitles between every common format — as a tiny **zero-dependency** library or a batteries-included CLI.

```sh
# one-liner: pull a caption file off S3 and convert it
subkit convert s3://my-bucket/movie.srt --to vtt -o movie.vtt
```

## Why subtitle-kit?

- 🗂️ **Every format that matters** — SRT, WebVTT, ASS/SSA, SBV, LRC, JSON, JSONL, and plain text, all behind one unified model.
- 🪶 **Zero runtime dependencies** in the core. No bloat, no supply-chain surprises — just ~7 kB of ESM.
- ⏱️ **Millisecond-accurate** — every format normalizes to a single integer-ms model, so timing math just works.
- 🔁 **Lossless round-trips** — parse → transform → serialize without mangling your cues (verified byte-for-byte on real-world files).
- 🌊 **Streaming-first** — constant-memory `node:stream` pipelines for huge files; convert-as-you-read.
- ☁️ **Remote-native** — read straight from `http(s)://` or `s3://` URLs, no AWS SDK required.
- 🧪 **Ruthlessly tested** — 178 tests, built test-first, exercised against real production subtitle files.
- 📦 **Modern & typed** — ESM, full TypeScript types, tree-shakeable.

## Packages

| Package                               | Description                                               | Dependencies |
| ------------------------------------- | --------------------------------------------------------- | ------------ |
| [`@subtitle-kit/core`](packages/core) | The library: parse / transform / convert API + streaming. | **0**        |
| [`@subtitle-kit/cli`](packages/cli)   | The `subtitle-kit` / `subkit` CLI (built on `commander`). | 2            |

```sh
pnpm add @subtitle-kit/core        # library
pnpm add -g @subtitle-kit/cli      # CLI
```

## 60-second tour

```ts
import { parse, convert, shift, stringify } from "@subtitle-kit/core";

convert(srt, "vtt"); // SRT text -> WebVTT text (source auto-detected)
const doc = parse(srt); // -> { format, cues: [{ start, end, text }], meta }
stringify(shift(doc, 1500), "ass"); // delay 1.5s and emit ASS
```

```sh
subkit convert movie.srt --to vtt -o movie.vtt   # convert
subkit shift movie.srt --by -250 -o fixed.srt    # nudge timing
cat movie.ass | subkit convert - --to srt        # pipe through stdin
```

## Development

```sh
pnpm install
pnpm test         # vitest (TDD suite)
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build        # tsdown -> ESM + d.ts
```
