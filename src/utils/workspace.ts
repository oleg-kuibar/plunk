import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import picomatch from "picomatch";
import { exists } from "./fs.js";

export interface Catalogs {
  default: Record<string, string>;
  named: Record<string, Record<string, string>>;
}

/**
 * Walk up from startDir looking for pnpm-workspace.yaml.
 * Returns the directory containing it, or null if not found.
 */
export async function findWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = startDir;
  for (;;) {
    if (await exists(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse pnpm-workspace.yaml for catalog definitions.
 * Handles the flat key-value structure that catalogs use:
 *
 *   catalog:          (default catalog)
 *     react: ^18.0.0
 *
 *   catalogs:         (named catalogs)
 *     react17:
 *       react: ^17.0.0
 *
 * This is a minimal line-by-line parser — no YAML library needed since
 * catalogs only use flat string key-value pairs (no anchors, multiline, etc).
 */
export async function parseCatalogs(workspaceRoot: string): Promise<Catalogs> {
  const result: Catalogs = { default: {}, named: {} };
  const filePath = join(workspaceRoot, "pnpm-workspace.yaml");

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return result;
  }

  const lines = content.split(/\r?\n/);

  type State = "top" | "default-catalog" | "named-catalogs" | "named-catalog-entries";
  let state: State = "top";
  let currentNamedCatalog = "";

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level keys (no indent)
    if (indent === 0) {
      if (line.startsWith("catalog:")) {
        state = "default-catalog";
        // Inline value like `catalog: { ... }` is not used in practice
        continue;
      }
      if (line.startsWith("catalogs:")) {
        state = "named-catalogs";
        continue;
      }
      // Any other top-level key resets state
      state = "top";
      continue;
    }

    // Inside `catalog:` — 2-space indented key-value pairs
    if (state === "default-catalog" && indent >= 2) {
      const kv = parseKeyValue(line);
      if (kv) result.default[kv[0]] = kv[1];
      continue;
    }

    // Inside `catalogs:` — 2-space indent = named catalog header
    if (state === "named-catalogs" && indent >= 2 && indent < 4) {
      const trimmed = line.trim();
      if (trimmed.endsWith(":")) {
        currentNamedCatalog = trimmed.slice(0, -1);
        result.named[currentNamedCatalog] = {};
        state = "named-catalog-entries";
      }
      continue;
    }

    // Inside a named catalog — 4-space indented key-value pairs
    if (state === "named-catalog-entries" && indent >= 4) {
      const kv = parseKeyValue(line);
      if (kv && currentNamedCatalog) {
        result.named[currentNamedCatalog][kv[0]] = kv[1];
      }
      continue;
    }

    // 2-space indent but we're in named-catalog-entries → new named catalog or exit
    if (state === "named-catalog-entries" && indent >= 2 && indent < 4) {
      const trimmed = line.trim();
      if (trimmed.endsWith(":")) {
        currentNamedCatalog = trimmed.slice(0, -1);
        result.named[currentNamedCatalog] = {};
      } else {
        state = "named-catalogs";
      }
      continue;
    }
  }

  return result;
}

/**
 * Find all workspace package directories.
 * Supports pnpm (pnpm-workspace.yaml) and npm/yarn (package.json workspaces field).
 * Returns absolute paths to directories that contain a package.json.
 */
export async function findWorkspacePackages(startDir: string): Promise<string[]> {
  // Try pnpm-workspace.yaml first
  const pnpmRoot = await findWorkspaceRoot(startDir);
  if (pnpmRoot) {
    const patterns = await parsePnpmWorkspacePackages(pnpmRoot);
    if (patterns.length > 0) {
      return resolveWorkspaceGlobs(pnpmRoot, patterns);
    }
  }

  // Fall back to npm/yarn workspaces field in package.json
  const rootDir = pnpmRoot ?? await findPackageJsonWorkspaceRoot(startDir);
  if (!rootDir) return [];

  try {
    const rootPkg = JSON.parse(await readFile(join(rootDir, "package.json"), "utf-8"));
    const workspaces: string[] = Array.isArray(rootPkg.workspaces)
      ? rootPkg.workspaces
      : rootPkg.workspaces?.packages ?? [];
    if (workspaces.length === 0) return [];
    return resolveWorkspaceGlobs(rootDir, workspaces);
  } catch {
    return [];
  }
}

/**
 * Parse pnpm-workspace.yaml for the `packages:` field.
 * Returns glob patterns like ["packages/*", "apps/*"].
 */
async function parsePnpmWorkspacePackages(workspaceRoot: string): Promise<string[]> {
  const filePath = join(workspaceRoot, "pnpm-workspace.yaml");
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const patterns: string[] = [];
  let inPackages = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inPackages = trimmed === "packages:";
      continue;
    }

    if (inPackages && indent >= 2) {
      // Lines like `  - "packages/*"` or `  - packages/*`
      const match = trimmed.match(/^-\s+["']?([^"']+)["']?$/);
      if (match) {
        // Skip negation patterns (e.g., "!packages/internal")
        if (!match[1].startsWith("!")) {
          patterns.push(match[1]);
        }
      }
    }
  }

  return patterns;
}

/**
 * Walk up from startDir looking for a package.json with a `workspaces` field.
 */
async function findPackageJsonWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = startDir;
  for (;;) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
      if (pkg.workspaces) return dir;
    } catch {
      // no package.json at this level
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve workspace glob patterns to actual package directories.
 * Each pattern like "packages/*" is expanded to actual directories containing package.json.
 */
async function resolveWorkspaceGlobs(rootDir: string, patterns: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const pattern of patterns) {
    // If pattern has a wildcard, expand it
    if (pattern.includes("*")) {
      // Find the static prefix before the first wildcard
      const parts = pattern.split("/");
      let staticPrefix = rootDir;
      const globParts: string[] = [];
      let foundGlob = false;
      for (const part of parts) {
        if (foundGlob || part.includes("*")) {
          foundGlob = true;
          globParts.push(part);
        } else {
          staticPrefix = join(staticPrefix, part);
        }
      }

      if (globParts.length === 1 && globParts[0] === "*") {
        // Simple case: "packages/*" → list immediate subdirs
        try {
          const entries = await readdir(staticPrefix, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgDir = join(staticPrefix, entry.name);
              if (await exists(join(pkgDir, "package.json"))) {
                results.push(pkgDir);
              }
            }
          }
        } catch {
          // directory doesn't exist
        }
      } else {
        // Complex glob: use picomatch
        const isMatch = picomatch(pattern);
        const candidates = await collectDirs(rootDir, 4);
        for (const candidate of candidates) {
          const rel = relative(rootDir, candidate).replace(/\\/g, "/");
          if (isMatch(rel) && await exists(join(candidate, "package.json"))) {
            results.push(candidate);
          }
        }
      }
    } else {
      // Literal path
      const pkgDir = resolve(rootDir, pattern);
      if (await exists(join(pkgDir, "package.json"))) {
        results.push(pkgDir);
      }
    }
  }

  return [...new Set(results)];
}

/** Collect directories up to a given depth */
async function collectDirs(dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      results.push(full);
      results.push(...await collectDirs(full, maxDepth - 1));
    }
  } catch {
    // directory doesn't exist or can't be read
  }
  return results;
}

/** Parse a YAML key-value line like `  react: ^18.0.0` */
function parseKeyValue(line: string): [string, string] | null {
  const trimmed = line.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx <= 0) return null;
  const key = trimmed.slice(0, colonIdx).trim();
  const value = trimmed.slice(colonIdx + 1).trim();
  if (!key || !value) return null;
  // Remove optional quotes around value
  const unquoted = value.replace(/^["']|["']$/g, "");
  return [key, unquoted];
}
