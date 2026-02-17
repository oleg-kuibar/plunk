// Public API for programmatic usage
export { publish } from "./core/publisher.js";
export type { PublishOptions, PublishResult } from "./core/publisher.js";
export { inject, backupExisting, restoreBackup, removeInjected, checkMissingDeps } from "./core/injector.js";
export { getStoreEntry, findStoreEntry, listStoreEntries } from "./core/store.js";
export { readConsumerState, addLink, removeLink, getConsumers, registerConsumer, unregisterConsumer, cleanStaleConsumers } from "./core/tracker.js";
export { startWatcher, killActiveBuild } from "./core/watcher.js";
export { detectPackageManager } from "./utils/pm-detect.js";
export { Timer } from "./utils/timer.js";
export { isNodeError } from "./utils/fs.js";
export type * from "./types.js";
