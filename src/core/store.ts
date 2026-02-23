import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "../utils/console.js";
import type { PlunkMeta, StoreEntry } from "../types.js";
import {
  getStorePath,
  getStoreEntryPath,
  getStorePackagePath,
  getStoreMetaPath,
  encodePackageName,
  decodePackageName,
} from "../utils/paths.js";
import { ensureDir, ensurePrivateDir, exists, removeDir, atomicWriteFile, isNodeError } from "../utils/fs.js";
import { isPlunkMeta } from "../utils/validators.js";

/** Read the .plunk-meta.json for a store entry */
export async function readMeta(
  name: string,
  version: string
): Promise<PlunkMeta | null> {
  const metaPath = getStoreMetaPath(name, version);
  try {
    const content = await readFile(metaPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!isPlunkMeta(parsed)) {
      consola.warn(`Invalid metadata for ${name}@${version}, ignoring`);
      return null;
    }
    return parsed;
  } catch (err) {
    if (isNodeError(err) && err.code !== "ENOENT") {
      consola.warn(`Failed to read metadata for ${name}@${version}: ${err}`);
    }
    return null;
  }
}

/** Write .plunk-meta.json for a store entry */
export async function writeMeta(
  name: string,
  version: string,
  meta: PlunkMeta
): Promise<void> {
  const metaPath = getStoreMetaPath(name, version);
  await ensurePrivateDir(getStoreEntryPath(name, version));
  await atomicWriteFile(metaPath, JSON.stringify(meta, null, 2));
}

/** Get a store entry if it exists */
export async function getStoreEntry(
  name: string,
  version: string
): Promise<StoreEntry | null> {
  const packageDir = getStorePackagePath(name, version);
  const meta = await readMeta(name, version);
  if (!meta) return null;
  if (!(await exists(packageDir))) return null;
  return { name, version, packageDir, meta };
}

/** Find a store entry by name (any version). Returns the latest by publishedAt. */
export async function findStoreEntry(
  name: string
): Promise<StoreEntry | null> {
  const storePath = getStorePath();
  if (!(await exists(storePath))) return null;

  // Pre-filter directories by encoded name prefix
  const encodedPrefix = encodePackageName(name) + "@";
  const dirs = await readdir(storePath, { withFileTypes: true });
  const candidates = dirs.filter(
    (d) => d.isDirectory() && d.name.startsWith(encodedPrefix)
  );

  // Read all matching metadata in parallel
  const results = await Promise.all(
    candidates.map(async (dir) => {
      const version = dir.name.slice(encodedPrefix.length);
      const meta = await readMeta(name, version);
      if (!meta) return null;
      return {
        name,
        version,
        packageDir: getStorePackagePath(name, version),
        meta,
      } satisfies StoreEntry;
    })
  );

  const matching = results.filter((r): r is StoreEntry => r !== null);
  if (matching.length === 0) return null;
  // Sort by publishedAt descending
  matching.sort(
    (a, b) =>
      new Date(b.meta.publishedAt).getTime() -
      new Date(a.meta.publishedAt).getTime()
  );
  return matching[0];
}

/** List all entries in the store */
export async function listStoreEntries(): Promise<StoreEntry[]> {
  const storePath = getStorePath();
  if (!(await exists(storePath))) return [];

  const dirs = await readdir(storePath, { withFileTypes: true });
  const candidates = dirs.filter((d) => {
    if (!d.isDirectory()) return false;
    const atIdx = d.name.lastIndexOf("@");
    return atIdx > 0;
  });

  // Read all metadata in parallel
  const results = await Promise.all(
    candidates.map(async (dir) => {
      const atIdx = dir.name.lastIndexOf("@");
      const encodedName = dir.name.slice(0, atIdx);
      const version = dir.name.slice(atIdx + 1);
      const name = decodePackageName(encodedName);

      const meta = await readMeta(name, version);
      if (!meta) return null;

      return {
        name,
        version,
        packageDir: getStorePackagePath(name, version),
        meta,
      } satisfies StoreEntry;
    })
  );

  return results.filter((r): r is StoreEntry => r !== null);
}

/** Remove a store entry */
export async function removeStoreEntry(
  name: string,
  version: string
): Promise<void> {
  await removeDir(getStoreEntryPath(name, version));
}
