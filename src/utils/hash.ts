import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import pLimit from "p-limit";
import { availableParallelism } from "node:os";
import xxhash from "xxhash-wasm";
import { verbose } from "./logger.js";

/** Files larger than this threshold use streaming hash */
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

/** Files smaller than this are hashed on the main thread (worker overhead not worth it) */
const WORKER_THRESHOLD = 64 * 1024; // 64KB

/** Concurrency limit for parallel file reads in computeContentHash */
const limit = pLimit(Math.max(availableParallelism(), 8));

/** Lazily initialized xxhash instance */
let xxh: Awaited<ReturnType<typeof xxhash>> | null = null;

async function getXxhash() {
  if (!xxh) xxh = await xxhash();
  return xxh;
}

// ── Worker pool (lazy-init) ──

type Pool = { run: (args: [string, number]) => Promise<string>; destroy: () => Promise<void> };
let pool: Pool | null = null;
let poolFailed = false;

async function getPool(): Promise<Pool | null> {
  if (poolFailed) return null;
  if (pool) return pool;

  try {
    const { default: Tinypool } = await import("tinypool");
    const poolSize = Math.min(Math.max(availableParallelism(), 2), 8);
    const workerUrl = new URL("./hash-worker.mjs", import.meta.url);

    pool = new Tinypool({
      filename: workerUrl.href,
      minThreads: 0,
      maxThreads: poolSize,
    }) as unknown as Pool;

    verbose(`[hash] Worker pool initialized (max ${poolSize} threads)`);
    return pool;
  } catch {
    poolFailed = true;
    verbose("[hash] Worker pool unavailable, using main-thread hashing");
    return null;
  }
}

// Graceful cleanup on exit
process.on("exit", () => {
  pool?.destroy();
});

/**
 * Compute an xxh64 content hash for a list of files.
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
 * Compute xxh64 hash of a single file's content.
 * - Files ≤64KB: hashed on main thread (worker overhead not worth it)
 * - Files >64KB: offloaded to worker pool
 * - Files >1MB: SHA-256 streaming (in worker or main thread fallback)
 * Accepts an optional knownSize to skip the stat syscall when the caller already has it.
 */
export async function hashFile(filePath: string, knownSize?: number): Promise<string> {
  const size = knownSize ?? (await stat(filePath)).size;

  // Small files: main thread is faster than worker overhead
  if (size <= WORKER_THRESHOLD) {
    return hashFileMainThread(filePath, size);
  }

  // Try worker pool for larger files
  const p = await getPool();
  if (p) {
    try {
      return await p.run([filePath, size]);
    } catch {
      // Worker failed, fall back to main thread
    }
  }

  return hashFileMainThread(filePath, size);
}

/** Hash a file on the main thread */
async function hashFileMainThread(filePath: string, size: number): Promise<string> {
  if (size > STREAM_THRESHOLD) {
    return hashFileStream(filePath);
  }
  const { h64Raw } = await getXxhash();
  const content = await readFile(filePath);
  return h64Raw(content).toString(16);
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
