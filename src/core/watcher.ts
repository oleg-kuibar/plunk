import { spawn } from "node:child_process";
import { platform } from "node:os";
import { consola } from "consola";
import type { WatchOptions } from "../types.js";

/**
 * Start watching a directory for changes and trigger a callback.
 * Uses chokidar for cross-platform file watching.
 */
export async function startWatcher(
  watchDir: string,
  options: WatchOptions,
  onChange: () => Promise<void>
): Promise<{ close: () => Promise<void> }> {
  const { watch } = await import("chokidar");

  const patterns = options.patterns ?? ["src", "lib", "dist"];
  const watchPaths = patterns.map((p) =>
    p.startsWith("/") || p.includes(":") ? p : `${watchDir}/${p}`
  );

  const debounceMs = options.debounce ?? 300;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const debouncedOnChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        if (options.buildCmd) {
          const success = await runBuildCommand(options.buildCmd, watchDir);
          if (!success) {
            consola.warn("Build failed, skipping push");
            return;
          }
        }
        await onChange();
      } catch (err) {
        consola.error("Push failed:", err);
      } finally {
        running = false;
      }
    }, debounceMs);
  };

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.plunk/**",
    ],
  });

  watcher.on("change", debouncedOnChange);
  watcher.on("add", debouncedOnChange);
  watcher.on("unlink", debouncedOnChange);

  consola.info(`Watching for changes in: ${patterns.join(", ")}`);

  return {
    close: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      await watcher.close();
    },
  };
}

/**
 * Run a build command and return true if it succeeds.
 */
function runBuildCommand(cmd: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const isWin = platform() === "win32";
    const shell = isWin ? "cmd" : "sh";
    const shellFlag = isWin ? "/c" : "-c";

    consola.start(`Running: ${cmd}`);
    const child = spawn(shell, [shellFlag, cmd], {
      cwd,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        consola.success("Build succeeded");
        resolve(true);
      } else {
        consola.error(`Build failed with code ${code}`);
        resolve(false);
      }
    });

    child.on("error", (err) => {
      consola.error(`Build error: ${err.message}`);
      resolve(false);
    });
  });
}
