import { defineCommand, runMain } from "citty";
import { initFlags } from "./utils/logger.js";

initFlags();

const main = defineCommand({
  meta: {
    name: "plunk",
    version: "0.1.0",
    description:
      "Modern local package development tool. Smart file copying for node_modules injection.",
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
