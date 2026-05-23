# Password Reset + Email Verification Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the auth surface deferred from `auth-and-users` — a complete password-reset flow (request → email → set-new) and email-verification flow (send → click → mark verified) — built on the `password_reset_tokens` and `magic_link_tokens` tables already created by that plan. Wire the email templates through the Resend adapter, add an admin-issued reset-link path (consumed by `wpkiller user reset-password`), and surface email-verification status in the user profile.

**Architecture:** Three new Server Actions + three new pages: `(auth)/forgot-password`, `(auth)/reset-password`, `(auth)/verify-email`. The `passwordResetTokens` table already exists. Email-verification reuses `magicLinkTokens` with a `purpose` column added in Task 1 ('signin' | 'verify'). The same routes/components are reused for sign-in magic links and verification-only links — only the success behavior differs.

The CLI's `wpkiller user reset-password` endpoint (delivered by the **cli** plan) already issues tokens; this plan ships the page that consumes them. Email templates are React components rendered to HTML via `@react-email/render`.

**Tech Stack additions:** `@react-email/components` v0.0.x (templates), `@react-email/render` v0.0.x. No build-system changes.

**Depends on:**

- foundation, auth-and-users (env, sessions, passwords, tokens, magic link primitives, `sendEmail`).
- cli (`wpkiller user reset-password` already issues tokens against the `passwordResetTokens` table).

---

## File Map

| Path                                            | Purpose                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/db/schema.ts`                              | **MODIFY** — add `purpose` column to `magic_link_tokens`                                         |
| `src/db/migrations/0013_email_verification.sql` | Generated migration                                                                              |
| `src/auth/password-reset.ts`                    | `issuePasswordReset(email)`, `consumePasswordReset(token, newPassword)`                          |
| `src/auth/password-reset.test.ts`               | Tests                                                                                            |
| `src/auth/email-verification.ts`                | `issueEmailVerification(email)`, `consumeEmailVerification(token)`                               |
| `src/auth/email-verification.test.ts`           | Tests                                                                                            |
| `src/auth/magic-link.ts`                        | **MODIFY** — accept `purpose` argument, default 'signin'                                         |
| `src/emails/PasswordResetEmail.tsx`             | React Email template                                                                             |
| `src/emails/EmailVerificationEmail.tsx`         | React Email template                                                                             |
| `src/emails/render.ts`                          | Render React Email → HTML + plain text                                                           |
| `src/emails/render.test.tsx`                    | Tests                                                                                            |
| `src/auth/email.ts`                             | **MODIFY** — accept a `{ react: ReactElement }` alternative to raw html/text                     |
| `src/app/actions/auth.ts`                       | **MODIFY** — add `forgotPasswordAction`, `resetPasswordAction`, `requestEmailVerificationAction` |
| `src/app/actions/auth.test.ts`                  | **MODIFY** — extend                                                                              |
| `src/app/(auth)/forgot-password/page.tsx`       | Request form                                                                                     |
| `src/app/(auth)/reset-password/page.tsx`        | New-password form                                                                                |
| `src/app/(auth)/verify-email/page.tsx`          | Click-target                                                                                     |
| `src/app/admin/profile/page.tsx`                | Show verification status; resend button                                                          |

---

## Task 1: Extend magic-link tokens with purpose

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0013_email_verification.sql`
- Modify: `src/auth/magic-link.ts`

- [ ] **Step 1: Schema change**

In `src/db/schema.ts`:

```ts
export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    purpose: text("purpose").notNull().default("signin"), // 'signin' | 'verify'
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("magic_link_email_idx").on(t.email),
    expiresIdx: index("magic_link_expires_idx").on(t.expiresAt),
    purposeIdx: index("magic_link_purpose_idx").on(t.purpose),
  }),
);
```

- [ ] **Step 2: Generate + apply migration**

```bash
pnpm db:generate
mv src/db/migrations/0013_*.sql src/db/migrations/0013_email_verification.sql
set -a; source .env.local; set +a
pnpm db:migrate
```

- [ ] **Step 3: Extend `issueMagicLink` to take a purpose**

In `src/auth/magic-link.ts`:

```ts
export async function issueMagicLink(
  rawEmail: string,
  purpose: "signin" | "verify" = "signin",
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await db().insert(magicLinkTokens).values({ tokenHash, email, purpose, expiresAt });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const path = purpose === "verify" ? "/verify-email" : "/api/auth/magic-link/verify";
  const url = `${appUrl.replace(/\/$/, "")}${path}?token=${token}`;

  await sendEmail({
    to: email,
    subject: purpose === "verify" ? "Verify your email" : "Sign in to Slate",
    text: `Click to ${purpose === "verify" ? "verify your email" : "sign in"}: ${url}\n\nLink expires in 15 minutes.`,
    html: `<p>Click to ${purpose === "verify" ? "verify your email" : "sign in"}: <a href="${url}">${url}</a></p><p>Link expires in 15 minutes.</p>`,
  });
}
```

> Note: this changes the existing function signature only in the optional second arg — existing call sites continue to work because `'signin'` is the default.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0013_email_verification.sql src/auth/magic-link.ts
git commit -m "feat(auth-polish): magic-link tokens carry a purpose"
```

---

## Task 2: Email templates (TDD)

**Files:**

- Create: `src/emails/PasswordResetEmail.tsx`
- Create: `src/emails/EmailVerificationEmail.tsx`
- Create: `src/emails/render.ts`
- Create: `src/emails/render.test.tsx`
- Modify: `src/auth/email.ts`

- [ ] **Step 1: Add deps**

```bash
pnpm add @react-email/components@0.0.31 @react-email/render@1.0.6
```

- [ ] **Step 2: Write failing tests**

`src/emails/render.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderEmail } from "./render";
import { PasswordResetEmail } from "./PasswordResetEmail";

describe("renderEmail", () => {
  it("returns html + text for a React Email template", async () => {
    const out = await renderEmail(
      <PasswordResetEmail resetUrl="https://example.com/reset?token=abc" displayName="Test User" />,
    );
    expect(out.html).toContain("reset?token=abc");
    expect(out.html).toContain("Test User");
    expect(out.text).toContain("https://example.com/reset?token=abc");
  });
});
```

- [ ] **Step 3: Implement render helper**

`src/emails/render.ts`:

```ts
import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element, { pretty: false }),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
```

- [ ] **Step 4: Templates**

`src/emails/PasswordResetEmail.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface PasswordResetEmailProps {
  resetUrl: string;
  displayName: string;
}

export function PasswordResetEmail({ resetUrl, displayName }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Slate password</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f9fafb", padding: "20px" }}>
        <Container
          style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "560px" }}
        >
          <Heading style={{ fontSize: "20px", margin: 0 }}>Hi {displayName},</Heading>
          <Text>
            We received a request to reset the password on your Slate account. Click the
            button below to choose a new one. The link expires in 24 hours.
          </Text>
          <Button
            href={resetUrl}
            style={{
              background: "#0b5fff",
              color: "white",
              padding: "10px 18px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Reset password
          </Button>
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>
            If you didn't request this, you can safely ignore the email — your password won't
            change.
          </Text>
          <Text style={{ color: "#6b7280", fontSize: "12px" }}>{resetUrl}</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

`src/emails/EmailVerificationEmail.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface EmailVerificationEmailProps {
  verifyUrl: string;
  displayName: string;
}

export function EmailVerificationEmail({ verifyUrl, displayName }: EmailVerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f9fafb", padding: "20px" }}>
        <Container
          style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "560px" }}
        >
          <Heading style={{ fontSize: "20px", margin: 0 }}>Welcome, {displayName}!</Heading>
          <Text>Confirm your email address to finish setting up your account.</Text>
          <Button
            href={verifyUrl}
            style={{
              background: "#0b5fff",
              color: "white",
              padding: "10px 18px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Verify email
          </Button>
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>{verifyUrl}</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Extend `sendEmail` to accept a React node**

In `src/auth/email.ts`:

```ts
import type { ReactElement } from "react";
import { renderEmail } from "@/emails/render";

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  react?: ReactElement;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  let html = msg.html;
  let text = msg.text;
  if (msg.react) {
    const rendered = await renderEmail(msg.react);
    html = rendered.html;
    text = rendered.text;
  }
  if (!html || !text) {
    throw new Error("sendEmail requires either react or both html+text");
  }
  // (existing send logic continues, using html and text)
}
```

Update the existing call sites that pass `react`/`html`/`text` to match.

- [ ] **Step 6: Run tests**

```bash
pnpm test src/emails/render.test.tsx
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/emails src/auth/email.ts package.json pnpm-lock.yaml
git commit -m "feat(auth-polish): React Email templates + sendEmail({ react })"
```

---

## Task 3: Password reset service (TDD)

**Files:**

- Create: `src/auth/password-reset.ts`
- Create: `src/auth/password-reset.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/password-reset.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { issuePasswordReset, consumePasswordReset } from "./password-reset";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

vi.stubEnv("APP_URL", "https://app.test");

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("password reset", () => {
  it("issuePasswordReset emails a link with a 40-char token", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `pr-${Date.now()}@e.com`,
        displayName: "PR",
        role: "subscriber",
        passwordHash: null,
      })
      .returning();
    uids.push(u!.id);
    sendEmail.mockClear();
    await issuePasswordReset(u!.email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const callArg = sendEmail.mock.calls[0]![0];
    expect(callArg.to).toBe(u!.email);
    expect(callArg.react).toBeTruthy();
  });

  it("issuePasswordReset is a no-op for unknown emails (no enumeration)", async () => {
    sendEmail.mockClear();
    await issuePasswordReset(`absent-${Date.now()}@e.com`);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("consumePasswordReset updates the hash + invalidates other sessions", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `cp-${Date.now()}@e.com`,
        displayName: "CP",
        role: "subscriber",
        passwordHash: null,
      })
      .returning();
    uids.push(u!.id);
    await issuePasswordReset(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.resetUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;

    const result = await consumePasswordReset(token, "correct horse battery 2");
    expect(result.kind).toBe("ok");
    const fresh = await db()
      .select()
      .from(users)
      .where(sql`${users.id} = ${u!.id}`);
    expect(fresh[0]!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("consumePasswordReset rejects a used token on second attempt", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `rs-${Date.now()}@e.com`,
        displayName: "RS",
        role: "subscriber",
      })
      .returning();
    uids.push(u!.id);
    await issuePasswordReset(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.resetUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;
    const first = await consumePasswordReset(token, "correct horse battery 2");
    expect(first.kind).toBe("ok");
    const second = await consumePasswordReset(token, "correct horse battery 3");
    expect(second.kind).toBe("error");
  });

  it("consumePasswordReset rejects unknown token", async () => {
    expect((await consumePasswordReset("a".repeat(40), "correct horse battery 2")).kind).toBe(
      "error",
    );
  });
});
```

- [ ] **Step 2: Implement**

`src/auth/password-reset.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users, type User } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { hashPassword } from "./passwords";
import { sendEmail } from "./email";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import { invalidateAllUserSessions } from "./sessions";
import { logger } from "@/lib/logger";

export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export async function issuePasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = (await db().select().from(users).where(eq(users.email, email)))[0];
  if (!user) {
    // No-enumeration: silently succeed.
    logger().info({ email }, "password-reset:unknown-email");
    return;
  }
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  await db()
    .insert(passwordResetTokens)
    .values({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your Slate password",
    react: PasswordResetEmail({ resetUrl, displayName: user.displayName }) as ReturnType<
      typeof PasswordResetEmail
    >,
  });
}

export type ConsumeResult =
  | { kind: "ok"; user: User }
  | { kind: "error"; reason: "unknown" | "expired" | "used" };

export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);
  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    const t = rows[0];
    if (!t) return { kind: "error", reason: "unknown" } as const;
    if (t.usedAt) return { kind: "error", reason: "used" } as const;
    if (t.expiresAt.getTime() < Date.now()) return { kind: "error", reason: "expired" } as const;

    const passwordHash = await hashPassword(newPassword);
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    const [updated] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: sql`now()` })
      .where(eq(users.id, t.userId))
      .returning();
    await invalidateAllUserSessions(updated!.id);
    return { kind: "ok", user: updated! } as const;
  });
}
```

- [ ] **Step 3: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/password-reset.test.ts
```

Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add src/auth/password-reset.ts src/auth/password-reset.test.ts
git commit -m "feat(auth-polish): password reset issuance + consumption"
```

---

## Task 4: Email verification service (TDD)

**Files:**

- Create: `src/auth/email-verification.ts`
- Create: `src/auth/email-verification.test.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/email-verification.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { issueEmailVerification, consumeEmailVerification } from "./email-verification";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

vi.stubEnv("APP_URL", "https://app.test");

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("email verification", () => {
  it("issueEmailVerification emails a 40-char token URL with purpose=verify", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `ev-${Date.now()}@e.com`, displayName: "EV", role: "subscriber" })
      .returning();
    uids.push(u!.id);
    sendEmail.mockClear();
    await issueEmailVerification(u!.email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const callArg = sendEmail.mock.calls[0]![0];
    expect(callArg.react.props.verifyUrl).toMatch(/\/verify-email\?token=[a-z2-7]{40}/);
    const rows = await db()
      .select()
      .from(magicLinkTokens)
      .where(sql`${magicLinkTokens.email} = ${u!.email}`);
    expect(rows[0]?.purpose).toBe("verify");
  });

  it("consumeEmailVerification marks emailVerifiedAt and the token as used", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `cv-${Date.now()}@e.com`, displayName: "CV", role: "subscriber" })
      .returning();
    uids.push(u!.id);
    await issueEmailVerification(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.verifyUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;
    const result = await consumeEmailVerification(token);
    expect(result.kind).toBe("ok");
    const fresh = await db()
      .select()
      .from(users)
      .where(sql`${users.id} = ${u!.id}`);
    expect(fresh[0]!.emailVerifiedAt).not.toBeNull();
  });

  it("consumeEmailVerification rejects a signin-purpose token", async () => {
    // create a signin-purpose token directly
    const token = "a".repeat(40);
    await db()
      .insert(magicLinkTokens)
      .values({
        tokenHash: (await import("./tokens")).hashToken(token),
        email: "x@e.com",
        purpose: "signin",
        expiresAt: new Date(Date.now() + 60_000),
      });
    expect((await consumeEmailVerification(token)).kind).toBe("error");
    await db()
      .delete(magicLinkTokens)
      .where(sql`${magicLinkTokens.email} = 'x@e.com'`);
  });
});
```

- [ ] **Step 2: Implement**

`src/auth/email-verification.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { sendEmail } from "./email";
import { EmailVerificationEmail } from "@/emails/EmailVerificationEmail";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueEmailVerification(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = (await db().select().from(users).where(eq(users.email, email)))[0];
  if (!user) return;
  if (user.emailVerifiedAt) return;
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  await db()
    .insert(magicLinkTokens)
    .values({
      tokenHash,
      email,
      purpose: "verify",
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your email",
    react: EmailVerificationEmail({ verifyUrl, displayName: user.displayName }) as never,
  });
}

export type ConsumeResult =
  | { kind: "ok"; userId: string }
  | { kind: "error"; reason: "unknown" | "expired" | "used" | "wrong-purpose" };

export async function consumeEmailVerification(token: string): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);
  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const t = rows[0];
    if (!t) return { kind: "error", reason: "unknown" } as const;
    if (t.purpose !== "verify") return { kind: "error", reason: "wrong-purpose" } as const;
    if (t.usedAt) return { kind: "error", reason: "used" } as const;
    if (t.expiresAt.getTime() < Date.now()) return { kind: "error", reason: "expired" } as const;
    await tx
      .update(magicLinkTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.email, t.email))
      .returning({ id: users.id });
    return { kind: "ok", userId: u?.id ?? "" } as const;
  });
}
```

- [ ] **Step 3: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/auth/email-verification.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/auth/email-verification.ts src/auth/email-verification.test.ts
git commit -m "feat(auth-polish): email verification flow"
```

---

## Task 5: Server Actions for forgot/reset/verify (TDD)

**Files:**

- Modify: `src/app/actions/auth.ts`
- Modify: `src/app/actions/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/app/actions/auth.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const issuePasswordReset = vi.fn();
const consumePasswordReset = vi.fn();
const issueEmailVerification = vi.fn();
const consumeEmailVerification = vi.fn();
vi.mock("@/auth/password-reset", () => ({
  issuePasswordReset: (...a: unknown[]) => issuePasswordReset(...a),
  consumePasswordReset: (...a: unknown[]) => consumePasswordReset(...a),
}));
vi.mock("@/auth/email-verification", () => ({
  issueEmailVerification: (...a: unknown[]) => issueEmailVerification(...a),
  consumeEmailVerification: (...a: unknown[]) => consumeEmailVerification(...a),
}));

const {
  forgotPasswordAction,
  resetPasswordAction,
  requestEmailVerificationAction,
  verifyEmailAction,
} = await import("./auth");

afterEach(() => {
  issuePasswordReset.mockReset();
  consumePasswordReset.mockReset();
  issueEmailVerification.mockReset();
  consumeEmailVerification.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("forgotPasswordAction", () => {
  it("validates email, calls issuePasswordReset, returns ok regardless of existence", async () => {
    issuePasswordReset.mockResolvedValue(undefined);
    const r = await forgotPasswordAction(undefined, fd({ email: "a@b.com" }));
    expect(r.ok).toBe(true);
    expect(issuePasswordReset).toHaveBeenCalledWith("a@b.com");
  });
  it("returns fieldError on invalid email", async () => {
    const r = await forgotPasswordAction(undefined, fd({ email: "not-email" }));
    expect(r.fieldErrors?.email).toBeDefined();
  });
});

describe("resetPasswordAction", () => {
  it("ok path updates", async () => {
    consumePasswordReset.mockResolvedValue({ kind: "ok", user: { id: "u-1" } });
    const r = await resetPasswordAction(
      undefined,
      fd({ token: "a".repeat(40), password: "correct horse battery 2" }),
    );
    expect(r.ok).toBe(true);
  });
  it("returns error on used token", async () => {
    consumePasswordReset.mockResolvedValue({ kind: "error", reason: "used" });
    const r = await resetPasswordAction(
      undefined,
      fd({ token: "a".repeat(40), password: "correct horse battery 2" }),
    );
    expect(r.error).toMatch(/used/i);
  });
});

describe("verifyEmailAction", () => {
  it("ok path returns ok", async () => {
    consumeEmailVerification.mockResolvedValue({ kind: "ok", userId: "u-1" });
    const r = await verifyEmailAction(undefined, fd({ token: "a".repeat(40) }));
    expect(r.ok).toBe(true);
  });
});

describe("requestEmailVerificationAction", () => {
  it("calls issueEmailVerification with the actor's email", async () => {
    issueEmailVerification.mockResolvedValue(undefined);
    const r = await requestEmailVerificationAction(undefined, fd({ email: "user@example.com" }));
    expect(r.ok).toBe(true);
    expect(issueEmailVerification).toHaveBeenCalledWith("user@example.com");
  });
});
```

- [ ] **Step 2: Implement**

Append to `src/app/actions/auth.ts`:

```ts
import { issuePasswordReset, consumePasswordReset } from "@/auth/password-reset";
import { issueEmailVerification, consumeEmailVerification } from "@/auth/email-verification";

const forgotSchema = z.object({ email: z.string().email() });

export async function forgotPasswordAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult & { ok?: boolean }> {
  const parsed = forgotSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]!.message } };
  }
  await issuePasswordReset(parsed.data.email);
  return { ok: true };
}

const resetSchema = z.object({
  token: z.string().regex(/^[a-z2-7]{40}$/),
  password: z.string().min(12).max(256),
});

export async function resetPasswordAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult & { ok?: boolean }> {
  const parsed = resetSchema.safeParse({
    token: fd.get("token"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: "Invalid token or password" };
  }
  const result = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (result.kind === "error") {
    if (result.reason === "expired") return { error: "Link expired. Request a new one." };
    if (result.reason === "used") return { error: "This link was already used." };
    return { error: "Invalid link." };
  }
  return { ok: true };
}

const verifySchema = z.object({ token: z.string().regex(/^[a-z2-7]{40}$/) });

export async function verifyEmailAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult & { ok?: boolean }> {
  const parsed = verifySchema.safeParse({ token: fd.get("token") });
  if (!parsed.success) return { error: "Invalid link." };
  const r = await consumeEmailVerification(parsed.data.token);
  if (r.kind === "error") return { error: "Invalid or expired link." };
  return { ok: true };
}

const requestVerificationSchema = z.object({ email: z.string().email() });

export async function requestEmailVerificationAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult & { ok?: boolean }> {
  const parsed = requestVerificationSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]!.message } };
  await issueEmailVerification(parsed.data.email);
  return { ok: true };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/app/actions/auth.test.ts
```

Expected: 6 new passes plus existing ones.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/auth.ts src/app/actions/auth.test.ts
git commit -m "feat(auth-polish): forgot/reset/verify server actions"
```

---

## Task 6: Public pages

**Files:**

- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/app/(auth)/verify-email/page.tsx`

- [ ] **Step 1: Forgot-password form**

`src/app/(auth)/forgot-password/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";

interface State {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<State | undefined, FormData>(
    forgotPasswordAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Check your email</h1>
        <p>
          If we have an account for that address, a password-reset link is on its way. The link
          expires in 24 hours.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Reset your password</h1>
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Email</span>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border px-2 py-1"
            aria-invalid={state?.fieldErrors?.email ? true : undefined}
          />
          {state?.fieldErrors?.email && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.email}</p>
          )}
        </label>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Reset-password form (token in URL)**

`src/app/(auth)/reset-password/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";

interface State {
  ok?: boolean;
  error?: string;
}

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action, pending] = useActionState<State | undefined, FormData>(
    resetPasswordAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Password updated</h1>
        <p>You can now sign in with your new password.</p>
        <a className="mt-3 inline-block underline" href="/sign-in">
          Sign in
        </a>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Choose a new password</h1>
      <form action={action} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">New password</span>
          <input
            type="password"
            name="password"
            minLength={12}
            required
            className="w-full rounded border px-2 py-1"
          />
        </label>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Set password"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify-email page**

`src/app/(auth)/verify-email/page.tsx`:

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmailAction } from "@/app/actions/auth";

interface State {
  ok?: boolean;
  error?: string;
}

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action] = useActionState<State | undefined, FormData>(verifyEmailAction, undefined);

  useEffect(() => {
    if (token && !state) {
      const fd = new FormData();
      fd.append("token", token);
      action(fd);
    }
  }, [token, state, action]);

  if (state?.ok) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Email verified</h1>
        <p>You're all set.</p>
        <a className="mt-3 inline-block underline" href="/">
          Continue
        </a>
      </main>
    );
  }
  if (state?.error) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Verification failed</h1>
        <p className="text-sm text-red-700">{state.error}</p>
        <a className="mt-3 inline-block underline" href="/admin/profile">
          Resend verification email
        </a>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Verifying…</h1>
      <p>Hold tight.</p>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/forgot-password src/app/\(auth\)/reset-password src/app/\(auth\)/verify-email
git commit -m "feat(auth-polish): public forgot / reset / verify pages"
```

---

## Task 7: Profile page surface

**Files:**

- Create: `src/app/admin/profile/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { requireUser } from "@/auth/context";
import { requestEmailVerificationAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Profile</h1>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="font-semibold">Email</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerifiedAt ? (
            <span className="ml-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
              verified
            </span>
          ) : (
            <span className="ml-2 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
              unverified
            </span>
          )}
        </dd>
        <dt className="font-semibold">Display name</dt>
        <dd>{user.displayName}</dd>
        <dt className="font-semibold">Role</dt>
        <dd>{user.role}</dd>
      </dl>
      {!user.emailVerifiedAt && (
        <form action={requestEmailVerificationAction.bind(null, undefined)} className="mt-6">
          <input type="hidden" name="email" value={user.email} />
          <button className="rounded bg-black px-3 py-1.5 text-sm text-white">
            Send verification email
          </button>
        </form>
      )}
      <p className="mt-8 text-sm">
        <a className="underline" href="/forgot-password">
          Change password
        </a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/profile
git commit -m "feat(auth-polish): profile page with verification status"
```

---

## Task 8: Sign-in surface: link to forgot password

**Files:**

- Modify: `src/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Add a "Forgot password?" link**

Find the closing of the form and append:

```tsx
<p className="mt-3 text-sm">
  <a className="underline" href="/forgot-password">
    Forgot your password?
  </a>
</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/sign-in/page.tsx
git commit -m "feat(auth-polish): link forgot-password from sign-in"
```

---

## Task 9: Final integration

> No code changes.

- [ ] **Step 1: Suite**

```bash
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 2: Manual smoke**

1. Sign up a new user (`/sign-up`). Trigger `requestEmailVerificationAction` from `/admin/profile` — receive the verification email in the dev-stdout log.
2. Open the link → land on `/verify-email?token=…` → see "Email verified".
3. Sign out. Click "Forgot password?" on the sign-in page → enter the email → check log → open the reset link → set a new password → sign in with it.
4. Confirm the previous session was invalidated (`invalidateAllUserSessions` on consume).

- [ ] **Step 3: Invariants**

1. Tokens are single-use; reuse returns a clear error.
2. Existing `magicLinkTokens` for sign-in continue to work — the `purpose` column has a default.
3. Email enumeration is prevented at the API surface — both `forgotPasswordAction` and `requestEmailVerificationAction` return `{ ok: true }` regardless of whether the address exists.
4. Templates rendered through `@react-email/render` round-trip into html+text.

---

## Out of Scope

- 2FA / WebAuthn (designed for in v2).
- Admin-managed device list & token revocation UI (could be added in a polish pass).
- Rate-limiting on `/forgot-password` and `/verify-email` — covered by the middleware rate limit from **deployment-hardening** (auth bucket already includes `/api/auth/*` and these submit through Server Actions).

---

_End of password-reset-polish plan._
