import { afterEach, describe, expect, it, vi } from "vitest";

const listWebhooksForEvent = vi.fn();
vi.mock("./service", () => ({
  listWebhooksForEvent: (...a: unknown[]) => listWebhooksForEvent(...a),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const insertDelivery = vi.fn().mockResolvedValue({ id: "d-1" });
vi.mock("./deliveries", () => ({
  insertDelivery: (...a: unknown[]) => insertDelivery(...a),
}));

const { emit } = await import("./emit");

afterEach(() => {
  listWebhooksForEvent.mockReset();
  enqueueJob.mockReset();
  insertDelivery.mockReset().mockResolvedValue({ id: "d-1" });
});

describe("emit", () => {
  it("validates the payload and inserts a delivery + enqueues a job per webhook", async () => {
    listWebhooksForEvent.mockResolvedValue([
      { id: "w-1", url: "https://e1.test", secret: "s1", pluginId: "p-1" },
      { id: "w-2", url: "https://e2.test", secret: "s2", pluginId: "p-2" },
    ]);
    await emit("post.published", {
      postId: "11111111-1111-1111-1111-111111111111",
      slug: "hello",
      url: "https://app.test/blog/hello",
      publishedAt: new Date().toISOString(),
    });
    expect(insertDelivery).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledWith(
      "webhook-deliver",
      expect.objectContaining({ webhookId: "w-1" }),
    );
  });

  it("throws on invalid payload", async () => {
    listWebhooksForEvent.mockResolvedValue([]);
    await expect(
      emit("post.published", { wrong: true } as unknown as Record<string, never>),
    ).rejects.toThrow(/payload/);
  });

  it("is a no-op when no webhooks subscribe", async () => {
    listWebhooksForEvent.mockResolvedValue([]);
    await emit("comment.added", { commentId: "11111111-1111-1111-1111-111111111111" });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
