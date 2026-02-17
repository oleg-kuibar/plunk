import { readFile, writeFile } from "node:fs/promises";

/**
 * Detect the indentation style used in a file.
 */
function detectIndent(content: string): string {
  const match = content.match(/^(\s+)\S/m);
  return match?.[1] || "  ";
}

/**
 * Parse items from a string like `'a', 'b', "c"` into an array of strings.
 */
function parseArrayItems(str: string): string[] {
  const items: string[] = [];
  const regex = /['"]([^'"]*)['"]/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    items.push(match[1]);
  }
  return items;
}

/**
 * Format an array of strings as a JS array literal for exclude.
 */
function formatExcludeArray(items: string[], indent: string): string {
  if (items.length === 0) return "[]";
  if (items.length <= 3) {
    return `[${items.map((i) => `'${i}'`).join(", ")}]`;
  }
  const inner = items.map((i) => `${indent}${indent}'${i}',`).join("\n");
  return `[\n${inner}\n${indent}]`;
}

/**
 * Add a package to optimizeDeps.exclude in a Vite config file.
 * Returns { modified: true } on success, { modified: false, error } on failure.
 */
export async function addToOptimizeDepsExclude(
  configPath: string,
  packageName: string
): Promise<{ modified: boolean; error?: string }> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return { modified: false, error: "could not read config file" };
  }

  const indent = detectIndent(content);

  // Pattern 1: existing exclude array
  const excludeRegex = /exclude\s*:\s*\[([^\]]*)\]/s;
  const excludeMatch = excludeRegex.exec(content);
  if (excludeMatch) {
    const items = parseArrayItems(excludeMatch[1]);
    if (items.includes(packageName)) {
      return { modified: false }; // already present
    }
    items.push(packageName);
    const newArray = formatExcludeArray(items, indent);
    const updated = content.replace(excludeRegex, `exclude: ${newArray}`);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  // Pattern 2: optimizeDeps exists but no exclude
  const optimizeDepsRegex = /optimizeDeps\s*:\s*\{/;
  const optimizeDepsMatch = optimizeDepsRegex.exec(content);
  if (optimizeDepsMatch) {
    const insertPos = optimizeDepsMatch.index + optimizeDepsMatch[0].length;
    const newExclude = `\n${indent}${indent}exclude: ['${packageName}'],`;
    const updated = content.slice(0, insertPos) + newExclude + content.slice(insertPos);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  // Pattern 3: defineConfig({ or export default { but no optimizeDeps
  const configObjRegex = /defineConfig\s*\(\s*\{|export\s+default\s+\{/;
  const configObjMatch = configObjRegex.exec(content);
  if (configObjMatch) {
    const insertPos = configObjMatch.index + configObjMatch[0].length;
    const newSection = `\n${indent}optimizeDeps: {\n${indent}${indent}exclude: ['${packageName}'],\n${indent}},`;
    const updated = content.slice(0, insertPos) + newSection + content.slice(insertPos);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  return { modified: false, error: "unrecognized config pattern" };
}

/**
 * Remove a package from optimizeDeps.exclude in a Vite config file.
 */
export async function removeFromOptimizeDepsExclude(
  configPath: string,
  packageName: string
): Promise<{ modified: boolean }> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return { modified: false };
  }

  const indent = detectIndent(content);

  const excludeRegex = /exclude\s*:\s*\[([^\]]*)\]/s;
  const excludeMatch = excludeRegex.exec(content);
  if (!excludeMatch) return { modified: false };

  const items = parseArrayItems(excludeMatch[1]);
  const filtered = items.filter((i) => i !== packageName);
  if (filtered.length === items.length) return { modified: false }; // wasn't present

  const newArray = formatExcludeArray(filtered, indent);
  const updated = content.replace(excludeRegex, `exclude: ${newArray}`);
  await writeFile(configPath, updated);
  return { modified: true };
}

/**
 * Ensure an optimizeDeps section exists in a Vite config file.
 * If one already exists, does nothing. If not, inserts an empty one.
 */
export async function ensureOptimizeDepsSection(
  configPath: string
): Promise<{ modified: boolean; error?: string }> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return { modified: false, error: "could not read config file" };
  }

  // Already has optimizeDeps
  if (/optimizeDeps\s*:/.test(content)) {
    return { modified: false };
  }

  const indent = detectIndent(content);

  const configObjRegex = /defineConfig\s*\(\s*\{|export\s+default\s+\{/;
  const configObjMatch = configObjRegex.exec(content);
  if (configObjMatch) {
    const insertPos = configObjMatch.index + configObjMatch[0].length;
    const newSection = `\n${indent}optimizeDeps: {\n${indent}${indent}exclude: [],\n${indent}},`;
    const updated = content.slice(0, insertPos) + newSection + content.slice(insertPos);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  return { modified: false, error: "unrecognized config pattern" };
}
