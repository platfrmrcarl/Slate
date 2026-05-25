# shadcn UI Migration + Google OAuth on Sign-Up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install shadcn UI with the slate base palette on the Slate app, wire next-themes for light/dark mode, migrate every page in `src/app/*` and shared `src/components/*` to shadcn primitives, and add a Google OAuth button to the sign-up page that preserves the `?tier=` query param through the OAuth flow.

**Architecture:** Tailwind v4 + shadcn (new-york, slate, CSS variables, RSC). `next-themes` provider in root layout with system/light/dark toggle. Six PR groups landed in order: Foundation (A) → OAuth backend + Auth pages (B) → Marketing (C) → Admin shell (D) → Admin pages in 4 sub-groups (E1–E4) → Misc (F). OAuth tier preservation via a sibling cookie `oauth_signup_tier` alongside the existing state/PKCE cookies; `upsertOAuthUser` is extended to return `{ user, isNew }` so the callback can route new paid-tier signups to checkout.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn (new-york), next-themes, lucide-react, arctic (OAuth), drizzle-orm, vitest.

**Spec:** `docs/superpowers/specs/2026-05-25-shadcn-migration-and-google-oauth-design.md`

---

## Re-Skin Recipe (referenced by all presentational tasks below)

Every "re-skin" task below means: open the file, replace raw Tailwind-styled elements with shadcn primitives, preserve all behavior, keep all `data-*` and accessibility attributes intact. Concretely:

| Old | New |
|---|---|
| `<input className="rounded border p-2" />` | `<Input />` from `@/components/ui/input` |
| `<button className="rounded bg-black px-4 py-2 text-white">` | `<Button>` from `@/components/ui/button` |
| `<button className="rounded border …">` (secondary) | `<Button variant="outline">` |
| `<a className="rounded border px-4 py-2 text-center" href=…>` (OAuth provider link) | `<Button variant="outline" render={<a href={…} />}>…</Button>` (Base UI render prop — see note below) |
| `<p className="text-sm text-red-600">…error…</p>` | `<Alert variant="destructive"><AlertDescription>…</AlertDescription></Alert>` (or `<FormMessage>` inside a form context) |
| Field labels (often absent) | Add `<Label htmlFor="…">…</Label>` above each input |
| Section containers like `<section>` with raw padding | `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader><CardContent>…</CardContent></Card>` for boxed forms; leave full-bleed sections alone |
| Raw color utilities (`bg-black`, `text-gray-600`, `text-red-600`) | Use semantic tokens: `bg-primary`, `text-muted-foreground`, `text-destructive` |
| Custom dividers | `<Separator />` (with optional inline label for "or" / "continue with") |
| Inline icons | `lucide-react` icons |

Preserve all `name`, `type`, `required`, `placeholder` attributes on inputs. Preserve all `useActionState`/form action wiring. Preserve all conditional rendering (e.g., env-flag gates).

**IMPORTANT — Base UI primitives, not Radix.** The shadcn primitives in `src/components/ui/` in this repo are the **Base UI** variant (`@base-ui/react/*`), not Radix. There is **no `asChild` prop** on `Button`, `DropdownMenuTrigger`, or any other primitive. Use the **`render` prop** instead. Patterns:

```tsx
// OAuth link as button — Base UI (note nativeButton={false} when rendering as <a>):
<Button
  variant="outline"
  className="w-full"
  nativeButton={false}
  render={<a href={googleHref} />}
>
  Continue with Google
</Button>

// Internal link as ghost nav button — Base UI:
<Button variant="ghost" nativeButton={false} render={<Link href={"/something" as Route} />}>
  Label
</Button>

// DropdownMenuTrigger wrapping a styled icon Button — Base UI (no nativeButton needed when render is itself a Button):
<DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="…" />}>
  <IconA />
  <IconB />
</DropdownMenuTrigger>
```

Children of the outer component go inside the outer tag; the inner element passed to `render` only carries routing/href attributes. Every `asChild` mention later in this plan should be substituted with `render={<… />}`.

**`nativeButton={false}` rule.** Base UI's `<Button>` defaults to rendering as a native `<button>` and warns at runtime if you slot in an `<a>` or `<Link>` instead. When you use `render={<a … />}` or `render={<Link … />}` on a `<Button>`, **always add `nativeButton={false}`** to silence the warning and produce semantically correct HTML. When the render target is itself another Button (or any element that already participates as a button), don't add the prop.

**Lint note:** the project's eslint picks up React 19's `react-hooks/set-state-in-effect` rule. The canonical `next-themes` mount-guard (calling `setState` inside `useEffect`) trips it. Add a targeted `// eslint-disable-next-line react-hooks/set-state-in-effect` with a one-line comment explaining the hydration guard when you encounter this. Don't disable it globally.

For each re-skin task: read the file first, apply the above transforms, then `pnpm typecheck && pnpm lint --fix` and visually load the page in `pnpm dev` before committing.

---

## Phase 1 — Foundation (Group A)

### Task 1: Branch + worktree setup

**Files:** none (git only)

- [ ] **Step 1: Create a feature branch off main**

```bash
cd /home/carl/GitHub/Slate
git checkout main
git pull
git checkout -b feat/shadcn-and-google-oauth
```

- [ ] **Step 2: Confirm clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

---

### Task 2: Run shadcn init and swap in mist palette

**Background:** shadcn v4 dropped `slate` from its base colors. The v4 CLI no longer accepts `--base-color` and defaults to `neutral`. We use `mist` (v4's cool blue-gray equivalent of slate, hues 213°–228°). Strategy: run init with defaults (gets `neutral`), then overwrite the token blocks in `globals.css` with `mist` values and patch `components.json`.

**Files:**
- Create: `components.json`
- Modify: `src/app/globals.css`
- Create: `src/lib/utils.ts` (if not present)
- Modify: `package.json` (CLI adds deps)

- [ ] **Step 1: Run init with defaults**

```bash
cd /home/carl/GitHub/Slate
pnpm dlx shadcn@latest init -d
```

`-d` accepts defaults: TypeScript yes, style new-york (under nova preset), CSS variables yes, RSC yes. Base color will be `neutral` — we replace it in Step 3.

- [ ] **Step 2: Verify files exist**

```bash
test -f components.json && echo "components.json OK"
test -f src/lib/utils.ts && echo "utils.ts OK"
grep -q ":root" src/app/globals.css && echo "globals.css has tokens"
grep -q "@theme inline" src/app/globals.css && echo "globals.css has @theme inline"
```

Expected: all four "OK" lines print.

- [ ] **Step 3: Replace token blocks in globals.css with mist palette**

Open `src/app/globals.css`. Find the existing `:root { … }` block and the `.dark { … }` block (both written by `shadcn init`). Replace ONLY the token bodies (keep the selectors and any surrounding `@theme inline` / `@custom-variant` / `@import` lines untouched). Use these literal mist values:

`:root` body:
```css
  --background: oklch(1 0 0);
  --foreground: oklch(0.148 0.004 228.8);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.148 0.004 228.8);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.148 0.004 228.8);
  --primary: oklch(0.218 0.008 223.9);
  --primary-foreground: oklch(0.987 0.002 197.1);
  --secondary: oklch(0.963 0.002 197.1);
  --secondary-foreground: oklch(0.218 0.008 223.9);
  --muted: oklch(0.963 0.002 197.1);
  --muted-foreground: oklch(0.56 0.021 213.5);
  --accent: oklch(0.963 0.002 197.1);
  --accent-foreground: oklch(0.218 0.008 223.9);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.925 0.005 214.3);
  --input: oklch(0.925 0.005 214.3);
  --ring: oklch(0.723 0.014 214.4);
  --chart-1: oklch(0.872 0.007 219.6);
  --chart-2: oklch(0.56 0.021 213.5);
  --chart-3: oklch(0.45 0.017 213.2);
  --chart-4: oklch(0.378 0.015 216);
  --chart-5: oklch(0.275 0.011 216.9);
  --radius: 0.625rem;
  --sidebar: oklch(0.987 0.002 197.1);
  --sidebar-foreground: oklch(0.148 0.004 228.8);
  --sidebar-primary: oklch(0.218 0.008 223.9);
  --sidebar-primary-foreground: oklch(0.987 0.002 197.1);
  --sidebar-accent: oklch(0.963 0.002 197.1);
  --sidebar-accent-foreground: oklch(0.218 0.008 223.9);
  --sidebar-border: oklch(0.925 0.005 214.3);
  --sidebar-ring: oklch(0.723 0.014 214.4);
```

`.dark` body:
```css
  --background: oklch(0.148 0.004 228.8);
  --foreground: oklch(0.987 0.002 197.1);
  --card: oklch(0.218 0.008 223.9);
  --card-foreground: oklch(0.987 0.002 197.1);
  --popover: oklch(0.218 0.008 223.9);
  --popover-foreground: oklch(0.987 0.002 197.1);
  --primary: oklch(0.925 0.005 214.3);
  --primary-foreground: oklch(0.218 0.008 223.9);
  --secondary: oklch(0.275 0.011 216.9);
  --secondary-foreground: oklch(0.987 0.002 197.1);
  --muted: oklch(0.275 0.011 216.9);
  --muted-foreground: oklch(0.723 0.014 214.4);
  --accent: oklch(0.275 0.011 216.9);
  --accent-foreground: oklch(0.987 0.002 197.1);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.56 0.021 213.5);
  --chart-1: oklch(0.872 0.007 219.6);
  --chart-2: oklch(0.56 0.021 213.5);
  --chart-3: oklch(0.45 0.017 213.2);
  --chart-4: oklch(0.378 0.015 216);
  --chart-5: oklch(0.275 0.011 216.9);
  --sidebar: oklch(0.218 0.008 223.9);
  --sidebar-foreground: oklch(0.987 0.002 197.1);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.987 0.002 197.1);
  --sidebar-accent: oklch(0.275 0.011 216.9);
  --sidebar-accent-foreground: oklch(0.987 0.002 197.1);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.56 0.021 213.5);
```

- [ ] **Step 4: Patch components.json baseColor**

Edit `components.json` — find the field `"baseColor": "neutral"` (under `"tailwind"`) and change it to `"baseColor": "mist"`.

- [ ] **Step 5: Verify mist tokens are in place**

```bash
grep -E "oklch\(0\.\d+ 0\.0\d+ 21[34]" src/app/globals.css | head -3
```

Expected: at least one match — mist uses oklch values around hues 213°–214° (the slate-blue tinted neutral).

- [ ] **Step 6: Commit**

```bash
git add components.json src/lib/utils.ts src/app/globals.css package.json pnpm-lock.yaml
git commit -m "feat(ui): init shadcn with mist (v4 slate equivalent) palette"
```

---

### Task 3: Batch-add shadcn primitives

**Files:**
- Create: `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `separator.tsx`, `alert.tsx`, `form.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx`, `radio-group.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `badge.tsx`, `tabs.tsx`, `dialog.tsx`, `sheet.tsx`, `table.tsx`, `tooltip.tsx`, `sonner.tsx`, `skeleton.tsx`
- Modify: `package.json` (peer deps added per primitive)

- [ ] **Step 1: Generate all primitives in one batch**

```bash
cd /home/carl/GitHub/Slate
pnpm dlx shadcn@latest add -y button input label card separator alert form \
  select textarea checkbox radio-group dropdown-menu avatar badge tabs dialog \
  sheet table tooltip sonner skeleton
```

Note: shadcn dropped the legacy `toast` primitive in favor of `sonner`. We add `sonner` instead of `toast`.

- [ ] **Step 2: Verify generated files**

```bash
ls src/components/ui/ | sort
```

Expected: at minimum the 21 file names listed above.

- [ ] **Step 3: Type-check the new primitives compile cleanly**

```bash
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui package.json pnpm-lock.yaml
git commit -m "feat(ui): add shadcn primitives (button, input, card, etc.)"
```

---

### Task 4: Install next-themes

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dep**

```bash
pnpm add next-themes
```

- [ ] **Step 2: Verify install**

```bash
pnpm list next-themes
```

Expected: shows `next-themes` with a version.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(ui): add next-themes for dark mode"
```

---

### Task 5: Write the ThemeToggle test

**Files:**
- Test: `src/components/theme-toggle.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/theme-toggle.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "system" }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders nothing until mounted to avoid SSR hydration mismatch", () => {
    const { container } = render(<ThemeToggle />);
    // Before useEffect runs (we render synchronously in JSDOM), the component
    // should return null because the mounted flag is still false.
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/components/theme-toggle.test.tsx
```

Expected: FAIL with `Cannot find module './theme-toggle'`.

---

### Task 6: Implement ThemeToggle

**Files:**
- Create: `src/components/theme-toggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/theme-toggle.tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle(): React.ReactElement | null {
  const { setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Toggle theme" />}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm test src/components/theme-toggle.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/theme-toggle.tsx src/components/theme-toggle.test.tsx
git commit -m "feat(ui): add ThemeToggle with mounted-state guard"
```

---

### Task 7: Wire ThemeProvider in root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read the current layout to see its structure**

```bash
cat src/app/layout.tsx
```

- [ ] **Step 2: Add `suppressHydrationWarning` to `<html>` and wrap `<body>` children in ThemeProvider**

Find the `<html>` opening tag and add `suppressHydrationWarning`. Find the `<body>` and wrap its children:

```tsx
import { ThemeProvider } from "next-themes";
// …other imports remain unchanged…

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body /* …existing className/attrs… */>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

If the layout already has `<html lang="en">` or similar, just add `suppressHydrationWarning` to the existing tag — do not duplicate attributes.

- [ ] **Step 3: Type-check + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean.

- [ ] **Step 4: Smoke-test the dev server boots**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
curl -sf http://localhost:3000 -o /dev/null && echo "dev server OK"
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

Expected: `dev server OK`. Don't worry about the page content yet — we just need the bootstrap to work.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): wire next-themes provider in root layout"
```

---

### Task 8: Foundation verification

**Files:** none

- [ ] **Step 1: Run the full verification suite**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all four succeed. Do not proceed to Phase 2 if any step fails.

---

## Phase 2 — OAuth Backend (Group B, Part 1)

### Task 9: Extend upsertOAuthUser to return isNew

**Files:**
- Modify: `src/auth/oauth/index.ts`
- Modify: `src/auth/oauth/oauth.test.ts`

- [ ] **Step 1: Write failing test for the new return shape**

Append to `src/auth/oauth/oauth.test.ts`:

```ts
describe.runIf(HAS_DB)("upsertOAuthUser isNew flag", () => {
  it("returns isNew=true for a brand-new user", async () => {
    const email = `oauth-isnew-${Date.now()}@example.com`;
    const result = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-isnew-${Date.now()}`,
      email,
      displayName: "N",
    });
    userIds.push(result.user.id);
    expect(result.isNew).toBe(true);
  });

  it("returns isNew=false when the oauth link already exists", async () => {
    const email = `oauth-link-${Date.now()}@example.com`;
    const providerAccountId = `g-link-${Date.now()}`;
    const first = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "L",
    });
    userIds.push(first.user.id);
    const second = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "L",
    });
    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("returns isNew=false when linking to an existing-by-email user", async () => {
    const email = `oauth-byemail-${Date.now()}@example.com`;
    // Pre-create a user via direct insert
    const [pre] = await db()
      .insert(users)
      .values({ email, displayName: "P", role: "subscriber" })
      .returning();
    userIds.push(pre!.id);
    const result = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-byemail-${Date.now()}`,
      email,
      displayName: "P",
    });
    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe(pre!.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/auth/oauth/oauth.test.ts
```

Expected: FAIL — `Property 'user' does not exist on type 'User'` and/or `Property 'isNew' does not exist`.

- [ ] **Step 3: Update `upsertOAuthUser` to return `{ user, isNew }`**

Replace the body of `upsertOAuthUser` in `src/auth/oauth/index.ts`:

```ts
export interface UpsertResult {
  user: User;
  isNew: boolean;
}

export async function upsertOAuthUser(identity: OAuthIdentity): Promise<UpsertResult> {
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
    if (linkRows[0]) return { user: linkRows[0].user, isNew: false };

    const existing = await tx.select().from(users).where(eq(users.email, email));
    if (existing[0]) {
      await tx.insert(oauthAccounts).values({
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        userId: existing[0].id,
      });
      return { user: existing[0], isNew: false };
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
    return { user: created!, isNew: true };
  });
}
```

- [ ] **Step 4: Update the existing tests in the same file to read `.user`**

Find `expect(u.email).toBe(email)` and similar in the original block at top of the file; rename `u` references to `u.user.email`, etc. Specifically:

```ts
// Was:
const u = await upsertOAuthUser({…});
userIds.push(u.id);
expect(u.email).toBe(email);

// Becomes:
const u = await upsertOAuthUser({…});
userIds.push(u.user.id);
expect(u.user.email).toBe(email);
```

Apply this rename to every `await upsertOAuthUser` call site in the original tests.

- [ ] **Step 5: Update the callback route to consume the new return shape**

Edit `src/app/api/auth/oauth/[provider]/callback/route.ts`. Find both `upsertOAuthUser(...)` call sites and update:

```ts
// Was:
const user = await upsertOAuthUser({…});
await setSessionCookie(user.id);

// Becomes:
const { user } = await upsertOAuthUser({…});
await setSessionCookie(user.id);
```

(We're only extracting `user` here; `isNew` is consumed in Task 12.)

- [ ] **Step 6: Update callback route mock test to match new shape**

Edit `src/app/api/auth/oauth/[provider]/callback/route.test.ts` line ~92:

```ts
// Was:
upsertOAuthUser.mockResolvedValue({ id: "u-1" });

// Becomes:
upsertOAuthUser.mockResolvedValue({ user: { id: "u-1" }, isNew: true });
```

- [ ] **Step 7: Run all auth tests to verify everything passes**

```bash
pnpm test src/auth/oauth src/app/api/auth/oauth
```

Expected: PASS (or the DB-gated tests SKIP if `DATABASE_URL` is unset).

- [ ] **Step 8: Commit**

```bash
git add src/auth/oauth src/app/api/auth/oauth
git commit -m "feat(auth): upsertOAuthUser returns { user, isNew }"
```

---

### Task 10: Write failing tests for tier handling in start route

**Files:**
- Modify: `src/app/api/auth/oauth/[provider]/start/route.test.ts`

- [ ] **Step 1: Append new test cases**

Add inside the existing `describe("GET /api/auth/oauth/[provider]/start", () => { … })` block:

```ts
it("sets the tier cookie when a valid tier is supplied for google", async () => {
  googleClient.mockReturnValue({
    createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
  });
  await GET(new Request("http://x/api/auth/oauth/google/start?tier=premium"), {
    params: Promise.resolve({ provider: "google" }),
  });
  const tierCall = cookieSet.mock.calls.find(
    ([opts]) => opts?.name === "oauth_signup_tier",
  );
  expect(tierCall).toBeDefined();
  expect(tierCall![0].value).toBe("premium");
  expect(tierCall![0].httpOnly).toBe(true);
  expect(tierCall![0].sameSite).toBe("lax");
  expect(tierCall![0].maxAge).toBe(600);
});

it("does NOT set the tier cookie when tier is invalid", async () => {
  googleClient.mockReturnValue({
    createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
  });
  await GET(new Request("http://x/api/auth/oauth/google/start?tier=bogus"), {
    params: Promise.resolve({ provider: "google" }),
  });
  const tierCall = cookieSet.mock.calls.find(
    ([opts]) => opts?.name === "oauth_signup_tier",
  );
  expect(tierCall).toBeUndefined();
});

it("does NOT set the tier cookie when tier is absent", async () => {
  googleClient.mockReturnValue({
    createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
  });
  await call("google");
  const tierCall = cookieSet.mock.calls.find(
    ([opts]) => opts?.name === "oauth_signup_tier",
  );
  expect(tierCall).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test src/app/api/auth/oauth/[provider]/start/route.test.ts
```

Expected: 3 tests FAIL (the new ones). The first should fail with "tierCall is undefined" because we haven't implemented the cookie yet.

---

### Task 11: Implement tier handling in start route

**Files:**
- Modify: `src/app/api/auth/oauth/[provider]/start/route.ts`

- [ ] **Step 1: Add the tier constants + cookie write**

At the top of the file, after the existing constants:

```ts
const TIER_COOKIE_NAME = "oauth_signup_tier";
const VALID_TIERS = new Set(["essential", "premium", "enterprise"]);
```

Change the `GET` signature to read `req` (currently `_req`) so we can parse the query:

```ts
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const tier = url.searchParams.get("tier");
  const state = generateState();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  if (tier && VALID_TIERS.has(tier)) {
    cookieStore.set({
      name: TIER_COOKIE_NAME,
      value: tier,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
  }
  // …rest of the function unchanged…
}
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test src/app/api/auth/oauth/[provider]/start/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/oauth/[provider]/start/route.ts \
        src/app/api/auth/oauth/[provider]/start/route.test.ts
git commit -m "feat(auth): persist sign-up tier through google oauth start"
```

---

### Task 12: Write failing tests for tier-driven callback redirect

**Files:**
- Modify: `src/app/api/auth/oauth/[provider]/callback/route.test.ts`

- [ ] **Step 1: Append new test cases**

Add inside the existing `describe` block:

```ts
it("redirects to /sign-up/checkout?tier=X for a NEW user when tier cookie is set", async () => {
  cookieStore.set("slate_oauth_state_google", "s1");
  cookieStore.set("slate_oauth_pkce_google", "pk1");
  cookieStore.set("oauth_signup_tier", "premium");
  googleClient.mockReturnValue({
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => "t" }),
  });
  fetchGoogleProfile.mockResolvedValue({
    sub: "g-2",
    email: "new@b.com",
    email_verified: true,
    name: "New",
  });
  upsertOAuthUser.mockResolvedValue({ user: { id: "u-2" }, isNew: true });
  createSession.mockResolvedValue({ token: "sess", expiresAt: new Date() });
  const res = await call("google", "?code=c&state=s1");
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/sign-up/checkout?tier=premium");
  expect(cookieDelete).toHaveBeenCalledWith("oauth_signup_tier");
});

it("IGNORES tier and redirects to / for an EXISTING user even if tier cookie is set", async () => {
  cookieStore.set("slate_oauth_state_google", "s1");
  cookieStore.set("slate_oauth_pkce_google", "pk1");
  cookieStore.set("oauth_signup_tier", "premium");
  googleClient.mockReturnValue({
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => "t" }),
  });
  fetchGoogleProfile.mockResolvedValue({
    sub: "g-3",
    email: "old@b.com",
    email_verified: true,
    name: "Old",
  });
  upsertOAuthUser.mockResolvedValue({ user: { id: "u-3" }, isNew: false });
  createSession.mockResolvedValue({ token: "sess", expiresAt: new Date() });
  const res = await call("google", "?code=c&state=s1");
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/");
  expect(cookieDelete).toHaveBeenCalledWith("oauth_signup_tier");
});

it("clears the tier cookie even when no tier cookie was set", async () => {
  cookieStore.set("slate_oauth_state_google", "s1");
  cookieStore.set("slate_oauth_pkce_google", "pk1");
  googleClient.mockReturnValue({
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => "t" }),
  });
  fetchGoogleProfile.mockResolvedValue({
    sub: "g-4",
    email: "x@b.com",
    email_verified: true,
    name: "X",
  });
  upsertOAuthUser.mockResolvedValue({ user: { id: "u-4" }, isNew: true });
  createSession.mockResolvedValue({ token: "sess", expiresAt: new Date() });
  await call("google", "?code=c&state=s1");
  // delete is called unconditionally — idempotent cleanup
  expect(cookieDelete).toHaveBeenCalledWith("oauth_signup_tier");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test src/app/api/auth/oauth/[provider]/callback/route.test.ts
```

Expected: 3 new tests FAIL (the first because location is `/` instead of checkout; the others because we don't delete the tier cookie yet).

---

### Task 13: Implement tier-driven redirect in callback

**Files:**
- Modify: `src/app/api/auth/oauth/[provider]/callback/route.ts`

- [ ] **Step 1: Add constants and redirect logic**

Near the top, after the existing constants:

```ts
const TIER_COOKIE_NAME = "oauth_signup_tier";
const VALID_TIERS = new Set(["essential", "premium", "enterprise"]);
```

In the `GET` function, capture `isNew` from both `upsertOAuthUser` call sites:

```ts
// google branch:
const { user, isNew } = await upsertOAuthUser({…});
await setSessionCookie(user.id);
googleIsNew = isNew; // see below

// github branch (mirror the change, even though we won't use it yet):
const { user, isNew: _isNewGh } = await upsertOAuthUser({…});
await setSessionCookie(user.id);
```

Hoist a variable above the try/catch so it survives the branch:

```ts
let isNewUser = false;
try {
  if (provider === "google") {
    // …
    const { user, isNew } = await upsertOAuthUser({…});
    isNewUser = isNew;
    await setSessionCookie(user.id);
  } else if (provider === "github") {
    // …
    const { user } = await upsertOAuthUser({…});
    await setSessionCookie(user.id);
  } else {
    return new Response("unknown provider", { status: 404 });
  }
} catch (err) {
  // …unchanged…
}
```

Just before the final `return redirectTo("/")`, compute the destination and delete the tier cookie:

```ts
const tierCookie = cookieStore.get(TIER_COOKIE_NAME)?.value;
cookieStore.delete(`${STATE_COOKIE_PREFIX}${provider}`);
cookieStore.delete(`${PKCE_COOKIE_PREFIX}${provider}`);
cookieStore.delete(TIER_COOKIE_NAME);

if (isNewUser && tierCookie && VALID_TIERS.has(tierCookie)) {
  return redirectTo(`/sign-up/checkout?tier=${encodeURIComponent(tierCookie)}`);
}
return redirectTo("/");
```

- [ ] **Step 2: Run all callback tests**

```bash
pnpm test src/app/api/auth/oauth/[provider]/callback/route.test.ts
```

Expected: all PASS, including the original "redirects to /" test.

- [ ] **Step 3: Run the whole OAuth route suite**

```bash
pnpm test src/app/api/auth/oauth
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/oauth/[provider]/callback/route.ts \
        src/app/api/auth/oauth/[provider]/callback/route.test.ts
git commit -m "feat(auth): redirect new oauth signups to tier checkout"
```

---

## Phase 3 — Auth Pages (Group B, Part 2)

### Task 14: Re-skin (auth)/layout.tsx

**Files:**
- Read first, then modify: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat 'src/app/(auth)/layout.tsx'
```

- [ ] **Step 2: Replace with a centered Card shell**

```tsx
// src/app/(auth)/layout.tsx
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
```

If the existing layout has additional concerns (header/logo/locale wrapper), preserve them inside the Card.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 15: Re-skin sign-in page

**Files:**
- Modify: `src/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Replace the page contents**

```tsx
// src/app/(auth)/sign-in/page.tsx
"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-muted-foreground text-sm">Welcome back.</p>
      </header>

      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="text-muted-foreground space-y-1 text-center text-sm">
        <p>
          <Link href={"/magic-link" as Route} className="underline-offset-4 hover:underline">
            Sign in via magic link
          </Link>{" "}
          ·{" "}
          <Link href={"/sign-up" as Route} className="underline-offset-4 hover:underline">
            Create account
          </Link>
        </p>
        <p>
          <Link href={"/forgot-password" as Route} className="underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </p>
      </div>

      {(process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" ||
        process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1") && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs uppercase">or</span>
            <Separator className="flex-1" />
          </div>
          <div className="grid gap-2">
            {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
              <Button
                variant="outline"
                className="w-full"
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                render={<a href="/api/auth/oauth/google/start" />}
              >
                Continue with Google
              </Button>
            )}
            {process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1" && (
              <Button
                variant="outline"
                className="w-full"
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                render={<a href="/api/auth/oauth/github/start" />}
              >
                Continue with GitHub
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 16: Re-skin sign-up page + add Google OAuth button with tier

**Files:**
- Modify: `src/app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Replace the page contents**

```tsx
// src/app/(auth)/sign-up/page.tsx
"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  const search = useSearchParams();
  const tierParam = search.get("tier");
  const validTier =
    tierParam === "essential" || tierParam === "premium" || tierParam === "enterprise"
      ? tierParam
      : null;
  const googleHref = validTier
    ? `/api/auth/oauth/google/start?tier=${encodeURIComponent(validTier)}`
    : "/api/auth/oauth/google/start";

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Create account</h2>
        {validTier && (
          <p className="text-muted-foreground text-sm">
            You picked the <span className="text-foreground font-medium capitalize">{validTier}</span>{" "}
            plan. Payment on the next step.
          </p>
        )}
      </header>

      <form action={action} className="grid gap-4">
        {validTier && <input type="hidden" name="tier" value={validTier} />}
        <div className="grid gap-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" required autoComplete="name" />
          {state?.fieldErrors?.displayName && (
            <p className="text-destructive text-sm">{state.fieldErrors.displayName}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
          {state?.fieldErrors?.email && (
            <p className="text-destructive text-sm">{state.fieldErrors.email}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password (12+ chars)</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
          {state?.fieldErrors?.password && (
            <p className="text-destructive text-sm">{state.fieldErrors.password}</p>
          )}
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs uppercase">or</span>
            <Separator className="flex-1" />
          </div>
          <Button
            variant="outline"
            className="w-full"
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            render={<a href={googleHref} />}
          >
            Continue with Google
          </Button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 17: Re-skin remaining auth pages

**Files (read each, then re-skin per the recipe at the top of this plan):**
- `src/app/(auth)/magic-link/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(auth)/verify-email/page.tsx`

- [ ] **Step 1: For each file, read it, then apply the recipe**

```bash
cat 'src/app/(auth)/magic-link/page.tsx'
# …re-skin per recipe…
cat 'src/app/(auth)/forgot-password/page.tsx'
# …re-skin per recipe…
cat 'src/app/(auth)/reset-password/page.tsx'
# …re-skin per recipe…
cat 'src/app/(auth)/verify-email/page.tsx'
# …re-skin per recipe…
```

The transforms are mechanical: raw inputs → `<Input>`, raw buttons → `<Button>`, raw `<label>` → `<Label htmlFor>`, error `<p>` → `<Alert variant="destructive">`. Preserve all form actions, hidden fields, and conditional rendering exactly as written. Use the sign-in page (Task 15) as a structural template.

- [ ] **Step 2: Typecheck after all four pages**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 18: Auth flow manual verification

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
```

- [ ] **Step 2: Load each auth page in a browser (or curl for smoke)**

```bash
for path in /sign-in /sign-up /magic-link /forgot-password /reset-password /verify-email; do
  echo "--- $path ---"
  curl -sf "http://localhost:3000$path" -o /dev/null && echo "OK" || echo "FAIL"
done
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

Expected: each path prints `OK`.

**For visual + behavior verification (you must open a browser):**
- [ ] `/sign-in` — form renders inside Card; submit with wrong creds shows Alert; magic-link / sign-up / forgot-password links work; OAuth section hidden when flag off, shows buttons when on.
- [ ] `/sign-up` — same; submit with weak password shows field error; with `?tier=premium` shows the tier banner and "Continue with Google" href includes `?tier=premium`.
- [ ] `/sign-up?tier=premium` then click "Continue with Google" — should redirect to Google (if env configured) and on return land on `/sign-up/checkout?tier=premium` (new user) or `/` (existing user).

---

### Task 19: Phase 3 verification + commit

**Files:** none

- [ ] **Step 1: Full check**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 2: Commit**

```bash
git add 'src/app/(auth)'
git commit -m "feat(ui): reskin auth pages with shadcn + add google oauth to signup"
```

---

## Phase 4 — Marketing (Group C)

### Task 20: Re-skin marketing layout + add ThemeToggle

**Files:**
- Modify: `src/app/(marketing)/layout.tsx`

- [ ] **Step 1: Read the existing layout**

```bash
cat 'src/app/(marketing)/layout.tsx'
```

- [ ] **Step 2: Apply the recipe + mount ThemeToggle in the header**

Add `<ThemeToggle />` somewhere visible in the header nav. Convert nav links to shadcn buttons where appropriate (e.g., a primary "Get started" CTA → `<Button>`, secondary nav links → `<Button variant="ghost" render={<Link href={…} />}>Label</Button>`). Apply the rest of the re-skin recipe.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 21: Re-skin marketing pages

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/(marketing)/products/page.tsx`

- [ ] **Step 1: Read both files**

```bash
cat 'src/app/(marketing)/page.tsx'
cat 'src/app/(marketing)/products/page.tsx'
```

- [ ] **Step 2: Apply the recipe**

Full-bleed hero sections keep their existing structure but use semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`). Feature cards become `<Card>`. CTAs become `<Button>`.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

---

### Task 22: Marketing verification + commit

**Files:** none

- [ ] **Step 1: Manual visual check in `pnpm dev`**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
curl -sf http://localhost:3000/ -o /dev/null && echo "/ OK"
curl -sf http://localhost:3000/products -o /dev/null && echo "/products OK"
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

Open both pages in a browser. Toggle theme via the header ThemeToggle (Light/Dark/System). Confirm slate-tinted neutrals in both modes.

- [ ] **Step 2: Full check**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(marketing)'
git commit -m "feat(ui): reskin marketing with shadcn + theme toggle"
```

---

## Phase 5 — Admin Shell (Group D)

### Task 23: Re-skin admin layout

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Read the existing layout**

```bash
cat src/app/admin/layout.tsx
```

- [ ] **Step 2: Apply the recipe — switch wrapper to shadcn layout primitives**

Use a two-column grid on desktop (sidebar + content), a `<Sheet>`-triggered drawer on mobile. The Sidebar component itself is rewritten in Task 24; this layout just hosts it.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 24: Re-skin admin Sidebar + ThemeToggle

**Files:**
- Modify: `src/app/admin/_components/Sidebar.tsx`

- [ ] **Step 1: Read the existing Sidebar**

```bash
cat src/app/admin/_components/Sidebar.tsx
```

- [ ] **Step 2: Apply the recipe**

- Sidebar header row: brand on the left, `<ThemeToggle />` and `<UserMenu />` on the right.
- Nav items: `<Button variant="ghost" render={<Link href={…} />}>Label</Button>` for inactive items; `variant="secondary"` for the active item (detect via `usePathname`).
- Mobile: render the same nav inside a `<Sheet>` (`<SheetTrigger>` is a hamburger `<Button variant="ghost" size="icon">` with `Menu` icon from lucide).

Import: `import { ThemeToggle } from "@/components/theme-toggle";`

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 25: Re-skin UserMenu

**Files:**
- Modify: `src/app/admin/_components/UserMenu.tsx`

- [ ] **Step 1: Read the existing UserMenu**

```bash
cat src/app/admin/_components/UserMenu.tsx
```

- [ ] **Step 2: Apply the recipe — convert to shadcn DropdownMenu over an Avatar trigger**

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
```

Trigger: `<Button variant="ghost" size="icon"><Avatar>…</Avatar></Button>`. Menu items: profile, settings, sign out (preserve existing actions and routes).

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 26: Admin shell verification + commit

**Files:** none

- [ ] **Step 1: Manual check**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
```

Sign in as an admin user. Visit `/admin`. Confirm:
- Sidebar renders on desktop, hamburger Sheet on mobile (resize browser to test).
- ThemeToggle works.
- UserMenu opens and items navigate.

```bash
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

- [ ] **Step 2: Full check**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx src/app/admin/_components/Sidebar.tsx \
        src/app/admin/_components/UserMenu.tsx
git commit -m "feat(ui): reskin admin shell with shadcn sidebar + user menu"
```

---

## Phase 6 — Admin Pages E1 (Dashboard / Profile / Settings)

### Task 27: Re-skin admin dashboard

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Read + apply the recipe**

```bash
cat src/app/admin/page.tsx
```

Apply re-skin. Common dashboard patterns: stat tiles become `<Card>` with `<CardHeader>` + `<CardContent>`; tables become shadcn `<Table>`; CTAs become `<Button>`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 28: Re-skin admin profile

**Files:**
- Modify: `src/app/admin/profile/page.tsx` (and any sibling components in that directory)

- [ ] **Step 1: List the directory**

```bash
ls src/app/admin/profile/
```

- [ ] **Step 2: Read each file and apply the recipe**

For each `.tsx` file in the profile directory, read it, apply the recipe (inputs → `<Input>`, labels → `<Label>`, buttons → `<Button>`, sections → `<Card>`).

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 29: Re-skin admin settings

**Files:**
- Modify: `src/app/admin/settings/page.tsx` and any sibling components

- [ ] **Step 1: List + read**

```bash
ls src/app/admin/settings/
```

- [ ] **Step 2: Apply the recipe to each file**

Settings pages commonly use tabs — use shadcn `<Tabs>` + `<TabsList>` + `<TabsTrigger>` + `<TabsContent>`. Toggle switches: shadcn doesn't ship a `<Switch>` by default — if needed, add via `pnpm dlx shadcn@latest add switch`. Otherwise use `<Checkbox>`.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 30: E1 verification + commit

- [ ] **Step 1: Manual visual check of `/admin`, `/admin/profile`, `/admin/settings` in dev**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
```

Open each page, verify forms still submit, theme toggle still works.

```bash
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

- [ ] **Step 2: Full check + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/app/admin/page.tsx src/app/admin/profile src/app/admin/settings
git commit -m "feat(ui): reskin admin dashboard, profile, settings"
```

---

## Phase 7 — Admin Pages E2 (Posts / Pages)

### Task 31: Re-skin admin posts pages

**Files:**
- Modify: `src/app/admin/posts/page.tsx` (index)
- Modify: `src/app/admin/posts/new/page.tsx`
- Modify: `src/app/admin/posts/[id]/page.tsx`
- Modify: any per-route components found alongside

- [ ] **Step 1: List + read each file**

```bash
find src/app/admin/posts -name "*.tsx" -not -name "*.test.*"
```

For each file: `cat <path>`; apply the recipe; preserve all BlockNote editor wiring (`@blocknote/shadcn` will inherit our shadcn CSS vars automatically — no code changes there). List/table views → `<Table>`. Status badges → `<Badge>`. Save buttons → `<Button>`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 32: Re-skin admin pages pages

**Files:**
- Modify: `src/app/admin/pages/*.tsx` (mirror the posts treatment)

- [ ] **Step 1: List + read each file**

```bash
find src/app/admin/pages -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe per file. The structure should closely mirror posts.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 33: E2 verification + commit

- [ ] **Step 1: Manual check**

In dev, navigate posts index → new post → edit existing post → pages index. Confirm: forms submit, BlockNote editor renders, theme toggle still works on all views.

- [ ] **Step 2: Full check + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/app/admin/posts src/app/admin/pages
git commit -m "feat(ui): reskin admin posts + pages with shadcn"
```

---

## Phase 8 — Admin Pages E3 (Media / Users / Taxonomies / Comments)

### Task 34: Re-skin admin/media

**Files:**
- Modify: all `.tsx` under `src/app/admin/media/`

- [ ] **Step 1: List + read each file**

```bash
find src/app/admin/media -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe. Media grid items → `<Card>`. Upload button → `<Button>` (preserve file-input wiring; don't break drag-and-drop).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 35: Re-skin admin/users

**Files:**
- Modify: all `.tsx` under `src/app/admin/users/`

- [ ] **Step 1: List + read each file**

```bash
find src/app/admin/users -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe. User list → `<Table>`. Role labels → `<Badge>`. Row actions → `<DropdownMenu>`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 36: Re-skin admin/taxonomies

**Files:**
- Modify: `src/app/admin/taxonomies/page.tsx` (and any siblings)

- [ ] **Step 1: List + read**

```bash
find src/app/admin/taxonomies -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 37: Re-skin admin/comments

**Files:**
- Modify: all `.tsx` under `src/app/admin/comments/`

- [ ] **Step 1: List + read**

```bash
find src/app/admin/comments -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe. Comment list rows → `<Card>` or `<Table>` depending on existing density. Approve/reject buttons → `<Button variant="default">` / `<Button variant="destructive">`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 38: E3 verification + commit

- [ ] **Step 1: Manual check** — navigate each of `/admin/media`, `/admin/users`, `/admin/taxonomies`, `/admin/comments` in dev.

- [ ] **Step 2: Full check + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/app/admin/media src/app/admin/users \
        src/app/admin/taxonomies src/app/admin/comments
git commit -m "feat(ui): reskin admin media, users, taxonomies, comments"
```

---

## Phase 9 — Admin Pages E4 (Plugins / Themes / AI / Import / Export + Components)

### Task 39: Re-skin admin/plugins

**Files:**
- Modify: all `.tsx` under `src/app/admin/plugins/`

- [ ] **Step 1: List + read**

```bash
find src/app/admin/plugins -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe. Plugin cards → `<Card>` with `<CardHeader>` (title), `<CardDescription>` (blurb), `<CardFooter>` (install/uninstall button).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 40: Re-skin admin/themes

**Files:**
- Modify: all `.tsx` under `src/app/admin/themes/`

- [ ] **Step 1: List + read**

```bash
find src/app/admin/themes -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe. Theme preview tiles → `<Card>`. Activate button → `<Button>`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 41: Re-skin admin/ai, admin/import, admin/export

**Files:**
- Modify: all `.tsx` under `src/app/admin/ai/`, `src/app/admin/import/`, `src/app/admin/export/`

- [ ] **Step 1: For each subdir, list + read + apply the recipe**

```bash
find src/app/admin/ai src/app/admin/import src/app/admin/export -name "*.tsx" -not -name "*.test.*"
```

Apply the recipe per file.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

---

### Task 42: Re-skin admin _components

**Files:**
- Modify: `src/app/admin/_components/AutoSeoButton.tsx`
- Modify: `src/app/admin/_components/RewritePanel.tsx`

- [ ] **Step 1: Re-skin AutoSeoButton**

Apply the recipe. The trigger button → `<Button variant="outline" size="sm">`. Error messages → `<Alert variant="destructive">` or inline `<p className="text-destructive text-sm">`. Loading state preserved.

- [ ] **Step 2: Re-skin RewritePanel**

```bash
cat src/app/admin/_components/RewritePanel.tsx
```

Apply the recipe. Likely a panel with inputs, action button, output area: panel container → `<Card>`, textarea → `<Textarea>`, action button → `<Button>`.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 43: E4 verification + commit

- [ ] **Step 1: Manual check** — navigate each of `/admin/plugins`, `/admin/themes`, `/admin/ai`, `/admin/import`, `/admin/export`; exercise AutoSeoButton from a post edit page; exercise RewritePanel if available.

- [ ] **Step 2: Full check + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/app/admin/plugins src/app/admin/themes src/app/admin/ai \
        src/app/admin/import src/app/admin/export \
        src/app/admin/_components/AutoSeoButton.tsx \
        src/app/admin/_components/RewritePanel.tsx
git commit -m "feat(ui): reskin admin plugins/themes/ai/import/export + components"
```

---

## Phase 10 — Misc (Group F)

### Task 44: Re-skin setup wizard

**Files:**
- Modify: `src/app/setup/page.tsx`

- [ ] **Step 1: Read + apply the recipe**

```bash
cat src/app/setup/page.tsx
```

Wizard step container → `<Card>`. Steps as `<Tabs>` if multi-step. Form fields → `<Input>` / `<Label>`. Action button → `<Button>`.

- [ ] **Step 2: Verify first-run flow on a fresh DB**

Manual check: with no theme cookie set (incognito window) and fresh DB, load `/setup`. Confirm: page renders cleanly in system theme; no hydration warning in console; form submits.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 45: Re-skin [locale] app chrome

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/blog/page.tsx`
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`
- Modify: `src/app/[locale]/[...slug]/page.tsx`

- [ ] **Step 1: Read each file**

```bash
cat 'src/app/[locale]/layout.tsx' \
    'src/app/[locale]/page.tsx' \
    'src/app/[locale]/blog/page.tsx' \
    'src/app/[locale]/blog/[slug]/page.tsx' \
    'src/app/[locale]/[...slug]/page.tsx'
```

- [ ] **Step 2: Re-skin ONLY the app chrome wrappers**

CRITICAL: the reader-facing content is rendered via the theme system (`themes/slate-default/*`), which is OUT OF SCOPE for this plan. Only re-skin app chrome (layout containers, locale switcher invocation, hreflang). Do NOT touch any component that renders the theme's `Hero`/`Heading`/`Paragraph`/etc.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

---

### Task 46: Misc verification + commit

- [ ] **Step 1: Manual check** — `/setup` on a fresh DB, locale routes render.

- [ ] **Step 2: Full check + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/app/setup 'src/app/[locale]'
git commit -m "feat(ui): reskin setup wizard + locale chrome"
```

---

## Phase 11 — Final Verification

### Task 47: Full verification suite

**Files:** none

- [ ] **Step 1: All checks pass**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all four succeed.

- [ ] **Step 2: Walk the manual checklist from spec §6.4**

Start dev (`pnpm dev`). For each item below, verify in a real browser:

- [ ] Sign in via email/password.
- [ ] Sign up via email/password (free, essential, premium, enterprise).
- [ ] Sign in via Google with `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=0` (button hidden).
- [ ] Sign in via Google with flag on, returning user → lands on `/`.
- [ ] Sign up via Google with flag on, no tier param → lands on `/`.
- [ ] Sign up via Google with flag on, `?tier=essential` → lands on `/sign-up/checkout?tier=essential`.
- [ ] Sign up via Google with flag on, `?tier=premium` → lands on `/sign-up/checkout?tier=premium`.
- [ ] Sign up via Google with flag on, `?tier=invalid` → no tier carried, lands on `/`.
- [ ] Theme toggle: Light / Dark / System on `/` (marketing), `/sign-in`, `/admin` dashboard.
- [ ] First-run `/setup` with no theme cookie → renders cleanly in system default.

If anything fails the manual checklist, fix it before merging.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/shadcn-and-google-oauth
```

- [ ] **Step 4: Open a PR**

```bash
gh pr create --title "feat(ui): shadcn migration + Google OAuth on sign-up" --body "$(cat <<'EOF'
## Summary
- Install shadcn UI (new-york, slate base palette, Tailwind v4 mode).
- Wire next-themes with light/dark/system toggle.
- Migrate every page under `src/app/*` and shared `src/components/*` to shadcn primitives.
- Add Google OAuth button to the sign-up page (env-gated by `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`).
- Preserve `?tier=` through the OAuth flow; new paid-tier signups land on `/sign-up/checkout?tier=X`.

## Out of scope
- `themes/slate-default/*` generated blog theme — separate follow-up spec.

## Test plan
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.
- [x] Manual checklist from spec §6.4 walked end-to-end.

Spec: `docs/superpowers/specs/2026-05-25-shadcn-migration-and-google-oauth-design.md`
Plan: `docs/superpowers/plans/2026-05-25-shadcn-migration-and-google-oauth.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes & Risk Reminders

- **BlockNote editor:** `@blocknote/shadcn` is already in deps. Once Group E2 (Posts) is rendered with the new CSS vars in place, the editor should inherit slate colors automatically. If it doesn't, check that the editor mount point is inside the ThemeProvider tree (it should be — the provider lives at the root).
- **Existing tests:** the only behavior-changing files in this plan are `src/auth/oauth/index.ts`, `src/app/api/auth/oauth/[provider]/start/route.ts`, and `src/app/api/auth/oauth/[provider]/callback/route.ts`. All other changes are presentational. If a non-auth test fails after a re-skin, you broke behavior — investigate before continuing.
- **Two-cookie boundary:** the tier cookie (`oauth_signup_tier`) and the existing OAuth state cookies (`slate_oauth_state_*`, `slate_oauth_pkce_*`) are siblings, all with 10-minute TTL, all cleared by the callback regardless of outcome. If you change one TTL, change the others — they describe the same OAuth flow lifetime.
