import { defineCommand } from "citty";
import { resolve, join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { consola } from "consola";
import pc from "picocolors";
import { exists, ensureDir } from "../utils/fs.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import { detectBundler } from "../utils/bundler-detect.js";
import { ensureOptimizeDepsSection } from "../utils/vite-config.js";
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
        const added = await addLibraryScripts(pkgPath, pm, libraryBuildCmd);
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
        `  3. ${pc.cyan(`cd ../my-lib && plunk push --watch --build "${pm === "npm" ? "npm run build" : `${pm} build`}"`)}`
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
 * Add "postinstall": "plunk restore || true" to package.json scripts.
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
 */
async function detectBuildCommand(
  pkgPath: string,
  pm: PackageManager,
  skipPrompts: boolean
): Promise<string> {
  const runPrefix = pm === "npm" ? "npm run " : `${pm} `;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const scripts = pkg.scripts || {};

    // Check common build script names in priority order
    for (const name of ["build", "compile", "bundle", "tsc"]) {
      if (scripts[name]) {
        const cmd = `${runPrefix}${name}`;
        consola.success(`Detected build script: ${pc.cyan(cmd)}`);
        return cmd;
      }
    }
  } catch {
    // ignore parse errors
  }

  // No build script found — ask the user
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
  _pm: PackageManager,
  buildCmd: string
): Promise<string[]> {
  const added: string[] = [];

  if (await addScript(pkgPath, "plunk:publish", "plunk publish")) {
    added.push("plunk:publish");
  }

  if (
    await addScript(
      pkgPath,
      "plunk:dev",
      `plunk push --watch --build "${buildCmd}"`
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
