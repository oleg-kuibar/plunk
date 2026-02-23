import { join } from "node:path";
import { removeDir, exists } from "./fs.js";
import { detectAllBundlers } from "./bundler-detect.js";
import type { BundlerInfo, BundlerType } from "./bundler-detect.js";
import { verbose } from "./logger.js";

/** Cache directories to clear for each bundler type */
const CACHE_DIRS: Partial<Record<NonNullable<BundlerType>, string[]>> = {
  vite: ["node_modules/.vite"],
  next: [".next/cache"],
  webpack: ["node_modules/.cache"],
};

/** Per-consumer cache of detected bundlers to avoid redundant fs checks */
const bundlerCache = new Map<string, BundlerInfo[]>();

/** Reset the bundler detection cache (for testing) */
export function resetBundlerDetectionCache(): void {
  bundlerCache.clear();
}

export async function invalidateBundlerCache(
  consumerPath: string
): Promise<void> {
  let bundlers = bundlerCache.get(consumerPath);
  if (!bundlers) {
    bundlers = await detectAllBundlers(consumerPath);
    bundlerCache.set(consumerPath, bundlers);
  }

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
