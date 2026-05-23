import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PORT: z.coerce.number().int().positive().default(3000),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
    APP_URL: z.string().url("APP_URL must be a valid URL"),
    PREVIEW_TOKEN_SECRET: z.string().min(32, "PREVIEW_TOKEN_SECRET must be at least 32 chars"),
    INTERNAL_JOB_SECRET: z.string().min(32, "INTERNAL_JOB_SECRET must be at least 32 chars"),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
    GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default("noreply@example.com"),
    GCS_BUCKET_MEDIA: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/,
        "GCS_BUCKET_MEDIA must be a valid GCS bucket name",
      ),
    GCS_BUCKET_THEMES: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/)
      .optional(),
    GCS_EMULATOR_HOST: z.string().url().optional(),
    MEDIA_PUBLIC_URL: z.string().url().optional(),
    ANTHROPIC_API_KEY: z
      .string()
      .regex(/^sk-ant-/, "ANTHROPIC_API_KEY must start with sk-ant-")
      .optional(),
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().min(1000).default(2_000_000),
    AI_MODEL_GENERATE_PAGE: z.string().default("claude-opus-4-7"),
    AI_MODEL_REWRITE: z.string().default("claude-haiku-4-5"),
    AI_MODEL_ALT_TEXT: z.string().default("claude-haiku-4-5"),
    AI_MODEL_SEO_META: z.string().default("claude-haiku-4-5"),
    AI_MODEL_TRANSLATE: z.string().default("claude-sonnet-4-6"),
    AI_MODEL_CHAT: z.string().default("claude-sonnet-4-6"),
    AI_MODEL_SPAM: z.string().default("claude-haiku-4-5"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL must be HTTPS in production",
      });
    }
    if (!!env.GOOGLE_OAUTH_CLIENT_ID !== !!env.GOOGLE_OAUTH_CLIENT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_OAUTH_CLIENT_SECRET"],
        message: "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set together",
      });
    }
    if (!!env.GITHUB_OAUTH_CLIENT_ID !== !!env.GITHUB_OAUTH_CLIENT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["GITHUB_OAUTH_CLIENT_SECRET"],
        message: "GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must be set together",
      });
    }
    if (env.NODE_ENV === "production" && env.GCS_EMULATOR_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["GCS_EMULATOR_HOST"],
        message: "GCS_EMULATOR_HOST must not be set in production",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

export function resetEnvForTesting(): void {
  cached = undefined;
}
