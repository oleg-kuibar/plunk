import { availableParallelism } from "node:os";

// Expand libuv's threadpool to match available CPU cores.
// Must happen before any async I/O (fs, dns, crypto) is dispatched.
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(availableParallelism(), 8));

import { defineCommand, runMain } from "citty";
import { initFlags } from "./utils/logger.js";
import { showBanner } from "./utils/banner.js";

initFlags();

// Show banner when running without subcommand or with --help
const args = process.argv.slice(2);
const hasSubcommand = args.some(
  (arg) =>
    !arg.startsWith("-") &&
    [
      "init", "publish", "add", "remove", "push", "dev",
      "restore", "list", "status", "update", "clean", "gc",
      "doctor", "migrate",
    ].includes(arg)
);
if (!hasSubcommand) {
  showBanner();
}

const main = defineCommand({
  meta: {
    name: "plunk",
    version: "0.1.0",
    description: "",
  },
  args: {
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Enable verbose debug logging",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Preview changes without writing files",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Output machine-readable JSON",
      default: false,
    },
  },
  subCommands: {
    init: () => import("./commands/init.js").then((m) => m.default),
    publish: () => import("./commands/publish.js").then((m) => m.default),
    add: () => import("./commands/add.js").then((m) => m.default),
    remove: () => import("./commands/remove.js").then((m) => m.default),
    push: () => import("./commands/push.js").then((m) => m.default),
    dev: () => import("./commands/dev.js").then((m) => m.default),
    restore: () => import("./commands/restore.js").then((m) => m.default),
    list: () => import("./commands/list.js").then((m) => m.default),
    status: () => import("./commands/status.js").then((m) => m.default),
    update: () => import("./commands/update.js").then((m) => m.default),
    clean: () => import("./commands/clean.js").then((m) => m.default),
    gc: () => import("./commands/clean.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    migrate: () => import("./commands/migrate.js").then((m) => m.default),
  },
});

runMain(main);
