import { readFile, writeFile } from "node:fs/promises";

/**
 * Detect the indentation style used in a file.
 */
function detectIndent(content: string): string {
  const match = content.match(/^(\s+)\S/m);
  return match?.[1] || "  ";
}

/**
 * Check if the content already has the plunk Vite plugin configured.
 */
function hasPlunkPlugin(content: string): boolean {
  return (
    content.includes("@papoy/plunk/vite") ||
    content.includes("vite-plugin-plunk")
  );
}

/**
 * Parse comma-separated plugin entries, handling nested parentheses.
 * e.g. "react(), svelte({ hot: true })" → ["react()", "svelte({ hot: true })"]
 */
function parsePluginItems(str: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;

    if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);

  return items;
}

/**
 * Format plugin items into a plugins array literal.
 */
function formatPlugins(items: string[], indent: string): string {
  if (items.length === 0) return "[]";
  if (items.length === 1) return `[${items[0]}]`;
  const inner = items.map((i) => `${indent}${indent}${i},`).join("\n");
  return `[\n${inner}\n${indent}]`;
}

/**
 * Add the plunk Vite plugin import and plugin call to a Vite config file.
 * Returns { modified: true } on success, { modified: false, error } on failure.
 */
export async function addPlunkVitePlugin(
  configPath: string,
): Promise<{ modified: boolean; error?: string }> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return { modified: false, error: "could not read config file" };
  }

  if (hasPlunkPlugin(content)) {
    return { modified: false }; // already configured
  }

  const indent = detectIndent(content);

  // Phase 1: Add plunk() to plugins array
  // Pattern 1: existing plugins: [...] array
  const pluginsRegex = /plugins\s*:\s*\[([\s\S]*?)\]/;
  const pluginsMatch = pluginsRegex.exec(content);

  if (pluginsMatch) {
    const items = parsePluginItems(pluginsMatch[1]);
    items.push("plunk()");
    const newPlugins = formatPlugins(items, indent);
    content = content.replace(pluginsRegex, `plugins: ${newPlugins}`);
  } else {
    // Pattern 2: config object exists but no plugins array
    // Match defineConfig({, export default {, etc.
    const configObjRegex =
      /(?:defineConfig\s*\(\s*\{|export\s+default\s+\{)/;
    const configObjMatch = configObjRegex.exec(content);

    if (configObjMatch) {
      const insertPos = configObjMatch.index + configObjMatch[0].length;
      const newSection = `\n${indent}plugins: [plunk()],`;
      content =
        content.slice(0, insertPos) + newSection + content.slice(insertPos);
    } else {
      return {
        modified: false,
        error: "unrecognized Vite config pattern",
      };
    }
  }

  // Phase 2: Add import statement after the last existing import
  const importLine = `import plunk from "@papoy/plunk/vite";\n`;
  const lastImportRegex = /^import\s.+$/gm;
  let lastImportEnd = 0;
  let match;
  while ((match = lastImportRegex.exec(content)) !== null) {
    lastImportEnd = match.index + match[0].length;
  }

  if (lastImportEnd > 0) {
    // Insert after last import line
    content =
      content.slice(0, lastImportEnd) +
      "\n" +
      importLine +
      content.slice(lastImportEnd + 1); // +1 to consume the \n after last import
  } else {
    // No imports found — prepend
    content = importLine + "\n" + content;
  }

  await writeFile(configPath, content);
  return { modified: true };
}

/**
 * Remove the plunk Vite plugin from a config file.
 * Removes the import line and the plunk() call from the plugins array.
 */
export async function removeFromViteConfig(
  configPath: string,
): Promise<{ modified: boolean }> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return { modified: false };
  }

  if (!hasPlunkPlugin(content)) {
    return { modified: false };
  }

  let modified = false;

  // Remove the import line
  const importRegex =
    /^import\s+\w+\s+from\s+["']@papoy\/plunk\/vite["'];?\s*\n?/m;
  if (importRegex.test(content)) {
    content = content.replace(importRegex, "");
    modified = true;
  }

  // Remove plunk() from plugins array
  const pluginsRegex = /plugins\s*:\s*\[([\s\S]*?)\]/;
  const pluginsMatch = pluginsRegex.exec(content);
  if (pluginsMatch) {
    const items = parsePluginItems(pluginsMatch[1]);
    const filtered = items.filter(
      (item) => !item.startsWith("plunk("),
    );
    if (filtered.length !== items.length) {
      const indent = detectIndent(content);
      const newPlugins = formatPlugins(filtered, indent);
      content = content.replace(pluginsRegex, `plugins: ${newPlugins}`);
      modified = true;
    }
  }

  if (modified) {
    await writeFile(configPath, content);
  }

  return { modified };
}
