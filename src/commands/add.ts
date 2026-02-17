import { defineCommand } from "citty";
import { resolve, basename } from "node:path";
import { consola } from "consola";
import { findStoreEntry } from "../core/store.js";
import { publish } from "../core/publisher.js";
import { inject, backupExisting, checkMissingDeps } from "../core/injector.js";
import { addLink, registerConsumer } from "../core/tracker.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { addToOptimizeDepsExclude } from "../utils/vite-config.js";
import type { LinkEntry } from "../types.js";

export default defineCommand({
  meta: {
    name: "add",
    description: "Link a package from the plunk store into this project",
  },
  args: {
    package: {
      type: "positional",
      description: "Package name to add",
      required: true,
    },
    from: {
      type: "string",
      description: "Path to package source (will publish first)",
    },
  },
  async run({ args }) {
    const consumerPath = resolve(".");
    const packageName = args.package;

    // If --from specified, publish from that path first
    if (args.from) {
      const fromPath = resolve(args.from);
      consola.info(`Publishing from ${fromPath}...`);
      await publish(fromPath);
    }

    // Find package in store
    const entry = await findStoreEntry(packageName);
    if (!entry) {
      consola.error(
        `Package "${packageName}" not found in store. Run 'plunk publish' in the package directory first, or use --from <path>.`
      );
      process.exit(1);
    }

    // Detect package manager
    const pm = await detectPackageManager(consumerPath);
    consola.info(`Detected package manager: ${pm}`);

    // Backup existing installed version
    const hasBackup = await backupExisting(consumerPath, packageName, pm);
    if (hasBackup) {
      consola.info(`Backed up existing ${packageName} installation`);
    }

    // Inject into node_modules
    const result = await inject(entry, consumerPath, pm);
    consola.success(
      `Linked ${packageName}@${entry.version} → node_modules/${packageName} (${result.copied} files copied, ${result.skipped} unchanged)`
    );

    if (result.binLinks > 0) {
      consola.info(`Created ${result.binLinks} bin link(s)`);
    }

    // Record in state
    const linkEntry: LinkEntry = {
      version: entry.version,
      contentHash: entry.meta.contentHash,
      linkedAt: new Date().toISOString(),
      sourcePath: entry.meta.sourcePath,
      backupExists: hasBackup,
      packageManager: pm,
    };
    await addLink(consumerPath, packageName, linkEntry);
    await registerConsumer(packageName, consumerPath);

    // Check for missing transitive deps
    const missing = await checkMissingDeps(entry, consumerPath);
    if (missing.length > 0) {
      consola.warn(
        `Missing transitive dependencies: ${missing.join(", ")}\n` +
          `  Run: ${pm} ${pm === "yarn" ? "add" : "install"} ${missing.join(" ")}`
      );
    }

    // Auto-update Vite config
    const bundler = await detectBundler(consumerPath);
    if (bundler.type === "vite" && bundler.configFile) {
      const result = await addToOptimizeDepsExclude(
        bundler.configFile,
        packageName
      );
      if (result.modified) {
        consola.success(
          `Added ${packageName} to optimizeDeps.exclude in ${basename(bundler.configFile)}`
        );
      } else if (result.error) {
        consola.info(
          `Add to vite.config manually: optimizeDeps: { exclude: ['${packageName}'] }`
        );
      }
    }
  },
});
