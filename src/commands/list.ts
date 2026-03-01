import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "../utils/console.js";
import pc from "picocolors";
import { readConsumerState, readConsumersRegistry } from "../core/tracker.js";
import { listStoreEntries, getStoreEntry } from "../core/store.js";
import pLimit from "../utils/concurrency.js";
import { suppressHumanOutput, output } from "../utils/output.js";

export default defineCommand({
  meta: {
    name: "list",
    description: "List linked packages in current project or in the store",
  },
  args: {
    store: {
      type: "boolean",
      description: "List all packages in the global plunk store",
      default: false,
    },
  },
  async run({ args }) {
    suppressHumanOutput();
    if (args.store) {
      await listStore();
    } else {
      await listProject();
    }
  },
});

async function listProject() {
  const state = await readConsumerState(resolve("."));
  const links = Object.entries(state.links);

  if (links.length === 0) {
    consola.info("No linked packages in this project");
    output({ packages: [] });
    return;
  }

  consola.info(`Linked packages (${links.length}):\n`);

  // Check staleness in parallel
  const limit = pLimit(8);
  const packages = await Promise.all(
    links.map(([name, link]) =>
      limit(async () => {
        const storeEntry = await getStoreEntry(name, link.version);
        const stale = !!(storeEntry && storeEntry.meta.contentHash !== link.contentHash);
        return { name, version: link.version, buildId: link.buildId ?? null, stale, sourcePath: link.sourcePath };
      })
    )
  );

  for (const pkg of packages) {
    const buildTag = pkg.buildId ? `[${pkg.buildId}]` : "[--------]";
    const staleTag = pkg.stale ? pc.yellow(" (stale)") : "";
    consola.log(
      `  ${pc.cyan(pkg.name)} ${pc.dim("@" + pkg.version)} ${pc.dim(buildTag)}${staleTag}  ← ${pc.dim(pkg.sourcePath)}`
    );
  }
  output({ packages });
}

async function listStore() {
  const [entries, registry] = await Promise.all([
    listStoreEntries(),
    readConsumersRegistry(),
  ]);

  if (entries.length === 0) {
    consola.info("Plunk store is empty");
    output({ entries: [] });
    return;
  }

  consola.info(`Store entries (${entries.length}):\n`);
  const storeEntries = [];
  for (const entry of entries) {
    const age = getRelativeTime(new Date(entry.meta.publishedAt));
    const buildTag = entry.meta.buildId ? `[${entry.meta.buildId}]` : "[--------]";
    const consumers = registry[entry.name]?.length ?? 0;
    const consumersTag = consumers > 0
      ? pc.green(`${consumers} consumer${consumers > 1 ? "s" : ""}`)
      : pc.dim("no consumers");
    consola.log(
      `  ${pc.cyan(entry.name)} ${pc.dim("@" + entry.version)} ${pc.dim(buildTag)}  ${pc.dim(`published ${age}`)}  ${consumersTag}`
    );
    consola.log(`    ${pc.dim(`from: ${entry.meta.sourcePath}`)}`);
    storeEntries.push({
      name: entry.name,
      version: entry.version,
      buildId: entry.meta.buildId ?? null,
      publishedAt: entry.meta.publishedAt,
      sourcePath: entry.meta.sourcePath,
      consumers,
    });
  }
  output({ entries: storeEntries });
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
