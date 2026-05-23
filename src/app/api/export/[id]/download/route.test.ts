import { afterEach, describe, expect, it, vi } from "vitest";
import type * as AuthCtxMod from "@/auth/context";

const requireRole = vi.fn().mockResolvedValue({ id: "u-1" });
vi.mock("@/auth/context", async () => {
  const actual = await vi.importActual<typeof AuthCtxMod>("@/auth/context");
  return {
    ...actual,
    requireRole: (...a: unknown[]) => requireRole(...a),
  };
});

const where = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
  }),
}));

const createSignedReadUrl = vi.fn();
vi.mock("@/media/storage", () => ({
  createSignedReadUrl: (...a: unknown[]) => createSignedReadUrl(...a),
}));

const { GET } = await import("./route");

afterEach(() => {
  where.mockReset();
  createSignedReadUrl.mockReset();
  requireRole.mockReset();
  requireRole.mockResolvedValue({ id: "u-1" });
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/export/[id]/download", () => {
  it("returns 404 when job isn't completed", async () => {
    where.mockResolvedValue([{ id: "j", kind: "export", status: "running" }]);
    const res = await GET(new Request("https://e.test"), ctx("j"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when row is for an import job", async () => {
    where.mockResolvedValue([
      { id: "j", kind: "import", status: "completed", objectPath: "imports/x.zip" },
    ]);
    const res = await GET(new Request("https://e.test"), ctx("j"));
    expect(res.status).toBe(404);
  });

  it("redirects to a signed URL when completed", async () => {
    where.mockResolvedValue([
      { id: "j", kind: "export", status: "completed", objectPath: "exports/x.zip" },
    ]);
    createSignedReadUrl.mockResolvedValue("https://signed/...");
    const res = await GET(new Request("https://e.test"), ctx("j"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed/...");
  });
});
