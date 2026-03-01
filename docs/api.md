# API Reference

Everything exported from `@olegkuibar/plunk` (the `src/index.ts` entry point). Install as a dependency to use programmatically:

```bash
pnpm add @olegkuibar/plunk
```

```typescript
import { publish, inject, getStoreEntry } from "@olegkuibar/plunk";
```

## Publishing

### `publish(packageDir, options?)`

Publish a package to the plunk store.

```typescript
async function publish(
  packageDir: string,
  options?: PublishOptions
): Promise<PublishResult>
```

Reads `package.json`, resolves publishable files, computes a content hash, and copies to the store. Skips if the hash matches the existing store entry (unless `force` is set).

```typescript
const result = await publish("/path/to/my-lib");
if (!result.skipped) {
  console.log(`Published ${result.name}@${result.version} [${result.buildId}]`);
}
```

### `PublishOptions`

```typescript
interface PublishOptions {
  allowPrivate?: boolean;   // allow packages with "private": true
  runScripts?: boolean;     // run prepack/postpack hooks (default: true)
  force?: boolean;          // bypass hash comparison
}
```

### `PublishResult`

```typescript
interface PublishResult {
  name: string;
  version: string;
  fileCount: number;
  skipped: boolean;         // true if content was unchanged
  contentHash: string;      // "sha256v2:..." aggregate hash
  buildId: string;          // 8-char hex identifier
}
```

## Injection

### `inject(storeEntry, consumerPath, pm, options?)`

Copy a package from the store into a consumer's `node_modules/`.

```typescript
async function inject(
  storeEntry: StoreEntry,
  consumerPath: string,
  pm: PackageManager,
  options?: { force?: boolean }
): Promise<{ filesCopied: number; filesRemoved: number; skipped: boolean }>
```

Handles pnpm's `.pnpm/` virtual store by following symlinks. Performs incremental copy — only changed files are written.

```typescript
const entry = await getStoreEntry("my-lib", "1.0.0");
if (entry) {
  await inject(entry, "/path/to/my-app", "pnpm");
}
```

### `backupExisting(consumerPath, packageName, pm)`

Back up the current npm-installed version before overwriting.

```typescript
async function backupExisting(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<boolean>  // true if backup was created
```

### `restoreBackup(consumerPath, packageName, pm)`

Restore the backed-up version to `node_modules/`.

```typescript
async function restoreBackup(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<boolean>  // true if backup was restored
```

### `removeInjected(consumerPath, packageName, pm)`

Remove an injected package from `node_modules/` and its bin links.

```typescript
async function removeInjected(
  consumerPath: string,
  packageName: string,
  pm: PackageManager
): Promise<void>
```

### `checkMissingDeps(storeEntry, consumerPath)`

Check whether the consumer is missing any transitive dependencies.

```typescript
async function checkMissingDeps(
  storeEntry: StoreEntry,
  consumerPath: string
): Promise<string[]>  // array of missing package names
```

## Store

### `getStoreEntry(name, version)`

Get a store entry by name and version. Returns `null` if not found.

```typescript
async function getStoreEntry(
  name: string,
  version: string
): Promise<StoreEntry | null>
```

```typescript
const entry = await getStoreEntry("my-lib", "1.0.0");
if (entry) {
  console.log(entry.meta.contentHash);
  console.log(entry.packageDir); // path to package/ dir in store
}
```

### `findStoreEntry(name)`

Find a store entry by name (any version). Returns the most recently published version.

```typescript
async function findStoreEntry(
  name: string
): Promise<StoreEntry | null>
```

### `listStoreEntries()`

List all entries in the store.

```typescript
async function listStoreEntries(): Promise<StoreEntry[]>
```

## Tracking

### `readConsumerState(consumerPath)`

Read the consumer state file (`.plunk/state.json`). Returns empty state if the file doesn't exist.

```typescript
async function readConsumerState(
  consumerPath: string
): Promise<ConsumerState>
```

### `addLink(consumerPath, packageName, entry)`

Add or update a link entry in the consumer state.

```typescript
async function addLink(
  consumerPath: string,
  packageName: string,
  entry: LinkEntry
): Promise<void>
```

### `removeLink(consumerPath, packageName)`

Remove a link entry from the consumer state.

```typescript
async function removeLink(
  consumerPath: string,
  packageName: string
): Promise<void>
```

### `getConsumers(packageName)`

Get all registered consumer paths for a package.

```typescript
async function getConsumers(
  packageName: string
): Promise<string[]>
```

### `registerConsumer(packageName, consumerPath)`

Register a consumer in the global registry (`~/.plunk/consumers.json`).

```typescript
async function registerConsumer(
  packageName: string,
  consumerPath: string
): Promise<void>
```

### `unregisterConsumer(packageName, consumerPath)`

Remove a consumer from the global registry.

```typescript
async function unregisterConsumer(
  packageName: string,
  consumerPath: string
): Promise<void>
```

### `cleanStaleConsumers()`

Remove registrations for consumer directories that no longer exist on disk.

```typescript
async function cleanStaleConsumers(): Promise<{
  removedConsumers: number;
  removedPackages: number;
}>
```

## Watching

### `startWatcher(watchDir, options, onChange)`

Start watching a directory for file changes and trigger a callback.

```typescript
async function startWatcher(
  watchDir: string,
  options: WatchOptions,
  onChange: () => Promise<void>
): Promise<{ close: () => Promise<void> }>
```

Uses chokidar. Implements debounce-effects strategy: changes are detected immediately but coalesced before triggering the callback. If new changes arrive during callback execution, re-triggers after it finishes.

### `killActiveBuild()`

Kill the active build subprocess if one is running.

```typescript
function killActiveBuild(): void
```

## Utilities

### `detectPackageManager(projectDir)`

Detect the package manager by walking up the filesystem looking for lockfiles.

```typescript
async function detectPackageManager(
  projectDir: string
): Promise<PackageManager>  // "npm" | "pnpm" | "yarn" | "bun"
```

Priority order: pnpm > bun > yarn > npm. Falls back to npm if no lockfile is found.

### `Timer`

Simple elapsed-time tracker.

```typescript
class Timer {
  elapsedMs(): number    // milliseconds since creation
  elapsed(): string      // human-readable ("1.2s" or "150ms")
}
```

### `isNodeError(err)`

Type guard for Node.js system errors.

```typescript
function isNodeError(err: unknown): err is NodeJS.ErrnoException
```

## Types

All types from `src/types.ts` are re-exported:

```typescript
interface PlunkMeta {
  schemaVersion?: number;
  contentHash: string;
  publishedAt: string;
  sourcePath: string;
  buildId: string;
}

interface StoreEntry {
  name: string;
  version: string;
  packageDir: string;
  meta: PlunkMeta;
}

interface LinkEntry {
  version: string;
  contentHash: string;
  linkedAt: string;
  sourcePath: string;
  backupExists: boolean;
  packageManager: PackageManager;
  buildId: string;
}

interface ConsumerState {
  version: "1";
  packageManager?: PackageManager;
  role?: "consumer" | "library";
  links: Record<string, LinkEntry>;
}

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface WatchOptions {
  patterns?: string[];
  buildCmd?: string;
  debounce?: number;
  awaitWriteFinish?: boolean | { stabilityThreshold: number; pollInterval: number };
}

interface PackageJson {
  name: string;
  version: string;
  files?: string[];
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  private?: boolean;
  scripts?: Record<string, string>;
  publishConfig?: {
    main?: string;
    module?: string;
    exports?: unknown;
    types?: string;
    typings?: string;
    browser?: string | Record<string, string>;
    bin?: string | Record<string, string>;
    directory?: string;
  };
  // ... and other standard fields
}
```
