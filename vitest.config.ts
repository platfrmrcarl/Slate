import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    // Vitest's default exclude covers node_modules + dist; also exclude
    // .claude/worktrees so in-flight branches kept as on-disk worktrees
    // don't get harvested by `pnpm test` runs against main.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      ".claude/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/test/**",
        ".next/**",
        "node_modules/**",
        // UI shells and page components are exercised in browser-side smokes,
        // not in vitest coverage. Excluded to keep the thresholds honest for
        // the testable surface (services, route handlers, libs).
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "themes/**",
        "packages/cli/**",
        "infra/**",
        "instrumentation.ts",
        "next.config.ts",
        "drizzle.config.ts",
        "src/db/schema.ts",
        "src/db/migrate.ts",
      ],
      // Regression floor — set just below the current measured numbers so
      // a PR that deletes tests or adds large untested code paths fails CI.
      // Raise as coverage grows; do not lower without a written reason.
      thresholds: {
        lines: 65,
        statements: 65,
        functions: 70,
        branches: 55,
      },
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
