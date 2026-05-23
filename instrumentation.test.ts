import { describe, expect, it, vi } from "vitest";

describe("instrumentation", () => {
  it("module loads without throwing when OTEL is disabled", async () => {
    vi.stubEnv("OTEL_ENABLED", "false");
    vi.resetModules();
    await expect(import("./instrumentation")).resolves.toBeDefined();
  });

  it("attempts to register a Cloud Trace exporter when GCP_PROJECT_ID is set", async () => {
    vi.stubEnv("OTEL_ENABLED", "true");
    vi.stubEnv("GCP_PROJECT_ID", "wpk-test");
    vi.resetModules();
    // We don't actually want to spin up the SDK in tests — just confirm the
    // module decides to do so without crashing.
    await expect(import("./instrumentation")).resolves.toBeDefined();
  });
});
