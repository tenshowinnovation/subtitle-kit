# @tenshowinnovation/subtitle-kit-cli

A fast, friendly command-line subtitle converter and editor. Wraps the zero-dependency [`@tenshowinnovation/subtitle-kit-core`](../core) and installs the `subtitle-kit` and `subkit` binaries.

Supported formats: **SRT**, **WebVTT**, **ASS/SSA**, **SBV** (YouTube), **LRC** (lyrics), **JSON**, **JSONL**, plain **text**.

- 🔄 **Convert anything to anything** — `subkit convert in.ass --to vtt`.
- ⏱️ **Retime in place** — `shift` and `scale` for offsets and frame-rate drift.
- ☁️ **Read from anywhere** — local files, stdin, `http(s)://`, or `s3://` (no AWS SDK needed).
- 🌊 **Streaming by default** — constant memory for huge files; pipe-friendly.
- 🛠️ Built on [`commander`](https://github.com/tj/commander.js) for a polished `--help` and ergonomic flags.

## Install

```sh
pnpm add -g @tenshowinnovation/subtitle-kit-cli
# or run ad-hoc
npx @tenshowinnovation/subtitle-kit-cli convert movie.srt --to vtt
```

## Usage

```sh
# Convert (target from --to or the -o extension)
subkit convert movie.srt --to vtt > movie.vtt
subkit convert movie.srt -o movie.ass

# Shift / scale timing
subkit shift movie.srt --by 1500 -o delayed.srt
subkit scale movie.srt --factor 1.001 --anchor 0 -o fixed.srt

# Inspect
subkit info movie.srt

# Pipe via stdin with '-'
cat movie.srt | subkit convert - --to json
```

## Remote input (HTTP / S3)

`<input>` can be a URL, so you can convert subtitles straight out of object
storage — no AWS SDK or other dependency required (it uses Node's built-in
`fetch`):

```sh
# Any HTTP(S) URL
subkit convert https://cdn.example.com/movie.srt --to vtt -o movie.vtt

# S3 object — mapped to https://<bucket>.s3.<region>.amazonaws.com/<key>
subkit convert s3://my-bucket/subs/movie.srt --to vtt --region us-west-2 -o movie.vtt
```

- The S3 region comes from `--region`, else `$AWS_REGION`, else `us-east-1`.
- `s3://` works for **public** objects. For private buckets, generate a
  **presigned `https://` URL** and pass that directly (SigV4 request signing is
  intentionally not built in).

## Streaming

For streamable formats (`srt`, `vtt`, `ass`, `sbv`, `jsonl`, `txt`) the CLI
parses, transforms, and serializes as a constant-memory stream — input is never
fully held in memory. This kicks in automatically when the source format is
known (from `--from` or the file/URL extension) and the target is streamable.

- `json` and `lrc` always use the buffered path (they need the whole document).
- Pass `--buffer` to force buffering for any command.
- Output is written incrementally to `-o <file>` or stdout, so
  `subkit convert huge.srt --to vtt | head` streams the first cues immediately.

```
subtitle-kit convert <input> (--to <fmt> | -o <file>) [--from <fmt>] [-o <file>]
subtitle-kit shift   <input> --by <ms> [--to <fmt>] [-o <file>]
subtitle-kit scale   <input> --factor <n> [--anchor <ms>] [--to <fmt>] [-o <file>]
subtitle-kit info    <input>
subtitle-kit --help | --version
```

Use `-` as `<input>` to read from stdin. Output goes to stdout unless `-o` is given.

For programmatic use, depend on [`@tenshowinnovation/subtitle-kit-core`](../core) directly.

## License

MIT
