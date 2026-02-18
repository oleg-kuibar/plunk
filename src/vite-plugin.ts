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

        // Clear pre-bundled deps so Vite re-optimizes on next request.
        // bundler-cache.ts already clears these during inject(), but the
        // plugin also handles the standalone case (e.g. plunk add/update).
        await Promise.all([
          rm(join(cacheDir, "deps"), { recursive: true, force: true }),
          rm(join(cacheDir, "deps_temp"), { recursive: true, force: true }),
        ]).catch(() => {});

        // Send full-reload instead of server.restart() — restart re-bundles
        // vite.config.ts which can fail with CJS/ESM errors (brace-expansion).
        // A full-reload makes the browser refetch; Vite discovers missing
        // pre-bundled deps and re-optimizes automatically.
        server.hot.send({ type: "full-reload" });
      });
    },
  };
}
