import { defineConfig } from "vite";
import plunk from "@oleg-kuibar/plunk/vite";

export default defineConfig({
  plugins: [plunk()],
  optimizeDeps: {
    // Exclude plunk-linked packages so Vite doesn't pre-bundle them.
    exclude: ["@example/api-client"],
  },
});
