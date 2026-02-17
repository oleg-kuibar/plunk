import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import { consola } from "consola";
import type { WatchOptions } from "../types.js";

/** Module-level reference to active child process for signal cleanup */
let activeChild: ChildProcess | null = null;
let activeWatcher: { close: () => Promise<void> } | null = null;
let activeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Kill the active build process if one is running */
export function killActiveBuild(): void {
  if (activeChild && !activeChild.killed) {
    activeChild.kill("SIGTERM");
    activeChild = null;
  }
}

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
      activeDebounceTimer = null;
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
    activeDebounceTimer = debounceTimer;
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

  const watcherHandle = {
    close: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      activeDebounceTimer = null;
      killActiveBuild();
      await watcher.close();
      activeWatcher = null;
    },
  };

  activeWatcher = watcherHandle;

  // Register signal handlers for graceful shutdown
  const cleanup = async () => {
    consola.info("Stopping watcher...");
    await watcherHandle.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  consola.info(`Watching for changes in: ${patterns.join(", ")}`);

  return watcherHandle;
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

    activeChild = child;

    child.on("close", (code) => {
      activeChild = null;
      if (code === 0) {
        consola.success("Build succeeded");
        resolve(true);
      } else {
        consola.error(`Build failed with code ${code}`);
        resolve(false);
      }
    });

    child.on("error", (err) => {
      activeChild = null;
      consola.error(`Build error: ${err.message}`);
      resolve(false);
    });
  });
}
