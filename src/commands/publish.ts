import { defineCommand } from "citty";
import { resolve } from "node:path";
import { publish } from "../core/publisher.js";

export default defineCommand({
  meta: {
    name: "publish",
    description: "Publish current package to the plunk store",
  },
  args: {
    dir: {
      type: "positional",
      description: "Package directory (default: current directory)",
      required: false,
    },
  },
  async run({ args }) {
    const dir = resolve(args.dir || ".");
    await publish(dir);
  },
});
