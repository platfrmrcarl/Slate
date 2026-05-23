import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

import { GET } from "./route";
import * as dbModule from "@/db";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/readyz", () => {
  it("returns 200 with status=ready when DB query succeeds", async () => {
    vi.mocked(dbModule.db).mockReturnValue({
      execute: vi.fn().mockResolvedValue([{ one: 1 }]),
    } as unknown as ReturnType<typeof dbModule.db>);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { db: string } };
    expect(body.status).toBe("ready");
    expect(body.checks.db).toBe("ok");
  });

  it("returns 503 when DB query throws", async () => {
    vi.mocked(dbModule.db).mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as ReturnType<typeof dbModule.db>);

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: { db: string } };
    expect(body.status).toBe("not_ready");
    expect(body.checks.db).toContain("ECONNREFUSED");
  });
});
