// Public API for programmatic usage
export { publish } from "./core/publisher.js";
export { inject, backupExisting, restoreBackup, removeInjected, checkMissingDeps } from "./core/injector.js";
export { getStoreEntry, findStoreEntry, listStoreEntries } from "./core/store.js";
export { readConsumerState, addLink, removeLink, getConsumers, registerConsumer, unregisterConsumer } from "./core/tracker.js";
export { startWatcher } from "./core/watcher.js";
export { detectPackageManager } from "./utils/pm-detect.js";
export type * from "./types.js";
