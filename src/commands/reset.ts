import { defineCommand } from "citty";
import { resolve, join } from "node:path";
import { consola } from "../utils/console.js";
import { readConsumerState } from "../core/tracker.js";
import { removeSinglePackage } from "./remove.js";
import { removeDir, exists } from "../utils/fs.js";
import { removePostinstall } from "../utils/init-helpers.js";
import { getConsumerPlunkDir } from "../utils/paths.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { isDryRun, verbose } from "../utils/logger.js";
import { printDryRunReport } from "../utils/dry-run.js";

export default defineCommand({
  meta: {
    name: "reset",
    description:
      "Remove all plunk links and teardown plunk from this project",
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
    suppressHumanOutput();
    const timer = new Timer();
    const consumerPath = resolve(".");
    const plunkDir = getConsumerPlunkDir(consumerPath);

    if (!(await exists(plunkDir))) {
      consola.info("No plunk setup found in this project");
      output({ reset: false });
      return;
    }

    const state = await readConsumerState(consumerPath);
    const links = Object.entries(state.links);

    if (!args.yes) {
      const parts = [];
      if (links.length > 0) {
        parts.push(`remove ${links.length} linked package(s)`);
      }
      parts.push("delete .plunk/ directory", "remove postinstall hook");

      const confirmed = await consola.prompt(
        `Reset plunk? This will ${parts.join(", ")}.`,
        { type: "confirm" }
      );
      if (!confirmed || typeof confirmed === "symbol") {
        consola.info("Cancelled");
        return;
      }
    }

    // Remove all linked packages (restores backups)
    verbose(`[reset] Removing ${links.length} linked package(s) from ${consumerPath}`);
    let removed = 0;
    for (const [packageName, link] of links) {
      try {
        await removeSinglePackage(consumerPath, packageName, link);
        removed++;
      } catch (err) {
        consola.warn(
          `Failed to remove ${packageName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Delete .plunk/ directory
    await removeDir(plunkDir);
    consola.success("Removed .plunk/ directory");

    // Remove postinstall hook
    const pkgPath = join(consumerPath, "package.json");
    if (await exists(pkgPath)) {
      const removedHook = await removePostinstall(pkgPath);
      if (removedHook) {
        consola.success("Removed postinstall hook from package.json");
      }
    }

    consola.success(
      `Reset complete: ${removed} package(s) restored in ${timer.elapsed()}`
    );
    output({ reset: true, removed, elapsed: timer.elapsedMs() });

    if (isDryRun()) printDryRunReport();
  },
});
