import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/stream.ts"],
	sourcemap: true,
	dts: true,
	format: ["esm"],
	platform: "node",
	outExtensions: ({ format }) => ({
		js: format === "es" ? ".mjs" : format === "cjs" ? ".cjs" : ".js",
	}),
});
