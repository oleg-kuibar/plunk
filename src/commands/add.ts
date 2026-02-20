import { defineCommand } from "citty";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve, basename } from "node:path";
import { consola } from "consola";
import { findStoreEntry } from "../core/store.js";
import { publish } from "../core/publisher.js";
import { inject, backupExisting, checkMissingDeps } from "../core/injector.js";
import { addLink, registerConsumer } from "../core/tracker.js";
import { exists } from "../utils/fs.js";
import { detectPackageManager, detectYarnNodeLinker, hasYarnrcYml } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { ensureConsumerInit } from "../utils/init-helpers.js";
import { addToTranspilePackages } from "../utils/nextjs-config.js";
import { getConsumerStatePath } from "../utils/paths.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose, isJsonOutput } from "../utils/logger.js";
import type { LinkEntry, PackageManager } from "../types.js";

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
    yes: {
      type: "boolean",
      alias: "y",
      description: "Auto-accept prompts (install missing deps, etc.)",
      default: false,
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

    // Auto-init consumer if needed
    const needsInit = !(await exists(getConsumerStatePath(consumerPath)));
    const pm = await detectPackageManager(consumerPath);
    if (needsInit) {
      await ensureConsumerInit(consumerPath, pm);
      consola.success("Auto-initialized plunk (consumer mode)");
    }
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
      buildId: entry.meta.buildId ?? "",
    };
    await addLink(consumerPath, packageName, linkEntry);
    await registerConsumer(packageName, consumerPath);

    // Check for missing transitive deps
    const missing = await checkMissingDeps(entry, consumerPath);
    if (missing.length > 0) {
      if (isJsonOutput()) {
        // JSON mode: include in output only, no prompt
        verbose(`[add] Missing transitive deps (json mode): ${missing.join(", ")}`);
      } else if (args.yes) {
        // Auto-install
        const cmd = buildInstallCommand(pm, missing);
        consola.info(`Installing missing dependencies: ${missing.join(", ")}`);
        const ok = await runInstallCommand(cmd, consumerPath);
        if (ok) {
          consola.success("Installed missing dependencies");
        } else {
          consola.warn(`Install failed. Run manually: ${cmd}`);
        }
      } else {
        const confirm = await consola.prompt(
          `Install ${missing.length} missing dependencies? (${missing.join(", ")})`,
          { type: "confirm", initial: true },
        );
        if (confirm) {
          const cmd = buildInstallCommand(pm, missing);
          const ok = await runInstallCommand(cmd, consumerPath);
          if (ok) {
            consola.success("Installed missing dependencies");
          } else {
            consola.warn(`Install failed. Run manually: ${cmd}`);
          }
        } else {
          consola.warn(
            `Missing transitive dependencies: ${missing.join(", ")}\n` +
              `  Run: ${buildInstallCommand(pm, missing)}`,
          );
        }
      }
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
      const { addPlunkVitePlugin } = await import("../utils/vite-config.js");
      const viteResult = await addPlunkVitePlugin(bundler.configFile);
      if (viteResult.modified) {
        consola.success(`Added plunk plugin to ${basename(bundler.configFile)}`);
      } else if (viteResult.error) {
        consola.info(
          `Add manually:\n  import plunk from "@papoy/plunk/vite"\n  plugins: [plunk()]`
        );
      }
    }

    // Auto-add @source for Tailwind v4
    const { findTailwindCss, addTailwindSource } = await import("../utils/tailwind-source.js");
    const tailwindCss = await findTailwindCss(consumerPath);
    if (tailwindCss) {
      const twResult = await addTailwindSource(tailwindCss, packageName, consumerPath);
      if (twResult.modified) {
        consola.success(`Added @source for ${packageName} to ${basename(tailwindCss)}`);
      } else if (twResult.error) {
        consola.info(`Add to your CSS manually: @source "../node_modules/${packageName}";`);
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

function buildInstallCommand(pm: PackageManager, deps: string[]): string {
  const joined = deps.join(" ");
  switch (pm) {
    case "pnpm":
      return `pnpm add ${joined}`;
    case "yarn":
      return `yarn add ${joined}`;
    case "bun":
      return `bun add ${joined}`;
    default:
      return `npm install ${joined}`;
  }
}

function runInstallCommand(cmd: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const isWin = platform() === "win32";
    const shell = isWin ? "cmd" : "sh";
    const shellFlag = isWin ? "/c" : "-c";

    const child = spawn(shell, [shellFlag, cmd], {
      cwd,
      stdio: "inherit",
    });

    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}
