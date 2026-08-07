import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
    deps: {
      // zod 4.x is pure ESM; interopDefault keeps named imports working
      // through the SSR transform under real Node (Bun's node shim masks
      // this on the default PATH).
      interopDefault: true,
    },
    server: {
      deps: {
        inline: ["zod"],
      },
    },
  },
});
