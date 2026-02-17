import { homedir } from "node:os";
import { join } from "node:path";

/** Root plunk directory: ~/.plunk/ (override with PLUNK_HOME env var) */
export function getPlunkHome(): string {
  return process.env.PLUNK_HOME || join(homedir(), ".plunk");
}

/** Store root: ~/.plunk/store/ */
export function getStorePath(): string {
  return join(getPlunkHome(), "store");
}

/** Consumers registry: ~/.plunk/consumers.json */
export function getConsumersPath(): string {
  return join(getPlunkHome(), "consumers.json");
}

/** Global config: ~/.plunk/config.json */
export function getConfigPath(): string {
  return join(getPlunkHome(), "config.json");
}

/**
 * Encode a package name for use as a directory name.
 * Scoped packages: `@scope/name` → `@scope+name`
 */
export function encodePackageName(name: string): string {
  return name.replace(/\//g, "+");
}

/**
 * Decode a directory name back to a package name.
 * `@scope+name` → `@scope/name`
 */
export function decodePackageName(encoded: string): string {
  // Only decode the + after a scope prefix
  if (encoded.startsWith("@")) {
    const plusIdx = encoded.indexOf("+");
    if (plusIdx !== -1) {
      return encoded.slice(0, plusIdx) + "/" + encoded.slice(plusIdx + 1);
    }
  }
  return encoded;
}

/** Get the store directory for a specific package@version */
export function getStoreEntryPath(name: string, version: string): string {
  return join(getStorePath(), `${encodePackageName(name)}@${version}`);
}

/** Get the package directory within a store entry */
export function getStorePackagePath(name: string, version: string): string {
  return join(getStoreEntryPath(name, version), "package");
}

/** Get the .plunk-meta.json path for a store entry */
export function getStoreMetaPath(name: string, version: string): string {
  return join(getStoreEntryPath(name, version), ".plunk-meta.json");
}

/** Get the .plunk/ directory in a consumer project */
export function getConsumerPlunkDir(consumerPath: string): string {
  return join(consumerPath, ".plunk");
}

/** Get the state file in a consumer project */
export function getConsumerStatePath(consumerPath: string): string {
  return join(consumerPath, ".plunk", "state.json");
}

/** Get the backups directory in a consumer project */
export function getConsumerBackupPath(
  consumerPath: string,
  packageName: string
): string {
  return join(consumerPath, ".plunk", "backups", encodePackageName(packageName));
}

/** Get node_modules/<pkg> path for a package in a consumer */
export function getNodeModulesPackagePath(
  consumerPath: string,
  packageName: string
): string {
  // Scoped packages: node_modules/@scope/name (use original name with /)
  return join(consumerPath, "node_modules", packageName);
}
