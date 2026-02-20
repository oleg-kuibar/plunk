import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // Exclude plunk-linked packages so Vite doesn't pre-bundle them.
    // This ensures HMR works when plunk pushes new files.
    exclude: ["@example/api-client", "@example/ui-kit"],
  },
});
