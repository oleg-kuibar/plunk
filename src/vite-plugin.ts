import { join, normalize } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { Plugin } from "vite";

interface PlunkState {
  links?: Record<string, unknown>;
}

export default function plunkPlugin(): Plugin {
  let plunkStateFile: string;
  let cacheDir: string;
  let nodeModulesDir: string;

  return {
    name: "vite-plugin-plunk",
    apply: "serve",

    configResolved(config) {
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
      cacheDir = config.cacheDir;
      nodeModulesDir = normalize(join(config.root, "node_modules"));
    },

    configureServer(server) {
      server.watcher.add(plunkStateFile);

      server.watcher.on("change", async (changedPath: string) => {
        if (normalize(changedPath) !== plunkStateFile) return;

        server.config.logger.info("[plunk] Detected injection, reloading...", {
          timestamp: true,
        });

        // Read linked package names from state.json
        let linkedPackages: string[] = [];
        try {
          const stateContent = await readFile(plunkStateFile, "utf-8");
          const state = JSON.parse(stateContent) as PlunkState;
          linkedPackages = Object.keys(state.links ?? {});
        } catch {
          // If we can't read state, invalidate all node_modules
        }

        // Clear the entire Vite cache (deps, deps_ssr, metadata, etc.).
        // Safe because we use full-reload instead of server.restart().
        try {
          await rm(cacheDir, { recursive: true, force: true });
        } catch {
          server.config.logger.warn(
            "[plunk] Could not clear Vite cache (locked?). Browser may load stale deps.",
            { timestamp: true }
          );
        }

        // Invalidate modules in the module graph:
        // 1. All modules from linked packages (node_modules/@scope/pkg or node_modules/pkg)
        // 2. All CSS modules (for Tailwind v4 compatibility)
        // 3. All modules that import from linked packages
        const seen = new Set<import("vite").ModuleNode>();
        const modulesToInvalidate: import("vite").ModuleNode[] = [];

        for (const mod of server.moduleGraph.idToModuleMap.values()) {
          if (!mod.id) continue;

          const normalizedId = normalize(mod.id);

          // Check if module is from a linked package
          const isLinkedModule = linkedPackages.length === 0
            ? normalizedId.includes(nodeModulesDir) // No packages known, invalidate all node_modules
            : linkedPackages.some((pkg) =>
                normalizedId.includes(normalize(join(nodeModulesDir, pkg)))
              );

          // Check if it's a CSS module
          const isCssModule = mod.id.endsWith(".css") || mod.id.includes("lang.css");

          if (isLinkedModule || isCssModule) {
            modulesToInvalidate.push(mod);
          }
        }

        // Also invalidate importers of linked modules (transitive invalidation)
        const processImporters = (mod: import("vite").ModuleNode) => {
          for (const importer of mod.importers) {
            if (!seen.has(importer)) {
              modulesToInvalidate.push(importer);
            }
          }
        };

        for (const mod of modulesToInvalidate) {
          server.moduleGraph.invalidateModule(mod, seen);
          processImporters(mod);
        }

        // Invalidate any remaining importers that were added
        for (const mod of modulesToInvalidate) {
          if (!seen.has(mod)) {
            server.moduleGraph.invalidateModule(mod, seen);
          }
        }

        server.config.logger.info(
          `[plunk] Invalidated ${seen.size} modules`,
          { timestamp: true }
        );

        // Send full-reload instead of server.restart() — restart re-bundles
        // vite.config.ts which can fail with CJS/ESM errors (brace-expansion).
        // A full-reload makes the browser refetch; Vite discovers missing
        // pre-bundled deps and re-optimizes automatically.
        // Vite 6+ uses server.hot; older versions use server.ws.
        const channel = server.hot ?? (server as any).ws;
        channel.send({ type: "full-reload", path: "*" });
      });
    },
  };
}
