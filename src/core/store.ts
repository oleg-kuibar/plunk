import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlunkMeta, StoreEntry } from "../types.js";
import {
  getStorePath,
  getStoreEntryPath,
  getStorePackagePath,
  getStoreMetaPath,
  decodePackageName,
} from "../utils/paths.js";
import { ensureDir, exists, removeDir } from "../utils/fs.js";

/** Read the .plunk-meta.json for a store entry */
export async function readMeta(
  name: string,
  version: string
): Promise<PlunkMeta | null> {
  const metaPath = getStoreMetaPath(name, version);
  try {
    const content = await readFile(metaPath, "utf-8");
    return JSON.parse(content) as PlunkMeta;
  } catch {
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
  await ensureDir(getStoreEntryPath(name, version));
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
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
  const entries = await listStoreEntries();
  const matching = entries.filter((e) => e.name === name);
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

  const entries: StoreEntry[] = [];
  const dirs = await readdir(storePath, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;

    // Parse name@version from directory name
    const atIdx = dir.name.lastIndexOf("@");
    if (atIdx <= 0) continue; // no @ or @ at start without scope

    const encodedName = dir.name.slice(0, atIdx);
    const version = dir.name.slice(atIdx + 1);
    const name = decodePackageName(encodedName);

    const meta = await readMeta(name, version);
    if (!meta) continue;

    entries.push({
      name,
      version,
      packageDir: getStorePackagePath(name, version),
      meta,
    });
  }

  return entries;
}

/** Remove a store entry */
export async function removeStoreEntry(
  name: string,
  version: string
): Promise<void> {
  await removeDir(getStoreEntryPath(name, version));
}
