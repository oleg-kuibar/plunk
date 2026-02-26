import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "./console.js";
import pc from "picocolors";
import { exists, ensureDir } from "./fs.js";
import { getConsumerStatePath, getConsumerPlunkDir } from "./paths.js";
import { readConsumerState, writeConsumerState } from "../core/tracker.js";
import type { PackageManager } from "../types.js";

/**
 * Ensure .plunk/ is in .gitignore. Returns true if it was added.
 */
export async function ensureGitignore(
  gitignorePath: string,
): Promise<boolean> {
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // .gitignore doesn't exist, create it
  }

  const lines = content.split("\n");
  const alreadyIgnored = lines.some(
    (line) =>
      line.trim() === ".plunk/" ||
      line.trim() === ".plunk" ||
      line.trim() === "/.plunk/" ||
      line.trim() === "/.plunk",
  );

  if (alreadyIgnored) return false;

  const separator =
    content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const section =
    content.length > 0
      ? "\n# plunk local links\n.plunk/\n"
      : "# plunk local links\n.plunk/\n";
  await writeFile(gitignorePath, content + separator + section);
  return true;
}

/**
 * Add "postinstall": "npx @olegkuibar/plunk restore || true" to package.json scripts.
 * Uses npx to ensure the command works even if plunk isn't globally installed.
 * Returns true if it was added.
 */
export async function addPostinstall(pkgPath: string): Promise<boolean> {
  const content = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(content);

  if (pkg.scripts?.postinstall) {
    if (pkg.scripts.postinstall.includes("plunk")) return false;
    consola.warn(
      `Existing postinstall script found. Add ${pc.cyan("npx @olegkuibar/plunk restore")} manually if needed.`,
    );
    return false;
  }

  if (!pkg.scripts) pkg.scripts = {};
  pkg.scripts.postinstall = "npx @olegkuibar/plunk restore || true";

  const indent = content.match(/^(\s+)"/m)?.[1] || "  ";
  await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
  return true;
}

/**
 * Auto-initialize a consumer project: create .plunk/state.json,
 * add .plunk/ to .gitignore, add postinstall script.
 */
export async function ensureConsumerInit(
  projectDir: string,
  pm: PackageManager,
): Promise<void> {
  const plunkDir = getConsumerPlunkDir(projectDir);
  const statePath = getConsumerStatePath(projectDir);

  if (!(await exists(statePath))) {
    await ensureDir(plunkDir);
    await writeConsumerState(projectDir, {
      version: "1",
      packageManager: pm,
      role: "consumer",
      links: {},
    });
  } else {
    // Ensure PM is recorded
    const state = await readConsumerState(projectDir);
    if (!state.packageManager) {
      state.packageManager = pm;
      state.role = state.role ?? "consumer";
      await writeConsumerState(projectDir, state);
    }
  }

  const gitignorePath = join(projectDir, ".gitignore");
  await ensureGitignore(gitignorePath);

  const pkgPath = join(projectDir, "package.json");
  if (await exists(pkgPath)) {
    await addPostinstall(pkgPath);
  }
}
