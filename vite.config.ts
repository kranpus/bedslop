import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Type-checking generated scripts takes a few seconds each; allow for slow machines.
  test: { environment: "node", testTimeout: 30000 },
} as any);
