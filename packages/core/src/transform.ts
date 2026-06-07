import type { SubtitleCue, SubtitleDocument } from "./types";

/** Return a deep-enough copy so transforms never mutate their input. */
function clone(doc: SubtitleDocument): SubtitleDocument {
	return {
		format: doc.format,
		meta: { ...doc.meta },
		cues: doc.cues.map((cue) => ({
			...cue,
			...(cue.styles ? { styles: { ...cue.styles } } : {}),
		})),
	};
}

function clampTime(ms: number): number {
	return Math.max(0, Math.round(ms));
}

/** Offset every cue's timing by `ms` (may be negative). Times clamp at zero. */
export function shift(doc: SubtitleDocument, ms: number): SubtitleDocument {
	const next = clone(doc);
	for (const cue of next.cues) {
		cue.start = clampTime(cue.start + ms);
		cue.end = clampTime(cue.end + ms);
	}
	return next;
}

/**
 * Multiply every cue's timing by `factor`, optionally around an `anchor`
 * (useful for correcting frame-rate / drift). Times clamp at zero.
 */
export function scale(
	doc: SubtitleDocument,
	factor: number,
	options: { anchor?: number } = {},
): SubtitleDocument {
	const anchor = options.anchor ?? 0;
	const next = clone(doc);
	for (const cue of next.cues) {
		cue.start = clampTime(anchor + (cue.start - anchor) * factor);
		cue.end = clampTime(anchor + (cue.end - anchor) * factor);
	}
	return next;
}

/** Sort cues ascending by start time (ties broken by end time). */
export function sortCues(doc: SubtitleDocument): SubtitleDocument {
	const next = clone(doc);
	next.cues.sort((a, b) => a.start - b.start || a.end - b.end);
	return next;
}

/** Keep only cues for which `predicate` returns true. */
export function filterCues(
	doc: SubtitleDocument,
	predicate: (cue: SubtitleCue, index: number) => boolean,
): SubtitleDocument {
	const next = clone(doc);
	next.cues = next.cues.filter((cue, i) => predicate(cue, i));
	return next;
}

/** Apply `fn` to every cue's text. */
export function mapText(
	doc: SubtitleDocument,
	fn: (text: string, cue: SubtitleCue) => string,
): SubtitleDocument {
	const next = clone(doc);
	for (const cue of next.cues) {
		cue.text = fn(cue.text, cue);
	}
	return next;
}

/** Rewrite cue indexes to a sequential 1-based run. */
export function renumber(doc: SubtitleDocument): SubtitleDocument {
	const next = clone(doc);
	next.cues.forEach((cue, i) => {
		cue.index = i + 1;
	});
	return next;
}

/**
 * Keep cues that overlap the `[start, end]` window (in ms), trimming each cue's
 * bounds to fit the window.
 */
export function clip(doc: SubtitleDocument, start: number, end: number): SubtitleDocument {
	const next = clone(doc);
	next.cues = next.cues
		.filter((cue) => cue.end > start && cue.start < end)
		.map((cue) => ({
			...cue,
			start: Math.max(cue.start, start),
			end: Math.min(cue.end, end),
		}));
	return next;
}

/**
 * Merge cues whose intervals overlap or touch into single cues, joining their
 * text with newlines. Assumes (and produces) start-sorted cues.
 */
export function mergeOverlapping(doc: SubtitleDocument): SubtitleDocument {
	const sorted = sortCues(doc);
	const merged: SubtitleCue[] = [];

	for (const cue of sorted.cues) {
		const last = merged[merged.length - 1];
		if (last && cue.start <= last.end) {
			last.end = Math.max(last.end, cue.end);
			last.text = last.text === "" ? cue.text : `${last.text}\n${cue.text}`;
		} else {
			merged.push({ ...cue });
		}
	}

	sorted.cues = merged;
	return renumber(sorted);
}
