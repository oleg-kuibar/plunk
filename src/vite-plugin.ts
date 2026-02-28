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
  let pollTimer: ReturnType<typeof setInterval> | undefined;

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

      const result: UserConfig = {};

      if (linkedPackages.length > 0) {
        // Merge with existing optimizeDeps.exclude
        const existingExclude = config.optimizeDeps?.exclude ?? [];
        const newExclude = [
          ...existingExclude,
          ...linkedPackages.filter((pkg) => !existingExclude.includes(pkg)),
        ];

        console.log(`[plunk] Excluding from pre-bundling: ${newExclude.join(", ")}`);
        result.optimizeDeps = { exclude: newExclude };
      }

      // WebContainers don't emit native filesystem events, so chokidar
      // never fires. Enable polling for file-watching to work.
      const isWebContainer = !!process.versions?.webcontainer;
      if (isWebContainer && !config.server?.watch?.usePolling) {
        result.server = {
          watch: { usePolling: true, interval: 1000 },
        };
        console.log("[plunk] WebContainer detected, enabling filesystem polling");
      }

      if (Object.keys(result).length === 0) return;

      return result satisfies UserConfig;
    },

    configResolved(config) {
      rootDir = config.root;
      cacheDir = config.cacheDir;
      nodeModulesDir = join(config.root, "node_modules");
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
      console.log(`[plunk] Watching state file: ${plunkStateFile}`);
    },

    configureServer(server) {
      // Mutable set of watched packages — updated whenever state.json changes
      const watchedPackages = new Set<string>();
      let isRestarting = false;

      /** Re-read state.json and add watchers for any new linked packages */
      function syncPackageWatchers() {
        let added = false;
        for (const pkg of readLinkedPackagesSync(plunkStateFile)) {
          if (!watchedPackages.has(pkg)) {
            watchedPackages.add(pkg);
            added = true;
          }
        }

        if (added && watchedPackages.size > 0) {
          // Vite hardcodes **/node_modules/** in its chokidar ignored list.
          // Override with a regex that allows our linked packages through.
          // This is the standard workaround from vitejs/vite#8619.
          const escaped = [...watchedPackages]
            .map(p => p.replace(/[/\\.*+?^${}()|[\]]/g, "\\$&"))
            .join("|");

          server.watcher.options = {
            ...server.watcher.options,
            ignored: [
              new RegExp(`node_modules\\/(?!(?:${escaped})(?:\\/|$)).*`),
              "**/.git/**",
              "**/test-results/**",
            ],
          };
          // Force chokidar to recompute its ignored filter (lazy cache)
          (server.watcher as any)._userIgnored = undefined;

          // Now add() calls actually register with chokidar
          for (const pkg of watchedPackages) {
            const pkgPath = join(nodeModulesDir, pkg);
            server.watcher.add(pkgPath);
            console.log(`[plunk] Added watcher for package: ${pkgPath}`);
          }
        }
      }

      /** Clear Vite cache and restart the server */
      async function clearCacheAndRestart(source: string) {
        if (isRestarting) return;
        isRestarting = true;

        syncPackageWatchers();

        console.log(`[plunk] ${source}, restarting server...`);
        server.config.logger.info(
          `[plunk] ${source}, restarting server...`,
          { timestamp: true }
        );

        try {
          if (existsSync(cacheDir)) {
            rmSync(cacheDir, { recursive: true, force: true });
            console.log(`[plunk] Cleared cache: ${cacheDir}`);
          }
        } catch (err) {
          console.error(`[plunk] Failed to clear cache:`, err);
        }

        try {
          await server.restart();
        } finally {
          isRestarting = false;
        }
      }

      server.watcher.add(plunkStateFile);
      console.log(`[plunk] Added watcher for: ${plunkStateFile}`);

      // Initial sync
      syncPackageWatchers();

      // Primary detection: chokidar watcher (works outside WebContainers,
      // and inside when usePolling is enabled and chokidar respects it)
      server.watcher.on("change", async (changedPath: string) => {
        const normalizedChanged = normalize(changedPath);
        const isStateFile = normalizedChanged === plunkStateFile;
        const isLinkedPackage = [...watchedPackages].some(pkg =>
          normalizedChanged.includes(normalize(join(nodeModulesDir, pkg)))
        );

        if (!isStateFile && !isLinkedPackage) return;

        await clearCacheAndRestart(
          `Detected ${isStateFile ? "state.json" : "package"} change via watcher`
        );
      });

      // Fallback detection for WebContainers: poll state.json directly.
      // Chokidar's polling may not work reliably inside WebContainers
      // (no native FS events, virtualized filesystem). This reads the
      // file content and compares it, bypassing chokidar entirely.
      if (process.versions?.webcontainer) {
        // Clean up timer from previous server instance (restart cycle)
        if (pollTimer) clearInterval(pollTimer);

        let lastStateContent = "";
        try {
          lastStateContent = readFileSync(plunkStateFile, "utf-8");
        } catch {
          // state.json doesn't exist yet
        }

        pollTimer = setInterval(async () => {
          try {
            const content = readFileSync(plunkStateFile, "utf-8");
            if (lastStateContent && content !== lastStateContent) {
              lastStateContent = content;
              await clearCacheAndRestart(
                "Detected state.json change via polling fallback"
              );
            }
            // First read — just record the baseline
            if (!lastStateContent) lastStateContent = content;
          } catch {
            // state.json doesn't exist yet
          }
        }, 1000);

        console.log("[plunk] WebContainer polling fallback active (1s interval)");
      }
    },
  };
}
