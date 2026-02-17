import { defineCommand } from "citty";
import { resolve, join } from "node:path";
import { consola } from "consola";
import pc from "picocolors";
import { readConsumerState } from "../core/tracker.js";
import { getStoreEntry } from "../core/store.js";
import { exists } from "../utils/fs.js";

export default defineCommand({
  meta: {
    name: "status",
    description: "Show status of linked packages with health checks",
  },
  async run() {
    const consumerPath = resolve(".");
    const state = await readConsumerState(consumerPath);
    const links = Object.entries(state.links);

    if (links.length === 0) {
      consola.info("No linked packages in this project");
      return;
    }

    consola.info(`Package status (${links.length} linked):\n`);

    for (const [name, link] of links) {
      const issues: string[] = [];

      // Check if store entry still exists
      const entry = await getStoreEntry(name, link.version);
      if (!entry) {
        issues.push(pc.red("store entry missing"));
      } else if (entry.meta.contentHash !== link.contentHash) {
        issues.push(pc.yellow("unpublished changes in store"));
      }

      // Check if node_modules version exists
      const nmPath = join(consumerPath, "node_modules", name);
      if (!(await exists(nmPath))) {
        issues.push(pc.red("missing from node_modules (run plunk restore)"));
      }

      const statusIcon = issues.length === 0 ? pc.green("✓") : pc.yellow("!");
      console.log(
        `  ${statusIcon} ${pc.cyan(name)} ${pc.dim("@" + link.version)}`
      );
      console.log(
        `    ${pc.dim(`linked ${new Date(link.linkedAt).toLocaleString()} from ${link.sourcePath}`)}`
      );

      for (const issue of issues) {
        console.log(`    ${pc.yellow("⚠")} ${issue}`);
      }
    }
  },
});
