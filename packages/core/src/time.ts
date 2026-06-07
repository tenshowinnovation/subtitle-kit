import type { SubtitleFormat } from "./types";
import { SubtitleParseError } from "./types";

/**
 * Parse a textual timestamp into integer milliseconds.
 *
 * Accepts the notations used across the supported formats so callers never need
 * to know which dialect produced the string:
 *
 * - `HH:MM:SS,mmm` (SRT)
 * - `HH:MM:SS.mmm` / `MM:SS.mmm` (WebVTT, SBV)
 * - `H:MM:SS.cc` (ASS/SSA centiseconds)
 * - `MM:SS.cc` / `MM:SS.mmm` (LRC)
 * - a bare number of milliseconds (`1500`)
 *
 * The fractional part is interpreted by its digit count: 2 digits are
 * centiseconds, 3 are milliseconds; other lengths are scaled to milliseconds.
 */
export function parseTimestamp(input: string): number {
	const raw = input.trim();
	if (raw === "") {
		throw new SubtitleParseError("Empty timestamp");
	}

	// Bare integer milliseconds.
	if (/^\d+$/.test(raw)) {
		return Number(raw);
	}

	const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/.exec(raw);
	if (!match) {
		throw new SubtitleParseError(`Invalid timestamp: "${input}"`);
	}

	const [, hours, minutes, seconds, fraction] = match;
	let ms = 0;
	ms += Number(hours ?? 0) * 3_600_000;
	ms += Number(minutes) * 60_000;
	ms += Number(seconds) * 1000;
	ms += fractionToMillis(fraction);
	return ms;
}

function fractionToMillis(fraction: string | undefined): number {
	if (!fraction) {
		return 0;
	}
	if (fraction.length === 3) {
		return Number(fraction);
	}
	if (fraction.length === 2) {
		return Number(fraction) * 10;
	}
	// Normalize any other precision to a 0..1 fraction of a second.
	return Math.round(Number(`0.${fraction}`) * 1000);
}

/**
 * Format integer milliseconds as a timestamp string in the conventions of the
 * given subtitle format. Negative inputs are clamped to zero.
 */
export function formatTimestamp(ms: number, format: SubtitleFormat): string {
	const total = Math.max(0, Math.round(ms));
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1000);
	const millis = total % 1000;

	switch (format) {
		case "srt":
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
		case "vtt":
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
		case "sbv":
			// YouTube SBV uses a single-digit hour with millisecond precision.
			return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
		case "ass":
		case "ssa":
			// ASS uses a single-digit hour and centiseconds.
			return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(Math.floor(millis / 10), 2)}`;
		case "lrc":
			// LRC tags are [mm:ss.xx] with centiseconds; hours fold into minutes.
			return `${pad(hours * 60 + minutes)}:${pad(seconds)}.${pad(Math.floor(millis / 10), 2)}`;
		default:
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
	}
}

function pad(value: number, width = 2): string {
	return String(value).padStart(width, "0");
}
