import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.INTERNAL_JOB_SECRET = "secret";
});

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const { POST } = await import("./route");

afterEach(() => vi.clearAllMocks());

describe("POST /api/jobs/revalidate", () => {
  it("returns 403 without correct auth", async () => {
    const res = await POST(
      new Request("http://x/api/jobs/revalidate", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(403);
  });

  it("revalidates supplied paths + tags", async () => {
    const res = await POST(
      new Request("http://x/api/jobs/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: JSON.stringify({ paths: ["/foo", "/bar"], tags: ["t1"] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/foo");
    expect(revalidatePath).toHaveBeenCalledWith("/bar");
    expect(revalidateTag).toHaveBeenCalledWith("t1", "max");
  });
});
