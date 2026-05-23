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
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
    GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default("noreply@example.com"),
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
