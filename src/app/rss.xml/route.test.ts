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
vi.mock("@/posts/service", () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }));

const { GET } = await import("./route");

afterEach(() => listPosts.mockReset());

describe("GET /rss.xml", () => {
  it("returns an RSS document with content-type application/rss+xml", async () => {
    listPosts.mockResolvedValue({
      items: [
        {
          id: "p-1",
          slug: "hello",
          title: "Hello",
          excerpt: "world",
          publishedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      nextCursor: null,
    });
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body).toContain("<rss");
    expect(body).toMatch(/<title>(?:<!\[CDATA\[)?Hello(?:\]\]>)?<\/title>/);
    expect(body).toContain("https://app.test/blog/hello");
  });
});
