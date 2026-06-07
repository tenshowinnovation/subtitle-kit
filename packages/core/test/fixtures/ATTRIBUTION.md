# Test fixtures

Real-world subtitle files used to exercise the parsers against messy, production-grade input (override tags, bilingual cues, BOM/CRLF, numeric cue identifiers, promo lines, etc.). They are used solely as test data.

| File | Format | Source / notes |
| --- | --- | --- |
| `breaking-bad.s01e01.ass` | ASS (Advanced SubStation Alpha) | Provided by the project owner. Bilingual CN/EN dialogue with `\N` line breaks, inline override blocks (`{\fn…}`), many named styles, UTF-8 + CRLF. ~695 dialogue events. |
| `elephants-dream.en.vtt` | WebVTT | *Elephants Dream* (Blender Foundation, CC-BY 2.5) English captions, via the [video.js](https://github.com/videojs/video.js) example assets. Numeric cue identifiers. 78 cues. |
| `pysrt-sample.fr.srt` | SubRip (SRT) | French sample subtitle from the [pysrt](https://github.com/byroot/pysrt) test corpus (BSD-3-Clause). Starts at cue index `0` with a promo line; accented UTF-8 text. 1332 cues. |

These files are included only as fixtures for the test suite and are not part of the published packages.
