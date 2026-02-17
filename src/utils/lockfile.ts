import { lock } from "proper-lockfile";
import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { isNodeError } from "./fs.js";

const LOCK_OPTIONS = {
  retries: {
    retries: 5,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2,
  },
  stale: 10000,
  realpath: false,
};

/**
 * Execute a function while holding a file lock on the given path.
 * Creates parent directory and empty file if needed (proper-lockfile requires the file to exist).
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  await mkdir(dirname(filePath), { recursive: true });

  // Ensure the file exists (proper-lockfile requires it)
  try {
    await writeFile(filePath, "", { flag: "wx" });
  } catch (err) {
    if (isNodeError(err) && err.code === "EEXIST") {
      // File already exists, that's fine
    } else {
      throw err;
    }
  }

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(filePath, LOCK_OPTIONS);
    return await fn();
  } finally {
    if (release) {
      await release();
    }
  }
}
