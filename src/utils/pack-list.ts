import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { PackageJson } from "../types.js";

/**
 * Resolve the list of publishable files for a package.
 * Mimics `npm pack` logic:
 * 1. If `files` field exists in package.json, use those globs (always includes package.json)
 * 2. If no `files` field, include everything except common ignores
 * 3. Respect .npmignore if present (simplified)
 *
 * Returns absolute file paths.
 */
export async function resolvePackFiles(
  packageDir: string,
  pkg: PackageJson
): Promise<string[]> {
  const files: string[] = [];
  const absDir = resolve(packageDir);

  // package.json is always included
  files.push(join(absDir, "package.json"));

  if (pkg.files && pkg.files.length > 0) {
    // Use the `files` field — treat each entry as a file or directory
    for (const pattern of pkg.files) {
      const target = join(absDir, pattern);
      try {
        const s = await stat(target);
        if (s.isDirectory()) {
          const dirFiles = await collectAllFiles(target);
          files.push(...dirFiles);
        } else {
          files.push(target);
        }
      } catch {
        // Pattern might be a glob or not exist — try as glob-like
        // For simplicity, treat as literal path. If it doesn't exist, skip.
      }
    }
  } else {
    // No `files` field — include everything except common ignores
    const allFiles = await collectAllFiles(absDir);
    const ignoreSet = await loadNpmIgnore(absDir);
    for (const f of allFiles) {
      const rel = relative(absDir, f);
      if (!shouldIgnore(rel, ignoreSet)) {
        files.push(f);
      }
    }
  }

  // Always include common root files
  for (const name of ["README.md", "README", "LICENSE", "LICENCE", "CHANGELOG.md"]) {
    const p = join(absDir, name);
    try {
      await stat(p);
      if (!files.includes(p)) files.push(p);
    } catch {
      // doesn't exist
    }
  }

  // Deduplicate
  return [...new Set(files)];
}

/** Default directories/files to ignore when no `files` field */
const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".DS_Store",
  ".npmrc",
  ".plunk",
  "test",
  "tests",
  "__tests__",
  ".github",
  ".vscode",
  ".idea",
  "coverage",
  ".nyc_output",
  "tsconfig.json",
  "tsconfig.build.json",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".prettierrc",
  ".prettierrc.js",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
];

function shouldIgnore(relPath: string, ignoreSet: Set<string>): boolean {
  const parts = relPath.split(/[\\/]/);
  for (const part of parts) {
    if (DEFAULT_IGNORES.includes(part)) return true;
    if (ignoreSet.has(part)) return true;
  }
  // Also check full relative path
  if (ignoreSet.has(relPath)) return true;
  return false;
}

async function loadNpmIgnore(dir: string): Promise<Set<string>> {
  const ignoreSet = new Set<string>();
  try {
    const content = await readFile(join(dir, ".npmignore"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        ignoreSet.add(trimmed);
      }
    }
  } catch {
    // no .npmignore
  }
  return ignoreSet;
}

async function collectAllFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...(await collectAllFiles(full)));
    } else {
      results.push(full);
    }
  }
  return results;
}
