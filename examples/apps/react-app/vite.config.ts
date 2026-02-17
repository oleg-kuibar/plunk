import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // IMPORTANT: Exclude plunk-linked packages so Vite doesn't pre-bundle them.
    // This ensures HMR works when plunk pushes new files.
    exclude: ["@example/api-client", "@example/ui-kit"],
  },
});
