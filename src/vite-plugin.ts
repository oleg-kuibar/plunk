import { join, normalize } from "node:path";
import { readFileSync, existsSync, rmSync } from "node:fs";
import type { Plugin, UserConfig } from "vite";

interface PlunkState {
  links?: Record<string, unknown>;
}

/** Synchronously read linked package names from state.json */
function readLinkedPackagesSync(stateFile: string): string[] {
  try {
    const content = readFileSync(stateFile, "utf-8");
    const state = JSON.parse(content) as PlunkState;
    return Object.keys(state.links ?? {});
  } catch {
    return [];
  }
}

export default function plunkPlugin(): Plugin {
  let plunkStateFile: string;
  let rootDir: string;
  let cacheDir: string;
  let nodeModulesDir: string;

  return {
    name: "vite-plugin-plunk",
    apply: "serve",

    // Exclude linked packages from pre-bundling so Vite serves them
    // directly from node_modules. This ensures fresh code after push.
    config(config, { command }) {
      if (command !== "serve") return;

      const root = config.root ?? process.cwd();
      const stateFile = join(root, ".plunk", "state.json");
      const linkedPackages = readLinkedPackagesSync(stateFile);

      if (linkedPackages.length === 0) return;

      // Merge with existing optimizeDeps.exclude
      const existingExclude = config.optimizeDeps?.exclude ?? [];
      const newExclude = [
        ...existingExclude,
        ...linkedPackages.filter((pkg) => !existingExclude.includes(pkg)),
      ];

      console.log(`[plunk] Excluding from pre-bundling: ${newExclude.join(", ")}`);

      return {
        optimizeDeps: {
          exclude: newExclude,
        },
      } satisfies UserConfig;
    },

    configResolved(config) {
      rootDir = config.root;
      cacheDir = config.cacheDir;
      nodeModulesDir = join(config.root, "node_modules");
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
      console.log(`[plunk] Watching state file: ${plunkStateFile}`);
    },

    configureServer(server) {
      server.watcher.add(plunkStateFile);
      console.log(`[plunk] Added watcher for: ${plunkStateFile}`);

      // Also watch linked packages in node_modules directly
      const linkedPackages = readLinkedPackagesSync(plunkStateFile);
      for (const pkg of linkedPackages) {
        const pkgPath = join(nodeModulesDir, pkg);
        server.watcher.add(pkgPath);
        console.log(`[plunk] Added watcher for package: ${pkgPath}`);
      }

      server.watcher.on("change", async (changedPath: string) => {
        const normalizedChanged = normalize(changedPath);
        const isStateFile = normalizedChanged === plunkStateFile;
        const isLinkedPackage = linkedPackages.some(pkg =>
          normalizedChanged.includes(normalize(join(nodeModulesDir, pkg)))
        );

        if (!isStateFile && !isLinkedPackage) return;

        console.log(`[plunk] Change detected: ${changedPath}`);
        server.config.logger.info(
          `[plunk] Detected ${isStateFile ? "push" : "package"} change, restarting server...`,
          { timestamp: true }
        );

        // Clear Vite's cache directory to ensure fresh module resolution
        try {
          if (existsSync(cacheDir)) {
            rmSync(cacheDir, { recursive: true, force: true });
            console.log(`[plunk] Cleared cache: ${cacheDir}`);
          }
        } catch (err) {
          console.error(`[plunk] Failed to clear cache:`, err);
        }

        // Restart the server to force complete re-resolution of all modules
        // This is more reliable than just invalidating the module graph
        await server.restart();
      });
    },
  };
}
