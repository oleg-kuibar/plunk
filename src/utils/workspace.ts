import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
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
