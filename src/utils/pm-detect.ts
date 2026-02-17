import { readFile, stat } from "node:fs/promises";
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

export type YarnNodeLinker = "node-modules" | "pnpm" | "pnp";

/**
 * Detect the Yarn Berry nodeLinker mode from .yarnrc.yml.
 * Returns null if the file is missing or the key is absent.
 */
export async function detectYarnNodeLinker(
  projectDir: string
): Promise<YarnNodeLinker | null> {
  let content: string;
  try {
    content = await readFile(join(projectDir, ".yarnrc.yml"), "utf-8");
  } catch {
    return null;
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

/**
 * Check whether a .yarnrc.yml file exists in the project directory.
 * Presence of this file indicates Yarn Berry (v2+) rather than Yarn Classic.
 */
export async function hasYarnrcYml(projectDir: string): Promise<boolean> {
  try {
    await stat(join(projectDir, ".yarnrc.yml"));
    return true;
  } catch {
    return false;
  }
}
