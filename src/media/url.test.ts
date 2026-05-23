import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
vi.stubEnv("AUTH_SECRET", "x".repeat(64));
vi.stubEnv("PREVIEW_TOKEN_SECRET", "x".repeat(64));
vi.stubEnv("INTERNAL_JOB_SECRET", "x".repeat(64));
vi.stubEnv("GCS_BUCKET_MEDIA", "wpk-test-bucket");
vi.stubEnv("APP_URL", "https://app.test");
vi.stubEnv("MEDIA_PUBLIC_URL", "https://cdn.test");

const { imgUrl } = await import("./url");

describe("imgUrl", () => {
  it("uses MEDIA_PUBLIC_URL when present", () => {
    expect(imgUrl("m-1", { width: 400 })).toBe("https://cdn.test/api/img/m-1?w=400");
  });
  it("omits format=auto", () => {
    expect(imgUrl("m-1", { format: "auto" })).toBe("https://cdn.test/api/img/m-1");
  });
  it("includes fit and quality", () => {
    expect(imgUrl("m-1", { width: 100, height: 100, fit: "cover", quality: 70 })).toBe(
      "https://cdn.test/api/img/m-1?w=100&h=100&q=70&fit=cover",
    );
  });
});
