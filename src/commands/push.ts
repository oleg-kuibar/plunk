import { defineCommand } from "citty";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { consola } from "consola";
import pLimit from "p-limit";
import { publish } from "../core/publisher.js";
import { getStoreEntry } from "../core/store.js";
import { inject } from "../core/injector.js";
import { addLink, getConsumers, getLink } from "../core/tracker.js";
import { startWatcher } from "../core/watcher.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose } from "../utils/logger.js";
import type { PackageJson } from "../types.js";

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

              // Update state.json so the Vite plugin detects the push
              if (injectResult.copied > 0) {
                await addLink(consumerPath, result.name, {
                  ...link,
                  contentHash: entry.meta.contentHash,
                  linkedAt: new Date().toISOString(),
                });
              }

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
      // Infer watch patterns from context:
      // - With a build command: watch source dirs (src/lib), the build will produce output
      // - Without a build command: watch the package.json `files` field (typically dist/)
      let patterns: string[] | undefined;
      if (!args.build) {
        try {
          const pkg = JSON.parse(
            await readFile(join(packageDir, "package.json"), "utf-8")
          ) as PackageJson;
          if (pkg.files && pkg.files.length > 0) {
            patterns = pkg.files;
            verbose(`[watch] Using package.json files field: ${patterns.join(", ")}`);
          }
        } catch {
          // Fall through to defaults
        }
      }

      await startWatcher(
        packageDir,
        {
          patterns,
          buildCmd: args.build,
          debounce: args.debounce ? parseInt(args.debounce, 10) : undefined,
        },
        doPush
      );

      // Prevent the process from exiting
      await new Promise(() => {});
    }
  },
});
