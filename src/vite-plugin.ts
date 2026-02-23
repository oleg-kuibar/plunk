import { join, normalize } from "node:path";
import { rm } from "node:fs/promises";
import type { Plugin } from "vite";

export default function plunkPlugin(): Plugin {
  let plunkStateFile: string;
  let cacheDir: string;

  return {
    name: "vite-plugin-plunk",
    apply: "serve",

    configResolved(config) {
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
      cacheDir = config.cacheDir;
    },

    configureServer(server) {
      server.watcher.add(plunkStateFile);

      server.watcher.on("change", async (changedPath: string) => {
        if (normalize(changedPath) !== plunkStateFile) return;

        server.config.logger.info("[plunk] Detected injection, reloading...", {
          timestamp: true,
        });

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

        // Invalidate CSS modules so Tailwind v4's transform hook re-runs.
        // Without this, Vite serves the in-memory cached transformResult and
        // Tailwind never re-scans node_modules for new utility classes.
        const seen = new Set<import("vite").ModuleNode>();
        for (const mod of server.moduleGraph.idToModuleMap.values()) {
          if (mod.id?.endsWith(".css") || mod.id?.includes("lang.css")) {
            server.moduleGraph.invalidateModule(mod, seen);
          }
        }

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
