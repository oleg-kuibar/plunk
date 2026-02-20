import type {
  ConsumerState,
  PlunkMeta,
  ConsumersRegistry,
  LinkEntry,
} from "../types.js";

/** Check if a value is a valid PlunkMeta */
export function isPlunkMeta(value: unknown): value is PlunkMeta {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.contentHash === "string" &&
    typeof v.publishedAt === "string" &&
    typeof v.sourcePath === "string" &&
    (v.buildId === undefined || typeof v.buildId === "string")
  );
}

/** Check if a value is a valid LinkEntry */
export function isLinkEntry(value: unknown): value is LinkEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "string" &&
    typeof v.contentHash === "string" &&
    typeof v.linkedAt === "string" &&
    typeof v.sourcePath === "string" &&
    typeof v.backupExists === "boolean" &&
    typeof v.packageManager === "string" &&
    ["npm", "pnpm", "yarn", "bun"].includes(v.packageManager as string) &&
    (v.buildId === undefined || typeof v.buildId === "string")
  );
}

/** Check if a value is a valid ConsumerState */
export function isConsumerState(value: unknown): value is ConsumerState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== "1") return false;
  if (typeof v.links !== "object" || v.links === null) return false;
  const links = v.links as Record<string, unknown>;
  for (const entry of Object.values(links)) {
    if (!isLinkEntry(entry)) return false;
  }
  return true;
}

/** Check if a value is a valid ConsumersRegistry */
export function isConsumersRegistry(
  value: unknown
): value is ConsumersRegistry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  for (const val of Object.values(v)) {
    if (!Array.isArray(val)) return false;
    for (const item of val) {
      if (typeof item !== "string") return false;
    }
  }
  return true;
}
