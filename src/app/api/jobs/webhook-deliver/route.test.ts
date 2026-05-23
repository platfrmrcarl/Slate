import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const deliverOnce = vi.fn();
vi.mock("@/plugins/deliver", () => ({ deliverOnce: (...a: unknown[]) => deliverOnce(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  deliverOnce.mockReset();
  authorizeJobRequest.mockReset().mockResolvedValue(true);
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/webhook-deliver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/webhook-deliver", () => {
  it("calls deliverOnce", async () => {
    const res = await POST(
      req({
        deliveryId: "11111111-1111-1111-1111-111111111111",
        webhookId: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(res.status).toBe(200);
    expect(deliverOnce).toHaveBeenCalled();
  });

  it("rejects invalid payload", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("rejects unauthorized requests", async () => {
    authorizeJobRequest.mockResolvedValueOnce(false);
    const res = await POST(
      req({
        deliveryId: "11111111-1111-1111-1111-111111111111",
        webhookId: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(res.status).toBe(401);
  });
});
