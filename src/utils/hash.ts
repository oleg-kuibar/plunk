import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import pLimit from "p-limit";
import { verbose } from "./logger.js";

/** Files larger than this threshold use streaming hash */
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

/** Concurrency limit for parallel file reads in computeContentHash */
const limit = pLimit(16);

/**
 * Compute a SHA-256 content hash for a list of files.
 * The hash is deterministic: sorted by relative path, each entry is `path\0content`.
 * Reads files in parallel (up to 16 concurrent) then feeds into hash in sorted order.
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
 * Uses streaming for files > 1MB, buffered for smaller files.
 */
export async function hashFile(filePath: string): Promise<string> {
  const fileStat = await stat(filePath);
  if (fileStat.size > STREAM_THRESHOLD) {
    return hashFileStream(filePath);
  }
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute SHA-256 hash using a readable stream (for large files).
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
