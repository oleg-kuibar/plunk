import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "consola";
import { publish } from "../core/publisher.js";
import { getStoreEntry } from "../core/store.js";
import { inject } from "../core/injector.js";
import { getConsumers, getLink } from "../core/tracker.js";
import { startWatcher } from "../core/watcher.js";
import { readFile } from "node:fs/promises";
import type { PackageJson } from "../types.js";

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
    debounce: {
      type: "string",
      description: "Debounce delay in ms for watch mode (default: 300)",
    },
  },
  async run({ args }) {
    const packageDir = resolve(".");

    const doPush = async () => {
      // Publish to store
      const result = await publish(packageDir);
      if (result.skipped) {
        consola.info("No changes to push");
        return;
      }

      // Get the store entry
      const entry = await getStoreEntry(result.name, result.version);
      if (!entry) {
        consola.error("Failed to read store entry after publish");
        return;
      }

      // Push to all consumers
      const consumers = await getConsumers(result.name);
      if (consumers.length === 0) {
        consola.info(
          "No consumers registered. Use 'plunk add' in a consumer project first."
        );
        return;
      }

      let totalCopied = 0;
      let pushCount = 0;

      for (const consumerPath of consumers) {
        const link = await getLink(consumerPath, result.name);
        if (!link) continue;

        try {
          const injectResult = await inject(
            entry,
            consumerPath,
            link.packageManager
          );
          totalCopied += injectResult.copied;
          pushCount++;
        } catch (err) {
          consola.warn(`Failed to push to ${consumerPath}: ${err}`);
        }
      }

      consola.success(
        `Pushed ${result.name}@${result.version} to ${pushCount} consumer(s) (${totalCopied} files changed)`
      );
    };

    // Initial push
    await doPush();

    // Watch mode
    if (args.watch) {
      const watcher = await startWatcher(
        packageDir,
        {
          buildCmd: args.build,
          debounce: args.debounce ? parseInt(args.debounce, 10) : 300,
        },
        doPush
      );

      // Keep process alive, handle graceful shutdown
      const cleanup = async () => {
        consola.info("Stopping watcher...");
        await watcher.close();
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Prevent the process from exiting
      await new Promise(() => {});
    }
  },
});
