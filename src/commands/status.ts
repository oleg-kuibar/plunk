import { defineCommand } from "citty";
import { resolve, join } from "node:path";
import { consola } from "../utils/console.js";
import pc from "picocolors";
import pLimit from "../utils/concurrency.js";
import { readConsumerState } from "../core/tracker.js";
import { getStoreEntry } from "../core/store.js";
import { exists } from "../utils/fs.js";
import { suppressHumanOutput, output } from "../utils/output.js";

const checkLimit = pLimit(4);

interface PackageStatus {
  name: string;
  version: string;
  buildId: string;
  issues: string[];
  linkedAt: string;
  sourcePath: string;
}

export default defineCommand({
  meta: {
    name: "status",
    description: "Show status of linked packages with health checks",
  },
  async run() {
    suppressHumanOutput();
    const consumerPath = resolve(".");
    const state = await readConsumerState(consumerPath);
    const links = Object.entries(state.links);

    if (links.length === 0) {
      consola.info("No linked packages in this project");
      output({ packages: [] });
      return;
    }

    consola.info(`Package status (${links.length} linked):\n`);

    // Gather data in parallel
    const statuses = await Promise.all(
      links.map(([name, link]) =>
        checkLimit(async (): Promise<PackageStatus> => {
          const issues: string[] = [];

          // Check if store entry still exists
          const entry = await getStoreEntry(name, link.version);
          if (!entry) {
            issues.push("store entry missing");
          } else if (entry.meta.contentHash !== link.contentHash) {
            issues.push("unpublished changes in store");
          }

          // Check if node_modules version exists
          const nmPath = join(consumerPath, "node_modules", name);
          if (!(await exists(nmPath))) {
            issues.push("missing from node_modules (run plunk restore)");
          }

          return {
            name,
            version: link.version,
            buildId: link.buildId ?? "",
            issues,
            linkedAt: link.linkedAt,
            sourcePath: link.sourcePath,
          };
        })
      )
    );

    // Render sequentially for deterministic output
    for (const s of statuses) {
      const statusIcon = s.issues.length === 0 ? pc.green("✓") : pc.yellow("!");
      const buildTag = s.buildId ? `[${s.buildId}]` : "[--------]";
      console.log(
        `  ${statusIcon} ${pc.cyan(s.name)} ${pc.dim("@" + s.version)} ${pc.dim(buildTag)}`
      );
      console.log(
        `    ${pc.dim(`linked ${new Date(s.linkedAt).toLocaleString()} from ${s.sourcePath}`)}`
      );

      for (const issue of s.issues) {
        console.log(`    ${pc.yellow("⚠")} ${issue}`);
      }
    }

    output({
      packages: statuses.map(({ name, version, buildId, issues }) => ({
        name,
        version,
        buildId: buildId || null,
        healthy: issues.length === 0,
        issues,
      })),
    });
  },
});
