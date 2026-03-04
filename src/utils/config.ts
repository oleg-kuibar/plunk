import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verbose } from "./logger.js";

/**
 * plunk configuration stored in package.json under the "plunk" key.
 * Provides persistent defaults for watch/build/dev behavior.
 */
export interface PlunkConfig {
  /** Build command override (same as --build CLI flag) */
  buildCmd?: string;
  /** Glob patterns to watch (same as watch patterns) */
  watchPatterns?: string[];
  /** Debounce delay in ms */
  debounce?: number;
  /** Minimum time between builds in ms */
  cooldown?: number;
}

/**
 * Load plunk configuration from package.json#plunk.
 * Returns an empty config if the field is missing or invalid.
 */
export async function loadPlunkConfig(
  projectDir: string
): Promise<PlunkConfig> {
  try {
    const raw = await readFile(join(projectDir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    if (!pkg.plunk || typeof pkg.plunk !== "object") return {};

    const config: PlunkConfig = {};
    const p = pkg.plunk;

    if (typeof p.buildCmd === "string") config.buildCmd = p.buildCmd;
    if (Array.isArray(p.watchPatterns)) {
      config.watchPatterns = p.watchPatterns.filter(
        (v: unknown) => typeof v === "string"
      );
    }
    if (typeof p.debounce === "number" && Number.isFinite(p.debounce)) {
      config.debounce = p.debounce;
    }
    if (typeof p.cooldown === "number" && Number.isFinite(p.cooldown)) {
      config.cooldown = p.cooldown;
    }

    verbose(`[config] Loaded plunk config from package.json: ${JSON.stringify(config)}`);
    return config;
  } catch {
    return {};
  }
}
