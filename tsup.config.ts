import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    clean: true,
    splitting: true,
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
    noExternal: [/.*/],
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: true,
    splitting: false,
    target: "node20",
    noExternal: [/.*/],
  },
]);
