import { signPayload } from "./hmac";
import { getDelivery, recordDeliveryResult } from "./deliveries";
import { getWebhookById } from "./service";
import { assertUrlSafeForOutboundFetch, SsrfError } from "./ssrf";
import { logger } from "@/lib/logger";
import { enqueueJob } from "@/jobs/enqueue";

/** Maximum attempt count before a delivery is marked failed (~24h backoff cap). */
export const MAX_ATTEMPTS = 12;
const MAX_BACKOFF_SEC = 86_400;

/**
 * Exponential backoff schedule: `30 * 2^attempt` seconds, capped at 24h.
 * attempt 0 → 30s, 1 → 60s, 5 → 960s, 20 → 86400s.
 */
export function computeBackoffSec(attempt: number): number {
  const v = 30 * 2 ** attempt;
  return Math.min(v, MAX_BACKOFF_SEC);
}

export interface DeliverInput {
  deliveryId: string;
  webhookId: string;
}

/**
 * Deliver one webhook attempt. Signs the body with HMAC-SHA256, POSTs to the
 * subscriber URL, and updates the delivery row. Transient failures (non-2xx
 * or network error) re-enqueue with exponential backoff up to MAX_ATTEMPTS.
 */
export async function deliverOnce(input: DeliverInput): Promise<void> {
  const delivery = await getDelivery(input.deliveryId);
  if (!delivery) return;
  const webhook = await getWebhookById(input.webhookId);
  if (!webhook) {
    await recordDeliveryResult({
      id: delivery.id,
      status: "failed",
      lastError: "webhook deleted",
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  // SSRF guard: refuse to dial private / loopback / link-local addresses.
  // A rogue (or compromised) plugin manifest must not be able to use the app
  // server as a stepping stone into internal infrastructure.
  try {
    await assertUrlSafeForOutboundFetch(webhook.url);
  } catch (err) {
    if (err instanceof SsrfError) {
      logger().warn(
        { deliveryId: delivery.id, webhookId: webhook.id, err: err.message },
        "webhook-deliver:ssrf-blocked",
      );
      await recordDeliveryResult({
        id: delivery.id,
        status: "failed",
        lastError: `blocked: ${err.message}`,
        attemptsIncrement: 1,
        deliveredAt: new Date(),
      });
      return;
    }
    throw err;
  }

  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event: delivery.event,
    deliveredAt: new Date().toISOString(),
    payload: delivery.payload,
  });
  const signature = signPayload(webhook.secret, ts, body);

  let status = 0;
  let bodyText = "";
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wpk-event": delivery.event,
        "x-wpk-timestamp": String(ts),
        "x-wpk-signature": `t=${ts},v1=${signature}`,
      },
      body,
    });
    status = res.status;
    bodyText = await res.text();
  } catch (err) {
    logger().warn({ err, deliveryId: delivery.id }, "webhook-deliver:network-error");
    return await handleFailure({
      deliveryId: delivery.id,
      webhookId: webhook.id,
      attempts: delivery.attempts,
      statusCode: 0,
      responseBodyPreview: "",
      lastError: err instanceof Error ? err.message : String(err),
    });
  }

  if (status >= 200 && status < 300) {
    await recordDeliveryResult({
      id: delivery.id,
      status: "success",
      statusCode: status,
      responseBodyPreview: bodyText.slice(0, 1000),
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  await handleFailure({
    deliveryId: delivery.id,
    webhookId: webhook.id,
    attempts: delivery.attempts,
    statusCode: status,
    responseBodyPreview: bodyText,
    lastError: `non-2xx: ${status}`,
  });
}

async function handleFailure(input: {
  deliveryId: string;
  webhookId: string;
  attempts: number;
  statusCode: number;
  responseBodyPreview: string;
  lastError: string;
}) {
  const nextAttempt = input.attempts + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    await recordDeliveryResult({
      id: input.deliveryId,
      status: "failed",
      statusCode: input.statusCode,
      responseBodyPreview: input.responseBodyPreview,
      lastError: input.lastError,
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  const delaySec = computeBackoffSec(nextAttempt);
  const nextAttemptAt = new Date(Date.now() + delaySec * 1000);
  await recordDeliveryResult({
    id: input.deliveryId,
    status: "retrying",
    statusCode: input.statusCode,
    responseBodyPreview: input.responseBodyPreview,
    lastError: input.lastError,
    nextAttemptAt,
    attemptsIncrement: 1,
  });
  await enqueueJob(
    "webhook-deliver",
    { deliveryId: input.deliveryId, webhookId: input.webhookId },
    { delaySeconds: delaySec },
  );
}
