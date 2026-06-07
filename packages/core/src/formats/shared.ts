/**
 * Strip a leading UTF-8 byte-order mark and normalize line endings to `\n`.
 * Every text-based parser runs its input through this first.
 */
export function normalizeInput(input: string): string {
	return input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * Split normalized text into blocks separated by one or more blank lines.
 * Surrounding whitespace is trimmed and empty blocks are dropped.
 */
export function splitBlocks(input: string): string[] {
	return input
		.split(/\n[ \t]*\n/)
		.map((block) => block.replace(/^\n+|\n+$/g, ""))
		.filter((block) => block.trim() !== "");
}
