/**
 * Canonical subtitle format identifiers understood by the library.
 */
export type SubtitleFormat =
	| "srt"
	| "vtt"
	| "ass"
	| "ssa"
	| "sbv"
	| "lrc"
	| "json"
	| "jsonl"
	| "txt";

/**
 * A single subtitle entry, normalized into a format-independent shape.
 *
 * Timing is always expressed in integer milliseconds so that arithmetic
 * (shifting, scaling, sorting) never depends on a format's textual notation.
 */
export interface SubtitleCue {
	/**
	 * 1-based sequence number. Optional because some formats (VTT, LRC) do not
	 * require it; serializers regenerate it when a format demands one.
	 */
	index?: number;
	/** Start time in milliseconds from the beginning of the media. */
	start: number;
	/** End time in milliseconds from the beginning of the media. */
	end: number;
	/** Plain-text content. Multiple display lines are separated by `\n`. */
	text: string;
	/** Speaker / voice label (WebVTT `<v>`, ASS `Name`). */
	voice?: string;
	/**
	 * Format-specific fields preserved so a round-trip keeps information the
	 * canonical model does not model directly (e.g. VTT cue settings, ASS style).
	 */
	styles?: Record<string, string>;
}

/**
 * A parsed subtitle file: an ordered list of cues plus document-level metadata
 * (headers, script info, lyric tags) keyed by name.
 */
export interface SubtitleDocument {
	/** The format this document was parsed from / should serialize to. */
	format: SubtitleFormat;
	/** Ordered subtitle entries. */
	cues: SubtitleCue[];
	/** Document-level metadata: VTT header lines, ASS `[Script Info]`, LRC tags. */
	meta: Record<string, string>;
}

/**
 * A format handler knows how to recognize, read, and write one subtitle format.
 */
export interface FormatHandler {
	/** Canonical name of the format. */
	readonly name: SubtitleFormat;
	/** Common file extensions (without leading dot), most-canonical first. */
	readonly extensions: readonly string[];
	/** Heuristically decide whether `input` is this format. */
	detect(input: string): boolean;
	/** Parse `input` into the canonical document model. */
	parse(input: string): SubtitleDocument;
	/** Serialize a document back into this format's text. */
	stringify(doc: SubtitleDocument): string;
}

/** Error thrown when input cannot be parsed as the requested/expected format. */
export class SubtitleParseError extends Error {
	/** 1-based line number where parsing failed, when known. */
	readonly line?: number;

	constructor(message: string, options?: { line?: number; cause?: unknown }) {
		super(message, options?.cause === undefined ? undefined : { cause: options.cause });
		this.name = "SubtitleParseError";
		this.line = options?.line;
	}
}
