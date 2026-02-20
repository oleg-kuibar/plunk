/** Metadata stored alongside each package in the plunk store */
export interface PlunkMeta {
  contentHash: string;
  publishedAt: string;
  sourcePath: string;
}

/** A store entry representing a published package */
export interface StoreEntry {
  name: string;
  version: string;
  packageDir: string; // path to package/ dir in store
  meta: PlunkMeta;
}

/** Tracks a single linked package in a consumer project */
export interface LinkEntry {
  version: string;
  contentHash: string;
  linkedAt: string;
  sourcePath: string;
  backupExists: boolean;
  packageManager: PackageManager;
}

/** Consumer project state file (.plunk/state.json) */
export interface ConsumerState {
  version: "1";
  packageManager?: PackageManager;
  role?: "consumer" | "library";
  links: Record<string, LinkEntry>;
}

/** Global consumers registry (~/.plunk/consumers.json) */
export interface ConsumersRegistry {
  /** Maps package name → array of consumer project paths */
  [packageName: string]: string[];
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** Options for the watch mode */
export interface WatchOptions {
  /** Glob patterns to watch (default: src, lib, dist) */
  patterns?: string[];
  /** Build command to run before publishing */
  buildCmd?: string;
  /** Debounce delay in ms (default: 300) */
  debounce?: number;
  /** Enable awaitWriteFinish for large/slow writes (auto-enabled when no buildCmd) */
  awaitWriteFinish?:
    | boolean
    | { stabilityThreshold: number; pollInterval: number };
}

/** Package.json fields we care about */
export interface PackageJson {
  name: string;
  version: string;
  files?: string[];
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  main?: string;
  module?: string;
  exports?: unknown;
  type?: string;
  private?: boolean;
  scripts?: Record<string, string>;
}
