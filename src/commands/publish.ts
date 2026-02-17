import { defineCommand } from "citty";
import { resolve } from "node:path";
import { publish } from "../core/publisher.js";
import { Timer } from "../utils/timer.js";
import { suppressHumanOutput, output } from "../utils/output.js";
import { errorWithSuggestion } from "../utils/errors.js";
import { verbose } from "../utils/logger.js";

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
    private: {
      type: "boolean",
      description: "Allow publishing private packages",
      default: false,
    },
  },
  async run({ args }) {
    suppressHumanOutput();
    const timer = new Timer();
    const dir = resolve(args.dir || ".");
    verbose(`[publish] Publishing from ${dir}`);

    try {
      const result = await publish(dir, { allowPrivate: args.private });
      output({ ...result, elapsed: timer.elapsedMs() });
    } catch (err) {
      errorWithSuggestion(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
});
