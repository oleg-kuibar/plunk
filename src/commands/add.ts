import { defineCommand } from "citty";
import { resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { consola } from "consola";
import { findStoreEntry } from "../core/store.js";
import { publish } from "../core/publisher.js";
import { inject, backupExisting, checkMissingDeps } from "../core/injector.js";
import { addLink, registerConsumer } from "../core/tracker.js";
import { detectPackageManager, detectYarnNodeLinker, hasYarnrcYml } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { addToTranspilePackages } from "../utils/nextjs-config.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose } from "../utils/logger.js";
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
    suppressHumanOutput();
    const timer = new Timer();
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
      errorWithSuggestion(
        `Package "${packageName}" not found in store. Run 'plunk publish' in the package directory first, or use --from <path>.`
      );
      process.exit(1);
    }

    // Detect package manager
    const pm = await detectPackageManager(consumerPath);
    verbose(`[add] Detected package manager: ${pm}`);
    consola.info(`Detected package manager: ${pm}`);

    // Check for Yarn PnP incompatibility
    if (pm === "yarn") {
      const linker = await detectYarnNodeLinker(consumerPath);
      if (linker === "pnp" || (linker === null && await hasYarnrcYml(consumerPath))) {
        consola.error(
          `Yarn PnP mode is not compatible with plunk.\n\n` +
          `plunk works by copying files into node_modules/, but PnP eliminates\n` +
          `node_modules/ entirely. To use plunk with Yarn Berry, add this to\n` +
          `.yarnrc.yml:\n\n` +
          `  nodeLinker: node-modules\n\n` +
          `Then run: yarn install`
        );
        process.exit(1);
      }
    }

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

    // Auto-update bundler config
    const bundler = await detectBundler(consumerPath);
    if (bundler.type === "next" && bundler.configFile) {
      const configResult = await addToTranspilePackages(
        bundler.configFile,
        packageName
      );
      if (configResult.modified) {
        consola.success(
          `Added ${packageName} to transpilePackages in ${basename(bundler.configFile)}`
        );
      } else if (configResult.error) {
        consola.info(
          `Add to next.config manually: transpilePackages: ['${packageName}']`
        );
      }
    } else if (bundler.type === "vite" && bundler.configFile) {
      const hasPlugin = await viteConfigHasPlunkPlugin(bundler.configFile);
      if (!hasPlugin) {
        consola.info(
          `Tip: Add the Vite plugin for automatic dev server restarts when plunk pushes:\n` +
            `  import plunk from "@oleg-kuibar/plunk/vite"\n` +
            `  plugins: [plunk()]`
        );
      }
    }

    consola.info(`Done in ${timer.elapsed()}`);
    output({
      package: packageName,
      version: entry.version,
      copied: result.copied,
      skipped: result.skipped,
      binLinks: result.binLinks,
      elapsed: timer.elapsedMs(),
    });
  },
});

/**
 * Check if the Vite config file references the plunk plugin.
 * Simple string check — avoids parsing ESM/TS config.
 */
async function viteConfigHasPlunkPlugin(configFile: string): Promise<boolean> {
  try {
    const content = await readFile(configFile, "utf-8");
    return (
      content.includes("@oleg-kuibar/plunk/vite") ||
      content.includes("vite-plugin-plunk")
    );
  } catch {
    return false;
  }
}
