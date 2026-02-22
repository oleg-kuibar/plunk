import { readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
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
 * by checking for lockfile presence, walking up to the filesystem root.
 * Closest lockfile wins. Within the same directory, priority order is maintained.
 * Falls back to "npm" if no lockfile is found.
 */
export async function detectPackageManager(
  projectDir: string
): Promise<PackageManager> {
  let dir = projectDir;
  for (;;) {
    const results = await Promise.all(
      LOCKFILES.map(async ([lockfile, pm]) => {
        try {
          await stat(join(dir, lockfile));
          return pm;
        } catch {
          return null;
        }
      })
    );
    const found = results.find((pm) => pm !== null);
    if (found) return found;

    const parent = dirname(dir);
    if (parent === dir) return "npm"; // filesystem root
    dir = parent;
  }
}

export type YarnNodeLinker = "node-modules" | "pnpm" | "pnp";

/**
 * Detect the Yarn Berry nodeLinker mode from .yarnrc.yml.
 * Walks up from projectDir to find the file.
 * Returns null if the file is missing or the key is absent.
 */
export async function detectYarnNodeLinker(
  projectDir: string
): Promise<YarnNodeLinker | null> {
  let dir = projectDir;
  for (;;) {
    let content: string;
    try {
      content = await readFile(join(dir, ".yarnrc.yml"), "utf-8");
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
      continue;
    }

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("nodeLinker")) continue;
      const match = trimmed.match(/^nodeLinker:\s*(.+)$/);
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, "");
        if (value === "node-modules" || value === "pnpm" || value === "pnp") {
          return value;
        }
      }
    }

    return null;
  }
}

/**
 * Check whether a .yarnrc.yml file exists at or above the project directory.
 * Presence of this file indicates Yarn Berry (v2+) rather than Yarn Classic.
 */
export async function hasYarnrcYml(projectDir: string): Promise<boolean> {
  let dir = projectDir;
  for (;;) {
    try {
      await stat(join(dir, ".yarnrc.yml"));
      return true;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  }
}
