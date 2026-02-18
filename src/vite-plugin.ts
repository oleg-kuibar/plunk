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

        server.config.logger.info("[plunk] Detected injection, restarting...", {
          timestamp: true,
        });

        // Clear pre-bundled deps + metadata, but leave other .vite/ content
        // intact so Vite can restart without config-reload errors
        await Promise.all([
          rm(join(cacheDir, "deps"), { recursive: true, force: true }),
          rm(join(cacheDir, "deps_temp"), { recursive: true, force: true }),
        ]).catch(() => {});

        await server.restart();
      });
    },
  };
}
