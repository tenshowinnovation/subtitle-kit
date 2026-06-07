import { describe, expect, it } from "vitest";

import { json } from "../src/formats/json";
import { jsonl } from "../src/formats/jsonl";

const DOC_JSON = JSON.stringify({
	format: "json",
	meta: { title: "Example" },
	cues: [
		{ start: 1000, end: 4000, text: "Hello world" },
		{ start: 5500, end: 8000, text: "Second" },
	],
});

describe("json.parse", () => {
	it("parses a full document object", () => {
		const doc = json.parse(DOC_JSON);
		expect(doc.format).toBe("json");
		expect(doc.meta.title).toBe("Example");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[0]).toMatchObject({ start: 1000, end: 4000, text: "Hello world" });
	});

	it("accepts a bare array of cues", () => {
		const doc = json.parse(`[{"start":0,"end":1000,"text":"hi"}]`);
		expect(doc.cues).toHaveLength(1);
		expect(doc.cues[0].text).toBe("hi");
	});

	it("throws on invalid JSON", () => {
		expect(() => json.parse("{not json")).toThrow();
	});
});

describe("json.stringify", () => {
	it("emits a parseable document with cues and meta", () => {
		const out = json.stringify(json.parse(DOC_JSON));
		const back = JSON.parse(out);
		expect(back.cues).toHaveLength(2);
		expect(back.meta.title).toBe("Example");
	});

	it("round-trips", () => {
		const doc = json.parse(DOC_JSON);
		expect(json.parse(json.stringify(doc)).cues).toEqual(doc.cues);
	});
});

describe("json.detect", () => {
	it("recognizes JSON documents", () => {
		expect(json.detect(DOC_JSON)).toBe(true);
	});

	it("rejects SubRip content", () => {
		expect(json.detect("1\n00:00:01,000 --> 00:00:02,000\nhi")).toBe(false);
	});
});

const JSONL_TEXT = `{"start":1000,"end":4000,"text":"Hello world"}
{"start":5500,"end":8000,"text":"Second"}
`;

describe("jsonl.parse", () => {
	it("parses one cue object per line", () => {
		const doc = jsonl.parse(JSONL_TEXT);
		expect(doc.format).toBe("jsonl");
		expect(doc.cues).toHaveLength(2);
		expect(doc.cues[1]).toMatchObject({ start: 5500, end: 8000, text: "Second" });
	});

	it("ignores blank lines", () => {
		const doc = jsonl.parse(`\n${JSONL_TEXT}\n\n`);
		expect(doc.cues).toHaveLength(2);
	});
});

describe("jsonl.stringify", () => {
	it("emits one compact JSON object per line", () => {
		const out = jsonl.stringify(jsonl.parse(JSONL_TEXT));
		const lines = out.trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0]).text).toBe("Hello world");
	});

	it("round-trips", () => {
		const doc = jsonl.parse(JSONL_TEXT);
		expect(jsonl.parse(jsonl.stringify(doc)).cues).toEqual(doc.cues);
	});
});

describe("jsonl.detect", () => {
	it("recognizes JSON Lines", () => {
		expect(jsonl.detect(JSONL_TEXT)).toBe(true);
	});

	it("rejects a JSON array document", () => {
		expect(jsonl.detect(DOC_JSON)).toBe(false);
	});
});
