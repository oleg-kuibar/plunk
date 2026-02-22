import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    clean: true,
    splitting: true,
    target: "node22",
    banner: {
      js: '#!/usr/bin/env node\nimport{createRequire as __cr}from"node:module";globalThis.require=__cr(import.meta.url);',
    },
    noExternal: [/.*/],
    minify: true,
    treeshake: true,
    esbuildOptions(options) {
      options.keepNames = true;
      options.legalComments = "none";
      options.drop = ["debugger"];
    },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: true,
    splitting: false,
    target: "node22",
  },
  {
    entry: { "vite-plugin": "src/vite-plugin.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    dts: true,
    splitting: false,
    target: "node22",
    external: ["vite"],
  },
  {
    entry: { "hash-worker": "src/utils/hash-worker.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    splitting: false,
    target: "node22",
    noExternal: [/.*/],
    banner: {
      js: 'import{createRequire as __cr}from"node:module";globalThis.require=__cr(import.meta.url);',
    },
    minify: true,
    treeshake: true,
    esbuildOptions(options) {
      options.keepNames = true;
      options.legalComments = "none";
      options.drop = ["debugger"];
    },
  },
]);
