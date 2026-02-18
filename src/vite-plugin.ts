import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { rm } from "node:fs/promises";
import type { Plugin } from "vite";

export default function plunkPlugin(): Plugin {
  let plunkStateFile: string;
  let depsCacheDir: string;

  return {
    name: "vite-plugin-plunk",
    apply: "serve",

    configResolved(config) {
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
      depsCacheDir = join(config.cacheDir, "deps");
    },

    configureServer(server) {
      server.watcher.add(plunkStateFile);

      server.watcher.on("change", async (changedPath: string) => {
        if (normalize(changedPath) !== plunkStateFile) return;

        server.config.logger.info("[plunk] Detected injection, restarting...", {
          timestamp: true,
        });

        await rm(depsCacheDir, { recursive: true, force: true }).catch(
          () => {}
        );

        await server.restart();
      });
    },
  };
}
