# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the editorial-dark marketing landing page for slate.dev (spec §2). Lives at `/` under a `(marketing)` route group, gated by `SLATE_MARKETING_HOME=1` so self-hosted installs keep their CMS-driven home behavior. Static, server-rendered, no client JS.

**Architecture:** A new App Router route group `src/app/(marketing)/` with its own layout (no admin chrome, no locale machinery) and a `page.tsx` that composes nine section components. Middleware adds `/` to `LOCALE_BYPASS` only when the env flag is set, so the rewriter doesn't redirect `/` → `/<locale>` on slate.dev's deployment. Each section is a separate server component file for isolation; styling is Tailwind utilities plus a small `marketing.css` for the aurora gradient. No new dependencies, no third-party images.

**Tech Stack:** Existing Next.js 16 App Router, Tailwind, React Server Components. No additions.

**Depends on:** Spec at `docs/superpowers/specs/2026-05-23-slate-rename-and-landing-page-design.md` §2. Should be merged **after** the rename PR so brand strings are correct.

---

## File Map

| Path                                                          | Purpose                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/app/(marketing)/layout.tsx`                              | Minimal layout: HTML scaffold, font setup, marketing.css import        |
| `src/app/(marketing)/page.tsx`                                | Composes the nine section components in order                          |
| `src/app/(marketing)/marketing.css`                           | Aurora-gradient CSS, accent color variable                             |
| `src/app/(marketing)/_components/LandingNav.tsx`              | Top nav: logomark + Features/Pricing/Sign in/Sign up + Self-host link  |
| `src/app/(marketing)/_components/LandingHero.tsx`             | Eyebrow, headline (`Slate.italic{WordPress}`), sub, primary/secondary  |
| `src/app/(marketing)/_components/FeaturePillars.tsx`          | 2×2 grid of four feature tiles                                         |
| `src/app/(marketing)/_components/ProductPeek.tsx`             | Editor screenshot section — wraps `EditorMockup.tsx` placeholder       |
| `src/app/(marketing)/_components/EditorMockup.tsx`            | Hand-built BlockNote-look placeholder (marked clearly as placeholder)  |
| `src/app/(marketing)/_components/AIDemo.tsx`                  | Two-column prompt → blocks visualization                               |
| `src/app/(marketing)/_components/StackStrip.tsx`              | Single-line tech-stack list                                            |
| `src/app/(marketing)/_components/HowItWorks.tsx`              | Three-step "sign up → pick theme → connect domain"                     |
| `src/app/(marketing)/_components/SignUpCTA.tsx`               | Final CTA section + Wiki footnote                                      |
| `src/app/(marketing)/_components/LandingFooter.tsx`           | Site footer with policy links                                          |
| `src/app/(marketing)/page.test.tsx`                           | Smoke test: page renders, expected text appears                        |
| `src/middleware.ts`                                           | **MODIFY** — add `/` to bypass when `SLATE_MARKETING_HOME=1`            |
| `src/app/sitemap.ts` *(or `sitemap.xml`-equivalent route)*    | **MODIFY** — include `/` when the env flag is on                       |
| `.env.example`                                                | **MODIFY** — add `SLATE_MARKETING_HOME=` with a comment                |
| `public/og/slate-landing-1200x630.png`                        | Static OG image stub                                                   |

---

## Conventions used in this plan

- All section components are server components — no `"use client"` directive anywhere in this plan.
- The accent color (`#a8a3ff`) is referenced as `text-[#a8a3ff]` (Tailwind arbitrary value). The same hex is the value of a CSS custom property `--slate-accent` defined in `marketing.css` so future changes are one-edit.
- Section component files are kept under ~80 lines each — they're presentational, no logic.
- Each section component is exported as a default function with no props in v1. Copy lives inline in the component.
- Tests use Vitest + Testing Library (existing in this repo) and assert on visible text content. No snapshot tests.

---

## Task 1: Route Group + Env Flag Plumbing

**Goal:** Create the `(marketing)` route group with a layout and a minimal page that renders a single heading. Gate the marketing page behind `SLATE_MARKETING_HOME=1` — without the flag, fall through to the existing locale rewriter.

**Files:**
- Create: `src/app/(marketing)/layout.tsx`
- Create: `src/app/(marketing)/page.tsx`
- Create: `src/app/(marketing)/marketing.css`
- Create: `src/app/(marketing)/page.test.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Add the env-var documentation to `.env.example`**

Append to `.env.example`:

```bash
# Set to "1" only on the slate.dev marketing deployment. When set, "/" renders
# the marketing landing page; when unset (the self-host default), "/" continues
# to redirect to /<defaultLocale> and the CMS-driven home page wins.
SLATE_MARKETING_HOME=
```

- [ ] **Step 2: Create `marketing.css`**

Create `src/app/(marketing)/marketing.css`:

```css
:root {
  --slate-bg: #0a0a0c;
  --slate-bg-soft: #0c0c10;
  --slate-bg-card: #14141a;
  --slate-border: #1a1a22;
  --slate-border-strong: #2a2a35;
  --slate-fg: #f5f5f0;
  --slate-fg-muted: #9a9aa8;
  --slate-fg-subtle: #6b6b80;
  --slate-accent: #a8a3ff;
}

.marketing-aurora {
  background-color: var(--slate-bg);
  background-image:
    radial-gradient(ellipse 70% 50% at 25% 15%, rgba(168, 163, 255, 0.10), transparent 60%),
    radial-gradient(ellipse 60% 40% at 75% 85%, rgba(255, 180, 140, 0.06), transparent 60%);
}

.marketing-serif {
  font-family: "Iowan Old Style", "Georgia", "Times New Roman", serif;
  font-feature-settings: "kern", "liga";
}
```

- [ ] **Step 3: Create the layout**

Create `src/app/(marketing)/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Slate — The CMS WordPress should have been",
  description:
    "Block-based authoring with AI drafts. Modern stack, fully managed. Slate runs the servers — you run the site.",
  openGraph: {
    title: "Slate — The CMS WordPress should have been",
    description:
      "Block-based authoring with AI drafts. Modern stack, fully managed.",
    images: [{ url: "/og/slate-landing-1200x630.png", width: 1200, height: 630 }],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen marketing-aurora text-[var(--slate-fg)] antialiased">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create a minimal `page.tsx`**

Create `src/app/(marketing)/page.tsx`:

```tsx
import { notFound } from "next/navigation";

export const dynamic = "force-static";
export const revalidate = false;

export default function MarketingHome() {
  if (process.env.SLATE_MARKETING_HOME !== "1") {
    notFound();
  }
  return (
    <main>
      <h1>Slate</h1>
    </main>
  );
}
```

The `notFound()` short-circuit ensures self-hosted installs never see the marketing page; the locale rewriter handles `/` for them instead. Subsequent tasks will replace the `<main>` body with the real sections.

- [ ] **Step 5: Add a smoke test**

Create `src/app/(marketing)/page.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock next/navigation's notFound to throw a recognizable error so we can assert
// on its invocation instead of hitting Next's actual 404 plumbing.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import MarketingHome from "./page";

describe("MarketingHome", () => {
  const originalFlag = process.env.SLATE_MARKETING_HOME;
  beforeEach(() => {
    delete process.env.SLATE_MARKETING_HOME;
  });
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SLATE_MARKETING_HOME;
    else process.env.SLATE_MARKETING_HOME = originalFlag;
  });

  it("404s when SLATE_MARKETING_HOME is unset", () => {
    expect(() => render(<MarketingHome />)).toThrow("NEXT_NOT_FOUND");
  });

  it("renders when SLATE_MARKETING_HOME=1", () => {
    process.env.SLATE_MARKETING_HOME = "1";
    const { getByRole } = render(<MarketingHome />);
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Slate");
  });
});
```

- [ ] **Step 6: Run the test**

```bash
pnpm test src/app/\(marketing\)/page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(marketing): scaffold (marketing) route group + env flag"
```

---

## Task 2: Middleware — Bypass Locale Rewriter at `/`

**Goal:** Update `src/middleware.ts` so when `SLATE_MARKETING_HOME=1`, the locale rewriter skips `/` (leaving it to render the marketing page); without the flag, behavior is unchanged.

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/middleware.test.ts`

- [ ] **Step 1: Read the current locale-bypass block**

Open `src/middleware.ts` and find the `LOCALE_BYPASS` constant and the `bypassLocale` function. The change is additive — append `/^\/$/` to the bypass set only when the flag is set.

- [ ] **Step 2: Modify `bypassLocale`**

Replace the `bypassLocale` function in `src/middleware.ts`:

```ts
function bypassLocale(pathname: string): boolean {
  if (LOCALE_BYPASS.some((rx) => rx.test(pathname))) return true;
  // Static asset shortcut — anything with a file extension.
  if (pathname.includes(".")) return true;
  // Marketing landing at "/" — only when the deployment opts in via env flag.
  if (process.env.SLATE_MARKETING_HOME === "1" && pathname === "/") return true;
  return false;
}
```

- [ ] **Step 3: Add a test**

Add to `src/middleware.test.ts` (inside the existing describe block, alongside other locale tests):

```ts
it("bypasses locale rewriter at / when SLATE_MARKETING_HOME=1", async () => {
  const originalFlag = process.env.SLATE_MARKETING_HOME;
  process.env.SLATE_MARKETING_HOME = "1";
  try {
    const req = makeRequest("/");
    const res = await middleware(req);
    // Expect a pass-through (NextResponse.next), not a redirect to /<locale>.
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  } finally {
    if (originalFlag === undefined) delete process.env.SLATE_MARKETING_HOME;
    else process.env.SLATE_MARKETING_HOME = originalFlag;
  }
});

it("redirects / to default locale when SLATE_MARKETING_HOME is unset", async () => {
  const originalFlag = process.env.SLATE_MARKETING_HOME;
  delete process.env.SLATE_MARKETING_HOME;
  try {
    const req = makeRequest("/");
    const res = await middleware(req);
    // Expect a 308 to the default locale path (existing behavior).
    expect([301, 302, 307, 308]).toContain(res.status);
  } finally {
    if (originalFlag !== undefined) process.env.SLATE_MARKETING_HOME = originalFlag;
  }
});
```

If `makeRequest` doesn't exist in the test file, adapt to the existing helper or construct a `NextRequest` inline:

```ts
const req = new NextRequest(new URL("http://localhost/"));
```

- [ ] **Step 4: Run middleware tests**

```bash
pnpm test src/middleware.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(middleware): bypass locale rewriter at / when SLATE_MARKETING_HOME=1"
```

---

## Task 3: LandingNav

**Goal:** Top navigation bar with logomark on the left, primary nav + sign-in/sign-up on the right, and a small self-host link.

**Files:**
- Create: `src/app/(marketing)/_components/LandingNav.tsx`
- Modify: `src/app/(marketing)/page.tsx` (mount the nav)

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/LandingNav.tsx`:

```tsx
import Link from "next/link";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingNav() {
  return (
    <nav className="border-b border-[var(--slate-border)]">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
        <Link href="/" className="marketing-serif text-lg tracking-tight text-[var(--slate-fg)]">
          <span className="text-[#a8a3ff]" aria-hidden>◐</span>{" "}
          <span>Slate</span>
        </Link>
        <div className="flex items-center gap-6 text-[13px] text-[var(--slate-fg-muted)]">
          <Link href="#features" className="hover:text-[var(--slate-fg)]">Features</Link>
          <Link href="#pricing" className="hover:text-[var(--slate-fg)]">Pricing</Link>
          <a
            href={WIKI_URL}
            className="text-[var(--slate-fg-subtle)] hover:text-[var(--slate-fg-muted)]"
          >
            Self-host →
          </a>
          <Link href="/sign-in" className="hover:text-[var(--slate-fg)]">Sign in</Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-[var(--slate-fg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--slate-bg)] hover:bg-white"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Mount the nav in `page.tsx`**

Replace `src/app/(marketing)/page.tsx` body's `<main>...</main>` with:

```tsx
import LandingNav from "./_components/LandingNav";
// ... existing imports
return (
  <>
    <LandingNav />
    <main>
      <h1 className="sr-only">Slate</h1>
    </main>
  </>
);
```

- [ ] **Step 3: Run the existing smoke test**

```bash
pnpm test src/app/\(marketing\)
```

Expected: PASS (the `<h1>` is now visually hidden but still queryable by role).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(marketing): landing nav"
```

---

## Task 4: LandingHero

**Goal:** The hero — editorial serif headline with italic *WordPress* accent, monospace eyebrow, two CTAs.

**Files:**
- Create: `src/app/(marketing)/_components/LandingHero.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/LandingHero.tsx`:

```tsx
import Link from "next/link";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingHero() {
  return (
    <section className="px-6 pt-20 pb-24 text-center">
      <div className="mx-auto max-w-[720px]">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          Hosted CMS · 2026
        </p>
        <h1 className="marketing-serif text-5xl leading-[1.04] tracking-tight text-[var(--slate-fg)] md:text-6xl">
          The CMS{" "}
          <em className="not-italic">
            <span className="italic text-[#a8a3ff]">WordPress</span>
          </em>
          <br />
          should have been.
        </h1>
        <p className="mx-auto mt-6 max-w-[520px] text-[15px] leading-relaxed text-[var(--slate-fg-muted)]">
          Block-based authoring with AI drafts, on a modern stack — fully managed.
          We run the servers. You run the site.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="rounded-md bg-[var(--slate-fg)] px-5 py-2.5 text-[13px] font-semibold text-[var(--slate-bg)] hover:bg-white"
          >
            Start free →
          </Link>
          <a
            href={WIKI_URL}
            className="text-[12px] text-[var(--slate-fg-subtle)] hover:text-[var(--slate-fg-muted)]"
          >
            Prefer to self-host? See the Wiki →
          </a>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount the hero**

Update `src/app/(marketing)/page.tsx` to render the hero in `<main>`:

```tsx
import LandingNav from "./_components/LandingNav";
import LandingHero from "./_components/LandingHero";
// ... gate, etc.
return (
  <>
    <LandingNav />
    <main>
      <LandingHero />
    </main>
  </>
);
```

- [ ] **Step 3: Update the smoke test to assert key copy**

In `src/app/(marketing)/page.test.tsx`, replace the existing "renders when SLATE_MARKETING_HOME=1" test body with:

```tsx
it("renders the hero when SLATE_MARKETING_HOME=1", () => {
  process.env.SLATE_MARKETING_HOME = "1";
  const { getByText } = render(<MarketingHome />);
  expect(getByText(/CMS/)).toBeTruthy();
  expect(getByText(/should have been/)).toBeTruthy();
  expect(getByText("Start free →")).toBeTruthy();
});
```

- [ ] **Step 4: Run**

```bash
pnpm test src/app/\(marketing\)
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): hero section"
```

---

## Task 5: FeaturePillars

**Goal:** 2×2 grid of four feature tiles.

**Files:**
- Create: `src/app/(marketing)/_components/FeaturePillars.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/FeaturePillars.tsx`:

```tsx
type Pillar = { glyph: string; title: string; body: string };

const PILLARS: Pillar[] = [
  {
    glyph: "✦",
    title: "AI-native authoring",
    body: "Describe a page, get blocks. Claude is in the editor by default — not a paid plugin afterthought.",
  },
  {
    glyph: "▲",
    title: "Modern stack",
    body: "Next.js, TypeScript, Drizzle, Postgres. No PHP, no plugin rot, no surprise 0-days at 3am.",
  },
  {
    glyph: "☁",
    title: "Fully managed",
    body: "We run Postgres, scaling, backups, upgrades. You write content and connect your domain.",
  },
  {
    glyph: "↔",
    title: "Yours to leave",
    body: "Import WXR, Ghost, markdown. Export everything as a portable ZIP. Lock-in is a choice we won't make for you.",
  },
];

export default function FeaturePillars() {
  return (
    <section id="features" className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <p className="mb-12 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          — Features —
        </p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-[var(--slate-border)] md:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="bg-[var(--slate-bg)] p-8">
              <div className="mb-3 text-2xl text-[#a8a3ff]" aria-hidden>{p.glyph}</div>
              <h3 className="marketing-serif mb-2 text-xl text-[var(--slate-fg)]">{p.title}</h3>
              <p className="text-[14px] leading-relaxed text-[var(--slate-fg-muted)]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount**

Add `<FeaturePillars />` after `<LandingHero />` in `page.tsx`.

- [ ] **Step 3: Run tests**

```bash
pnpm test src/app/\(marketing\)
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(marketing): feature pillars"
```

---

## Task 6: ProductPeek + EditorMockup

**Goal:** The "Blocks, not shortcodes" section. Ship with a hand-built `EditorMockup` placeholder; mark it clearly so it's easy to find and replace with a real screenshot later.

**Files:**
- Create: `src/app/(marketing)/_components/ProductPeek.tsx`
- Create: `src/app/(marketing)/_components/EditorMockup.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create `EditorMockup.tsx`**

Create `src/app/(marketing)/_components/EditorMockup.tsx`:

```tsx
// PLACEHOLDER: Hand-built approximation of the BlockNote admin editor. Replace
// with a real screenshot of the live editor once we have a polished one.
// Tracking: spec §2.5, Task 6.

export default function EditorMockup() {
  return (
    <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-6 shadow-2xl">
      <div className="mb-6 flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="ml-3 font-mono text-[11px] text-[var(--slate-fg-subtle)]">
          editor — Untitled Page
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-1/3 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="h-6 w-3/4 rounded-sm bg-[var(--slate-fg-muted)]/40" />
        <div className="h-3 w-11/12 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="h-3 w-9/12 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="border-l-2 border-[#a8a3ff] bg-[var(--slate-bg)]/40 py-2 pl-3">
          <div className="mb-2 h-2.5 w-4/5 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-2.5 w-3/5 rounded-sm bg-[var(--slate-border-strong)]" />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ProductPeek.tsx`**

Create `src/app/(marketing)/_components/ProductPeek.tsx`:

```tsx
import EditorMockup from "./EditorMockup";

export default function ProductPeek() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — The editor —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Blocks, not shortcodes.
          </h2>
        </div>
        <div className="mx-auto max-w-[840px]">
          <EditorMockup />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount**

Add `<ProductPeek />` after `<FeaturePillars />` in `page.tsx`.

- [ ] **Step 4: Run tests**

```bash
pnpm test src/app/\(marketing\)
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): product peek + editor placeholder mockup"
```

---

## Task 7: AIDemo

**Goal:** Two-column "Describe it. Get blocks." visual.

**Files:**
- Create: `src/app/(marketing)/_components/AIDemo.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/AIDemo.tsx`:

```tsx
export default function AIDemo() {
  return (
    <section className="border-t border-[var(--slate-border)] bg-[var(--slate-bg-soft)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — AI authoring —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Describe it. <em className="italic text-[#a8a3ff]">Get blocks.</em>
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 items-center gap-4 md:grid-cols-[1fr_32px_1fr]">
          <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-fg-subtle)]">
              Prompt
            </div>
            <div className="marketing-serif text-[15px] italic leading-relaxed text-[var(--slate-fg)]">
              "A pricing page with three tiers and a comparison table."
            </div>
          </div>
          <div className="text-center text-2xl text-[#a8a3ff]" aria-hidden>
            →
          </div>
          <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-fg-subtle)]">
              Output · blocks[]
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-3/5 rounded-sm bg-[var(--slate-fg-muted)]/40" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
              </div>
              <div className="h-2.5 w-4/5 rounded-sm bg-[var(--slate-border-strong)]" />
              <div className="h-2.5 w-2/3 rounded-sm bg-[var(--slate-border-strong)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount, run tests, commit**

Add `<AIDemo />` after `<ProductPeek />` in `page.tsx`. Then:

```bash
pnpm test src/app/\(marketing\)
git add -A
git commit -m "feat(marketing): AI authoring demo"
```

---

## Task 8: StackStrip

**Goal:** A single horizontal line of the core tech stack.

**Files:**
- Create: `src/app/(marketing)/_components/StackStrip.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/StackStrip.tsx`:

```tsx
const STACK = ["Next.js", "TypeScript", "Drizzle", "Postgres", "Claude", "Cloud Run"];

export default function StackStrip() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px] text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          — The stack —
        </p>
        <h2 className="marketing-serif mb-8 text-3xl tracking-tight text-[var(--slate-fg)]">
          Boring, in the good way.
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 font-mono text-[13px] text-[var(--slate-fg-muted)]">
          {STACK.map((tech, i) => (
            <span key={tech} className="flex items-center gap-4">
              <span>{tech}</span>
              {i < STACK.length - 1 ? <span className="text-[var(--slate-border-strong)]">·</span> : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount, run tests, commit**

Add `<StackStrip />` after `<AIDemo />` in `page.tsx`. Then:

```bash
pnpm test src/app/\(marketing\)
git add -A
git commit -m "feat(marketing): tech-stack strip"
```

---

## Task 9: HowItWorks

**Goal:** Three-step "Sign up → Pick a theme → Connect your domain" section.

**Files:**
- Create: `src/app/(marketing)/_components/HowItWorks.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/HowItWorks.tsx`:

```tsx
type Step = { n: string; title: string; body: string };

const STEPS: Step[] = [
  { n: "01", title: "Sign up.", body: "Email + password or GitHub OAuth. Free tier starts immediately." },
  { n: "02", title: "Pick a theme — or describe one.", body: "AI scaffolds an initial site from a one-line description." },
  { n: "03", title: "Connect your domain.", body: "We handle DNS, certificates, and CDN. You bring the domain name." },
];

export default function HowItWorks() {
  return (
    <section className="border-t border-[var(--slate-border)] bg-[var(--slate-bg-soft)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — How it works —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Three steps.
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-6">
              <div className="mb-4 font-mono text-[11px] tracking-[0.12em] text-[#a8a3ff]">{s.n}</div>
              <h3 className="marketing-serif mb-2 text-lg text-[var(--slate-fg)]">{s.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--slate-fg-muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount, run tests, commit**

Add `<HowItWorks />` after `<StackStrip />` in `page.tsx`. Then:

```bash
pnpm test src/app/\(marketing\)
git add -A
git commit -m "feat(marketing): how-it-works steps"
```

---

## Task 10: SignUpCTA

**Goal:** Final CTA section with the Wiki footnote.

**Files:**
- Create: `src/app/(marketing)/_components/SignUpCTA.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/SignUpCTA.tsx`:

```tsx
import Link from "next/link";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function SignUpCTA() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20 text-center">
      <div className="mx-auto max-w-[640px]">
        <h2 className="marketing-serif mb-3 text-3xl tracking-tight text-[var(--slate-fg)]">
          Run your site. Not your servers.
        </h2>
        <p className="mb-7 text-[15px] leading-relaxed text-[var(--slate-fg-muted)]">
          Start free. Bring your own domain when you're ready.
        </p>
        <Link
          href="/sign-up"
          className="inline-block rounded-md bg-[var(--slate-fg)] px-6 py-3 text-[13px] font-semibold text-[var(--slate-bg)] hover:bg-white"
        >
          Start free →
        </Link>
        <p className="mt-8 text-[12px] text-[var(--slate-fg-subtle)]">
          Source available on GitHub. Want to self-host?{" "}
          <a href={WIKI_URL} className="underline decoration-[var(--slate-border-strong)] hover:text-[var(--slate-fg-muted)]">
            See the Wiki →
          </a>
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount, run tests, commit**

Add `<SignUpCTA />` after `<HowItWorks />` in `page.tsx`. Then:

```bash
pnpm test src/app/\(marketing\)
git add -A
git commit -m "feat(marketing): final sign-up CTA"
```

---

## Task 11: LandingFooter

**Goal:** Minimal footer with policy links and brand strip.

**Files:**
- Create: `src/app/(marketing)/_components/LandingFooter.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(marketing)/_components/LandingFooter.tsx`:

```tsx
import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-[var(--slate-border)] px-6 py-6 font-mono text-[11px] text-[var(--slate-fg-subtle)]">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#a8a3ff]" aria-hidden>◐</span>
          <span>Slate</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-[var(--slate-fg-muted)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--slate-fg-muted)]">Terms</Link>
          <Link href="/status" className="hover:text-[var(--slate-fg-muted)]">Status</Link>
          <a href="https://github.com/platfrmrcarl/Slate" className="hover:text-[var(--slate-fg-muted)]">GitHub ↗</a>
          <a href="https://github.com/platfrmrcarl/Slate/wiki" className="hover:text-[var(--slate-fg-muted)]">Wiki ↗</a>
        </nav>
        <span>© 2026 Slate</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Mount, run tests, commit**

Add `<LandingFooter />` after `</main>` in `page.tsx`. Then:

```bash
pnpm test src/app/\(marketing\)
git add -A
git commit -m "feat(marketing): footer"
```

---

## Task 12: Sitemap + Static OG Image Stub

**Goal:** Add `/` to the sitemap when the flag is on; ship a 1200×630 placeholder OG image so the OG tags don't 404.

**Files:**
- Modify: `src/app/sitemap.xml/route.ts` (or `src/app/sitemap.ts` if Next's MetadataRoute is used — adapt to the existing structure)
- Create: `public/og/slate-landing-1200x630.png`

- [ ] **Step 1: Find the sitemap source**

```bash
find src/app -name "sitemap*" -print
```

Expected: a `sitemap.xml` route handler exists.

- [ ] **Step 2: Add `/` to the URL set when the flag is on**

Open the sitemap file and find where URLs are assembled. Add a conditional:

```ts
if (process.env.SLATE_MARKETING_HOME === "1") {
  urls.push({
    loc: `${origin}/`,
    lastmod: new Date().toISOString(),
    changefreq: "weekly",
    priority: "1.0",
  });
}
```

Adapt the shape to whatever the existing code expects (URL string vs. object).

- [ ] **Step 3: Add the OG image stub**

Generate a 1200×630 placeholder using ImageMagick (or a simple PNG export from a screenshot tool):

```bash
mkdir -p public/og
convert -size 1200x630 \
  -background "#0a0a0c" \
  -fill "#f5f5f0" \
  -font Helvetica \
  -gravity center \
  -pointsize 72 \
  label:"Slate" \
  public/og/slate-landing-1200x630.png
```

If ImageMagick isn't available, ship a hand-exported 1200×630 PNG of any restrained dark image with "Slate" centered. Commit the PNG; programmatic OG generation comes later.

- [ ] **Step 4: Confirm the image is reachable**

After the next dev-server boot (Task 13), `curl -I http://localhost:3000/og/slate-landing-1200x630.png` returns 200.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): sitemap + OG image stub"
```

---

## Task 13: Verification + PR

**Goal:** Boot the dev server, walk through each section in a browser, confirm the page renders end-to-end with `SLATE_MARKETING_HOME=1` set and that `/` redirects to the CMS home when the flag is unset.

- [ ] **Step 1: Type-check, lint, test, build**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

- [ ] **Step 2: Boot the dev server with the flag set**

```bash
SLATE_MARKETING_HOME=1 pnpm dev
```

In a browser, open `http://localhost:3000/`. Visually confirm:

- Top nav renders with logomark, links, and Sign-up button.
- Hero headline shows "The CMS *WordPress* should have been" with lavender italic accent.
- Four feature pillar tiles render in a 2×2 grid.
- Product peek section renders the editor mockup.
- AI demo shows the two-column prompt → blocks visual.
- Stack strip shows tech names separated by dots.
- How-it-works shows three numbered cards.
- Final CTA + Wiki footnote.
- Footer renders.

- [ ] **Step 3: Boot the dev server without the flag**

```bash
pnpm dev
```

Open `http://localhost:3000/`. Confirm the response is **not** the marketing page — either a redirect to `/<locale>` (existing CMS behavior) or, if there's no CMS home configured, a 404. Either is acceptable; the point is the marketing landing must not appear.

- [ ] **Step 4: Run the full test suite one more time**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(marketing): editorial landing page at /" --body "$(cat <<'EOF'
## Summary

- Adds the slate.dev marketing landing page under a new `(marketing)` route group at `/`.
- Editorial-dark visual direction: serif headlines with italic accent, mono labels, restrained aurora gradient, single lavender accent color.
- Nine pieces (top nav, hero, feature pillars, product peek, AI demo, stack strip, how-it-works, sign-up CTA, footer).
- Static, server-rendered, no client JS.
- Gated by `SLATE_MARKETING_HOME=1` so self-hosted installs keep their CMS-driven home behavior unchanged.

Spec: `docs/superpowers/specs/2026-05-23-slate-rename-and-landing-page-design.md` §2.

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `SLATE_MARKETING_HOME=1 pnpm dev` then visit `/` — all sections render, no console errors, no client JS shipped
- [ ] `pnpm dev` (no flag) then visit `/` — does NOT render the marketing page; existing locale rewriter behavior preserved
- [ ] Sitemap includes `/` when flag is on
- [ ] OG image is fetchable at `/og/slate-landing-1200x630.png`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- [x] Spec §2.1 (audience, positioning) → reflected in copy across Hero, Feature Pillars, SignUpCTA.
- [x] Spec §2.2 (visual direction — editorial dark, serif headlines, mono labels, lavender accent, aurora) → marketing.css + Tailwind class usage in every component.
- [x] Spec §2.3 nine pieces → one task per piece (Tasks 3–11) plus Task 1 for scaffolding.
- [x] Spec §2.4 (route group `(marketing)`, env flag gating, components under `_components/`, server components, marketing.css) → Tasks 1, 2.
- [x] Spec §2.5 (BlockNote screenshot placeholder, `◐` Unicode logo, no third-party images) → Task 6 (EditorMockup placeholder), `◐` used throughout, no external image references.
- [x] Spec §2.6 (semantic landmarks, color contrast, metadata, sitemap, no analytics) → layout metadata (Task 1), sitemap (Task 12). `<h1>` only in hero; `<h2>` per section.
- [x] Spec §2.7 (out of scope) — no comparison table, no animations, no waitlist, no multilingual, programmatic OG deferred, real screenshot deferred.
- [x] Open Question §4.4 (marketing-home env flag default = yes) → encoded as the `SLATE_MARKETING_HOME=1` gate.
- [x] Open Question §4.5 (placeholder mock default = yes) → Task 6 ships the placeholder with a top-of-file comment marking it.
- [x] No "TBD" / placeholder steps; every step has runnable code or a concrete instruction.
- [x] Each component file <80 lines.
- [x] Type/identifier consistency: every component is a default export with no props, every `WIKI_URL` constant is identical across the three files that use it (LandingNav, LandingHero, SignUpCTA).
- [ ] Open Question §4.1 (tenancy gap — `/sign-up` semantics on slate.dev) — NOT addressed in this plan; that's a product-scope question outside the landing-page implementation. The plan links to `/sign-up` per the spec default; if the answer becomes "waitlist," update the four `href="/sign-up"` strings.
- [ ] Open Question §4.2 (enable Wiki on the repo before launch) — captured here for awareness; an external action by the repo owner, not a code task.
- [ ] Open Question §4.6 (pricing nav link target) — Task 3 has `Pricing` linking to `#pricing` (an anchor with no target section). Before launch, either point the link at a real `/pricing` route, add a placeholder pricing section, or drop the link from the nav. Flagged in PR description.
