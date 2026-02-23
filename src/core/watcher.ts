import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import { consola } from "../utils/console.js";
import type { WatchOptions } from "../types.js";

/** Module-level reference to active child process for signal cleanup */
let activeChild: ChildProcess | null = null;
let activeWatcher: { close: () => Promise<void> } | null = null;

/** Kill the active build process if one is running */
export function killActiveBuild(): void {
  if (activeChild && !activeChild.killed) {
    activeChild.kill("SIGTERM");
    activeChild = null;
  }
}

/**
 * Start watching a directory for changes and trigger a callback.
 *
 * Uses a "debounce effects, not detection" strategy (inspired by Vite):
 * - File changes are detected immediately
 * - The push callback is coalesced: rapid changes within `debounceMs` are batched
 * - If a push is already running when new changes arrive, a re-push is queued
 *   so the final state is always pushed
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

  const debounceMs = options.debounce ?? 100;
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pendingWhileRunning = false;

  const scheduleFlush = () => {
    // Already scheduled — the existing timer will fire
    if (coalesceTimer) return;

    coalesceTimer = setTimeout(async () => {
      coalesceTimer = null;

      if (running) {
        // A push is in progress — flag that we need to re-run after it finishes
        pendingWhileRunning = true;
        return;
      }

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

        // If changes arrived while we were pushing, flush again
        if (pendingWhileRunning) {
          pendingWhileRunning = false;
          scheduleFlush();
        }
      }
    }, debounceMs);
  };

  const onFileEvent = (_path: string) => {
    // Reset the coalesce window on each event so rapid bursts collapse
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
    scheduleFlush();
  };

  // Auto-enable awaitWriteFinish when watching output dirs directly (no build command).
  // Disabled when a build command manages the pipeline (build finishes before push).
  const awfOption = options.buildCmd
    ? false
    : options.awaitWriteFinish ?? {
        stabilityThreshold: 200,
        pollInterval: 50,
      };

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.plunk/**",
    ],
    awaitWriteFinish: awfOption,
  });

  watcher.on("change", onFileEvent);
  watcher.on("add", onFileEvent);
  watcher.on("unlink", onFileEvent);

  const watcherHandle = {
    close: async () => {
      if (coalesceTimer) clearTimeout(coalesceTimer);
      killActiveBuild();
      await watcher.close();
      activeWatcher = null;
    },
  };

  activeWatcher = watcherHandle;

  // Register signal handlers for graceful shutdown (once to prevent accumulation)
  const cleanup = async () => {
    consola.info("Stopping watcher...");
    await watcherHandle.close();
    process.exit(0);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

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
