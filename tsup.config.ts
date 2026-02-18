import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    clean: true,
    splitting: true,
    target: "node20",
    banner: {
      js: '#!/usr/bin/env node\nimport{createRequire as __cr}from"node:module";globalThis.require=__cr(import.meta.url);',
    },
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
    banner: {
      js: 'import{createRequire as __cr}from"node:module";globalThis.require=__cr(import.meta.url);',
    },
  },
  {
    entry: { "vite-plugin": "src/vite-plugin.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: true,
    splitting: false,
    target: "node20",
    external: ["vite"],
  },
]);
