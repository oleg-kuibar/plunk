import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "plunk",
    version: "0.1.0",
    description:
      "Modern local package development tool. Smart file copying for node_modules injection.",
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
  },
});

runMain(main);
