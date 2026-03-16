/** Consumer project state file (.plunk/state.json) */
export interface ConsumerState {
  version: "1";
  packageManager?: PackageManager;
  role?: "consumer" | "library";
  links: Record<string, LinkEntry>;
}

/** Tracks a single linked package in a consumer project */
export interface LinkEntry {
  version: string;
  contentHash: string;
  linkedAt: string;
  sourcePath: string;
  backupExists: boolean;
  packageManager: PackageManager;
  buildId?: string;
}

/** Global consumers registry (~/.plunk/consumers.json) */
export interface ConsumersRegistry {
  [packageName: string]: string[];
}

/** Store metadata (.plunk-meta.json) */
export interface PlunkMeta {
  schemaVersion?: number;
  contentHash: string;
  publishedAt: string;
  sourcePath: string;
  buildId?: string;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
