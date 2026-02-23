import { defineCommand } from "citty";
import { resolve } from "node:path";
import { consola } from "../utils/console.js";
import pc from "picocolors";
import { readConsumerState } from "../core/tracker.js";
import { listStoreEntries, getStoreEntry } from "../core/store.js";
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
  const packages = [];
  for (const [name, link] of links) {
    const buildTag = link.buildId ? `[${link.buildId}]` : "[--------]";

    // Check staleness against store
    let stale = false;
    const storeEntry = await getStoreEntry(name, link.version);
    if (storeEntry && storeEntry.meta.buildId && link.buildId && storeEntry.meta.buildId !== link.buildId) {
      stale = true;
    }

    const staleTag = stale ? pc.yellow(" (stale)") : "";
    console.log(
      `  ${pc.cyan(name)} ${pc.dim("@" + link.version)} ${pc.dim(buildTag)}${staleTag}  ← ${pc.dim(link.sourcePath)}`
    );
    packages.push({ name, version: link.version, buildId: link.buildId ?? null, stale, sourcePath: link.sourcePath });
  }
  output({ packages });
}

async function listStore() {
  const entries = await listStoreEntries();

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
    console.log(
      `  ${pc.cyan(entry.name)} ${pc.dim("@" + entry.version)} ${pc.dim(buildTag)}  ${pc.dim(`published ${age}`)}`
    );
    console.log(`    ${pc.dim(`from: ${entry.meta.sourcePath}`)}`);
    storeEntries.push({
      name: entry.name,
      version: entry.version,
      buildId: entry.meta.buildId ?? null,
      publishedAt: entry.meta.publishedAt,
      sourcePath: entry.meta.sourcePath,
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
