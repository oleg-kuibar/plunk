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
 * Format an array of strings as a JS array literal.
 */
function formatArray(items: string[], indent: string): string {
  if (items.length === 0) return "[]";
  if (items.length <= 3) {
    return `[${items.map((i) => `'${i}'`).join(", ")}]`;
  }
  const inner = items.map((i) => `${indent}${indent}'${i}',`).join("\n");
  return `[\n${inner}\n${indent}]`;
}

/**
 * Add a package to transpilePackages in a Next.js config file.
 * Returns { modified: true } on success, { modified: false, error } on failure.
 */
export async function addToTranspilePackages(
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

  // Pattern 1: existing transpilePackages array
  const transpileRegex = /transpilePackages\s*:\s*\[([^\]]*)\]/s;
  const transpileMatch = transpileRegex.exec(content);
  if (transpileMatch) {
    const items = parseArrayItems(transpileMatch[1]);
    if (items.includes(packageName)) {
      return { modified: false }; // already present
    }
    items.push(packageName);
    const newArray = formatArray(items, indent);
    const updated = content.replace(transpileRegex, `transpilePackages: ${newArray}`);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  // Pattern 2: config object exists but no transpilePackages
  // Match: module.exports = {, export default {, nextConfig = {, etc.
  const configObjRegex = /(?:module\.exports\s*=\s*\{|export\s+default\s+\{|nextConfig\s*=\s*\{)/;
  const configObjMatch = configObjRegex.exec(content);
  if (configObjMatch) {
    const insertPos = configObjMatch.index + configObjMatch[0].length;
    const newSection = `\n${indent}transpilePackages: ['${packageName}'],`;
    const updated = content.slice(0, insertPos) + newSection + content.slice(insertPos);
    await writeFile(configPath, updated);
    return { modified: true };
  }

  return { modified: false, error: "unrecognized config pattern" };
}

/**
 * Remove a package from transpilePackages in a Next.js config file.
 */
export async function removeFromTranspilePackages(
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

  const transpileRegex = /transpilePackages\s*:\s*\[([^\]]*)\]/s;
  const transpileMatch = transpileRegex.exec(content);
  if (!transpileMatch) return { modified: false };

  const items = parseArrayItems(transpileMatch[1]);
  const filtered = items.filter((i) => i !== packageName);
  if (filtered.length === items.length) return { modified: false }; // wasn't present

  const newArray = formatArray(filtered, indent);
  const updated = content.replace(transpileRegex, `transpilePackages: ${newArray}`);
  await writeFile(configPath, updated);
  return { modified: true };
}
