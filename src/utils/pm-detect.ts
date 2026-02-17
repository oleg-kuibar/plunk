import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { PackageManager } from "../types.js";

/** Lockfile → package manager mapping (checked in order) */
const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/**
 * Detect the package manager used in a project directory
 * by checking for lockfile presence.
 * Falls back to "npm" if no lockfile is found.
 */
export async function detectPackageManager(
  projectDir: string
): Promise<PackageManager> {
  for (const [lockfile, pm] of LOCKFILES) {
    try {
      await stat(join(projectDir, lockfile));
      return pm;
    } catch {
      // lockfile doesn't exist, continue
    }
  }
  return "npm";
}
