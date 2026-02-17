import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

/**
 * Compute a SHA-256 content hash for a list of files.
 * The hash is deterministic: sorted by relative path, each entry is `path\0content`.
 */
export async function computeContentHash(
  files: string[],
  baseDir: string
): Promise<string> {
  const hash = createHash("sha256");

  // Sort by relative path for determinism
  const sorted = [...files].sort((a, b) => {
    const relA = relative(baseDir, a);
    const relB = relative(baseDir, b);
    return relA.localeCompare(relB);
  });

  for (const file of sorted) {
    const rel = relative(baseDir, file);
    const content = await readFile(file);
    hash.update(rel);
    hash.update("\0");
    hash.update(content);
  }

  return "sha256:" + hash.digest("hex");
}

/**
 * Compute SHA-256 hash of a single file's content.
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}
