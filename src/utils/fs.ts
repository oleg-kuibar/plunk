import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
  constants,
} from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { hashFile } from "./hash.js";
import { isDryRun } from "./logger.js";
import { verbose } from "./logger.js";

/** Type guard for Node.js system errors with an error code */
export function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * Copy a file using CoW (copy-on-write) when available, falling back to regular copy.
 * CoW is instant on APFS (macOS), btrfs (Linux), and ReFS (Windows).
 */
export async function copyWithCoW(src: string, dest: string): Promise<void> {
  if (isDryRun()) {
    verbose(`[dry-run] would copy ${src} → ${dest}`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  try {
    await copyFile(src, dest, constants.COPYFILE_FICLONE);
  } catch {
    // FICLONE not supported on this filesystem, fall back to regular copy
    await copyFile(src, dest);
  }
}

/**
 * Recursively collect all file paths in a directory.
 */
export async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Incrementally copy files from src to dest directory.
 * Only copies files whose content has changed (stat size check + hash comparison).
 * Also removes files in dest that don't exist in src.
 * Returns the number of files actually copied.
 */
export async function incrementalCopy(
  srcDir: string,
  destDir: string
): Promise<{ copied: number; removed: number; skipped: number }> {
  const srcFiles = await collectFiles(srcDir);
  let copied = 0;
  let removed = 0;
  let skipped = 0;

  // Copy new/changed files
  for (const srcFile of srcFiles) {
    const rel = relative(srcDir, srcFile);
    const destFile = join(destDir, rel);

    let needsCopy = true;
    try {
      const [srcStat, destStat] = await Promise.all([
        stat(srcFile),
        stat(destFile),
      ]);
      // Fast path: different sizes means definitely different content
      if (srcStat.size !== destStat.size) {
        verbose(`[copy] ${rel} (size differs: ${srcStat.size} vs ${destStat.size})`);
      } else {
        // Same size: compare hashes
        const [srcHash, destHash] = await Promise.all([
          hashFile(srcFile),
          hashFile(destFile),
        ]);
        if (srcHash === destHash) {
          needsCopy = false;
          skipped++;
          verbose(`[skip] ${rel} (unchanged)`);
        } else {
          verbose(`[copy] ${rel} (hash differs)`);
        }
      }
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        verbose(`[copy] ${rel} (new file)`);
      } else if (isNodeError(err)) {
        throw err;
      }
      // dest file doesn't exist, needs copy
    }

    if (needsCopy) {
      await copyWithCoW(srcFile, destFile);
      copied++;
    }
  }

  // Remove files in dest that don't exist in src
  try {
    const destFiles = await collectFiles(destDir);
    const srcRelPaths = new Set(srcFiles.map((f) => relative(srcDir, f)));
    for (const destFile of destFiles) {
      const rel = relative(destDir, destFile);
      if (!srcRelPaths.has(rel)) {
        verbose(`[remove] ${rel} (no longer in source)`);
        if (!isDryRun()) {
          await rm(destFile);
        }
        removed++;
      }
    }
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      // dest dir might not exist yet, that's fine
    } else if (isNodeError(err)) {
      throw err;
    }
  }

  return { copied, removed, skipped };
}

/** Remove a directory recursively, no error if it doesn't exist */
export async function removeDir(dir: string): Promise<void> {
  if (isDryRun()) {
    verbose(`[dry-run] would remove ${dir}`);
    return;
  }
  await rm(dir, { recursive: true, force: true });
}

/** Ensure a directory exists */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Check if a path exists */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents corruption if the process crashes mid-write.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string
): Promise<void> {
  if (isDryRun()) {
    verbose(`[dry-run] would write ${filePath}`);
    return;
  }
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, data);
  await rename(tmpPath, filePath);
}

/** Copy an entire directory recursively */
export async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyWithCoW(srcPath, destPath);
    }
  }
}
