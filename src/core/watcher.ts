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

  // Default to source directories only; dist is added by resolveWatchConfig when no build command
  const patterns = options.patterns ?? ["src", "lib"];
  const watchPaths = patterns.map((p) =>
    p.startsWith("/") || p.includes(":") ? p : `${watchDir}/${p}`
  );

  const debounceMs = options.debounce ?? 500;
  const cooldownMs = options.cooldown ?? 500;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let running = false;
  let lastBuildEndTime = 0;
  let hasPendingChanges = false;

  const doBuild = async () => {
    if (closed || running) return;

    // Check cooldown
    const timeSinceLastBuild = Date.now() - lastBuildEndTime;
    if (lastBuildEndTime > 0 && timeSinceLastBuild < cooldownMs) {
      return;
    }

    running = true;
    hasPendingChanges = false;

    try {
      if (options.buildCmd) {
        const success = await runBuildCommand(options.buildCmd, watchDir);
        if (!success) {
          consola.warn("Build failed (see output above), skipping push");
          return;
        }
      }
      await onChange();
    } catch (err) {
      consola.error(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
      lastBuildEndTime = Date.now();

      // Drain pending changes: if file events arrived while we were building,
      // schedule a new build after cooldown so those changes aren't silently dropped.
      if (hasPendingChanges && !closed) {
        hasPendingChanges = false;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          doBuild();
        }, cooldownMs);
      }
    }
  };

  const onFileEvent = (path: string) => {
    if (closed) return;

    // Ignore events while a build is running
    if (running) {
      hasPendingChanges = true;
      return;
    }

    // During cooldown: schedule a build for when cooldown expires
    const timeSinceLastBuild = Date.now() - lastBuildEndTime;
    if (lastBuildEndTime > 0 && timeSinceLastBuild < cooldownMs) {
      if (!debounceTimer) {
        const remainingCooldown = cooldownMs - timeSinceLastBuild;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          doBuild();
        }, remainingCooldown + debounceMs);
      }
      return;
    }

    // Debounce: reset timer on each event
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      doBuild();
    }, debounceMs);
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
  watcher.on("error", (err) => {
    consola.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`);
  });

  const watcherHandle = {
    close: async () => {
      closed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      killActiveBuild();
      await watcher.close();
      activeWatcher = null;
    },
  };

  activeWatcher = watcherHandle;

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
