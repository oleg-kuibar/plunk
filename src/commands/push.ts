import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "consola";
import pLimit from "p-limit";
import { publish } from "../core/publisher.js";
import { getStoreEntry } from "../core/store.js";
import { inject } from "../core/injector.js";
import { getConsumers, getLink } from "../core/tracker.js";
import { startWatcher } from "../core/watcher.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose } from "../utils/logger.js";

const consumerLimit = pLimit(4);

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
    suppressHumanOutput();
    const packageDir = resolve(".");

    const doPush = async () => {
      const timer = new Timer();

      // Publish to store
      const result = await publish(packageDir);
      if (result.skipped) {
        consola.info("No changes to push");
        return;
      }

      // Get the store entry
      const entry = await getStoreEntry(result.name, result.version);
      if (!entry) {
        errorWithSuggestion("Failed to read store entry after publish");
        return;
      }

      // Push to all consumers in parallel
      const consumers = await getConsumers(result.name);
      if (consumers.length === 0) {
        consola.info(
          "No consumers registered. Use 'plunk add' in a consumer project first."
        );
        return;
      }

      let totalCopied = 0;
      let totalSkipped = 0;
      let pushCount = 0;

      const results = await Promise.all(
        consumers.map((consumerPath) =>
          consumerLimit(async () => {
            const link = await getLink(consumerPath, result.name);
            if (!link) {
              verbose(`[push] No link found for ${result.name} in ${consumerPath}, skipping`);
              return null;
            }

            try {
              const injectResult = await inject(
                entry,
                consumerPath,
                link.packageManager
              );
              return injectResult;
            } catch (err) {
              consola.warn(`Failed to push to ${consumerPath}: ${err}`);
              return null;
            }
          })
        )
      );

      for (const r of results) {
        if (r) {
          totalCopied += r.copied;
          totalSkipped += r.skipped;
          pushCount++;
        }
      }

      consola.success(
        `Pushed ${result.name}@${result.version} to ${pushCount} consumer(s) in ${timer.elapsed()} (${totalCopied} files changed, ${totalSkipped} unchanged)`
      );

      output({
        name: result.name,
        version: result.version,
        consumers: pushCount,
        copied: totalCopied,
        skipped: totalSkipped,
        elapsed: timer.elapsedMs(),
      });
    };

    // Initial push
    await doPush();

    // Watch mode
    if (args.watch) {
      await startWatcher(
        packageDir,
        {
          buildCmd: args.build,
          debounce: args.debounce ? parseInt(args.debounce, 10) : 300,
        },
        doPush
      );

      // Prevent the process from exiting
      await new Promise(() => {});
    }
  },
});
