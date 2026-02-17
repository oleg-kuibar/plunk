import { readFile, readlink, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { consola } from "consola";
import type { PackageJson, PackageManager, StoreEntry } from "../types.js";
import { getNodeModulesPackagePath, getConsumerBackupPath } from "../utils/paths.js";
import {
  incrementalCopy,
  removeDir,
  ensureDir,
  exists,
  copyDir,
} from "../utils/fs.js";
import { createBinLinks, removeBinLinks } from "../utils/bin-linker.js";

export interface InjectResult {
  copied: number;
  removed: number;
  skipped: number;
  binLinks: number;
}

/**
 * Inject a package from the store into a consumer's node_modules.
 * Strategy depends on the package manager:
 * - npm/yarn/bun: direct node_modules/<pkg>/
 * - pnpm: follow .pnpm/ structure
 */
export async function inject(
  storeEntry: StoreEntry,
  consumerPath: string,
  pm: PackageManager
): Promise<InjectResult> {
  const targetDir = await resolveTargetDir(
    consumerPath,
    storeEntry.name,
    pm
  );

  await ensureDir(targetDir);
  const { copied, removed, skipped } = await incrementalCopy(
    storeEntry.packageDir,
    targetDir
  );

  // Read the published package.json for bin links
  const pkg = await readPackageJson(storeEntry.packageDir);
  const binLinks = pkg ? await createBinLinks(consumerPath, storeEntry.name, pkg) : 0;

  return { copied, removed, skipped, binLinks };
}

/**
 * Back up the existing installed version of a package before overwriting.
 */
export async function backupExisting(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<boolean> {
  const installedDir = await resolveTargetDir(consumerPath, packageName, pm);
  if (!(await exists(installedDir))) return false;

  const backupDir = getConsumerBackupPath(consumerPath, packageName);
  await removeDir(backupDir);
  await copyDir(installedDir, backupDir);
  return true;
}

/**
 * Restore a backed-up package to node_modules.
 */
export async function restoreBackup(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<boolean> {
  const backupDir = getConsumerBackupPath(consumerPath, packageName);
  if (!(await exists(backupDir))) return false;

  const targetDir = await resolveTargetDir(consumerPath, packageName, pm);
  await removeDir(targetDir);
  await copyDir(backupDir, targetDir);
  await removeDir(backupDir);
  return true;
}

/**
 * Remove an injected package from node_modules.
 */
export async function removeInjected(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<void> {
  const targetDir = await resolveTargetDir(consumerPath, packageName, pm);
  const pkg = await readPackageJson(targetDir);
  if (pkg) {
    await removeBinLinks(consumerPath, pkg);
  }
  await removeDir(targetDir);
}

/**
 * Check for missing transitive dependencies.
 * Returns a list of dependency names that are in the linked package's
 * dependencies but not installed in the consumer's node_modules.
 */
export async function checkMissingDeps(
  storeEntry: StoreEntry,
  consumerPath: string
): Promise<string[]> {
  const pkg = await readPackageJson(storeEntry.packageDir);
  if (!pkg?.dependencies) return [];

  const missing: string[] = [];
  for (const dep of Object.keys(pkg.dependencies)) {
    const depPath = join(consumerPath, "node_modules", dep);
    if (!(await exists(depPath))) {
      missing.push(dep);
    }
  }
  return missing;
}

/**
 * Resolve the actual target directory in node_modules for a given
 * package manager strategy.
 */
async function resolveTargetDir(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<string> {
  const directPath = getNodeModulesPackagePath(consumerPath, packageName);

  if (pm !== "pnpm") {
    return directPath;
  }

  // pnpm: follow symlink into .pnpm/ virtual store
  try {
    const realPath = await resolveRealPath(directPath);
    if (realPath !== resolve(directPath)) {
      return realPath;
    }
  } catch {
    // Symlink doesn't exist yet, fall through
  }

  // If no existing pnpm structure, try to find in .pnpm/
  const pnpmDir = join(consumerPath, "node_modules", ".pnpm");
  if (await exists(pnpmDir)) {
    // Look for the package in .pnpm/ directory
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(pnpmDir);
    const encodedName = packageName.replace("/", "+");
    for (const entry of entries) {
      if (entry.startsWith(encodedName + "@")) {
        const candidate = join(
          pnpmDir,
          entry,
          "node_modules",
          packageName
        );
        if (await exists(candidate)) {
          return candidate;
        }
      }
    }
  }

  // Fall back to direct path
  return directPath;
}

/** Resolve a path through symlinks to its real location */
async function resolveRealPath(linkPath: string): Promise<string> {
  try {
    const s = await stat(linkPath);
    // Use realpath to resolve all symlinks
    const { realpath } = await import("node:fs/promises");
    return await realpath(linkPath);
  } catch {
    return resolve(linkPath);
  }
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  try {
    const content = await readFile(join(dir, "package.json"), "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}
