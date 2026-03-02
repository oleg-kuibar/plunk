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
      let pendingRestart = false;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

          // Vite skips HMR for node_modules files — send explicit full-reload
          // when linked package files change (avoids needing server.restart).
          server.watcher.on("change", (changedPath: string) => {
            const normalized = normalize(changedPath);
            for (const pkg of watchedPackages) {
              if (normalized.includes(join("node_modules", pkg))) {
                console.log(`[plunk] Linked package file changed: ${changedPath}`);
                server.hot.send({ type: "full-reload", path: "*" });
                return;
              }
            }
          });
        }
      }

      /** Clear Vite cache and restart the server (for config-level changes like new packages) */
      async function clearCacheAndRestart(source: string) {
        if (isRestarting) {
          pendingRestart = true;
          console.log(`[plunk] Restart already in progress, queued: ${source}`);
          return;
        }
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
          if (pendingRestart) {
            pendingRestart = false;
            await clearCacheAndRestart("Queued change detected");
          }
        }
      }

      /** Debounced restart for state.json changes (new packages linked) */
      function scheduleRestart(source: string) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          clearCacheAndRestart(source);
        }, 100);
      }

      server.watcher.add(plunkStateFile);
      console.log(`[plunk] Added watcher for: ${plunkStateFile}`);

      // Initial sync
      syncPackageWatchers();

      // Watch for state.json changes (new package linked → need config restart).
      // Linked package file changes are handled by Vite's built-in HMR pipeline
      // automatically, since we unignored those paths in chokidar above.
      // Only restart when the set of linked packages changes (plunk add/remove),
      // not on every push (which only updates hashes/timestamps).
      server.watcher.on("change", async (changedPath: string) => {
        const normalizedChanged = normalize(changedPath);
        if (normalizedChanged !== plunkStateFile) return;

        const currentPackages = readLinkedPackagesSync(plunkStateFile);
        const hasNew = currentPackages.some((pkg) => !watchedPackages.has(pkg));
        if (!hasNew) {
          console.log("[plunk] state.json changed but no new packages, skipping restart");
          return;
        }

        scheduleRestart("New package linked");
      });

      // Fallback detection for WebContainers: poll state.json directly.
      if (process.versions?.webcontainer) {
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
              const currentPackages = readLinkedPackagesSync(plunkStateFile);
              const hasNew = currentPackages.some(
                (pkg) => !watchedPackages.has(pkg)
              );
              if (hasNew) {
                scheduleRestart("New package linked (polling fallback)");
              }
            }
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
