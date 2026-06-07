import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		// Resolve the core package to its source so tests run without a build.
		// The subpath alias must precede the base alias so it wins.
		alias: [
			{
				find: "@tenshowinnovation/subtitle-kit-core/stream",
				replacement: fileURLToPath(new URL("../core/src/stream.ts", import.meta.url)),
			},
			{
				find: "@tenshowinnovation/subtitle-kit-core",
				replacement: fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
			},
		],
	},
});
