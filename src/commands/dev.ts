import { defineCommand } from "citty";
import { resolve } from "node:path";
import { suppressHumanOutput } from "../utils/output.js";
import { doPush, resolveWatchConfig } from "../core/push-engine.js";
import { startWatcher } from "../core/watcher.js";

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
      description: "Debounce delay in ms (default: 100)",
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

    const { buildCmd, patterns } = await resolveWatchConfig(packageDir, args);

    // Initial push
    await push();

    // Start watcher
    await startWatcher(
      packageDir,
      {
        patterns,
        buildCmd,
        debounce: args.debounce
          ? (Number.isFinite(parseInt(args.debounce, 10)) ? parseInt(args.debounce, 10) : undefined)
          : undefined,
      },
      push,
    );

    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  },
});
