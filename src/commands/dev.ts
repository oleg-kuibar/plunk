import { defineCommand } from "citty";
import { resolve } from "node:path";
import { suppressHumanOutput } from "../utils/output.js";
import { doPush, startWatchMode } from "../core/push-engine.js";

export default defineCommand({
  meta: {
    name: "dev",
    description:
      "Watch, rebuild, and push to all consumers. Auto-detects build command.",
  },
  args: {
    build: {
      type: "string",
      description: "Override build command (default: auto-detect from package.json)",
    },
    "skip-build": {
      type: "boolean",
      description: "Watch output dirs directly, skip build command detection",
      default: false,
    },
    debounce: {
      type: "string",
      description: "Debounce delay in ms (default: 500)",
    },
    cooldown: {
      type: "string",
      description: "Minimum time between builds in ms (default: 500)",
    },
    "no-scripts": {
      type: "boolean",
      description: "Skip prepack/postpack lifecycle hooks",
      default: false,
    },
  },
  async run({ args }) {
    suppressHumanOutput();
    const packageDir = resolve(".");

    const push = () => doPush(packageDir, { runScripts: !args["no-scripts"] });

    // Initial push
    await push();

    // Start watching
    await startWatchMode(packageDir, args, push);
  },
});
