import { listWebhooksForEvent } from "./service";
import { insertDelivery } from "./deliveries";
import { enqueueJob } from "@/jobs/enqueue";
import { eventPayloadSchemas } from "./events";
import type { WebhookEvent } from "./manifest";
import { logger } from "@/lib/logger";

/**
 * Single sink for domain events. Validates the payload against the per-event
 * Zod schema, then inserts a `webhook_deliveries` row and enqueues a
 * `webhook-deliver` Cloud Task for every active webhook subscribed to the
 * event. Per-subscriber errors are logged and skipped so one bad webhook
 * cannot block delivery to the others.
 */
export async function emit<T extends WebhookEvent>(
  event: T,
  payload: Record<string, unknown>,
): Promise<void> {
  const schema = eventPayloadSchemas[event];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`invalid payload for event ${event}: ${parsed.error.message}`);
  }
  const subscribers = await listWebhooksForEvent(event);
  if (subscribers.length === 0) return;
  for (const w of subscribers) {
    try {
      const delivery = await insertDelivery({
        webhookId: w.id,
        event,
        payload: parsed.data,
      });
      await enqueueJob("webhook-deliver", { deliveryId: delivery.id, webhookId: w.id });
    } catch (err) {
      logger().warn({ err, webhookId: w.id, event }, "emit:webhook-enqueue-failed");
    }
  }
}

/**
 * Fire-and-forget convenience wrapper for callers that should never let a
 * webhook failure surface to the user-facing action.
 */
export function emitSafe<T extends WebhookEvent>(event: T, payload: Record<string, unknown>): void {
  emit(event, payload).catch((err) => {
    logger().warn({ err, event }, "emit:failed");
  });
}
