import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDelivery = vi.fn();
const recordDeliveryResult = vi.fn().mockResolvedValue(undefined);
vi.mock("./deliveries", () => ({
  getDelivery: (...a: unknown[]) => getDelivery(...a),
  recordDeliveryResult: (...a: unknown[]) => recordDeliveryResult(...a),
}));
const getWebhook = vi.fn();
vi.mock("./service", () => ({ getWebhookById: (...a: unknown[]) => getWebhook(...a) }));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { deliverOnce, computeBackoffSec, MAX_ATTEMPTS } = await import("./deliver");

beforeEach(() => {
  getDelivery.mockReset();
  recordDeliveryResult.mockReset().mockResolvedValue(undefined);
  getWebhook.mockReset();
  enqueueJob.mockReset();
  fetchMock.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("deliverOnce", () => {
  it("marks success on 2xx", async () => {
    getDelivery.mockResolvedValue({
      id: "d-1",
      webhookId: "w-1",
      event: "post.published",
      payload: { ok: true },
      attempts: 0,
    });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", statusCode: 200 }),
    );
  });

  it("marks retrying + enqueues with backoff on 5xx (under MAX_ATTEMPTS)", async () => {
    getDelivery.mockResolvedValue({
      id: "d-1",
      webhookId: "w-1",
      event: "post.published",
      payload: {},
      attempts: 0,
    });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "Service down" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retrying" }),
    );
    expect(enqueueJob).toHaveBeenCalledWith(
      "webhook-deliver",
      expect.objectContaining({ deliveryId: "d-1" }),
      expect.objectContaining({ delaySeconds: expect.any(Number) }),
    );
  });

  it("marks failed after MAX_ATTEMPTS", async () => {
    getDelivery.mockResolvedValue({
      id: "d-1",
      webhookId: "w-1",
      event: "post.published",
      payload: {},
      attempts: MAX_ATTEMPTS,
    });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("treats network error like a 5xx retry", async () => {
    getDelivery.mockResolvedValue({
      id: "d-1",
      webhookId: "w-1",
      event: "x",
      payload: {},
      attempts: 1,
    });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retrying" }),
    );
  });
});

describe("computeBackoffSec", () => {
  it("grows exponentially capped at 24h", () => {
    expect(computeBackoffSec(0)).toBe(30);
    expect(computeBackoffSec(1)).toBe(60);
    expect(computeBackoffSec(5)).toBe(960);
    expect(computeBackoffSec(20)).toBe(86_400);
  });
});
