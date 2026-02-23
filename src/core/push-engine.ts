import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "../utils/concurrency.js";
import { publish } from "./publisher.js";
import { getStoreEntry } from "./store.js";
import { inject } from "./injector.js";
import { addLink, getConsumers, getLink } from "./tracker.js";
import { detectBuildCommand } from "../utils/build-detect.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import { Timer } from "../utils/timer.js";
import { output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose } from "../utils/logger.js";
import { consola } from "../utils/console.js";
import type { PackageJson } from "../types.js";

const consumerLimit = pLimit(4);

export interface PushOptions {
  runScripts?: boolean;
}

/**
 * Publish a package to the store, then inject into all registered consumers.
 * Shared by both `push` and `dev` commands.
 */
export async function doPush(
  packageDir: string,
  options: PushOptions = {}
): Promise<void> {
  const timer = new Timer();

  // Publish to store
  const result = await publish(packageDir, {
    runScripts: options.runScripts,
  });
  if (result.skipped) {
    consola.info("No changes to push");
    return;
  }

  // Get the store entry
  const entry = await getStoreEntry(result.name, result.version);
  if (!entry) {
    errorWithSuggestion(
      `Failed to read store entry for ${result.name}@${result.version} after publish`
    );
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
          verbose(
            `[push] No link found for ${result.name} in ${consumerPath}, skipping`
          );
          return null;
        }

        try {
          const injectResult = await inject(
            entry,
            consumerPath,
            link.packageManager
          );

          // Update state.json so the Vite plugin detects the push
          if (injectResult.copied > 0 || injectResult.removed > 0) {
            await addLink(consumerPath, result.name, {
              ...link,
              contentHash: entry.meta.contentHash,
              linkedAt: new Date().toISOString(),
              buildId: entry.meta.buildId ?? "",
            });
          }

          return injectResult;
        } catch (err) {
          consola.warn(
            `Failed to push to ${consumerPath}: ${err instanceof Error ? err.message : String(err)}`
          );
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

  const buildTag = result.buildId ? ` [${result.buildId}]` : "";
  consola.success(
    `Pushed ${result.name}@${result.version}${buildTag} to ${pushCount} consumer(s) in ${timer.elapsed()} (${totalCopied} files changed, ${totalSkipped} unchanged)`
  );

  output({
    name: result.name,
    version: result.version,
    buildId: result.buildId,
    consumers: pushCount,
    copied: totalCopied,
    skipped: totalSkipped,
    elapsed: timer.elapsedMs(),
  });
}

export interface WatchConfig {
  buildCmd?: string;
  patterns?: string[];
}

/**
 * Resolve build command and watch patterns from CLI args and auto-detection.
 */
export async function resolveWatchConfig(
  packageDir: string,
  args: { build?: string; "skip-build"?: boolean }
): Promise<WatchConfig> {
  let buildCmd: string | undefined = args.build;
  let patterns: string[] | undefined;

  if (args.build) {
    // Explicit: use as-is
  } else if (args["skip-build"]) {
    // Explicitly no build
  } else {
    // Auto-detect from package.json scripts
    const pm = await detectPackageManager(packageDir);
    const detected = await detectBuildCommand(packageDir, pm);
    if (detected) {
      buildCmd = detected;
      consola.info(`Auto-detected build command: ${detected}`);
    }
  }

  // Without a build command: watch the package.json `files` field (typically dist/)
  if (!buildCmd) {
    try {
      const pkg = JSON.parse(
        await readFile(join(packageDir, "package.json"), "utf-8")
      ) as PackageJson;
      if (pkg.files && pkg.files.length > 0) {
        patterns = pkg.files;
        verbose(
          `[watch] Using package.json files field: ${patterns.join(", ")}`
        );
      }
    } catch (err) {
      verbose(
        `[watch] Could not read package.json: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { buildCmd, patterns };
}
