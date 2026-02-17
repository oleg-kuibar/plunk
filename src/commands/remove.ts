import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "consola";
import { removeInjected, restoreBackup } from "../core/injector.js";
import { getLink, removeLink, readConsumerState } from "../core/tracker.js";
import { unregisterConsumer } from "../core/tracker.js";

export default defineCommand({
  meta: {
    name: "remove",
    description: "Remove a plunk-linked package and restore the original",
  },
  args: {
    package: {
      type: "positional",
      description: "Package name to remove",
      required: true,
    },
  },
  async run({ args }) {
    const consumerPath = resolve(".");
    const packageName = args.package;

    const link = await getLink(consumerPath, packageName);
    if (!link) {
      consola.error(`Package "${packageName}" is not linked in this project`);
      process.exit(1);
    }

    // Remove from node_modules
    await removeInjected(consumerPath, packageName, link.packageManager);

    // Restore backup if it exists
    if (link.backupExists) {
      const restored = await restoreBackup(
        consumerPath,
        packageName,
        link.packageManager
      );
      if (restored) {
        consola.success(`Restored original ${packageName} from backup`);
      }
    }

    // Update state
    await removeLink(consumerPath, packageName);
    await unregisterConsumer(packageName, consumerPath);

    consola.success(`Removed plunk link for ${packageName}`);
  },
});
