import { defineCommand } from "citty";
import { resolve } from "node:path";
import { suppressHumanOutput } from "../utils/output.js";
import { doPush, resolveWatchConfig } from "../core/push-engine.js";
import { startWatcher } from "../core/watcher.js";

export default defineCommand({
  meta: {
    name: "push",
    description:
      "Publish and push to all consumers. Use --watch for continuous mode.",
  },
  args: {
    watch: {
      type: "boolean",
      description: "Watch for changes and auto-push",
      default: false,
    },
    build: {
      type: "string",
      description: "Build command to run before publishing (watch mode)",
    },
    "skip-build": {
      type: "boolean",
      description: "Watch output dirs directly, skip build command detection",
      default: false,
    },
    debounce: {
      type: "string",
      description: "Debounce delay in ms for watch mode (default: 300)",
    },
    "no-scripts": {
      type: "boolean",
      description: "Skip prepack/postpack lifecycle hooks",
      default: false,
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Force copy all files, bypassing hash comparison",
      default: false,
    },
  },
  async run({ args }) {
    suppressHumanOutput();
    const packageDir = resolve(".");

    const push = () => doPush(packageDir, {
      runScripts: !args["no-scripts"],
      force: args.force,
    });

    // Initial push
    await push();

    // Watch mode
    if (args.watch) {
      const { buildCmd, patterns } = await resolveWatchConfig(packageDir, args);

      await startWatcher(
        packageDir,
        {
          patterns,
          buildCmd,
          debounce: args.debounce
            ? (Number.isFinite(parseInt(args.debounce, 10)) ? parseInt(args.debounce, 10) : undefined)
            : undefined,
        },
        push
      );

      await new Promise<void>((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    }
  },
});
