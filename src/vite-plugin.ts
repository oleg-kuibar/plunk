import { join, normalize } from "node:path";
import { readFileSync } from "node:fs";
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

      return {
        optimizeDeps: {
          exclude: newExclude,
        },
      } satisfies UserConfig;
    },

    configResolved(config) {
      rootDir = config.root;
      plunkStateFile = normalize(join(config.root, ".plunk", "state.json"));
    },

    configureServer(server) {
      server.watcher.add(plunkStateFile);

      server.watcher.on("change", async (changedPath: string) => {
        if (normalize(changedPath) !== plunkStateFile) return;

        server.config.logger.info("[plunk] Detected push, restarting server...", {
          timestamp: true,
        });

        // Restart the server to pick up new code from node_modules.
        // This is more reliable than manual cache clearing + full-reload
        // because it re-runs the entire dev server initialization,
        // including re-reading files from node_modules.
        try {
          await server.restart();
        } catch (err) {
          server.config.logger.error(
            `[plunk] Server restart failed: ${err instanceof Error ? err.message : String(err)}`,
            { timestamp: true }
          );
          // Fallback to full-reload if restart fails
          const channel = server.hot ?? (server as any).ws;
          channel.send({ type: "full-reload", path: "*" });
        }
      });
    },
  };
}
