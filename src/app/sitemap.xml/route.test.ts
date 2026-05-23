import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "https://app.test";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "wpk-test-bucket";
});

const listPosts = vi.fn();
const listPages = vi.fn();
vi.mock("@/posts/service", () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }));
vi.mock("@/services/pages/service", () => ({ listPages: (...a: unknown[]) => listPages(...a) }));
vi.mock("@/i18n/settings", () => ({
  getI18nSettings: async () => ({
    defaultLocale: "en",
    enabledLocales: ["en"],
    hideDefaultPrefix: true,
  }),
}));

const { GET } = await import("./route");

afterEach(() => {
  listPosts.mockReset();
  listPages.mockReset();
});

describe("GET /sitemap.xml", () => {
  it("returns an XML sitemap including each published post", async () => {
    listPosts.mockResolvedValue({
      items: [
        { slug: "a", updatedAt: new Date("2026-01-01"), publishedAt: new Date("2026-01-01") },
      ],
      nextCursor: null,
    });
    listPages.mockResolvedValue([]);
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/xml");
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("https://app.test/blog/a");
  });

  it("includes published pages alongside posts", async () => {
    listPosts.mockResolvedValue({ items: [], nextCursor: null });
    listPages.mockResolvedValue([{ slug: "about", updatedAt: new Date("2026-02-02") }]);
    const res = await GET();
    const body = await res.text();
    expect(body).toContain("https://app.test/about");
    expect(body).toContain("2026-02-02");
  });
});
