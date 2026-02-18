import { join } from "node:path";
import { exists } from "./fs.js";

export type BundlerType = "vite" | "next" | "webpack" | "turbo" | "rollup" | null;

export interface BundlerInfo {
  type: BundlerType;
  configFile: string | null;
}

/** Config file patterns to check, in priority order */
const BUNDLER_CONFIGS: [BundlerType, string[]][] = [
  ["vite", ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]],
  ["next", ["next.config.js", "next.config.ts", "next.config.mjs"]],
  ["webpack", ["webpack.config.js", "webpack.config.ts"]],
  ["turbo", ["turbo.json"]],
  ["rollup", ["rollup.config.js", "rollup.config.ts", "rollup.config.mjs"]],
];

/**
 * Detect the bundler used in a project directory
 * by checking for config file presence.
 * Returns the first match in priority order.
 */
export async function detectBundler(projectDir: string): Promise<BundlerInfo> {
  for (const [type, configFiles] of BUNDLER_CONFIGS) {
    for (const configFile of configFiles) {
      const fullPath = join(projectDir, configFile);
      if (await exists(fullPath)) {
        return { type, configFile: fullPath };
      }
    }
  }
  return { type: null, configFile: null };
}

/**
 * Detect ALL bundlers present in a project directory.
 * A Next.js project may also have webpack caches, etc.
 */
export async function detectAllBundlers(projectDir: string): Promise<BundlerInfo[]> {
  const results: BundlerInfo[] = [];
  for (const [type, configFiles] of BUNDLER_CONFIGS) {
    for (const configFile of configFiles) {
      if (await exists(join(projectDir, configFile))) {
        results.push({ type, configFile: join(projectDir, configFile) });
        break;
      }
    }
  }
  return results;
}
