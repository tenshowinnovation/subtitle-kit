import { describe, expect, it } from "vitest";

import { txt } from "../src/formats/txt";

describe("txt.stringify", () => {
	it("emits only cue text, one block per cue", () => {
		const out = txt.stringify({
			format: "txt",
			meta: {},
			cues: [
				{ start: 1000, end: 2000, text: "Hello world" },
				{ start: 3000, end: 4000, text: "Line one\nLine two" },
			],
		});
		expect(out).toBe("Hello world\n\nLine one\nLine two\n");
	});
});

describe("txt.parse", () => {
	it("reads blank-line-separated blocks into untimed cues", () => {
		const doc = txt.parse("Hello world\n\nSecond block\n");
		expect(doc.format).toBe("txt");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({ start: 0, end: 0, text: "Hello world" });
		expect(doc.cues[1].text).toBe("Second block");
	});
});
