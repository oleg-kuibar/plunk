import { defineCommand } from "citty";
import { resolve, join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { consola } from "consola";
import pc from "picocolors";
import { exists, ensureDir } from "../utils/fs.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { detectBuildCommand as detectBuildCmd } from "../utils/build-detect.js";
import { ensureGitignore, addPostinstall } from "../utils/init-helpers.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import {
  readConsumerState,
  writeConsumerState,
} from "../core/tracker.js";
import type { PackageManager } from "../types.js";

type ProjectRole = "consumer" | "library";

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
    role: {
      type: "string",
      description: 'Project role: "consumer" or "library"',
    },
  },
  async run({ args }) {
    suppressHumanOutput();
    const timer = new Timer();
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

    // 2. Select project role
    let role: ProjectRole = "consumer";
    if (args.role === "consumer" || args.role === "library") {
      role = args.role;
    } else if (!skipPrompts) {
      const selected = await consola.prompt(
        "How will you use plunk in this project?",
        {
          type: "select",
          options: [
            {
              label: "Consumer (app) — I want to link packages INTO this project",
              value: "consumer",
            },
            {
              label: "Library (package) — I want to publish this package FOR other projects",
              value: "library",
            },
          ],
        }
      );
      if (selected === "library") {
        role = "library";
      }
    }

    consola.success(`Project role: ${pc.cyan(role)}`);

    // 3. Add .plunk/ to .gitignore
    const gitignorePath = join(projectDir, ".gitignore");
    const gitignoreUpdated = await ensureGitignore(gitignorePath);
    if (gitignoreUpdated) {
      consola.success("Added .plunk/ to .gitignore");
    }

    // 4. Add scripts based on role
    const pkgPath = join(projectDir, "package.json");
    let libraryBuildCmd: string | undefined;
    if (await exists(pkgPath)) {
      if (role === "consumer") {
        const postinstallAdded = await addPostinstall(pkgPath);
        if (postinstallAdded) {
          consola.success(
            'Added "postinstall": "plunk restore" to package.json scripts'
          );
        }

        // Prompt for package name to link
        let packageName = "{package-name}";
        if (!skipPrompts) {
          const input = await consola.prompt(
            "Package name to link (leave blank to skip):",
            { type: "text", default: "" }
          );
          if (typeof input === "string" && input.trim()) {
            packageName = input.trim();
          }
        }

        const addScriptAdded = await addScript(
          pkgPath,
          "plunk:add",
          `plunk add ${packageName}`
        );
        if (addScriptAdded) {
          consola.success(
            `Added "plunk:add": "plunk add ${packageName}" to package.json scripts`
          );
        }
      } else {
        // Detect or prompt for build command
        libraryBuildCmd = await detectBuildCommand(pkgPath, pm, skipPrompts);
        const added = await addLibraryScripts(pkgPath);
        for (const name of added) {
          consola.success(`Added "${name}" script to package.json`);
        }
      }
    }

    // 5. Create .plunk/ directory and state
    const plunkDir = join(projectDir, ".plunk");
    if (!(await exists(plunkDir))) {
      await ensureDir(plunkDir);
      await writeFile(
        join(plunkDir, "state.json"),
        JSON.stringify(
          { version: "1", packageManager: pm, role, links: {} },
          null,
          2
        )
      );
      consola.success("Created .plunk/ state directory");
    } else {
      // Update existing state with package manager and role
      const state = await readConsumerState(projectDir);
      state.packageManager = pm;
      state.role = role;
      await writeConsumerState(projectDir, state);
    }

    // 6. Detect bundler and auto-configure (consumers only)
    if (role === "consumer") {
      const bundler = await detectBundler(projectDir);
      if (bundler.type === "vite" && bundler.configFile) {
        consola.success(
          `Detected bundler: ${pc.cyan("Vite")} (${basename(bundler.configFile)})`
        );
        const { addPlunkVitePlugin } = await import("../utils/vite-config.js");
        const viteResult = await addPlunkVitePlugin(bundler.configFile);
        if (viteResult.modified) {
          consola.success(`Added plunk plugin to ${basename(bundler.configFile)}`);
        } else if (viteResult.error) {
          consola.info(
            `Add the Vite plugin for automatic dev server restarts:\n` +
              `  ${pc.cyan('import plunk from "@papoy/plunk/vite"')}\n` +
              `  ${pc.cyan("plugins: [plunk()]")}`
          );
        }
      } else if (bundler.type === "next" && bundler.configFile) {
        consola.success(
          `Detected bundler: ${pc.cyan("Next.js")} (${basename(bundler.configFile)})`
        );
        consola.info(
          `Next.js transpilePackages will be auto-configured when you run ${pc.cyan("plunk add")}`
        );
      } else if (bundler.type) {
        const names: Record<string, string> = {
          webpack: "Webpack",
          turbo: "Turbopack",
          rollup: "Rollup",
        };
        consola.success(
          `Detected bundler: ${pc.cyan(names[bundler.type] || bundler.type)} — no config needed, works out of the box`
        );
      }

      // Consumer next steps
      console.log("");
      consola.info(`${pc.bold("Next steps:")}`);
      console.log(
        `  1. ${pc.cyan("cd ../my-lib && plunk publish")}`
      );
      console.log(
        `  2. ${pc.cyan("plunk add my-lib")}${bundler.type === "vite" ? "                     ← auto-updates vite config" : bundler.type === "next" ? "                     ← auto-updates next config" : ""}`
      );
      console.log(
        `  3. ${pc.cyan("cd ../my-lib && plunk dev")}                  ← watch + rebuild + auto-push`
      );
    } else {
      // Library next steps
      console.log("");
      consola.info(`${pc.bold("Next steps:")}`);
      console.log(
        `  1. ${pc.cyan("plunk publish")}                    ← copy built files to plunk store`
      );
      console.log(
        `  2. ${pc.cyan(`${pm} run plunk:dev`)}               ← watch + rebuild + auto-push to consumers`
      );
      console.log(
        `  3. In consumer project: ${pc.cyan("plunk add " + (await readPkgName(pkgPath)))}`
      );
    }

    consola.info(`Done in ${timer.elapsed()}`);
    output({
      packageManager: pm,
      role,
      elapsed: timer.elapsedMs(),
    });
  },
});

/**
 * Add a single named script to package.json if it doesn't already exist.
 * Returns true if it was added.
 */
async function addScript(
  pkgPath: string,
  name: string,
  command: string
): Promise<boolean> {
  const content = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(content);

  if (pkg.scripts?.[name]) return false;

  if (!pkg.scripts) pkg.scripts = {};
  pkg.scripts[name] = command;

  const indent = content.match(/^(\s+)"/m)?.[1] || "  ";
  await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
  return true;
}

/**
 * Detect the build command from package.json scripts, or prompt the user.
 * Delegates detection to the shared utility, wraps with interactive prompts.
 */
async function detectBuildCommand(
  pkgPath: string,
  pm: PackageManager,
  skipPrompts: boolean
): Promise<string> {
  const packageDir = join(pkgPath, "..");
  const detected = await detectBuildCmd(packageDir, pm);

  if (detected) {
    consola.success(`Detected build script: ${pc.cyan(detected)}`);
    return detected;
  }

  // No build script found — ask the user
  const runPrefix = pm === "npm" ? "npm run " : `${pm} `;
  if (!skipPrompts) {
    consola.warn("No build script found in package.json");
    const input = await consola.prompt(
      "Build command (e.g. tsc, tsup, rollup -c):",
      { type: "text", default: "" }
    );
    if (typeof input === "string" && input.trim()) {
      return input.trim();
    }
  }

  // Fallback placeholder
  const fallback = `${runPrefix}build`;
  consola.warn(
    `Using ${pc.cyan(fallback)} as placeholder — add a "build" script to package.json`
  );
  return fallback;
}

/**
 * Add library-mode scripts (plunk:publish, plunk:dev) to package.json.
 * Returns array of script names that were added.
 */
async function addLibraryScripts(
  pkgPath: string,
): Promise<string[]> {
  const added: string[] = [];

  if (await addScript(pkgPath, "plunk:publish", "plunk publish")) {
    added.push("plunk:publish");
  }

  if (
    await addScript(
      pkgPath,
      "plunk:dev",
      "plunk dev"
    )
  ) {
    added.push("plunk:dev");
  }

  return added;
}

/**
 * Read the package name from package.json, falling back to basename.
 */
async function readPkgName(pkgPath: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    return pkg.name || "my-package";
  } catch {
    return "my-package";
  }
}
