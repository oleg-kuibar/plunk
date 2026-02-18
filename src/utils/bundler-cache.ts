import { join } from "node:path";
import { removeDir, exists } from "./fs.js";
import { detectBundler } from "./bundler-detect.js";
import { verbose } from "./logger.js";

export async function invalidateBundlerCache(
  consumerPath: string
): Promise<void> {
  const bundler = await detectBundler(consumerPath);
  if (bundler.type === "vite") {
    const cacheDir = join(consumerPath, "node_modules", ".vite", "deps");
    if (await exists(cacheDir)) {
      await removeDir(cacheDir);
      verbose("[inject] Invalidated Vite dep cache");
    }
  }
}
