import { join } from "node:path";
import { removeDir, exists } from "./fs.js";
import { detectAllBundlers } from "./bundler-detect.js";
import type { BundlerType } from "./bundler-detect.js";
import { verbose } from "./logger.js";

/** Cache directories to clear for each bundler type */
const CACHE_DIRS: Partial<Record<NonNullable<BundlerType>, string[]>> = {
  vite: ["node_modules/.vite/deps", "node_modules/.vite/deps_temp"],
  next: [".next/cache"],
  webpack: ["node_modules/.cache"],
};

export async function invalidateBundlerCache(
  consumerPath: string
): Promise<void> {
  const bundlers = await detectAllBundlers(consumerPath);

  for (const bundler of bundlers) {
    if (!bundler.type) continue;
    const dirs = CACHE_DIRS[bundler.type];
    if (!dirs) continue;

    for (const dir of dirs) {
      const cacheDir = join(consumerPath, dir);
      if (await exists(cacheDir)) {
        try {
          await removeDir(cacheDir);
          verbose(`[inject] Invalidated ${bundler.type} cache: ${dir}`);
        } catch {
          // Dev server might have the dir locked (especially on Windows)
          verbose(`[inject] Could not clear ${bundler.type} cache: ${dir} (locked?)`);
        }
      }
    }
  }
}
