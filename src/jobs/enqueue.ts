import type { CloudTasksClient as CloudTasksClientType } from "@google-cloud/tasks";
import { logger } from "@/lib/logger";

export type JobType =
  | "media-probe"
  | "media-alt-text"
  | "revalidate"
  | "webhook-deliver"
  | "ai-generate-page"
  | "email-send"
  | "import-run"
  | "export-run"
  | "comment-classify";

export const JOB_QUEUE: Record<JobType, string> = {
  "media-probe": "wpk-media",
  "media-alt-text": "wpk-ai",
  revalidate: "wpk-revalidate",
  "webhook-deliver": "wpk-webhooks",
  "ai-generate-page": "wpk-ai",
  "email-send": "wpk-email",
  "import-run": "wpk-imports",
  "export-run": "wpk-exports",
  "comment-classify": "wpk-ai",
};

interface EnqueueOptions {
  delaySeconds?: number;
}

export async function enqueueJob<P>(
  type: JobType,
  payload: P,
  opts: EnqueueOptions = {},
): Promise<void> {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${appUrl}/api/jobs/${type}`;
  if (process.env.NODE_ENV !== "production") {
    await runLocally(url, payload);
    return;
  }
  await runOnCloudTasks(type, url, payload, opts);
}

async function runLocally(url: string, payload: unknown): Promise<void> {
  const secret = process.env.INTERNAL_JOB_SECRET ?? "";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`local job failed (${res.status}): ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

let tasksClient: CloudTasksClientType | undefined;

async function runOnCloudTasks(
  type: JobType,
  url: string,
  payload: unknown,
  opts: EnqueueOptions,
): Promise<void> {
  const project = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION ?? "us-central1";
  const sa = process.env.CLOUD_TASKS_INVOKER_SA;
  if (!project || !sa) {
    logger().warn({ type }, "cloud-tasks not configured; running locally");
    return runLocally(url, payload);
  }
  if (!tasksClient) {
    // Lazy-load the SDK so its proto-tree resolution only fires when Cloud Tasks
    // is actually configured. Without this, the SDK module is evaluated at
    // route-module load time and crashes on Next.js standalone builds that
    // don't trace its proto JSON files.
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    tasksClient = new CloudTasksClient();
  }
  const parent = tasksClient.queuePath(project, region, JOB_QUEUE[type]);
  const secret = process.env.INTERNAL_JOB_SECRET ?? "";
  const task: Record<string, unknown> = {
    httpRequest: {
      httpMethod: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: { serviceAccountEmail: sa, audience: url },
    },
  };
  if (opts.delaySeconds) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds,
    };
  }
  await tasksClient.createTask({ parent, task });
}
