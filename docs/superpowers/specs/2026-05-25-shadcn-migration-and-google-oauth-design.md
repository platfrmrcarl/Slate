# shadcn UI Migration + Google OAuth on Sign-Up — Design Spec

**Status:** Draft v1 · **Date:** 2026-05-25 · **Owner:** carl@platfrmr.com

Three coupled deliverables for the Slate app:

1. Install shadcn UI with the **mist** base neutral palette as default, on Tailwind v4 (mist is the v4 cool blue-gray equivalent of the legacy `slate`, which v4 dropped — see §2.1).
2. Add `next-themes` for system/light/dark mode with a UI toggle.
3. Migrate every page and shared component under `src/app/*` and `src/components/*` to shadcn primitives in one focused push, and add a "Continue with Google" button to the sign-up page with tier preservation through the OAuth flow.

The generated blog theme system (`themes/slate-default/*`) is **out of scope** for this spec and will get its own follow-up.

---

## 1. Goals & Scope

### 1.1 In scope

- Install shadcn (Tailwind v4 mode) with base color `slate`, new-york style, CSS variables.
- Wire `next-themes` with `defaultTheme="system"`, light/dark toggle in admin shell + marketing nav.
- Migrate all app UI to shadcn primitives:
  - Auth: `sign-in`, `sign-up`, `magic-link`, `forgot-password`, `reset-password`, `verify-email`
  - Marketing: `(marketing)/page.tsx`, `(marketing)/products/page.tsx`
  - Admin shell + sidebar + all `admin/*` pages
  - Setup wizard
  - `[locale]` app chrome (not theme-rendered content)
- Add "Continue with Google" button to the sign-up page, gated by `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=1`.
- Preserve `?tier=essential|premium|enterprise` through Google OAuth: when the button is clicked on sign-up with a tier param, encode it server-side in a signed cookie keyed to OAuth state, and have the callback redirect to `/sign-up/checkout?tier=X` for new users on paid tiers.

### 1.2 Out of scope (deferred to follow-up specs)

- `themes/slate-default/*` generated blog theme adopting shadcn.
- GitHub OAuth UI work (backend exists; sign-in page already has the button; no sign-up button planned in this spec).
- BlockNote editor styling — already uses `@blocknote/shadcn` (in deps) and will pick up shadcn CSS variables automatically once they exist.

### 1.3 Already done (no work needed)

- Google OAuth backend: `arctic` lib, `src/auth/oauth/google.ts`, `api/auth/oauth/[provider]/start/route.ts`, `api/auth/oauth/[provider]/callback/route.ts`, tests.
- Sign-in page already renders "Continue with Google" when the env flag is on.

---

## 2. Architecture & Key Decisions

### 2.1 Tailwind v4 + shadcn integration

The project is on `tailwindcss@4` and `@tailwindcss/postcss@4`. `globals.css` is currently just `@import "tailwindcss"` and `tailwind.config.ts` has no theme extensions.

shadcn's Tailwind v4 mode does not extend `tailwind.config.ts`; it injects design tokens as CSS variables directly in `globals.css` with a `@theme inline` block that maps those variables to Tailwind utilities.

**Base color note:** shadcn v4 dropped the legacy `slate` base color. The v4 base color set is `neutral`, `stone`, `zinc`, `mauve`, `olive`, `mist`, `taupe`. We use **`mist`** — a cool blue-gray neutral (hues 213°–228°) that is the v4 spiritual successor to the legacy `slate`. The v4 CLI has no `--base-color` flag, so init defaults to `neutral` and we manually swap the token block in `globals.css` to mist's values (sourced from the v4 base-colors registry) and update `components.json` to set `tailwind.baseColor: "mist"`.

### 2.2 Component organization

- shadcn primitives → `src/components/ui/` (CLI default).
- `cn()` helper → `src/lib/utils.ts` (CLI default).
- Existing `src/components/*` (Hreflang, LanguageSwitcher, `blog/*`) stay in place, re-skinned.
- Admin composites stay in `src/app/admin/_components/` (existing convention).
- New `src/components/theme-toggle.tsx`.

### 2.3 Dark mode infrastructure

- `next-themes` provider mounted in `src/app/layout.tsx`.
- Settings: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
- `<html suppressHydrationWarning>` required to suppress the next-themes class-mutation warning.
- `<ThemeToggle>` mounted in `admin/_components/Sidebar.tsx` header and `(marketing)/layout.tsx` nav.
- Toggle component guards against SSR mismatch with a mounted-state check (renders nothing until mounted).

### 2.4 OAuth tier preservation

The OAuth start route is extended to accept an optional `tier` query param. Flow:

1. User on `/sign-up?tier=premium` clicks "Continue with Google".
2. Button href is `/api/auth/oauth/google/start?tier=premium`.
3. `start` route validates the tier against the allow-list (`essential|premium|enterprise`). If invalid, silently drop (do not 400 — degrade gracefully).
4. If valid, set a short-lived cookie `oauth_signup_tier` (10 min TTL matching OAuth state TTL, HttpOnly, Secure, SameSite=Lax) containing the tier value. The cookie is a sibling to the existing OAuth state cookie — both are set at start, both are read and cleared at callback. The OAuth state validation already prevents replay; the tier cookie does not need additional binding.
5. Callback route reads the tier cookie after successful state validation.
6. If the user is **new** (account created in this callback) AND tier cookie is present → redirect to `/sign-up/checkout?tier=X`.
7. If the user is **existing** (sign-in flow) → ignore tier, use default post-sign-in redirect.
8. Clear the tier cookie after read regardless of outcome.

The cookie attributes (HttpOnly, Secure, SameSite, TTL) match the existing OAuth state/PKCE cookies set by the start route.

### 2.5 Sign-up OAuth button placement

Same env-gated treatment as sign-in: rendered after the email/password form, separated by a shadcn `<Separator>` with an "or" label. Tier param flows through the button href.

### 2.6 Deferred: shared `<AuthLayout>` extraction

Not pre-designed. We will extract a shared auth shell organically if duplication becomes obvious while re-skinning the six auth pages. Avoids speculative abstraction.

---

## 3. shadcn Install & Theming Setup

### 3.1 Install commands

```bash
npx shadcn@latest init
# answers: TypeScript yes, style new-york, base color defaults to neutral, CSS variables yes, RSC yes
# (then patch components.json baseColor=mist and replace token blocks in globals.css per plan)

# generate primitives needed for migration in one batch:
npx shadcn@latest add button input label card separator alert form select \
  textarea checkbox radio-group dropdown-menu avatar badge tabs dialog \
  sheet table tooltip toast skeleton

pnpm add next-themes
```

shadcn init writes `components.json`, updates `globals.css`, and adds runtime deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`, and `@radix-ui/*` peers as primitives are added.

### 3.2 globals.css final shape (sketch)

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.129 0.042 264.695);
  /* …full slate token set from shadcn… */
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.129 0.042 264.695);
  --foreground: oklch(0.984 0.003 247.858);
  /* …slate dark variants… */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* …maps tokens to Tailwind utilities… */
}
```

### 3.3 ThemeProvider wiring

`src/app/layout.tsx`:

- `<html lang=... suppressHydrationWarning>`.
- Body wrapped in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`.

### 3.4 ThemeToggle component

`src/components/theme-toggle.tsx`:

- shadcn `<DropdownMenu>` over a `<Button variant="ghost" size="icon">` with sun/moon icons from `lucide-react`.
- Items: Light / Dark / System, each calling `setTheme(...)` from `useTheme()`.
- Returns `null` until mounted.
- Mounted in `admin/_components/Sidebar.tsx` header and `(marketing)/layout.tsx` nav.

---

## 4. Component Migration Plan

Six PR groups, bottom-up. Each group passes typecheck + lint + test before merging.

### Group A — Foundation

- `src/app/layout.tsx` — add `<ThemeProvider>`, `suppressHydrationWarning`, body font setup.
- `src/components/theme-toggle.tsx` — new.
- `src/components/ui/*` — generated shadcn primitives (one commit, batch).
- `src/lib/utils.ts` — `cn()` helper (CLI-generated if not present).

### Group B — Auth flow + OAuth changes

- `(auth)/layout.tsx` — wrap children in shadcn `<Card>` centered on screen.
- `(auth)/sign-in/page.tsx` — `<Input>`, `<Label>`, `<Button>`; `<Alert variant="destructive">` for errors; OAuth section uses `<Button variant="outline">` + Google icon + `<Separator>`.
- `(auth)/sign-up/page.tsx` — same treatment; **add OAuth button (env-gated)** with `tier` propagated through the start URL.
- `(auth)/magic-link/page.tsx`, `(auth)/forgot-password/page.tsx`, `(auth)/reset-password/page.tsx`, `(auth)/verify-email/page.tsx` — re-skin only.
- `api/auth/oauth/[provider]/start/route.ts` — accept and validate `tier` query param, persist in `oauth_signup_tier` signed cookie keyed to state.
- `api/auth/oauth/[provider]/callback/route.ts` — read tier cookie; if new user + tier present → redirect to `/sign-up/checkout?tier=X`; clear cookie after read.

### Group C — Marketing

- `(marketing)/layout.tsx` — header with `<ThemeToggle>`, nav links as shadcn buttons.
- `(marketing)/page.tsx`, `(marketing)/products/page.tsx` — re-skin with `<Card>`, typography utilities.

### Group D — Admin shell

- `admin/layout.tsx` — apply shadcn layout primitives.
- `admin/_components/Sidebar.tsx` — convert to shadcn `<Sheet>` on mobile, fixed sidebar on desktop; mount `<ThemeToggle>`.
- `admin/_components/UserMenu.tsx` — shadcn `<DropdownMenu>`.

### Group E — Admin pages (split into sub-groups)

- **E1:** `admin/page.tsx` (dashboard), `admin/profile`, `admin/settings`
- **E2:** `admin/posts/*` (index, new, `[id]`), `admin/pages/*`
- **E3:** `admin/media`, `admin/users`, `admin/taxonomies`, `admin/comments`
- **E4:** `admin/plugins/*`, `admin/themes`, `admin/ai`, `admin/import`, `admin/export`
- `admin/_components/AutoSeoButton.tsx`, `admin/_components/RewritePanel.tsx` — re-skin.

### Group F — Misc

- `setup/page.tsx` (setup wizard) — re-skin.
- `[locale]/layout.tsx`, `[locale]/page.tsx`, `[locale]/blog/page.tsx`, `[locale]/blog/[slug]/page.tsx`, `[locale]/[...slug]/page.tsx` — re-skin only the app-chrome wrappers; leave theme-rendered content alone (belongs to the deferred blog-theme spec).

### Group ordering

A → B → C → D → E (E1 → E2 → E3 → E4) → F. F may land independently of E if E grows large.

---

## 5. Error Handling

### 5.1 OAuth tier propagation

- Invalid `tier` value on start route → silently drop (no 400). Treat as "no tier" sign-up.
- Tier cookie present + existing user on callback → ignore tier, use default post-sign-in redirect.
- Tier cookie TTL: 10 min (matches OAuth state TTL).
- Cookie always cleared after read on callback, regardless of outcome.

### 5.2 shadcn migration

No new runtime error paths — re-skinning is presentational. Existing form action state shapes (`state?.error`, `state?.fieldErrors`) are preserved; rendered via `<Alert>` / `<FormMessage>` instead of raw `<p>`.

### 5.3 Theme toggle

- `next-themes` SSR mismatch suppressed via `suppressHydrationWarning` on `<html>` plus a mounted-state guard in `<ThemeToggle>`.

---

## 6. Testing

### 6.1 Existing tests stay green

The only behavior-changing files are the two OAuth routes; all other changes are presentational. Existing route tests must continue to pass:

- `src/app/api/auth/oauth/oauth.route.test.ts`
- `src/app/api/auth/oauth/[provider]/callback/route.test.ts`
- `src/app/api/auth/oauth/[provider]/start/route.test.ts`

### 6.2 New tests

- `start/route.test.ts`: valid tier value persists cookie; invalid tier ignored (no cookie set); no tier behaves as today.
- `callback/route.test.ts`: tier cookie + new user → redirect `/sign-up/checkout?tier=X`; tier cookie + existing user → ignored, default redirect; cookie cleared after read in both cases.

### 6.3 No snapshot tests for migrated pages

Visual changes are the point; snapshots would churn. Rely on existing component/unit tests (`Hreflang.test.tsx`, `LanguageSwitcher.test.tsx`).

### 6.4 Manual verification checklist

- Sign in via email/password.
- Sign up via email/password (free, essential, premium, enterprise).
- Sign in via Google with `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=0` (button hidden).
- Sign in via Google with flag on, returning user → dashboard.
- Sign up via Google with flag on, no tier → dashboard.
- Sign up via Google with flag on, `?tier=essential` → `/sign-up/checkout?tier=essential`.
- Sign up via Google with flag on, `?tier=premium` → `/sign-up/checkout?tier=premium`.
- Sign up via Google with flag on, `?tier=invalid` → no tier carried, dashboard.
- Theme toggle: Light / Dark / System on marketing page, sign-in page, admin dashboard.
- First-run `setup/page.tsx` with no theme cookie → renders system default cleanly.

---

## 7. Verification Before Completion

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm test` — all green.
- `pnpm build` — succeeds.
- `pnpm dev` — manual checklist (§6.4) walks cleanly.

---

## 8. Risk Callouts

- **BlockNote editor:** `@blocknote/shadcn` already in deps but currently unused. Once admin post editor wires it up, it'll inherit shadcn CSS vars automatically. Eyeball during E2 migration.
- **Setup wizard:** runs pre-auth, pre-theme-cookie; `next-themes` `defaultTheme="system"` handles this without intervention. Verify on fresh DB.
- **`[locale]` content rendering:** the reader-facing content for blogs is rendered via the `themes/` system, which is out of scope. Only the app chrome around it gets re-skinned in this spec — do not accidentally touch theme rendering.

---

## 9. Out of Scope / Follow-ups

- **Generated blog theme system** (`themes/slate-default/*`): separate spec. Its token system (`tokens.css.ts`) and component family (`Button`, `Heading`, `Hero`, `Image`, `Layout`, `Paragraph`) have a different architecture from the app shell and warrant their own design discussion.
- **GitHub OAuth on sign-up page:** can mirror the Google approach once Google ships and is validated.
- **Shared `<AuthLayout>` / `<AuthForm>` composite components:** extract organically if duplication emerges during Group B; not pre-designed.
