import { defineCommand } from "citty";
import { resolve, join } from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { consola } from "consola";
import pc from "picocolors";
import { exists, ensureDir } from "../utils/fs.js";

export default defineCommand({
  meta: {
    name: "init",
    description: "Set up plunk in the current project",
  },
  args: {
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    const projectDir = resolve(".");
    consola.info(`Initializing plunk in ${pc.cyan(projectDir)}\n`);

    const actions: string[] = [];

    // 1. Add .plunk/ to .gitignore
    const gitignorePath = join(projectDir, ".gitignore");
    const gitignoreUpdated = await ensureGitignore(gitignorePath);
    if (gitignoreUpdated) {
      actions.push("Added .plunk/ to .gitignore");
    }

    // 2. Add plunk restore to postinstall
    const pkgPath = join(projectDir, "package.json");
    if (await exists(pkgPath)) {
      const postinstallAdded = await addPostinstall(pkgPath);
      if (postinstallAdded) {
        actions.push('Added "postinstall": "plunk restore" to package.json scripts');
      }
    }

    // 3. Create .plunk/ directory
    const plunkDir = join(projectDir, ".plunk");
    if (!(await exists(plunkDir))) {
      await ensureDir(plunkDir);
      await writeFile(
        join(plunkDir, "state.json"),
        JSON.stringify({ version: "1", links: {} }, null, 2)
      );
      actions.push("Created .plunk/ directory with empty state");
    }

    // 4. Print Vite hint if applicable
    const hasVite =
      (await exists(join(projectDir, "vite.config.ts"))) ||
      (await exists(join(projectDir, "vite.config.js"))) ||
      (await exists(join(projectDir, "vite.config.mts")));

    // Summary
    if (actions.length === 0) {
      consola.success("plunk is already set up in this project");
    } else {
      for (const action of actions) {
        consola.success(action);
      }
    }

    console.log("");
    consola.info(`${pc.bold("Next steps:")}`);
    console.log(`  1. Publish a package:  ${pc.cyan("cd ../my-lib && plunk publish")}`);
    console.log(`  2. Link it here:       ${pc.cyan("plunk add my-lib")}`);
    console.log(`  3. Or in one step:     ${pc.cyan("plunk add my-lib --from ../my-lib")}`);
    console.log(`  4. Push changes:       ${pc.cyan("cd ../my-lib && plunk push --watch --build 'npm run build'")}`);

    if (hasVite) {
      console.log("");
      consola.info(
        `${pc.bold("Vite detected.")} Add linked packages to your vite.config:\n` +
          `  ${pc.cyan("optimizeDeps: { exclude: ['my-lib'] }")}`
      );
    }
  },
});

/**
 * Ensure .plunk/ is in .gitignore. Returns true if it was added.
 */
async function ensureGitignore(gitignorePath: string): Promise<boolean> {
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // .gitignore doesn't exist, create it
  }

  // Check if .plunk/ is already ignored (various patterns)
  const lines = content.split("\n");
  const alreadyIgnored = lines.some(
    (line) =>
      line.trim() === ".plunk/" ||
      line.trim() === ".plunk" ||
      line.trim() === "/.plunk/" ||
      line.trim() === "/.plunk"
  );

  if (alreadyIgnored) return false;

  // Append .plunk/ to .gitignore
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const section = content.length > 0 ? "\n# plunk local links\n.plunk/\n" : "# plunk local links\n.plunk/\n";
  await writeFile(gitignorePath, content + separator + section);
  return true;
}

/**
 * Add "postinstall": "plunk restore --silent" to package.json scripts.
 * Returns true if it was added.
 */
async function addPostinstall(pkgPath: string): Promise<boolean> {
  const content = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(content);

  // Don't overwrite existing postinstall
  if (pkg.scripts?.postinstall) {
    if (pkg.scripts.postinstall.includes("plunk")) return false;
    consola.warn(
      `Existing postinstall script found. Add ${pc.cyan("plunk restore")} manually if needed.`
    );
    return false;
  }

  if (!pkg.scripts) pkg.scripts = {};
  pkg.scripts.postinstall = "plunk restore || true";

  // Preserve original formatting (detect indent)
  const indent = content.match(/^(\s+)"/m)?.[1] || "  ";
  await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
  return true;
}
