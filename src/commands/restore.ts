import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "consola";
import { readConsumerState } from "../core/tracker.js";
import { getStoreEntry } from "../core/store.js";
import { inject } from "../core/injector.js";

export default defineCommand({
  meta: {
    name: "restore",
    description:
      "Re-inject all linked packages (use after npm install wipes overrides)",
  },
  args: {
    silent: {
      type: "boolean",
      description: "Suppress output when no packages are linked (for postinstall scripts)",
      default: false,
    },
  },
  async run({ args }) {
    const consumerPath = resolve(".");
    const state = await readConsumerState(consumerPath);

    const links = Object.entries(state.links);
    if (links.length === 0) {
      if (!args.silent) {
        consola.info("No linked packages in this project");
      }
      return;
    }

    let restored = 0;
    let failed = 0;

    for (const [packageName, link] of links) {
      const entry = await getStoreEntry(packageName, link.version);
      if (!entry) {
        consola.warn(
          `Store entry missing for ${packageName}@${link.version}. Re-publish it.`
        );
        failed++;
        continue;
      }

      try {
        const result = await inject(entry, consumerPath, link.packageManager);
        consola.success(
          `Restored ${packageName}@${link.version} (${result.copied} files)`
        );
        restored++;
      } catch (err) {
        consola.error(`Failed to restore ${packageName}: ${err}`);
        failed++;
      }
    }

    consola.info(
      `Restore complete: ${restored} restored, ${failed} failed`
    );
  },
});
