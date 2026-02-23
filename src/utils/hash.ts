import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { availableParallelism } from "node:os";
import pLimit from "./concurrency.js";
import { verbose } from "./logger.js";

/** Files larger than this threshold use streaming hash */
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

/** Concurrency limit for parallel file reads in computeContentHash */
const limit = pLimit(Math.max(availableParallelism(), 8));

/**
 * Compute a SHA-256 content hash for a list of files.
 * The hash is deterministic: sorted by relative path, each entry is `path\0content`.
 * Reads files in parallel (up to CPU count concurrent) then feeds into hash in sorted order.
 */
export async function computeContentHash(
  files: string[],
  baseDir: string
): Promise<string> {
  // Sort by relative path for determinism (normalize separators for cross-platform consistency)
  const sorted = [...files].sort((a, b) => {
    const relA = relative(baseDir, a).replace(/\\/g, "/");
    const relB = relative(baseDir, b).replace(/\\/g, "/");
    return relA.localeCompare(relB);
  });

  // Read all files in parallel, maintaining sorted order
  const contents = await Promise.all(
    sorted.map((file) =>
      limit(async () => ({
        rel: relative(baseDir, file).replace(/\\/g, "/"),
        content: await readFile(file),
      }))
    )
  );

  verbose(`[hash] Computing content hash for ${files.length} files`);

  // Use SHA-256 streaming for the aggregate content hash.
  // This is called once per publish (not per-file), and the deterministic
  // prefix "sha256:" is stored in metadata — switching to xxhash here would
  // invalidate every existing store entry for no meaningful speedup.
  const hash = createHash("sha256");
  for (const { rel, content } of contents) {
    hash.update(rel);
    hash.update("\0");
    hash.update(content);
  }

  const result = "sha256:" + hash.digest("hex");
  verbose(`[hash] Result: ${result.slice(0, 20)}...`);
  return result;
}

/**
 * Compute SHA-256 hash of a single file's content.
 * - Files ≤1MB: buffered read + SHA-256
 * - Files >1MB: SHA-256 streaming (bottleneck is disk I/O, not hashing)
 */
export async function hashFile(filePath: string, knownSize?: number): Promise<string> {
  const size = knownSize ?? (await stat(filePath)).size;

  if (size > STREAM_THRESHOLD) {
    return hashFileStream(filePath);
  }

  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute SHA-256 hash using a readable stream (for large files).
 * Large files are rare in the incremental copy path and SHA-256 streaming
 * is already fast enough — the bottleneck is disk I/O, not hashing.
 */
function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
