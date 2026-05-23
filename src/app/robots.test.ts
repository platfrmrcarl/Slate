import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "https://app.test";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "wpk-test-bucket";
});

const { default: robots } = await import("./robots");

describe("robots()", () => {
  it("allows '/' for all user-agents by default", () => {
    const out = robots();
    const rules = Array.isArray(out.rules) ? out.rules : [out.rules!];
    const star = rules.find((r) => r.userAgent === "*");
    expect(star).toBeDefined();
    expect(star?.allow).toBe("/");
  });

  it("disallows admin, setup, api, and auth routes", () => {
    const out = robots();
    const rules = Array.isArray(out.rules) ? out.rules : [out.rules!];
    const star = rules.find((r) => r.userAgent === "*");
    const disallow = (Array.isArray(star?.disallow) ? star?.disallow : [star?.disallow]) as
      | string[]
      | undefined;
    expect(disallow).toEqual(
      expect.arrayContaining(["/admin/", "/setup", "/api/", "/sign-in", "/sign-up", "/sign-out"]),
    );
  });

  it("emits a sitemap pointing at the configured APP_URL", () => {
    const out = robots();
    expect(out.sitemap).toBe("https://app.test/sitemap.xml");
  });

  it("strips a trailing slash from APP_URL before composing the sitemap URL", async () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://app.test/";
    const { resetEnvForTesting } = await import("@/env");
    resetEnvForTesting();
    try {
      const out = robots();
      expect(out.sitemap).toBe("https://app.test/sitemap.xml");
    } finally {
      process.env.APP_URL = prev;
      resetEnvForTesting();
    }
  });
});
