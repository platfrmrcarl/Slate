# Auth and Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user, session, and authorization layer for Slate — Argon2id passwords, signed-cookie sessions, OAuth (Google + GitHub), magic-link sign-in, WordPress-style roles with a permission matrix, and the first-run `/setup` wizard that bootstraps the Owner.

**Architecture:** Custom session management built on `@oslojs/crypto` and `@oslojs/encoding` (the primitives the original Lucia author created and now recommends). A session token is generated as cryptographically random bytes, base32-encoded into the cookie, and SHA-256-hashed before storage so a database leak does not yield session hijacking material. OAuth flows use `arctic` for PKCE and state generation. Magic links and password reset use single-use, expiring DB-backed tokens. Permissions are a pure-function matrix consulted by every Server Action and Route Handler that mutates state.

**Spec amendment:** Spec §10.1 specified Lucia v3. Lucia was archived by its author in 2024 (he wrote "Lucia is feature complete and won't see further updates" and recommended migration to `@oslojs/*` primitives). This plan implements the same security model directly. No behavioral change from the spec; only the dependency footprint differs.

**Tech Stack additions over foundation:** `@oslojs/crypto`, `@oslojs/encoding`, `@node-rs/argon2`, `arctic` (for OAuth), `resend` (transactional email), Zod (already present).

**Depends on:** `2026-05-22-foundation.md` must be complete (the `settings`, `users`, and `sessions` tables grow on top of the foundation Drizzle setup; `env.ts` is extended; the foundation logger is used).

---

## File Map

| Path                                                  | Purpose                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/env.ts`                                          | **MODIFY** — add `AUTH_SECRET`, OAuth credentials, `RESEND_API_KEY`, `APP_URL`                                           |
| `src/env.test.ts`                                     | **MODIFY** — extend tests for new env keys                                                                               |
| `src/db/schema.ts`                                    | **MODIFY** — add `userRole` enum + `users`, `sessions`, `oauthAccounts`, `magicLinkTokens`, `passwordResetTokens` tables |
| `src/db/migrations/0001_auth.sql`                     | Generated migration                                                                                                      |
| `src/auth/passwords.ts`                               | Argon2id hash + verify                                                                                                   |
| `src/auth/passwords.test.ts`                          | Tests for above                                                                                                          |
| `src/auth/tokens.ts`                                  | Session token + random-token primitives (oslojs)                                                                         |
| `src/auth/tokens.test.ts`                             | Tests for above                                                                                                          |
| `src/auth/cookies.ts`                                 | Cookie set/clear helpers                                                                                                 |
| `src/auth/cookies.test.ts`                            | Tests for above                                                                                                          |
| `src/auth/sessions.ts`                                | createSession / validateSessionToken / invalidateSession                                                                 |
| `src/auth/sessions.test.ts`                           | Integration tests (DB required)                                                                                          |
| `src/auth/permissions.ts`                             | Pure-function `can(user, action, resource?)` matrix                                                                      |
| `src/auth/permissions.test.ts`                        | Tests covering every role × action                                                                                       |
| `src/auth/context.ts`                                 | `getOptionalUser`, `requireUser`, `requireRole` for Server Components/Actions                                            |
| `src/auth/context.test.ts`                            | Tests                                                                                                                    |
| `src/auth/email.ts`                                   | Minimal Resend wrapper; logs to stdout in dev/test                                                                       |
| `src/auth/email.test.ts`                              | Tests                                                                                                                    |
| `src/auth/users.ts`                                   | `createUser`, `findUserByEmail`, `verifyPassword` orchestration                                                          |
| `src/auth/users.test.ts`                              | Tests                                                                                                                    |
| `src/auth/oauth/index.ts`                             | Shared OAuth handler scaffolding                                                                                         |
| `src/auth/oauth/google.ts`                            | Google provider config + helpers                                                                                         |
| `src/auth/oauth/github.ts`                            | GitHub provider config + helpers                                                                                         |
| `src/auth/oauth/oauth.test.ts`                        | Tests                                                                                                                    |
| `src/app/actions/auth.ts`                             | Server Actions: signUp, signIn, signOut, requestMagicLink                                                                |
| `src/app/actions/auth.test.ts`                        | Tests for Server Actions                                                                                                 |
| `src/app/api/auth/magic-link/verify/route.ts`         | GET handler for magic-link confirmation links                                                                            |
| `src/app/api/auth/magic-link/verify/route.test.ts`    | Tests                                                                                                                    |
| `src/app/api/auth/oauth/[provider]/start/route.ts`    | OAuth initiation                                                                                                         |
| `src/app/api/auth/oauth/[provider]/callback/route.ts` | OAuth callback                                                                                                           |
| `src/app/api/auth/oauth/oauth.route.test.ts`          | Tests                                                                                                                    |
| `src/app/(auth)/layout.tsx`                           | Public auth shell                                                                                                        |
| `src/app/(auth)/sign-in/page.tsx`                     | Sign-in UI                                                                                                               |
| `src/app/(auth)/sign-up/page.tsx`                     | Sign-up UI                                                                                                               |
| `src/app/(auth)/magic-link/page.tsx`                  | Request-magic-link UI                                                                                                    |
| `src/app/(auth)/magic-link/sent/page.tsx`             | Confirmation page                                                                                                        |
| `src/app/setup/page.tsx`                              | First-run wizard                                                                                                         |
| `src/app/setup/actions.ts`                            | Server Actions for wizard                                                                                                |
| `src/app/setup/actions.test.ts`                       | Tests                                                                                                                    |
| `src/middleware.ts`                                   | Redirect to `/setup` if no owner exists                                                                                  |
| `.env.example`                                        | **MODIFY** — uncomment auth env vars + add `APP_URL`                                                                     |

---

## Task 1: Extend env + auth schema + migration

**Files:**

- Modify: `src/env.ts`
- Modify: `src/env.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `.env.example`
- Create: `src/db/migrations/0001_auth.sql` (generated)

- [ ] **Step 1: Write failing tests for new env keys**

Append to `src/env.test.ts`:

```ts
import { parseEnv } from "./env";

describe("parseEnv (auth additions)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
  };

  it("accepts a complete auth environment", () => {
    const env = parseEnv(base);
    expect(env.AUTH_SECRET).toHaveLength(64);
    expect(env.APP_URL).toBe("https://example.com");
  });

  it("rejects AUTH_SECRET shorter than 32 hex chars", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects non-https APP_URL in production", () => {
    expect(() => parseEnv({ ...base, APP_URL: "http://example.com" })).toThrow(/APP_URL/);
  });

  it("allows http APP_URL in development", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development", APP_URL: "http://localhost:3000" });
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("OAuth credentials are optional", () => {
    const env = parseEnv(base);
    expect(env.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_OAUTH_CLIENT_ID).toBeUndefined();
  });

  it("OAuth credentials require client_id + client_secret together", () => {
    expect(() => parseEnv({ ...base, GOOGLE_OAUTH_CLIENT_ID: "id-only" })).toThrow(
      /GOOGLE_OAUTH_CLIENT_SECRET/,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/env.test.ts
```

Expected: 6 failures.

- [ ] **Step 3: Update `src/env.ts`**

Replace the contents with:

```ts
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
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
```

- [ ] **Step 4: Run env tests to verify they pass**

```bash
pnpm test src/env.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Extend `src/db/schema.ts`**

Append to the existing file:

```ts
import { pgEnum, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "owner",
  "admin",
  "editor",
  "author",
  "contributor",
  "subscriber",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("subscriber"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("oauth_accounts_pk").on(t.provider, t.providerAccountId),
    userIdx: index("oauth_accounts_user_idx").on(t.userId),
  }),
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("magic_link_email_idx").on(t.email),
    expiresIdx: index("magic_link_expires_idx").on(t.expiresAt),
  }),
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
```

- [ ] **Step 6: Update `.env.example`**

Replace the file with:

```
NODE_ENV=development
DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk
LOG_LEVEL=info
PORT=3000

# 64 random hex chars (generate with: openssl rand -hex 32)
AUTH_SECRET=replace-me-with-openssl-rand-hex-32

# Public origin of the app; HTTPS required in production
APP_URL=http://localhost:3000

# OAuth (optional — set both halves of any pair you enable)
# GOOGLE_OAUTH_CLIENT_ID=
# GOOGLE_OAUTH_CLIENT_SECRET=
# GITHUB_OAUTH_CLIENT_ID=
# GITHUB_OAUTH_CLIENT_SECRET=

# Resend transactional email (optional — when absent, emails log to stdout)
# RESEND_API_KEY=
EMAIL_FROM=noreply@example.com

# --- Reserved for later sub-plans ---
# ANTHROPIC_API_KEY=
# GCS_BUCKET_MEDIA=
# GCS_BUCKET_THEMES=
```

Update local `.env.local` to include `AUTH_SECRET` and `APP_URL`:

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "APP_URL=http://localhost:3000" >> .env.local
```

- [ ] **Step 7: Generate the migration**

```bash
pnpm db:generate
mv src/db/migrations/0001_*.sql src/db/migrations/0001_auth.sql
```

Update the corresponding entry in `src/db/migrations/meta/_journal.json` to reflect the renamed `tag`.

- [ ] **Step 8: Apply the migration**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
docker compose exec postgres psql -U wpk -d wpk -c '\dt'
```

Expected: `users`, `sessions`, `oauth_accounts`, `magic_link_tokens`, `password_reset_tokens` listed in addition to `settings` and `__drizzle_migrations`.

- [ ] **Step 9: Commit**

```bash
git add src/env.ts src/env.test.ts src/db/schema.ts src/db/migrations/0001_auth.sql .env.example
git commit -m "feat(auth): extend env + auth tables (users/sessions/oauth/tokens)"
```

---

## Task 2: Argon2id password hashing (TDD)

**Files:**

- Create: `src/auth/passwords.ts`
- Create: `src/auth/passwords.test.ts`

- [ ] **Step 1: Add dependency**

```bash
pnpm add @node-rs/argon2@2
```

- [ ] **Step 2: Write failing tests**

`src/auth/passwords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("hashPassword / verifyPassword", () => {
  it("produces a distinct hash each call", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
    expect(a.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(await verifyPassword(hash, "hunter2hunter2")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(await verifyPassword(hash, "hunter2hunter3")).toBe(false);
  });

  it("rejects passwords shorter than 12 chars at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
  });

  it("rejects passwords longer than 256 chars (avoid DoS)", async () => {
    await expect(hashPassword("a".repeat(257))).rejects.toThrow(/at most 256/);
  });

  it("treats null/garbage hash inputs as invalid", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/auth/passwords.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement `src/auth/passwords.ts`**

```ts
import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";

const ARGON_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // 19 MiB — OWASP 2024 baseline
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_LEN = 12;
const MAX_LEN = 256;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_LEN) throw new Error(`password must be at least ${MIN_LEN} characters`);
  if (plain.length > MAX_LEN) throw new Error(`password must be at most ${MAX_LEN} characters`);
  return argonHash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false;
  if (!hash.startsWith("$argon2id$")) return false;
  if (plain.length > MAX_LEN) return false;
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/auth/passwords.test.ts
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add src/auth/passwords.ts src/auth/passwords.test.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): Argon2id password hashing"
```

---

## Task 3: Session token primitives (TDD)

**Files:**

- Create: `src/auth/tokens.ts`
- Create: `src/auth/tokens.test.ts`

- [ ] **Step 1: Add dependencies**

```bash
pnpm add @oslojs/crypto@1 @oslojs/encoding@1
```

- [ ] **Step 2: Write failing tests**

`src/auth/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  generateRandomToken,
  hashToken,
  constantTimeEqual,
} from "./tokens";

describe("session tokens", () => {
  it("generateSessionToken returns 32 base32 chars (no padding)", () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[a-z2-7]{32}$/);
  });

  it("each call produces a different token", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });

  it("hashSessionToken returns a hex SHA-256", () => {
    const t = generateSessionToken();
    const h = hashSessionToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashSessionToken is deterministic", () => {
    const t = generateSessionToken();
    expect(hashSessionToken(t)).toBe(hashSessionToken(t));
  });
});

describe("opaque random tokens (magic links / password reset)", () => {
  it("generateRandomToken returns 40 base32 chars", () => {
    expect(generateRandomToken()).toMatch(/^[a-z2-7]{40}$/);
  });

  it("hashToken is a hex SHA-256", () => {
    expect(hashToken("abc123")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for different content of same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/auth/tokens.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement `src/auth/tokens.ts`**

```ts
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";

const SESSION_TOKEN_BYTES = 20; // 20 raw bytes → 32 base32 chars
const RANDOM_TOKEN_BYTES = 25; // 25 raw bytes → 40 base32 chars

export function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashSessionToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export function generateRandomToken(): string {
  const bytes = new Uint8Array(RANDOM_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/auth/tokens.test.ts
```

Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add src/auth/tokens.ts src/auth/tokens.test.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): session + opaque token primitives via @oslojs"
```

---

## Task 4: Cookie helpers (TDD)

**Files:**

- Create: `src/auth/cookies.ts`
- Create: `src/auth/cookies.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/cookies.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildSessionCookie, clearedSessionCookie, SESSION_COOKIE_NAME } from "./cookies";

describe("session cookie", () => {
  it("name is 'slate_session'", () => {
    expect(SESSION_COOKIE_NAME).toBe("slate_session");
  });

  it("buildSessionCookie sets HttpOnly, Secure (prod), SameSite=Lax, Path=/, value", () => {
    const cookie = buildSessionCookie("token-value", new Date("2099-01-01T00:00:00Z"), {
      secure: true,
    });
    expect(cookie.name).toBe("slate_session");
    expect(cookie.value).toBe("token-value");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(cookie.expires?.toISOString()).toBe("2099-01-01T00:00:00.000Z");
  });

  it("omits Secure when secure=false (dev over http)", () => {
    const cookie = buildSessionCookie("t", new Date("2099-01-01"), { secure: false });
    expect(cookie.secure).toBe(false);
  });

  it("clearedSessionCookie has empty value + maxAge 0", () => {
    const cookie = clearedSessionCookie({ secure: true });
    expect(cookie.name).toBe("slate_session");
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/auth/cookies.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/cookies.ts`**

```ts
export const SESSION_COOKIE_NAME = "slate_session";

export interface CookieAttrs {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  expires?: Date;
  maxAge?: number;
}

export interface CookieOptions {
  secure: boolean;
}

export function buildSessionCookie(
  token: string,
  expiresAt: Date,
  opts: CookieOptions,
): CookieAttrs {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

export function clearedSessionCookie(opts: CookieOptions): CookieAttrs {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/auth/cookies.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/cookies.ts src/auth/cookies.test.ts
git commit -m "feat(auth): session cookie helpers"
```

---

## Task 5: Session service (TDD)

**Files:**

- Create: `src/auth/sessions.ts`
- Create: `src/auth/sessions.test.ts`

- [ ] **Step 1: Write failing integration tests** (require DB; skipped otherwise)

`src/auth/sessions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllUserSessions,
  SESSION_DURATION_MS,
} from "./sessions";
import { hashSessionToken } from "./tokens";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
let userId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  const [row] = await db()
    .insert(users)
    .values({
      email: `session-test-${Date.now()}@example.com`,
      displayName: "Session Test",
      role: "subscriber",
    })
    .returning();
  userId = row!.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(users)
    .where(sql`${users.id} = ${userId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("sessions", () => {
  it("createSession returns token + expiresAt ~30 days out", async () => {
    const { token, expiresAt } = await createSession(userId);
    expect(token).toMatch(/^[a-z2-7]{32}$/);
    const diff = expiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(SESSION_DURATION_MS - 60_000);
    expect(diff).toBeLessThan(SESSION_DURATION_MS + 60_000);
  });

  it("validateSessionToken resolves to { user, session } for a fresh token", async () => {
    const { token } = await createSession(userId);
    const result = await validateSessionToken(token);
    expect(result.user?.id).toBe(userId);
    expect(result.session?.id).toBe(hashSessionToken(token));
  });

  it("validateSessionToken returns nulls for an unknown token", async () => {
    const result = await validateSessionToken("a".repeat(32));
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
  });

  it("invalidateSession deletes the row", async () => {
    const { token } = await createSession(userId);
    await invalidateSession(token);
    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
  });

  it("invalidateAllUserSessions clears every session for the user", async () => {
    const t1 = (await createSession(userId)).token;
    const t2 = (await createSession(userId)).token;
    await invalidateAllUserSessions(userId);
    expect((await validateSessionToken(t1)).user).toBeNull();
    expect((await validateSessionToken(t2)).user).toBeNull();
  });

  it("expired sessions resolve to null and are pruned", async () => {
    const { token } = await createSession(userId, { ttlMs: -1000 });
    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/sessions.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/sessions.ts`**

```ts
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Session, type User } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "./tokens";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew if <15 days left

export interface CreateSessionResult {
  token: string;
  session: Session;
  expiresAt: Date;
}

export interface CreateSessionOpts {
  ttlMs?: number;
  userAgent?: string;
  ipAddress?: string;
}

export async function createSession(
  userId: string,
  opts: CreateSessionOpts = {},
): Promise<CreateSessionResult> {
  const token = generateSessionToken();
  const id = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? SESSION_DURATION_MS));
  const [session] = await db()
    .insert(sessions)
    .values({
      id,
      userId,
      expiresAt,
      userAgent: opts.userAgent,
      ipAddress: opts.ipAddress,
    })
    .returning();
  return { token, session: session!, expiresAt };
}

export interface ValidateResult {
  user: User | null;
  session: Session | null;
}

export async function validateSessionToken(token: string): Promise<ValidateResult> {
  if (!token || !/^[a-z2-7]{32}$/.test(token)) return { user: null, session: null };
  const id = hashSessionToken(token);
  const rows = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  const row = rows[0];
  if (!row) return { user: null, session: null };

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return { user: null, session: null };
  }

  // Sliding renewal: if less than the threshold remains, extend.
  const msLeft = row.session.expiresAt.getTime() - Date.now();
  if (msLeft < RENEW_THRESHOLD_MS) {
    const newExpires = new Date(Date.now() + SESSION_DURATION_MS);
    const [updated] = await db()
      .update(sessions)
      .set({ expiresAt: newExpires })
      .where(eq(sessions.id, id))
      .returning();
    return { user: row.user, session: updated! };
  }
  return { user: row.user, session: row.session };
}

export async function invalidateSession(token: string): Promise<void> {
  const id = hashSessionToken(token);
  await db().delete(sessions).where(eq(sessions.id, id));
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions(): Promise<number> {
  const result = await db()
    .delete(sessions)
    .where(lt(sessions.expiresAt, sql`now()`))
    .returning({ id: sessions.id });
  return result.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/sessions.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/sessions.ts src/auth/sessions.test.ts
git commit -m "feat(auth): session create/validate/invalidate service"
```

---

## Task 6: Permissions matrix (TDD)

**Files:**

- Create: `src/auth/permissions.ts`
- Create: `src/auth/permissions.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, type ActorLike, type Action } from "./permissions";

function actor(role: ActorLike["role"], id = "user-1"): ActorLike {
  return { id, role };
}

const ALL_ROLES = ["owner", "admin", "editor", "author", "contributor", "subscriber"] as const;

describe("permissions matrix", () => {
  describe("manage:users", () => {
    it("allows owner and admin", () => {
      expect(can(actor("owner"), "manage:users")).toBe(true);
      expect(can(actor("admin"), "manage:users")).toBe(true);
    });
    it("denies others", () => {
      for (const r of ["editor", "author", "contributor", "subscriber"] as const) {
        expect(can(actor(r), "manage:users")).toBe(false);
      }
    });
  });

  describe("manage:themes / manage:plugins / manage:settings", () => {
    it.each(["manage:themes", "manage:plugins", "manage:settings"] as const)(
      "%s allowed only for owner+admin",
      (action) => {
        expect(can(actor("owner"), action)).toBe(true);
        expect(can(actor("admin"), action)).toBe(true);
        expect(can(actor("editor"), action)).toBe(false);
      },
    );
  });

  describe("publish:any-post", () => {
    it("allows owner, admin, editor", () => {
      expect(can(actor("owner"), "publish:any-post")).toBe(true);
      expect(can(actor("admin"), "publish:any-post")).toBe(true);
      expect(can(actor("editor"), "publish:any-post")).toBe(true);
    });
    it("denies author, contributor, subscriber", () => {
      expect(can(actor("author"), "publish:any-post")).toBe(false);
      expect(can(actor("contributor"), "publish:any-post")).toBe(false);
      expect(can(actor("subscriber"), "publish:any-post")).toBe(false);
    });
  });

  describe("publish:own-post", () => {
    it("allows owner, admin, editor, author on their own", () => {
      const u = actor("author", "user-1");
      const resource = { authorId: "user-1" };
      expect(can(u, "publish:own-post", resource)).toBe(true);
    });
    it("denies author on someone else's post", () => {
      const u = actor("author", "user-1");
      const resource = { authorId: "user-2" };
      expect(can(u, "publish:own-post", resource)).toBe(false);
    });
    it("denies contributor and subscriber even on their own", () => {
      expect(can(actor("contributor", "u1"), "publish:own-post", { authorId: "u1" })).toBe(false);
      expect(can(actor("subscriber", "u1"), "publish:own-post", { authorId: "u1" })).toBe(false);
    });
  });

  describe("edit:own-post (contributor allowed)", () => {
    it("contributor can edit their own draft", () => {
      expect(can(actor("contributor", "u1"), "edit:own-post", { authorId: "u1" })).toBe(true);
    });
    it("contributor cannot edit others", () => {
      expect(can(actor("contributor", "u1"), "edit:own-post", { authorId: "u2" })).toBe(false);
    });
  });

  describe("upload:media", () => {
    it("allows owner through author", () => {
      for (const r of ["owner", "admin", "editor", "author"] as const) {
        expect(can(actor(r), "upload:media")).toBe(true);
      }
    });
    it("denies contributor and subscriber", () => {
      expect(can(actor("contributor"), "upload:media")).toBe(false);
      expect(can(actor("subscriber"), "upload:media")).toBe(false);
    });
  });

  describe("moderate:comments", () => {
    it("allows owner, admin, editor", () => {
      for (const r of ["owner", "admin", "editor"] as const) {
        expect(can(actor(r), "moderate:comments")).toBe(true);
      }
    });
    it("denies the rest", () => {
      for (const r of ["author", "contributor", "subscriber"] as const) {
        expect(can(actor(r), "moderate:comments")).toBe(false);
      }
    });
  });

  describe("unknown action", () => {
    it("denies by default", () => {
      for (const r of ALL_ROLES) {
        // @ts-expect-error — testing runtime default-deny
        expect(can(actor(r), "do:something:undefined")).toBe(false);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/auth/permissions.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/permissions.ts`**

```ts
import type { Role } from "@/db/schema";

export type Action =
  | "manage:users"
  | "manage:themes"
  | "manage:plugins"
  | "manage:settings"
  | "publish:any-post"
  | "publish:own-post"
  | "edit:any-post"
  | "edit:own-post"
  | "delete:any-post"
  | "delete:own-post"
  | "upload:media"
  | "moderate:comments"
  | "read:protected-content"
  | "comment:create";

export interface ActorLike {
  id: string;
  role: Role;
}

interface OwnableResource {
  authorId: string;
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

function atLeast(actor: ActorLike, role: Role): boolean {
  return ROLE_RANK[actor.role] >= ROLE_RANK[role];
}

function owns(actor: ActorLike, resource?: OwnableResource): boolean {
  return !!resource && resource.authorId === actor.id;
}

export function can(actor: ActorLike, action: Action, resource?: OwnableResource): boolean {
  switch (action) {
    case "manage:users":
    case "manage:themes":
    case "manage:plugins":
    case "manage:settings":
      return atLeast(actor, "admin");

    case "publish:any-post":
    case "edit:any-post":
    case "delete:any-post":
    case "moderate:comments":
      return atLeast(actor, "editor");

    case "publish:own-post":
    case "delete:own-post":
      return atLeast(actor, "author") && (atLeast(actor, "editor") || owns(actor, resource));

    case "edit:own-post":
      return atLeast(actor, "contributor") && (atLeast(actor, "editor") || owns(actor, resource));

    case "upload:media":
      return atLeast(actor, "author");

    case "read:protected-content":
      return atLeast(actor, "subscriber");

    case "comment:create":
      return atLeast(actor, "subscriber");

    default:
      return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/auth/permissions.test.ts
```

Expected: all describe blocks pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/permissions.ts src/auth/permissions.test.ts
git commit -m "feat(auth): role-based permissions matrix"
```

---

## Task 7: Auth context helpers (TDD)

**Files:**

- Create: `src/auth/context.ts`
- Create: `src/auth/context.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/context.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/db/schema";

const mockCookies = vi.fn();
const mockValidate = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));
vi.mock("./sessions", () => ({
  validateSessionToken: (...args: unknown[]) => mockValidate(...args),
}));

const { getOptionalUser, requireUser, requireRole } = await import("./context");

const FAKE_USER: User = {
  id: "user-1",
  email: "x@example.com",
  displayName: "X",
  passwordHash: null,
  avatarUrl: null,
  role: "editor",
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => {
  mockCookies.mockReset();
  mockValidate.mockReset();
});

describe("getOptionalUser", () => {
  it("returns null when cookie is absent", async () => {
    mockCookies.mockReturnValue({ get: () => undefined });
    expect(await getOptionalUser()).toBeNull();
  });

  it("returns null when validation fails", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: null, session: null });
    expect(await getOptionalUser()).toBeNull();
  });

  it("returns the user when validation succeeds", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: FAKE_USER, session: {} });
    expect((await getOptionalUser())?.id).toBe("user-1");
  });
});

describe("requireUser", () => {
  it("throws AuthRequiredError when there is no user", async () => {
    mockCookies.mockReturnValue({ get: () => undefined });
    await expect(requireUser()).rejects.toThrow(/auth required/i);
  });

  it("returns the user otherwise", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: FAKE_USER, session: {} });
    const u = await requireUser();
    expect(u.id).toBe("user-1");
  });
});

describe("requireRole", () => {
  it("returns the user when role meets the minimum", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: { ...FAKE_USER, role: "admin" }, session: {} });
    const u = await requireRole("editor");
    expect(u.role).toBe("admin");
  });

  it("throws PermissionDeniedError when role is below the minimum", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: { ...FAKE_USER, role: "author" }, session: {} });
    await expect(requireRole("editor")).rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/auth/context.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/context.ts`**

```ts
import { cookies } from "next/headers";
import { validateSessionToken } from "./sessions";
import { SESSION_COOKIE_NAME } from "./cookies";
import type { Role, User } from "@/db/schema";

export class AuthRequiredError extends Error {
  constructor() {
    super("auth required");
    this.name = "AuthRequiredError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(required: Role, actual: Role) {
    super(`permission denied: requires ${required}, actor is ${actual}`);
    this.name = "PermissionDeniedError";
  }
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export async function getOptionalUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const { user } = await validateSessionToken(token);
  return user;
}

export async function requireUser(): Promise<User> {
  const u = await getOptionalUser();
  if (!u) throw new AuthRequiredError();
  return u;
}

export async function requireRole(minimum: Role): Promise<User> {
  const u = await requireUser();
  if (ROLE_RANK[u.role] < ROLE_RANK[minimum]) {
    throw new PermissionDeniedError(minimum, u.role);
  }
  return u;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/auth/context.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/context.ts src/auth/context.test.ts
git commit -m "feat(auth): getOptionalUser / requireUser / requireRole helpers"
```

---

## Task 8: Email adapter (TDD)

**Files:**

- Create: `src/auth/email.ts`
- Create: `src/auth/email.test.ts`

> Minimal Resend wrapper used by magic-link + password-reset. When `RESEND_API_KEY` is unset (dev/test), emails are logged via the foundation logger and the call resolves immediately. Future sub-plans extend this for transactional notifications.

- [ ] **Step 1: Add dependency**

```bash
pnpm add resend@4
```

- [ ] **Step 2: Write failing tests**

`src/auth/email.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));

const logs: string[] = [];
vi.mock("@/lib/logger", () => ({
  logger: () => ({
    info: (obj: object, msg: string) => logs.push(`info:${JSON.stringify(obj)}:${msg}`),
    warn: (obj: object, msg: string) => logs.push(`warn:${JSON.stringify(obj)}:${msg}`),
    error: (obj: object, msg: string) => logs.push(`error:${JSON.stringify(obj)}:${msg}`),
  }),
}));

beforeEach(() => {
  logs.length = 0;
  send.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("logs the email instead of sending when RESEND_API_KEY is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(send).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes("email:dry-run"))).toBe(true);
  });

  it("calls Resend.emails.send when key is present", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.com");
    send.mockResolvedValue({ data: { id: "msg-1" }, error: null });
    vi.resetModules();
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(send).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    send.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.resetModules();
    const { sendEmail } = await import("./email");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", html: "x", text: "x" }),
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/auth/email.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement `src/auth/email.ts`**

```ts
import { Resend } from "resend";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let cachedClient: Resend | undefined;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const client = getClient();
  if (!client) {
    logger().info({ to: msg.to, subject: msg.subject }, "email:dry-run (no RESEND_API_KEY set)");
    return;
  }
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  const result = await client.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  if (result.error) {
    logger().error({ err: result.error, to: msg.to }, "email:send-failed");
    throw new Error(`email send failed: ${result.error.message}`);
  }
  logger().info({ to: msg.to, id: result.data?.id }, "email:sent");
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/auth/email.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/auth/email.ts src/auth/email.test.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): Resend-backed email adapter with dev dry-run"
```

---

## Task 9: User CRUD orchestration (TDD)

**Files:**

- Create: `src/auth/users.ts`
- Create: `src/auth/users.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/users.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { createUser, findUserByEmail, verifyCredentials, countOwners } from "./users";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanup: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanup) {
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  }
  await closeDb();
});

describe.runIf(HAS_DB)("user orchestration", () => {
  it("createUser stores a hashed password and lowercased email", async () => {
    const u = await createUser({
      email: "  TestUser@Example.com  ",
      password: "correct horse battery",
      displayName: "Test User",
    });
    cleanup.push(u.id);
    expect(u.email).toBe("testuser@example.com");
    expect(u.passwordHash).not.toBeNull();
    expect(u.passwordHash!.startsWith("$argon2id$")).toBe(true);
  });

  it("createUser rejects duplicate email (case-insensitive)", async () => {
    const u = await createUser({
      email: `dup-${Date.now()}@example.com`,
      password: "correct horse battery",
      displayName: "Dup",
    });
    cleanup.push(u.id);
    await expect(
      createUser({
        email: u.email.toUpperCase(),
        password: "correct horse battery",
        displayName: "Dup2",
      }),
    ).rejects.toThrow(/already in use/i);
  });

  it("findUserByEmail is case-insensitive and trims", async () => {
    const email = `find-${Date.now()}@example.com`;
    const u = await createUser({ email, password: "correct horse battery", displayName: "F" });
    cleanup.push(u.id);
    expect((await findUserByEmail(` ${email.toUpperCase()} `))?.id).toBe(u.id);
  });

  it("verifyCredentials returns the user on correct password", async () => {
    const email = `v-${Date.now()}@example.com`;
    const u = await createUser({
      email,
      password: "correct horse battery",
      displayName: "V",
    });
    cleanup.push(u.id);
    expect((await verifyCredentials(email, "correct horse battery"))?.id).toBe(u.id);
  });

  it("verifyCredentials returns null on wrong password", async () => {
    const email = `w-${Date.now()}@example.com`;
    const u = await createUser({
      email,
      password: "correct horse battery",
      displayName: "W",
    });
    cleanup.push(u.id);
    expect(await verifyCredentials(email, "wrong wrong wrong")).toBeNull();
  });

  it("verifyCredentials returns null for OAuth-only users (no password)", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `oauth-${Date.now()}@example.com`,
        displayName: "OAuth",
        passwordHash: null,
      })
      .returning();
    cleanup.push(u!.id);
    expect(await verifyCredentials(u!.email, "anything anything")).toBeNull();
  });

  it("countOwners returns the number of owner-role users", async () => {
    const before = await countOwners();
    const [u] = await db()
      .insert(users)
      .values({
        email: `owner-${Date.now()}@example.com`,
        displayName: "O",
        role: "owner",
      })
      .returning();
    cleanup.push(u!.id);
    expect(await countOwners()).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/users.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/users.ts`**

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";
import { hashPassword, verifyPassword } from "./passwords";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role?: Role;
}

export class EmailInUseError extends Error {
  constructor() {
    super("email already in use");
    this.name = "EmailInUseError";
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) throw new EmailInUseError();
  const passwordHash = await hashPassword(input.password);
  const [row] = await db()
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      role: input.role ?? "subscriber",
    })
    .returning();
  return row!;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const e = normalizeEmail(email);
  const rows = await db().select().from(users).where(eq(users.email, e));
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.id, id));
  return rows[0] ?? null;
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) return null;
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

export async function countOwners(): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "owner"));
  return rows[0]?.n ?? 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/users.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/users.ts src/auth/users.test.ts
git commit -m "feat(auth): user CRUD orchestration (create/find/verify/countOwners)"
```

---

## Task 10: Sign-up / sign-in / sign-out Server Actions (TDD)

**Files:**

- Create: `src/app/actions/auth.ts`
- Create: `src/app/actions/auth.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/actions/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setCookie = vi.fn();
const deleteCookie = vi.fn();
const getCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: (...args: unknown[]) => setCookie(...args),
    delete: (...args: unknown[]) => deleteCookie(...args),
    get: (...args: unknown[]) => getCookie(...args),
  }),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const createSession = vi.fn();
const invalidateSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
  invalidateSession: (...a: unknown[]) => invalidateSession(...a),
  SESSION_DURATION_MS: 1000 * 60 * 60 * 24 * 30,
}));

const createUser = vi.fn();
const verifyCredentials = vi.fn();
const countOwners = vi.fn();
vi.mock("@/auth/users", () => ({
  createUser: (...a: unknown[]) => createUser(...a),
  verifyCredentials: (...a: unknown[]) => verifyCredentials(...a),
  countOwners: () => countOwners(),
  EmailInUseError: class extends Error {
    constructor() {
      super("email already in use");
    }
  },
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://example.com");
});

afterEach(() => {
  setCookie.mockReset();
  deleteCookie.mockReset();
  getCookie.mockReset();
  redirect.mockReset();
  createSession.mockReset();
  invalidateSession.mockReset();
  createUser.mockReset();
  verifyCredentials.mockReset();
  countOwners.mockReset();
  vi.unstubAllEnvs();
});

const { signUpAction, signInAction, signOutAction } = await import("./auth");

function formData(input: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(input)) fd.append(k, v);
  return fd;
}

describe("signUpAction", () => {
  it("rejects when /setup hasn't finished (no owner yet)", async () => {
    countOwners.mockResolvedValue(0);
    const result = await signUpAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery", displayName: "X" }),
    );
    expect(result.error).toMatch(/setup/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates a subscriber, opens a session, sets the cookie, redirects", async () => {
    countOwners.mockResolvedValue(1);
    createUser.mockResolvedValue({ id: "u-1", email: "x@example.com", role: "subscriber" });
    createSession.mockResolvedValue({
      token: "t-1",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    await signUpAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery", displayName: "X" }),
    );
    expect(createUser).toHaveBeenCalledWith({
      email: "x@example.com",
      password: "correct horse battery",
      displayName: "X",
      role: "subscriber",
    });
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "slate_session", value: "t-1", secure: true }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns field errors for invalid input", async () => {
    countOwners.mockResolvedValue(1);
    const result = await signUpAction(
      undefined,
      formData({ email: "not-an-email", password: "short", displayName: "" }),
    );
    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
    expect(result.fieldErrors?.displayName).toBeDefined();
  });
});

describe("signInAction", () => {
  it("returns generic error for unknown email or wrong password", async () => {
    verifyCredentials.mockResolvedValue(null);
    const result = await signInAction(
      undefined,
      formData({ email: "x@example.com", password: "any password ok" }),
    );
    expect(result.error).toMatch(/invalid email or password/i);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("opens a session and redirects on success", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1", role: "editor" });
    createSession.mockResolvedValue({
      token: "t-2",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery" }),
    );
    expect(setCookie).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("honors `redirectTo` when safe (same-origin path)", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1" });
    createSession.mockResolvedValue({
      token: "t-3",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({
        email: "x@example.com",
        password: "correct horse battery",
        redirectTo: "/admin/posts",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/admin/posts");
  });

  it("rejects redirectTo that is not a local path", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1" });
    createSession.mockResolvedValue({
      token: "t-4",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({
        email: "x@example.com",
        password: "correct horse battery",
        redirectTo: "https://evil.example.com",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("signOutAction", () => {
  it("invalidates the session, clears the cookie, redirects", async () => {
    getCookie.mockReturnValue({ value: "t-9" });
    await signOutAction();
    expect(invalidateSession).toHaveBeenCalledWith("t-9");
    expect(deleteCookie).toHaveBeenCalledWith("slate_session");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("is a no-op when there is no session cookie", async () => {
    getCookie.mockReturnValue(undefined);
    await signOutAction();
    expect(invalidateSession).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/app/actions/auth.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/app/actions/auth.ts`**

```ts
"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, invalidateSession, SESSION_DURATION_MS } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";
import { EmailInUseError, countOwners, createUser, verifyCredentials } from "@/auth/users";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const signUpSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  displayName: z.string().trim().min(2, "Display name is required"),
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  redirectTo: z.string().optional(),
});

function isSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export async function signUpAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const ownersBefore = await countOwners();
  if (ownersBefore === 0) {
    return { error: "Setup is incomplete. Visit /setup first." };
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors };
  }

  try {
    const user = await createUser({ ...parsed.data, role: "subscriber" });
    const { token, expiresAt } = await createSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isSecure(),
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch (err) {
    if (err instanceof EmailInUseError) return { error: "That email is already in use." };
    throw err;
  }
  redirect("/");
}

export async function signInAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return { error: "Invalid email or password." };
  const { token, expiresAt } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect(safeRedirect(parsed.data.redirectTo));
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME);
  if (existing?.value) {
    await invalidateSession(existing.value);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
  redirect("/");
}

// Referenced to ensure SESSION_DURATION_MS is exported in the right shape.
void SESSION_DURATION_MS;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/app/actions/auth.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/auth.ts src/app/actions/auth.test.ts
git commit -m "feat(auth): signUp / signIn / signOut Server Actions"
```

---

## Task 11: Magic link (request + verify)

**Files:**

- Create: `src/auth/magic-link.ts`
- Create: `src/auth/magic-link.test.ts`
- Create: `src/app/api/auth/magic-link/verify/route.ts`
- Create: `src/app/api/auth/magic-link/verify/route.test.ts`
- Modify: `src/app/actions/auth.ts` (add `requestMagicLinkAction`)

- [ ] **Step 1: Write failing tests for `magic-link.ts`**

`src/auth/magic-link.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

vi.stubEnv("APP_URL", "https://app.test");

const { issueMagicLink, consumeMagicLink, MAGIC_LINK_TTL_MS } = await import("./magic-link");

const HAS_DB = !!process.env.DATABASE_URL;
const userIds: string[] = [];

beforeEach(() => sendEmail.mockClear());

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of userIds)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("magic link", () => {
  it("issueMagicLink stores a hashed token and emails a URL", async () => {
    const email = `ml-${Date.now()}@example.com`;
    await issueMagicLink(email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0]![0] as { to: string; html: string };
    expect(args.to).toBe(email);
    expect(args.html).toContain("https://app.test/api/auth/magic-link/verify?token=");

    const rows = await db().select().from(magicLinkTokens).where(eq(magicLinkTokens.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedAt).toBeNull();
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(MAGIC_LINK_TTL_MS - 60_000);
  });

  it("consumeMagicLink creates a user if missing, returns it, and marks token used", async () => {
    const email = `ml2-${Date.now()}@example.com`;
    await issueMagicLink(email);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    const tokenMatch = html.match(/verify\?token=([a-z2-7]{40})/);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch![1]!;

    const result = await consumeMagicLink(token);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      userIds.push(result.user.id);
      expect(result.user.email).toBe(email);
    }
  });

  it("consumeMagicLink rejects a reused token", async () => {
    const email = `ml3-${Date.now()}@example.com`;
    await issueMagicLink(email);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    const token = html.match(/verify\?token=([a-z2-7]{40})/)![1]!;
    const first = await consumeMagicLink(token);
    if (first.kind === "ok") userIds.push(first.user.id);
    const second = await consumeMagicLink(token);
    expect(second.kind).toBe("error");
  });

  it("consumeMagicLink rejects an unknown token", async () => {
    const result = await consumeMagicLink("a".repeat(40));
    expect(result.kind).toBe("error");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/magic-link.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/auth/magic-link.ts`**

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { magicLinkTokens, users, type User } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { sendEmail } from "./email";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function issueMagicLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await db().insert(magicLinkTokens).values({ tokenHash, email, expiresAt });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link/verify?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Sign in to Slate",
    text: `Click to sign in: ${url}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click to sign in: <a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
  });
}

export type ConsumeResult =
  | { kind: "ok"; user: User; wasCreated: boolean }
  | { kind: "error"; reason: "unknown" | "expired" | "used" };

export async function consumeMagicLink(token: string): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);

  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const token = rows[0];
    if (!token) return { kind: "error", reason: "unknown" } as const;
    if (token.usedAt) return { kind: "error", reason: "used" } as const;
    if (token.expiresAt.getTime() < Date.now())
      return { kind: "error", reason: "expired" } as const;

    await tx
      .update(magicLinkTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(magicLinkTokens.tokenHash, tokenHash));

    const existing = await tx.select().from(users).where(eq(users.email, token.email));
    if (existing[0]) {
      await tx
        .update(users)
        .set({ emailVerifiedAt: sql`now()` })
        .where(eq(users.id, existing[0].id));
      return { kind: "ok", user: existing[0], wasCreated: false } as const;
    }

    const displayName = token.email.split("@")[0]!;
    const [created] = await tx
      .insert(users)
      .values({
        email: token.email,
        displayName,
        role: "subscriber",
        emailVerifiedAt: sql`now()`,
      })
      .returning();
    return { kind: "ok", user: created!, wasCreated: true } as const;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/magic-link.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Add `requestMagicLinkAction` to `src/app/actions/auth.ts`**

Append:

```ts
import { issueMagicLink } from "@/auth/magic-link";

const requestMagicLinkSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export async function requestMagicLinkAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestMagicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]!.message } };
  }
  await issueMagicLink(parsed.data.email);
  redirect("/magic-link/sent");
}
```

- [ ] **Step 6: Write failing test for the verify route**

`src/app/api/auth/magic-link/verify/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const consumeMagicLink = vi.fn();
vi.mock("@/auth/magic-link", () => ({
  consumeMagicLink: (...a: unknown[]) => consumeMagicLink(...a),
}));
const createSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));
const setCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ set: (...a: unknown[]) => setCookie(...a) }),
}));

const { GET } = await import("./route");

afterEach(() => {
  consumeMagicLink.mockReset();
  createSession.mockReset();
  setCookie.mockReset();
});

function req(url: string): Request {
  return new Request(url);
}

describe("GET /api/auth/magic-link/verify", () => {
  it("redirects to /magic-link/invalid when token is missing", async () => {
    const res = await GET(req("https://app.test/api/auth/magic-link/verify"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/magic-link/invalid");
  });

  it("redirects to /magic-link/invalid on consume error", async () => {
    consumeMagicLink.mockResolvedValue({ kind: "error", reason: "expired" });
    const res = await GET(req("https://app.test/api/auth/magic-link/verify?token=abc"));
    expect(res.headers.get("location")).toBe("/magic-link/invalid");
  });

  it("creates a session, sets cookie, redirects to / on success", async () => {
    consumeMagicLink.mockResolvedValue({
      kind: "ok",
      user: { id: "u-1" },
      wasCreated: false,
    });
    createSession.mockResolvedValue({
      token: "t-9",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    const res = await GET(req("https://app.test/api/auth/magic-link/verify?token=abc"));
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "slate_session", value: "t-9" }),
    );
    expect(res.headers.get("location")).toBe("/");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
pnpm test src/app/api/auth/magic-link
```

Expected: module-not-found failure.

- [ ] **Step 8: Implement the verify route**

`src/app/api/auth/magic-link/verify/route.ts`:

```ts
import { cookies } from "next/headers";
import { consumeMagicLink } from "@/auth/magic-link";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.redirect("/magic-link/invalid", 302);

  const result = await consumeMagicLink(token);
  if (result.kind !== "ok") return Response.redirect("/magic-link/invalid", 302);

  const { token: sessionToken, expiresAt } = await createSession(result.user.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return Response.redirect("/", 302);
}
```

- [ ] **Step 9: Run route test**

```bash
pnpm test src/app/api/auth/magic-link
```

Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add src/auth/magic-link.ts src/auth/magic-link.test.ts \
        src/app/actions/auth.ts \
        src/app/api/auth/magic-link
git commit -m "feat(auth): magic-link request + verify flow"
```

---

## Task 12: OAuth (Google + GitHub via Arctic)

**Files:**

- Create: `src/auth/oauth/index.ts`
- Create: `src/auth/oauth/google.ts`
- Create: `src/auth/oauth/github.ts`
- Create: `src/auth/oauth/oauth.test.ts`
- Create: `src/app/api/auth/oauth/[provider]/start/route.ts`
- Create: `src/app/api/auth/oauth/[provider]/callback/route.ts`
- Create: `src/app/api/auth/oauth/oauth.route.test.ts`

- [ ] **Step 1: Add dependency**

```bash
pnpm add arctic@2
```

- [ ] **Step 2: Implement provider configs**

`src/auth/oauth/google.ts`:

```ts
import { Google } from "arctic";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export function googleClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) return null;
  return new Google(
    clientId,
    clientSecret,
    `${appUrl.replace(/\/$/, "")}/api/auth/oauth/google/callback`,
  );
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google userinfo failed: ${res.status}`);
  return (await res.json()) as GoogleProfile;
}
```

`src/auth/oauth/github.ts`:

```ts
import { GitHub } from "arctic";

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export function githubClient() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new GitHub(clientId, clientSecret, null);
}

export async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "slate",
    },
  });
  if (!res.ok) throw new Error(`github user failed: ${res.status}`);
  return (await res.json()) as GitHubProfile;
}

export async function fetchPrimaryGitHubEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "slate",
    },
  });
  if (!res.ok) return null;
  const emails = (await res.json()) as GitHubEmail[];
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  return primary?.email ?? null;
}
```

- [ ] **Step 3: Implement `src/auth/oauth/index.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccounts, users, type User } from "@/db/schema";

export type Provider = "google" | "github";

export interface OAuthIdentity {
  provider: Provider;
  providerAccountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export async function upsertOAuthUser(identity: OAuthIdentity): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  return await db().transaction(async (tx) => {
    const linkRows = await tx
      .select({ user: users })
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(
        and(
          eq(oauthAccounts.provider, identity.provider),
          eq(oauthAccounts.providerAccountId, identity.providerAccountId),
        ),
      );
    if (linkRows[0]) return linkRows[0].user;

    const existing = await tx.select().from(users).where(eq(users.email, email));
    if (existing[0]) {
      await tx.insert(oauthAccounts).values({
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        userId: existing[0].id,
      });
      return existing[0];
    }

    const [created] = await tx
      .insert(users)
      .values({
        email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl ?? null,
        role: "subscriber",
      })
      .returning();
    await tx.insert(oauthAccounts).values({
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      userId: created!.id,
    });
    return created!;
  });
}
```

- [ ] **Step 4: Write tests for `upsertOAuthUser`**

`src/auth/oauth/oauth.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { users, oauthAccounts } from "@/db/schema";
import { sql } from "drizzle-orm";
import { upsertOAuthUser } from ".";

const HAS_DB = !!process.env.DATABASE_URL;
const userIds: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of userIds)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("upsertOAuthUser", () => {
  it("creates a new user when neither link nor email match", async () => {
    const email = `oauth-new-${Date.now()}@example.com`;
    const u = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-${Date.now()}`,
      email,
      displayName: "G",
    });
    userIds.push(u.id);
    expect(u.email).toBe(email);
  });

  it("returns the linked user on second sign-in", async () => {
    const providerAccountId = `g-link-${Date.now()}`;
    const email = `oauth-link-${Date.now()}@example.com`;
    const first = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "G",
    });
    userIds.push(first.id);
    const second = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "G",
    });
    expect(second.id).toBe(first.id);
  });

  it("links to an existing email-matching user", async () => {
    const email = `oauth-existing-${Date.now()}@example.com`;
    const [existing] = await db()
      .insert(users)
      .values({ email, displayName: "Existing" })
      .returning();
    userIds.push(existing!.id);

    const linked = await upsertOAuthUser({
      provider: "github",
      providerAccountId: `gh-${Date.now()}`,
      email,
      displayName: "GH",
    });
    expect(linked.id).toBe(existing!.id);
    const links = await db()
      .select()
      .from(oauthAccounts)
      .where(sql`${oauthAccounts.userId} = ${existing!.id}`);
    expect(links).toHaveLength(1);
    expect(links[0]!.provider).toBe("github");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/oauth/oauth.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Implement the start route**

`src/app/api/auth/oauth/[provider]/start/route.ts`:

```ts
import { generateState, generateCodeVerifier } from "arctic";
import { cookies } from "next/headers";
import { googleClient } from "@/auth/oauth/google";
import { githubClient } from "@/auth/oauth/github";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE_PREFIX = "slate_oauth_state_";
const PKCE_COOKIE_PREFIX = "slate_oauth_pkce_";
const STATE_TTL_SEC = 600;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const state = generateState();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  if (provider === "google") {
    const client = googleClient();
    if (!client) return new Response("google not configured", { status: 501 });
    const codeVerifier = generateCodeVerifier();
    const url = client.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
    cookieStore.set({
      name: `${STATE_COOKIE_PREFIX}google`,
      value: state,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    cookieStore.set({
      name: `${PKCE_COOKIE_PREFIX}google`,
      value: codeVerifier,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    return Response.redirect(url.toString(), 302);
  }

  if (provider === "github") {
    const client = githubClient();
    if (!client) return new Response("github not configured", { status: 501 });
    const url = client.createAuthorizationURL(state, ["read:user", "user:email"]);
    cookieStore.set({
      name: `${STATE_COOKIE_PREFIX}github`,
      value: state,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    return Response.redirect(url.toString(), 302);
  }

  return new Response("unknown provider", { status: 404 });
}
```

- [ ] **Step 7: Implement the callback route**

`src/app/api/auth/oauth/[provider]/callback/route.ts`:

```ts
import { cookies } from "next/headers";
import { OAuth2RequestError } from "arctic";
import { googleClient, fetchGoogleProfile } from "@/auth/oauth/google";
import { githubClient, fetchGitHubProfile, fetchPrimaryGitHubEmail } from "@/auth/oauth/github";
import { upsertOAuthUser } from "@/auth/oauth";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE_PREFIX = "slate_oauth_state_";
const PKCE_COOKIE_PREFIX = "slate_oauth_pkce_";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(`${STATE_COOKIE_PREFIX}${provider}`)?.value;
  if (!code || !stateFromQuery || !expectedState || stateFromQuery !== expectedState) {
    return new Response("invalid oauth state", { status: 400 });
  }

  try {
    if (provider === "google") {
      const client = googleClient();
      const codeVerifier = cookieStore.get(`${PKCE_COOKIE_PREFIX}google`)?.value;
      if (!client || !codeVerifier) return new Response("google not configured", { status: 501 });
      const tokens = await client.validateAuthorizationCode(code, codeVerifier);
      const profile = await fetchGoogleProfile(tokens.accessToken());
      if (!profile.email_verified) return new Response("email not verified", { status: 400 });
      const user = await upsertOAuthUser({
        provider: "google",
        providerAccountId: profile.sub,
        email: profile.email,
        displayName: profile.name ?? profile.email.split("@")[0]!,
        avatarUrl: profile.picture,
      });
      await setSessionAndRedirect(user.id);
    } else if (provider === "github") {
      const client = githubClient();
      if (!client) return new Response("github not configured", { status: 501 });
      const tokens = await client.validateAuthorizationCode(code);
      const profile = await fetchGitHubProfile(tokens.accessToken());
      const email = await fetchPrimaryGitHubEmail(tokens.accessToken());
      if (!email) return new Response("no verified email on github account", { status: 400 });
      const user = await upsertOAuthUser({
        provider: "github",
        providerAccountId: String(profile.id),
        email,
        displayName: profile.name ?? profile.login,
        avatarUrl: profile.avatar_url ?? undefined,
      });
      await setSessionAndRedirect(user.id);
    } else {
      return new Response("unknown provider", { status: 404 });
    }
  } catch (err) {
    if (err instanceof OAuth2RequestError)
      return new Response("oauth exchange failed", { status: 400 });
    throw err;
  }

  cookieStore.delete(`${STATE_COOKIE_PREFIX}${provider}`);
  cookieStore.delete(`${PKCE_COOKIE_PREFIX}${provider}`);
  return Response.redirect("/", 302);
}

async function setSessionAndRedirect(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
```

- [ ] **Step 8: Test the routes**

`src/app/api/auth/oauth/oauth.route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/oauth/google", () => ({
  googleClient: () => null,
  fetchGoogleProfile: vi.fn(),
}));
vi.mock("@/auth/oauth/github", () => ({
  githubClient: () => null,
  fetchGitHubProfile: vi.fn(),
  fetchPrimaryGitHubEmail: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ set: vi.fn(), get: () => undefined, delete: vi.fn() }),
}));

const start = (await import("../../api/auth/oauth/[provider]/start/route")).GET;

afterEach(() => vi.clearAllMocks());

describe("oauth start route", () => {
  it("returns 501 when provider is not configured", async () => {
    const res = await start(new Request("https://app.test/api/auth/oauth/google/start"), {
      params: Promise.resolve({ provider: "google" }),
    });
    expect(res.status).toBe(501);
  });

  it("returns 404 for unknown provider", async () => {
    const res = await start(new Request("https://app.test/api/auth/oauth/foo/start"), {
      params: Promise.resolve({ provider: "foo" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 9: Run tests**

```bash
pnpm test src/auth/oauth src/app/api/auth/oauth
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/auth/oauth src/app/api/auth/oauth package.json pnpm-lock.yaml
git commit -m "feat(auth): Google + GitHub OAuth via arctic with PKCE/state cookies"
```

---

## Task 13: First-run `/setup` wizard

**Files:**

- Create: `src/app/setup/page.tsx`
- Create: `src/app/setup/actions.ts`
- Create: `src/app/setup/actions.test.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Write failing tests for setup actions**

`src/app/setup/actions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const countOwners = vi.fn();
const createUser = vi.fn();
vi.mock("@/auth/users", () => ({
  countOwners: () => countOwners(),
  createUser: (...a: unknown[]) => createUser(...a),
}));

const createSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));

const setCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ set: (...a: unknown[]) => setCookie(...a) }),
}));

const upsertSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  upsertSetting: (...a: unknown[]) => upsertSetting(...a),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const { runSetupAction } = await import("./actions");

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe("runSetupAction", () => {
  it("refuses when an owner already exists", async () => {
    countOwners.mockResolvedValue(1);
    const result = await runSetupAction(
      undefined,
      fd({
        siteTitle: "S",
        siteTagline: "t",
        defaultLocale: "en",
        email: "x@example.com",
        password: "correct horse battery",
        displayName: "X",
      }),
    );
    expect(result.error).toMatch(/already complete/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates owner, persists settings, opens session", async () => {
    countOwners.mockResolvedValue(0);
    createUser.mockResolvedValue({ id: "owner-1", role: "owner" });
    createSession.mockResolvedValue({
      token: "t-7",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await runSetupAction(
      undefined,
      fd({
        siteTitle: "My Site",
        siteTagline: "Hello",
        defaultLocale: "en",
        email: "owner@example.com",
        password: "correct horse battery",
        displayName: "Owner",
      }),
    );
    expect(createUser).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct horse battery",
      displayName: "Owner",
      role: "owner",
    });
    expect(upsertSetting).toHaveBeenCalledWith("site.title", "My Site");
    expect(upsertSetting).toHaveBeenCalledWith("site.tagline", "Hello");
    expect(upsertSetting).toHaveBeenCalledWith("site.defaultLocale", "en");
    expect(upsertSetting).toHaveBeenCalledWith("setup.completed", true);
    expect(setCookie).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns field errors for invalid input", async () => {
    countOwners.mockResolvedValue(0);
    const result = await runSetupAction(
      undefined,
      fd({
        siteTitle: "",
        siteTagline: "",
        defaultLocale: "en",
        email: "not-email",
        password: "short",
        displayName: "",
      }),
    );
    expect(result.fieldErrors?.siteTitle).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
    expect(result.fieldErrors?.displayName).toBeDefined();
  });
});
```

- [ ] **Step 2: Create a small `lib/settings.ts` helper**

`src/lib/settings.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function upsertSetting<T>(key: string, value: T): Promise<void> {
  await db()
    .insert(settings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as object, updatedAt: sql`now()` },
    });
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db().select().from(settings).where(eq(settings.key, key));
  return (rows[0]?.value as T | undefined) ?? null;
}

export async function isSetupComplete(): Promise<boolean> {
  return (await getSetting<boolean>("setup.completed")) === true;
}
```

- [ ] **Step 3: Run setup tests — expect module-not-found for `actions`**

```bash
pnpm test src/app/setup/actions.test.ts
```

- [ ] **Step 4: Implement `src/app/setup/actions.ts`**

```ts
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { countOwners, createUser } from "@/auth/users";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";
import { upsertSetting } from "@/lib/settings";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({
  siteTitle: z.string().trim().min(1, "Site title is required"),
  siteTagline: z.string().trim().default(""),
  defaultLocale: z.string().trim().min(2).default("en"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  displayName: z.string().trim().min(2, "Display name is required"),
});

export async function runSetupAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if ((await countOwners()) > 0) {
    return { error: "Setup is already complete." };
  }

  const parsed = schema.safeParse({
    siteTitle: formData.get("siteTitle"),
    siteTagline: formData.get("siteTagline"),
    defaultLocale: formData.get("defaultLocale"),
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors };
  }

  const owner = await createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
    role: "owner",
  });

  await upsertSetting("site.title", parsed.data.siteTitle);
  await upsertSetting("site.tagline", parsed.data.siteTagline);
  await upsertSetting("site.defaultLocale", parsed.data.defaultLocale);
  await upsertSetting("setup.completed", true);

  const { token, expiresAt } = await createSession(owner.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect("/");
}
```

- [ ] **Step 5: Re-run setup tests**

```bash
pnpm test src/app/setup/actions.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Implement the setup page** (`src/app/setup/page.tsx`)

```tsx
import { redirect } from "next/navigation";
import { countOwners } from "@/auth/users";
import { runSetupAction } from "./actions";

export default async function SetupPage() {
  if ((await countOwners()) > 0) redirect("/sign-in");
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Welcome to Slate</h1>
      <p className="mt-2 text-gray-600">Set up your site and create the owner account.</p>

      <form action={runSetupAction} className="mt-6 grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-gray-700">Site</legend>
          <input
            name="siteTitle"
            placeholder="Site title"
            className="rounded border p-2"
            required
          />
          <input
            name="siteTagline"
            placeholder="Tagline (optional)"
            className="rounded border p-2"
          />
          <input
            name="defaultLocale"
            defaultValue="en"
            placeholder="Default locale (e.g. en)"
            className="rounded border p-2"
          />
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-gray-700">Owner</legend>
          <input
            name="displayName"
            placeholder="Your name"
            className="rounded border p-2"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="rounded border p-2"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password (12+ chars)"
            className="rounded border p-2"
            required
          />
        </fieldset>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Create site
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Create middleware that redirects to `/setup` when no owner exists**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

const ALLOW_DURING_SETUP = ["/setup", "/api/healthz", "/api/readyz", "/_next", "/favicon.ico"];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (ALLOW_DURING_SETUP.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Hot path: bypass middleware for static assets without DB hits.
  if (pathname.startsWith("/_next") || pathname.includes(".")) return NextResponse.next();

  const setupRes = await fetch(new URL("/api/setup-status", req.url), {
    headers: { "x-internal": "1" },
  });
  if (setupRes.ok) {
    const { completed } = (await setupRes.json()) as { completed: boolean };
    if (!completed) return NextResponse.redirect(new URL("/setup", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 8: Implement the setup-status helper route**

`src/app/api/setup-status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ completed: await isSetupComplete() });
}
```

- [ ] **Step 9: Commit**

```bash
git add src/app/setup src/app/api/setup-status src/lib/settings.ts src/middleware.ts
git commit -m "feat(auth): first-run /setup wizard + setup-status middleware"
```

---

## Task 14: Auth UI pages

**Files:**

- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/sign-in/page.tsx`
- Create: `src/app/(auth)/sign-up/page.tsx`
- Create: `src/app/(auth)/magic-link/page.tsx`
- Create: `src/app/(auth)/magic-link/sent/page.tsx`
- Create: `src/app/(auth)/magic-link/invalid/page.tsx`

> These pages are minimal — `posts-taxonomies-comments` / `themes` sub-plans replace them with theme-driven UI later. Goal here: working forms that exercise every Server Action wired up above.

- [ ] **Step 1: Create `src/app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white p-4">
        <h1 className="text-lg font-semibold">Slate</h1>
      </header>
      <main className="mx-auto max-w-md p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(auth)/sign-in/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Sign in</h2>
      <form action={action} className="mt-6 grid gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        <Link href="/magic-link">Sign in via magic link</Link> ·{" "}
        <Link href="/sign-up">Create account</Link>
      </p>
      <div className="mt-6 grid gap-2">
        {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
          <a className="rounded border px-4 py-2 text-center" href="/api/auth/oauth/google/start">
            Continue with Google
          </a>
        )}
        {process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1" && (
          <a className="rounded border px-4 py-2 text-center" href="/api/auth/oauth/github/start">
            Continue with GitHub
          </a>
        )}
      </div>
    </section>
  );
}
```

> The `NEXT_PUBLIC_OAUTH_*_ENABLED` env vars are mirrored from the server-side config by the build (declared in `next.config.ts` via an `env` block). Add them now:

Modify `next.config.ts` to inject:

```ts
const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { typedRoutes: true },
  env: {
    NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED: process.env.GOOGLE_OAUTH_CLIENT_ID ? "1" : "0",
    NEXT_PUBLIC_OAUTH_GITHUB_ENABLED: process.env.GITHUB_OAUTH_CLIENT_ID ? "1" : "0",
  },
};
```

- [ ] **Step 3: Create `src/app/(auth)/sign-up/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Create account</h2>
      <form action={action} className="mt-6 grid gap-3">
        <div>
          <input
            name="displayName"
            placeholder="Your name"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.displayName && (
            <p className="text-sm text-red-600">{state.fieldErrors.displayName}</p>
          )}
        </div>
        <div>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.email && (
            <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
          )}
        </div>
        <div>
          <input
            name="password"
            type="password"
            placeholder="Password (12+ chars)"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.password && (
            <p className="text-sm text-red-600">{state.fieldErrors.password}</p>
          )}
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Create magic-link request page**

`src/app/(auth)/magic-link/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { requestMagicLinkAction } from "@/app/actions/auth";

export default function MagicLinkPage() {
  const [state, action, pending] = useActionState(requestMagicLinkAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Sign in via magic link</h2>
      <p className="mt-2 text-sm text-gray-600">
        We&apos;ll email you a link that signs you in. No password required.
      </p>
      <form action={action} className="mt-6 grid gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border p-2"
        />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
        )}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </section>
  );
}
```

`src/app/(auth)/magic-link/sent/page.tsx`:

```tsx
export default function MagicLinkSentPage() {
  return (
    <section>
      <h2 className="text-2xl font-bold">Check your inbox</h2>
      <p className="mt-2 text-gray-600">
        If we recognise your email, you&apos;ll get a sign-in link in the next minute. It expires in
        15 minutes.
      </p>
    </section>
  );
}
```

`src/app/(auth)/magic-link/invalid/page.tsx`:

```tsx
import Link from "next/link";

export default function MagicLinkInvalidPage() {
  return (
    <section>
      <h2 className="text-2xl font-bold">That link didn&apos;t work</h2>
      <p className="mt-2 text-gray-600">It may have expired or already been used.</p>
      <p className="mt-4">
        <Link href="/magic-link" className="underline">
          Request a new link
        </Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Manual smoke**

```bash
set -a; source .env.local; set +a
pnpm dev
```

- Open <http://localhost:3000>. Middleware should redirect to `/setup`.
- Complete the wizard with `owner@example.com` / 12+ char password.
- After redirect to `/`, the cookie is set; refreshing should not bounce to `/setup`.
- Visit `/sign-up` and create a subscriber.
- Sign out via a temporary button (or `document.cookie = "slate_session=; Max-Age=0; Path=/"` in devtools).
- Visit `/sign-in` and sign back in.
- Visit `/magic-link`, enter an email, observe the magic link URL in the terminal logs (dry-run mode without `RESEND_API_KEY`). Paste the URL in the browser to complete sign-in.
- Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)" next.config.ts
git commit -m "feat(auth): sign-in / sign-up / magic-link UI pages"
```

---

## Task 15: Final integration check

> No code changes — exercise the full system end-to-end.

- [ ] **Step 1: From a clean DB**

```bash
docker compose down -v
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
```

Expected: all pass.

- [ ] **Step 2: Manual smoke as in Task 14 Step 5**

- [ ] **Step 3: Container smoke**

```bash
docker build -t wpk:auth .
docker run --rm -d --name wpk-auth -p 8080:8080 --network=host \
  -e DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk \
  -e NODE_ENV=production \
  -e AUTH_SECRET=$(openssl rand -hex 32) \
  -e APP_URL=https://app.test \
  -e LOG_LEVEL=info \
  wpk:auth
sleep 3
curl -fs http://localhost:8080/api/healthz | jq
curl -fs http://localhost:8080/api/readyz  | jq
docker stop wpk-auth
```

Expected: probes return success.

- [ ] **Step 4: Tag the auth milestone**

```bash
git tag -a v0.2.0-auth -m "Auth complete: sessions, passwords, OAuth, magic link, permissions, /setup"
```

- [ ] **Step 5: Verify invariants for downstream sub-plans**

1. `requireUser()` returns the current `User` or throws `AuthRequiredError` in Server Components and Server Actions.
2. `requireRole(minimum)` is the canonical guard for protected admin surfaces.
3. `can(actor, action, resource?)` is the pure-function authorization check used inside guards once the action is known.
4. New tables can FK to `users.id` with `onDelete: "cascade"` — `block-editor-core` will use this for `pages.authorId`.
5. `setup.completed` setting is the gate that downstream middleware (admin shell, public renderer) can also consult.
6. OAuth providers fall back gracefully when client IDs are absent (501 from start route, hidden buttons in UI).

---

## Out of Scope (Handled by Sibling Sub-Plans)

| Sub-plan                         | What it adds on top of auth                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **block-editor-core**            | Admin shell, header with user menu + sign-out, requires editor role on `/admin/*`.                     |
| **media-library**                | `uploaded_by` FK to `users.id`; uses `can(user, "upload:media")` guard.                                |
| **themes**                       | Customization screens require `manage:themes`.                                                         |
| **ai-features**                  | Uses `requireUser` on Server Actions; `ai_usage` rows reference `user_id`.                             |
| **plugin-system**                | Plugin install requires `manage:plugins`.                                                              |
| **importers / exporter-backups** | Require `manage:settings`.                                                                             |
| **deployment-hardening**         | Adds rate limiting on `/api/auth/*` routes via Cloud Memorystore; backup automation for `users` table. |

---

## Open Items Deferred to a Polish Sub-Plan

- **Password reset flow** — schema is in place (`password_reset_tokens`), but the request/verify UI + Server Actions are deferred to a small follow-up plan once block-editor-core lands and we have the admin shell to host the "change password" surface.
- **Email verification gating** — v1 lets you sign up and sign in immediately. Sub-plan to add the verification gate (and resend-verification flow) lands together with the password-reset plan.
- **2FA / WebAuthn** — explicitly out of v1; add as a plugin in v2.
- **Account lockout / brute-force protection** — rate limiting at the route level lands in `deployment-hardening`; per-user lockout is v2.

---

_End of auth-and-users plan._
