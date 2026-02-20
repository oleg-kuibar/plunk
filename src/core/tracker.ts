import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { consola } from "consola";
import type {
  ConsumerState,
  ConsumersRegistry,
  LinkEntry,
  PackageManager,
} from "../types.js";
import {
  getConsumersPath,
  getConsumerStatePath,
  getConsumerPlunkDir,
} from "../utils/paths.js";
import { ensureDir, ensurePrivateDir, exists, atomicWriteFile, isNodeError } from "../utils/fs.js";
import { withFileLock } from "../utils/lockfile.js";
import { isConsumerState, isConsumersRegistry } from "../utils/validators.js";

// ── Consumer State (.plunk/state.json in each consumer project) ──

/** Read the consumer state file, or return an empty state if not found */
export async function readConsumerState(
  consumerPath: string
): Promise<ConsumerState> {
  const statePath = getConsumerStatePath(consumerPath);
  try {
    const content = await readFile(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (!isConsumerState(parsed)) {
      consola.warn(`Invalid consumer state in ${statePath}, using defaults`);
      return { version: "1", links: {} };
    }
    return parsed;
  } catch (err) {
    if (isNodeError(err) && err.code !== "ENOENT") {
      consola.warn(`Failed to read consumer state: ${err}`);
    }
    return { version: "1", links: {} };
  }
}

/** Write the consumer state file */
export async function writeConsumerState(
  consumerPath: string,
  state: ConsumerState
): Promise<void> {
  await ensureDir(getConsumerPlunkDir(consumerPath));
  const statePath = getConsumerStatePath(consumerPath);
  await atomicWriteFile(statePath, JSON.stringify(state, null, 2));
}

/** Add or update a link entry in the consumer state */
export async function addLink(
  consumerPath: string,
  packageName: string,
  entry: LinkEntry
): Promise<void> {
  const statePath = getConsumerStatePath(consumerPath);
  await withFileLock(statePath, async () => {
    const state = await readConsumerState(consumerPath);
    state.links[packageName] = entry;
    await writeConsumerState(consumerPath, state);
  });
}

/** Remove a link entry from the consumer state */
export async function removeLink(
  consumerPath: string,
  packageName: string
): Promise<void> {
  const statePath = getConsumerStatePath(consumerPath);
  await withFileLock(statePath, async () => {
    const state = await readConsumerState(consumerPath);
    delete state.links[packageName];
    await writeConsumerState(consumerPath, state);
  });
}

/** Get a specific link entry */
export async function getLink(
  consumerPath: string,
  packageName: string
): Promise<LinkEntry | null> {
  const state = await readConsumerState(consumerPath);
  return state.links[packageName] ?? null;
}

// ── Global Consumers Registry (~/.plunk/consumers.json) ──

/** Read the global consumers registry */
export async function readConsumersRegistry(): Promise<ConsumersRegistry> {
  const regPath = getConsumersPath();
  try {
    const content = await readFile(regPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!isConsumersRegistry(parsed)) {
      consola.warn(`Invalid consumers registry, using empty registry`);
      return {};
    }
    return parsed;
  } catch (err) {
    if (isNodeError(err) && err.code !== "ENOENT") {
      consola.warn(`Failed to read consumers registry: ${err}`);
    }
    return {};
  }
}

/** Write the global consumers registry */
async function writeConsumersRegistry(
  registry: ConsumersRegistry
): Promise<void> {
  const regPath = getConsumersPath();
  await ensurePrivateDir(dirname(getConsumersPath()));
  await atomicWriteFile(regPath, JSON.stringify(registry, null, 2));
}

/** Register a consumer for a package */
export async function registerConsumer(
  packageName: string,
  consumerPath: string
): Promise<void> {
  const regPath = getConsumersPath();
  await withFileLock(regPath, async () => {
    const registry = await readConsumersRegistry();
    if (!registry[packageName]) {
      registry[packageName] = [];
    }
    const normalized = consumerPath.replace(/\\/g, "/");
    if (!registry[packageName].includes(normalized)) {
      registry[packageName].push(normalized);
    }
    await writeConsumersRegistry(registry);
  });
}

/** Unregister a consumer for a package */
export async function unregisterConsumer(
  packageName: string,
  consumerPath: string
): Promise<void> {
  const regPath = getConsumersPath();
  await withFileLock(regPath, async () => {
    const registry = await readConsumersRegistry();
    if (!registry[packageName]) return;
    const normalized = consumerPath.replace(/\\/g, "/");
    registry[packageName] = registry[packageName].filter(
      (p) => p !== normalized
    );
    if (registry[packageName].length === 0) {
      delete registry[packageName];
    }
    await writeConsumersRegistry(registry);
  });
}

/** Get all consumers for a package */
export async function getConsumers(packageName: string): Promise<string[]> {
  const registry = await readConsumersRegistry();
  return registry[packageName] ?? [];
}

/**
 * Clean stale consumers — remove registrations for directories that no longer exist.
 * Returns the number of stale entries removed.
 */
export async function cleanStaleConsumers(): Promise<{
  removedConsumers: number;
  removedPackages: number;
}> {
  const regPath = getConsumersPath();
  let removedConsumers = 0;
  let removedPackages = 0;

  await withFileLock(regPath, async () => {
    const registry = await readConsumersRegistry();
    const updated: ConsumersRegistry = {};

    for (const [pkgName, consumers] of Object.entries(registry)) {
      const validConsumers: string[] = [];
      for (const consumerPath of consumers) {
        if (await exists(consumerPath)) {
          validConsumers.push(consumerPath);
        } else {
          removedConsumers++;
        }
      }
      if (validConsumers.length > 0) {
        updated[pkgName] = validConsumers;
      } else {
        removedPackages++;
      }
    }

    await writeConsumersRegistry(updated);
  });

  return { removedConsumers, removedPackages };
}
