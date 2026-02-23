import { defineCommand } from "citty";
import { consola } from "../utils/console.js";
import {
  readConsumersRegistry,
  readConsumerState,
  cleanStaleConsumers,
} from "../core/tracker.js";
import { listStoreEntries, removeStoreEntry } from "../core/store.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { verbose } from "../utils/logger.js";

export default defineCommand({
  meta: {
    name: "clean",
    description:
      "Remove unreferenced store entries and stale consumer registrations",
  },
  async run() {
    suppressHumanOutput();
    const timer = new Timer();

    // 1. Clean stale consumers (directories that no longer exist)
    consola.start("Checking consumer registrations...");
    const { removedConsumers, removedPackages } = await cleanStaleConsumers();
    if (removedConsumers > 0) {
      consola.success(
        `Removed ${removedConsumers} stale consumer registration(s) across ${removedPackages} package(s)`
      );
    }

    // 2. Collect all referenced name@version pairs from live consumers
    const registry = await readConsumersRegistry();
    const referenced = new Set<string>();

    for (const [, consumers] of Object.entries(registry)) {
      for (const consumerPath of consumers) {
        const state = await readConsumerState(consumerPath);
        for (const [pkgName, link] of Object.entries(state.links)) {
          referenced.add(`${pkgName}@${link.version}`);
        }
      }
    }
    verbose(`[clean] Referenced entries: ${[...referenced].join(", ") || "(none)"}`);

    // 3. Find and remove unreferenced store entries
    const storeEntries = await listStoreEntries();
    let removedEntries = 0;

    for (const entry of storeEntries) {
      const key = `${entry.name}@${entry.version}`;
      if (!referenced.has(key)) {
        verbose(`[clean] Removing unreferenced store entry: ${key}`);
        await removeStoreEntry(entry.name, entry.version);
        removedEntries++;
      }
    }

    if (removedEntries > 0) {
      consola.success(`Removed ${removedEntries} unreferenced store entry(ies)`);
    }

    if (removedConsumers === 0 && removedEntries === 0) {
      consola.info("Store is clean — no stale entries or registrations found");
    }

    consola.info(`Clean complete in ${timer.elapsed()}`);
    output({
      removedConsumers,
      removedPackages,
      removedEntries,
      elapsed: timer.elapsedMs(),
    });
  },
});
