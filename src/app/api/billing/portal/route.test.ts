import { afterEach, describe, expect, it, vi } from "vitest";

const getOptionalUser = vi.fn();
vi.mock("@/auth/context", () => ({
  getOptionalUser: (...a: unknown[]) => getOptionalUser(...a),
}));

const findStripeCustomerIdForUser = vi.fn();
const createPortalSession = vi.fn();
class BillingNotConfiguredError extends Error {
  constructor() {
    super("not configured");
    this.name = "BillingNotConfiguredError";
  }
}
vi.mock("@/billing/service", () => ({
  findStripeCustomerIdForUser: (...a: unknown[]) => findStripeCustomerIdForUser(...a),
  createPortalSession: (...a: unknown[]) => createPortalSession(...a),
  BillingNotConfiguredError,
}));

vi.mock("@/env", () => ({
  env: () => ({ APP_URL: "https://e.test" }),
}));

const { POST } = await import("./route");

afterEach(() => {
  getOptionalUser.mockReset();
  findStripeCustomerIdForUser.mockReset();
  createPortalSession.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/billing/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/portal", () => {
  it("returns 401 when no session", async () => {
    getOptionalUser.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(findStripeCustomerIdForUser).not.toHaveBeenCalled();
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the signed-in user has no Stripe customer", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(404);
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("creates a portal session for the caller's own customer", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    createPortalSession.mockResolvedValue("https://billing.stripe.com/p/sess");
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://billing.stripe.com/p/sess");
    expect(findStripeCustomerIdForUser).toHaveBeenCalledWith("u-1");
    expect(createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_own",
      returnUrl: "https://e.test/admin",
    });
  });

  it("ignores any customerId in the request body — caller cannot impersonate", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    createPortalSession.mockResolvedValue("https://billing.stripe.com/p/sess");
    const res = await POST(req({ customerId: "cus_someone_else" }));
    expect(res.status).toBe(200);
    expect(createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_own",
      returnUrl: "https://e.test/admin",
    });
  });

  it("honors a same-origin returnPath", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    createPortalSession.mockResolvedValue("https://billing.stripe.com/p/sess");
    const res = await POST(req({ returnPath: "/admin/billing" }));
    expect(res.status).toBe(200);
    expect(createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_own",
      returnUrl: "https://e.test/admin/billing",
    });
  });

  it("rejects a returnPath that doesn't begin with a single slash (open-redirect defense)", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    const res = await POST(req({ returnPath: "https://attacker.test/x" }));
    expect(res.status).toBe(400);
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative returnPath", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    const res = await POST(req({ returnPath: "//attacker.test/x" }));
    expect(res.status).toBe(400);
    expect(createPortalSession).not.toHaveBeenCalled();
  });

  it("returns 503 when billing is not configured", async () => {
    getOptionalUser.mockResolvedValue({ id: "u-1", email: "u1@e.test" });
    findStripeCustomerIdForUser.mockResolvedValue("cus_own");
    createPortalSession.mockRejectedValue(new BillingNotConfiguredError());
    const res = await POST(req({}));
    expect(res.status).toBe(503);
  });
});
