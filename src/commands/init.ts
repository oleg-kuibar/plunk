import { defineCommand } from "citty";
import { resolve, join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { consola } from "consola";
import pc from "picocolors";
import { exists, ensureDir } from "../utils/fs.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { ensureOptimizeDepsSection } from "../utils/vite-config.js";
import {
  readConsumerState,
  writeConsumerState,
} from "../core/tracker.js";

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
    const skipPrompts = args.yes;
    consola.info(`Initializing plunk in ${pc.cyan(projectDir)}\n`);

    // 1. Detect and confirm package manager
    const detectedPm = await detectPackageManager(projectDir);
    const lockfileNames: Record<string, string> = {
      pnpm: "pnpm-lock.yaml",
      bun: "bun.lockb",
      yarn: "yarn.lock",
      npm: "package-lock.json",
    };
    consola.success(
      `Detected package manager: ${pc.cyan(detectedPm)}` +
        (lockfileNames[detectedPm]
          ? ` (from ${lockfileNames[detectedPm]})`
          : "")
    );

    let pm = detectedPm;
    if (!skipPrompts) {
      const confirm = await consola.prompt(`Use ${detectedPm}?`, {
        type: "confirm",
        initial: true,
      });
      if (confirm === false) {
        const choices = (["npm", "pnpm", "yarn", "bun"] as const).filter(
          (p) => p !== detectedPm
        );
        const selected = await consola.prompt("Select package manager:", {
          type: "select",
          options: choices.map((p) => ({ label: p, value: p })),
        });
        if (typeof selected === "string") {
          pm = selected as typeof pm;
        }
      }
    }

    // 2. Add .plunk/ to .gitignore
    const gitignorePath = join(projectDir, ".gitignore");
    const gitignoreUpdated = await ensureGitignore(gitignorePath);
    if (gitignoreUpdated) {
      consola.success("Added .plunk/ to .gitignore");
    }

    // 3. Add plunk restore to postinstall
    const pkgPath = join(projectDir, "package.json");
    if (await exists(pkgPath)) {
      const postinstallAdded = await addPostinstall(pkgPath);
      if (postinstallAdded) {
        consola.success(
          'Added "postinstall": "plunk restore" to package.json scripts'
        );
      }
    }

    // 4. Create .plunk/ directory and state
    const plunkDir = join(projectDir, ".plunk");
    if (!(await exists(plunkDir))) {
      await ensureDir(plunkDir);
      await writeFile(
        join(plunkDir, "state.json"),
        JSON.stringify({ version: "1", packageManager: pm, links: {} }, null, 2)
      );
      consola.success("Created .plunk/ state directory");
    } else {
      // Update existing state with package manager
      const state = await readConsumerState(projectDir);
      if (state.packageManager !== pm) {
        state.packageManager = pm;
        await writeConsumerState(projectDir, state);
      }
    }

    // 5. Detect bundler and auto-configure
    const bundler = await detectBundler(projectDir);
    if (bundler.type === "vite" && bundler.configFile) {
      consola.success(
        `Detected bundler: ${pc.cyan("Vite")} (${basename(bundler.configFile)})`
      );
      let shouldConfigure = true;
      if (!skipPrompts) {
        const confirm = await consola.prompt(
          "Auto-configure optimizeDeps.exclude?",
          { type: "confirm", initial: true }
        );
        shouldConfigure = confirm !== false;
      }
      if (shouldConfigure) {
        const result = await ensureOptimizeDepsSection(bundler.configFile);
        if (result.modified) {
          consola.success(`Updated ${basename(bundler.configFile)}`);
        } else if (result.error) {
          consola.info(
            `Could not auto-configure: ${result.error}. Add manually:\n` +
              `  ${pc.cyan("optimizeDeps: { exclude: ['my-lib'] }")}`
          );
        }
      }
    } else if (bundler.type) {
      const names: Record<string, string> = {
        next: "Next.js",
        webpack: "Webpack",
        turbo: "Turbopack",
        rollup: "Rollup",
      };
      consola.success(
        `Detected bundler: ${pc.cyan(names[bundler.type] || bundler.type)} — no config needed, works out of the box`
      );
    }

    // Next steps
    console.log("");
    consola.info(`${pc.bold("Next steps:")}`);
    console.log(
      `  1. ${pc.cyan("cd ../my-lib && plunk publish")}`
    );
    console.log(
      `  2. ${pc.cyan("plunk add my-lib")}${bundler.type === "vite" ? "                     ← auto-updates vite config" : ""}`
    );
    console.log(
      `  3. ${pc.cyan(`cd ../my-lib && plunk push --watch --build "${pm === "npm" ? "npm run build" : `${pm} build`}"`)}`
    );
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
