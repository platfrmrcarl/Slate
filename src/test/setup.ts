import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import type * as EnvModule from "@/env";
import type * as LoggerModule from "@/lib/logger";

// The runtime `env()` and `logger()` singletons lazily call Zod validation on
// `process.env`. Most unit tests don't seed required vars (only integration
// tests that need a real DB do). When a tested code path happens to log or
// touch env() — typically in an error branch or a route handler — the
// validation throws "Invalid environment" and masks the original behavior the
// test expected.
//
// Mock both accessors to return safe defaults so unit tests stay hermetic.
// `parseEnv` / `resetEnvForTesting` / `createLogger` are left intact so the
// dedicated env-validation and logger-factory tests still exercise them.

vi.mock("@/env", async () => {
  const actual = await vi.importActual<typeof EnvModule>("@/env");
  // Parse from live process.env on each call, filling in test defaults for
  // any required var the test didn't seed. Tests that set process.env.APP_URL
  // (etc.) still see their value via env(); the DATABASE_URL default keeps
  // unit tests hermetic while integration tests that need a real DB set their
  // own value.
  return {
    ...actual,
    env: () =>
      actual.parseEnv({
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "x".repeat(64),
        APP_URL: process.env.APP_URL ?? "http://localhost:3000",
        PREVIEW_TOKEN_SECRET: process.env.PREVIEW_TOKEN_SECRET ?? "x".repeat(64),
        INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET ?? "x".repeat(64),
        GCS_BUCKET_MEDIA: process.env.GCS_BUCKET_MEDIA ?? "slate-test-bucket",
      }),
  };
});

vi.mock("@/lib/logger", async () => {
  const actual = await vi.importActual<typeof LoggerModule>("@/lib/logger");
  const noop = () => {};
  const noopLogger: Record<string, unknown> = {
    level: "silent",
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    silent: noop,
  };
  noopLogger.child = () => noopLogger;
  return {
    ...actual,
    logger: () => noopLogger,
  };
});

afterEach(() => {
  // Per-test cleanup hook; expanded by later sub-plans.
});
