# Slate Rename + Marketing Landing Page — Design Spec

**Status:** Draft v1 · **Date:** 2026-05-23 · **Owner:** carl@platfrmr.com

Two bundled deliverables, ordered:

1. Rename the product from **WordPressKiller** to **Slate** across the project.
2. Build a marketing landing page for slate.dev positioning Slate as a **hosted CMS service** for developers and agencies. Self-hosting is a secondary path, pointed at the GitHub Wiki.

The rename ships first so the landing page can reference the final brand consistently.

**Business model note**: Slate is sold and operated as a hosted service — the company runs the CMS, the customer brings content and a domain. The repository itself remains source-available so anyone can read the code, audit it, or self-host with effort — but the marketing landing page is for the hosted product, not the open-source release.

---

## 1. Rename: WordPressKiller → Slate

### 1.1 Scope (full rename)

All variants of the old brand are replaced. Inventory of occurrences (114 files):

| Variant       | Count | Replacement      | Notes                                                          |
| ------------- | ----- | ---------------- | -------------------------------------------------------------- |
| `wpk-`        | 254   | `slate-`         | Theme dir prefix (`wpk-default` → `slate-default`), CSS classes, etc. |
| `wpkiller`    | 118   | `slate`          | Package names, identifiers                                     |
| `wpk_`        | 59    | `slate_`         | Env var prefixes (`WPK_*` → `SLATE_*`), cookie names (`wpk_session` → `slate_session`), DB rows if any |
| `WordPressKiller` | 58 | `Slate`         | Brand strings, docs, comments                                  |
| `@wpkiller`   | 10    | `@slate`         | pnpm workspace package scope (`@wpkiller/cli` → `@slate/cli`)  |
| `wordpresskiller` | 9 | `slate`          | `package.json` name, kebab-case identifiers                    |

### 1.2 Non-string surfaces that need attention

- **Theme directory**: `themes/wpk-default/` → `themes/slate-default/`. Theme manifest references inside; update both sides.
- **pnpm workspace package**: `packages/cli` exports as `@wpkiller/cli`. Rename the package, update consumers, regenerate `pnpm-lock.yaml`.
- **Session cookie**: `wpk_session` is set/read in `src/auth/cookies.ts` and friends. Renaming logs everyone out — acceptable for pre-1.0 product; document as a "session reset on upgrade" note in CHANGELOG.
- **Environment variables**: `WPK_*` prefixed vars (if any) in `.env.example` and Terraform. Update both, and add a one-line shim or migration note.
- **Database identifiers**: scan migrations for `wpk_`-prefixed table/column names. If any exist, add a rename migration (next sequential snapshot). If none, no DB change needed.
- **Repository name**: already `platfrmrcarl/Slate` on GitHub — no change required.
- **Spec document**: `WordPressKiller.md` → `Slate.md` (rename file; update README cross-reference).

### 1.3 Out of scope

- Git history rewrites — old commit messages keep the original name.
- External resources (Cloud Run service name, GCP project IDs) — those are deployment-level and outside this repo.

### 1.4 Verification

After the rename: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and a fresh `pnpm install && pnpm build` must all pass. Plus a grep sweep: `grep -ri "wordpresskiller\|wpkiller\|@wpkiller\|wpk-\|wpk_\|WPK_" src packages themes plugins docs` should return zero hits outside intentional historical references (e.g., a single `CHANGELOG.md` line noting the rename).

---

## 2. Landing Page

### 2.1 Audience and positioning

**Primary audience**: developers and agencies who want a modern CMS for their sites or their clients' sites but don't want to operate it. They've felt WordPress's pain — hosting, security patches, plugin rot — and would pay to skip that.

**Positioning**: "The CMS WordPress should have been — and we run it for you." Block-based authoring with AI drafts, on a modern stack, **fully managed**, content stays portable. Two implicit promises: better than WordPress in product, easier than WordPress in operations.

**Open-source / self-host posture**: source-available on GitHub. The marketing page mentions it in passing with a link to the Wiki. We don't hide it, but we don't sell it either — the page sells the hosted service.

### 2.2 Visual direction — Editorial Dark

- **Ground**: deep slate-black (`#0a0a0c`), section variations to `#0c0c10` / `#14141a`. Restrained aurora tint via two radial gradients (lavender `#a8a3ff` + warm amber, both ~6-10% opacity).
- **Display type**: serif (Georgia / system serif stack initially; can upgrade to a hosted serif later). Italic on key accent words (e.g., the word *WordPress* in the hero).
- **Body type**: system sans (`ui-sans-serif`) for prose.
- **Labels and code**: monospace (`ui-monospace`) for section eyebrows, badges, CLI snippets.
- **Single accent color**: lavender `#a8a3ff` for italicized words, icons, terminal prompts.
- **Spacing**: generous — section padding ~48-72px vertical, max-width ~720px for prose, ~1100px for the wider product peek and AI demo sections.
- **Motion**: minimal. Subtle fade-in on scroll if cheap; no parallax, no auto-playing video.

### 2.3 Page structure

Seven content sections, plus a top nav and footer (nine pieces total). Vertical stack, no nav drawer:

1. **Top nav** — Logomark (`◐ Slate`) on the left; on the right: `Features` · `Pricing` · `Sign in` · **Sign up** (button). A small `Self-host →` link sits as a low-emphasis text link, pointing to the Wiki.
2. **Hero**
   - Eyebrow: `Hosted CMS · 2026`
   - Headline: "The CMS *WordPress* should have been."
   - Sub: "Block-based authoring with AI drafts, on a modern stack — fully managed. We run the servers. You run the site."
   - Primary CTA: **Start free →** → `/sign-up` (hosted-product onboarding).
   - Secondary CTA: a small text link, "Prefer to self-host? See the Wiki →" → GitHub Wiki URL.
3. **Feature pillars** — 2×2 grid of four tiles. Note: "Self-host in 15 min" is replaced by "Fully managed" — managed hosting is the product, self-host is a side door:
   - ✦ **AI-native authoring** — describe a page, get blocks. Claude in the editor by default.
   - ▲ **Modern stack** — Next.js, TypeScript, Drizzle, Postgres. No PHP, no plugin rot.
   - ☁ **Fully managed** — we run Postgres, scaling, backups, upgrades. You write content.
   - ↔ **Yours to leave** — import WXR, Ghost, markdown; export everything as a portable ZIP. Lock-in is a choice we won't make for you.
4. **Product peek** — "Blocks, not shortcodes." Real screenshot of the BlockNote editor in the Slate admin UI. (Until we have a polished screenshot, ship with a hand-crafted SVG/HTML mockup that approximates the editor surface; the placeholder is identified as such in code so we don't ship it long-term.)
5. **AI authoring demo** — "Describe it. *Get blocks.*" Two-column visual: a natural-language prompt on the left, a structured `blocks[]` result rendered as visual blocks on the right, with an arrow between them.
6. **Stack strip** — "Boring, in the good way." Single horizontal line of the core technologies (`Next.js · TypeScript · Drizzle · Postgres · Claude · Cloud Run`), mono font, separator dots between. This reassures the dev/agency audience the underlying tech is sound — it's the same payoff Vercel and Linear get from showing their stack.
7. **How it works** — Replaces the open-source "Quickstart" section. "Three steps." A short numbered visual:
   1. **Sign up.** Email + password or GitHub OAuth.
   2. **Pick a theme — or describe one.** AI scaffolds an initial site.
   3. **Connect your domain.** We handle DNS, certs, and CDN.
8. **Final CTA / sign-up**
   - Headline: "Run your site. Not your servers."
   - Sub: "Start free. Bring your own domain when you're ready."
   - Primary CTA: **Start free →** → `/sign-up`.
   - Footnote line beneath the CTA, smaller and quieter: "Source available on GitHub. Want to self-host? See the [Wiki](https://github.com/platfrmrcarl/Slate/wiki) →"
9. **Footer** — `◐ Slate` and a single-line of policy links (Privacy · Terms · Status · GitHub · Wiki) on one side; copyright on the other. Mono font, single thin top border.

#### What's NOT in §2.3 anymore

- The hero's primary CTA used to go to GitHub; now goes to `/sign-up`.
- The "Quickstart" section with a `gh repo clone` snippet has been removed — that's a self-host concern, deferred to the Wiki.
- The pre-rewrite final CTA was "Star on GitHub"; now it's "Start free."

### 2.4 Routing and code placement

- **Route**: `src/app/(marketing)/page.tsx` — root path `/`. Route group keeps it out of the locale and admin trees.
- **Layout**: `src/app/(marketing)/layout.tsx` — minimal layout (no admin chrome, no locale machinery). Imports the dark editorial font + Tailwind base from `globals.css`.
- **Middleware**: add `/` (exact match) to `LOCALE_BYPASS` in `src/middleware.ts`, so the locale rewriter doesn't redirect `/` → `/<defaultLocale>`. **Trade-off**: this displaces the previous CMS-driven home behavior. To preserve self-hosters' ability to set their own CMS home, gate the marketing route on an env var: `SLATE_MARKETING_HOME=1` (set on slate.dev's deployment) enables the marketing landing at `/`; unset (the self-host default), the locale rewriter behaves as today and the user's CMS `home` page wins.
- **Components**: each section gets its own component under `src/app/(marketing)/_components/`:
  - `LandingNav.tsx`
  - `LandingHero.tsx`
  - `FeaturePillars.tsx`
  - `ProductPeek.tsx`
  - `AIDemo.tsx`
  - `StackStrip.tsx`
  - `HowItWorks.tsx`
  - `SignUpCTA.tsx`
  - `LandingFooter.tsx`
  
  Small, focused, server components by default. None of these need client interactivity in v1.
- **Styling**: Tailwind utility classes, plus a small `marketing.css` import inside the layout for the gradient backgrounds and aurora tint (anything that's easier as CSS than as a stack of utilities). No new theme system.

### 2.5 Assets

- **BlockNote screenshot**: needed for the product peek section. Until we have a polished one, the section ships with a hand-built HTML/SVG mock that visually approximates the editor; the mock file is named `EditorMockup.tsx` and includes a top-of-file comment marking it as a placeholder so it's easy to find and replace.
- **Logomark `◐`**: rendered as the Unicode character in v1. A real SVG mark can come later without changing the page.
- **No third-party images** — no Unsplash, no avatars, no logos. The page is graphically restrained on purpose.

### 2.6 Accessibility and SEO

- Semantic landmarks: one `<main>`, one `<h1>` (the hero), `<h2>`s for each section.
- Color contrast: text-on-ground hits WCAG AA at the default sizes. The italic accent on `#a8a3ff` against `#0a0a0c` is ~7.5:1, fine.
- Page-level metadata: `<title>Slate — The CMS WordPress should have been</title>`, OG tags with a generated 1200×630 OG image (stub a static one in v1; programmatic OG can come later).
- Sitemap: include `/` in `src/app/sitemap.xml` (already exists; add the marketing route to its set when the env flag is on).
- No analytics in v1 — explicit non-goal.

### 2.7 Out of scope (deferred)

- **vs WordPress comparison table** — considered, dropped to keep the page confident rather than petty.
- **Animations / scroll effects** beyond minimal fade-in.
- **Newsletter signup, waitlist, blog teaser** — not in v1.
- **Multi-language landing copy** — English only. The marketing route is intentionally outside the `[locale]` machinery.
- **Programmatic OG image generation** — static OG for v1.
- **Real BlockNote screenshot** — placeholder mock for v1, swap to real screenshot when available.

---

## 3. Implementation ordering

1. **PR 1 — Rename**: mechanical refactor across the codebase. Verification gate: typecheck, lint, tests, build. CHANGELOG line noting the cookie/env break.
2. **PR 2 — Landing page**: add the marketing route group, build the sections, gate behind `SLATE_MARKETING_HOME=1`. Verification gate: visit `/` locally with the env var set and confirm each section renders; visit without the var and confirm CMS home behavior is unchanged.

Two PRs, not one — they're independently reviewable and the rename PR is large and mostly mechanical.

---

## 4. Open questions for review

1. **Tenancy gap between marketing and product.** The page sells a hosted multi-tenant service ("we run the servers"), but the current `/sign-up` route registers a user against a single Slate instance — multi-tenant SaaS is a v2 goal in `Slate.md` (was `WordPressKiller.md`). Options:
   1. **Single-tenant slate.dev for now**: slate.dev runs one Slate instance; "sign up" creates a user on that instance who can author content there. Crisp and shippable, but conflates "the marketing site" with "a CMS instance."
   2. **Sign-up = waitlist for now**: `/sign-up` on the marketing page goes to a waitlist form; full provisioning ships with the v2 multi-tenant work.
   3. **Pull v2 multi-tenant forward**: build the SaaS provisioning before this landing page goes live. Largest scope.
   Default in this spec: **(i) single-tenant slate.dev** because it's the smallest gap to ship.

2. **GitHub Wiki status.** The Wiki feature is currently disabled on `platfrmrcarl/Slate`. To make the "See the Wiki" links work, enable the Wiki on the repo and seed it with a single "Self-hosting Slate" page that points at the existing `README.md` quickstart. Implementation PR will not ship until the Wiki page exists.

3. **Cookie / env rename break.** OK to log everyone out and require updating local `.env` files on the rename PR? (Default: yes; documented in CHANGELOG.)

4. **Marketing-home env flag.** Agreed that the marketing landing is opt-in via `SLATE_MARKETING_HOME=1` (set on slate.dev only) so it doesn't displace self-hosters' CMS home? (Default: yes.)

5. **BlockNote screenshot.** Ship with a hand-built placeholder mock for v1, capture and swap real screenshot post-merge? (Default: yes.)

6. **Pricing.** The top nav includes a `Pricing` link, but no pricing exists yet. Default: the link scrolls to a "Pricing" anchor section with a "Coming soon — pricing announced at launch" placeholder, or it's removed from v1 nav. Pick one before implementation.
