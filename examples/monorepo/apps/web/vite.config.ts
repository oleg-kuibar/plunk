import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // Exclude plunk-linked packages so Vite doesn't pre-bundle them.
    // This ensures changes are picked up when plunk pushes new files.
    exclude: ["@example/api-client"],
  },
});
