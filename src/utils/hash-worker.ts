import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import xxhash from "xxhash-wasm";

/** Files larger than this threshold use SHA-256 streaming */
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

/** xxhash instance initialized once per worker */
const xxhReady = xxhash();

/**
 * Hash a single file. Called by the worker pool from the main thread.
 * - Files ≤1MB: buffered read + xxh64
 * - Files >1MB: SHA-256 streaming (bottleneck is disk I/O anyway)
 */
export default async function hashFileWorker(filePath: string, size: number): Promise<string> {
  if (size > STREAM_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  const { h64Raw } = await xxhReady;
  const content = await readFile(filePath);
  return h64Raw(content).toString(16);
}
