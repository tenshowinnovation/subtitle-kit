import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/cli.ts"],
	sourcemap: true,
	dts: true,
	format: ["esm"],
	platform: "node",
	// Keep the core library as a runtime dependency rather than inlining it.
	external: ["@subtitle-kit/core"],
	outExtensions: ({ format }) => ({
		js: format === "es" ? ".mjs" : format === "cjs" ? ".cjs" : ".js",
	}),
});
