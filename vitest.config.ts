import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "src/test/**", ".next/**", "node_modules/**"],
    },
    environmentMatchGlobs: [
      ["src/app/**/*.test.tsx", "happy-dom"],
      ["src/components/**/*.test.tsx", "happy-dom"],
    ],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
