# Multilingual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the locale + translation columns that block-editor-core and posts-taxonomies-comments have already declared on `pages` and `posts` into a working multilingual experience: locale-prefixed routing (`/fr/about`, `/en/blog/hello`), AI-assisted "Translate to…" flow that creates a sibling row in the target locale, automatic `hreflang` alternates, a language switcher available to themes, and a settings UI to manage the enabled locale set.

**Architecture:** Locale lives on each translatable row (`pages.locale`, `posts.locale`). A canonical row is identified by `translation_of = NULL`; every translation rows points back to it via `translation_of`. Public routes are wrapped in `/[locale]/...` segments. The default locale optionally hides its prefix (configurable in settings). A small `i18n` service resolves the current locale from the URL, returns the locale set from settings, and walks the `translation_of` graph to find sibling translations for `hreflang` emission.

**No new external dependencies.** Translation uses `translateBlocks` from the **ai-features** sub-plan; the AI translation flow degrades gracefully when AI is disabled (the editor opens a blank target-locale row for manual entry).

**Depends on:**

- foundation, auth-and-users, block-editor-core, posts-taxonomies-comments (locale columns + slug-uniqueness scoped to locale already exist).
- ai-features (`translateBlocks`).
- themes (theme `Layout` receives a `languages` prop with the per-page translations).

---

## File Map

| Path                                             | Purpose                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                               | **MODIFY** — confirm `pages.translationOf` + `posts.translationOf` self-FK declarations (formalize) |
| `src/db/migrations/0007_multilingual.sql`        | Adds FK constraint + i18n settings seed                                                             |
| `src/i18n/locales.ts`                            | Built-in locale catalogue (code, English name, native name, RTL flag)                               |
| `src/i18n/locales.test.ts`                       | Tests                                                                                               |
| `src/i18n/settings.ts`                           | Persist + read enabled locales / default locale via `settings` table                                |
| `src/i18n/settings.test.ts`                      | Tests                                                                                               |
| `src/i18n/url.ts`                                | URL ↔ locale helpers (prefix on/off, route building)                                                |
| `src/i18n/url.test.ts`                           | Tests                                                                                               |
| `src/i18n/translations.ts`                       | Resolve sibling translations for a row across locales                                               |
| `src/i18n/translations.test.ts`                  | Tests                                                                                               |
| `src/middleware.ts`                              | **MODIFY** — locale resolution + redirect                                                           |
| `src/app/[locale]/layout.tsx`                    | Per-locale layout wrapper passing `languages` to theme                                              |
| `src/app/[locale]/page.tsx`                      | Per-locale home                                                                                     |
| `src/app/[locale]/[...slug]/page.tsx`            | Per-locale page                                                                                     |
| `src/app/[locale]/blog/page.tsx`                 | Per-locale blog index                                                                               |
| `src/app/[locale]/blog/[slug]/page.tsx`          | Per-locale single post                                                                              |
| `src/app/[locale]/blog/category/[slug]/page.tsx` | Per-locale category archive                                                                         |
| `src/app/[locale]/blog/tag/[slug]/page.tsx`      | Per-locale tag archive                                                                              |
| `src/components/LanguageSwitcher.tsx`            | Server Component theme primitive                                                                    |
| `src/components/Hreflang.tsx`                    | Emits `<link rel="alternate" hreflang="..."/>`                                                      |
| `src/app/actions/translations.ts`                | Server Action: translatePage / translatePost                                                        |
| `src/app/actions/translations.test.ts`           | Tests                                                                                               |
| `src/app/admin/settings/locales/page.tsx`        | Admin: enabled-locales settings                                                                     |
| `src/app/admin/posts/[id]/TranslateButton.tsx`   | Per-row "Translate to…" UI                                                                          |
| `src/app/admin/pages/[id]/TranslateButton.tsx`   | Mirror for pages                                                                                    |
| `src/posts/service.ts`                           | **MODIFY** — `getPostBySlug` accepts a locale (already), `findCanonical` helper                     |
| `src/pages/service.ts`                           | **MODIFY** — mirror helper for pages                                                                |

---

## Task 1: Locale catalogue (TDD)

**Files:**

- Create: `src/i18n/locales.ts`
- Create: `src/i18n/locales.test.ts`

- [ ] **Step 1: Write failing tests**

`src/i18n/locales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ALL_LOCALES, findLocale, isLocaleCode } from "./locales";

describe("ALL_LOCALES", () => {
  it("includes en, fr, es, de, ja, ar (RTL), zh-Hans", () => {
    const codes = ALL_LOCALES.map((l) => l.code);
    expect(codes).toEqual(expect.arrayContaining(["en", "fr", "es", "de", "ja", "ar", "zh-Hans"]));
  });

  it("marks Arabic as rtl=true", () => {
    expect(findLocale("ar")?.rtl).toBe(true);
  });

  it("has English+native names for every locale", () => {
    for (const l of ALL_LOCALES) {
      expect(l.englishName).toBeTruthy();
      expect(l.nativeName).toBeTruthy();
    }
  });
});

describe("findLocale", () => {
  it("returns the matching locale", () => {
    expect(findLocale("fr")?.code).toBe("fr");
  });
  it("returns undefined for an unknown code", () => {
    expect(findLocale("zz")).toBeUndefined();
  });
});

describe("isLocaleCode", () => {
  it("accepts simple lowercase codes", () => {
    expect(isLocaleCode("en")).toBe(true);
    expect(isLocaleCode("fr")).toBe(true);
  });
  it("accepts script-tagged codes", () => {
    expect(isLocaleCode("zh-Hans")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isLocaleCode("../etc/passwd")).toBe(false);
    expect(isLocaleCode("English")).toBe(false);
    expect(isLocaleCode("EN")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm test src/i18n/locales.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/i18n/locales.ts`:

```ts
export interface Locale {
  code: string;
  englishName: string;
  nativeName: string;
  rtl?: true;
}

export const ALL_LOCALES: ReadonlyArray<Locale> = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "de", englishName: "German", nativeName: "Deutsch" },
  { code: "it", englishName: "Italian", nativeName: "Italiano" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "pt-BR", englishName: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands" },
  { code: "pl", englishName: "Polish", nativeName: "Polski" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
  { code: "ko", englishName: "Korean", nativeName: "한국어" },
  { code: "zh-Hans", englishName: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-Hant", englishName: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "ru", englishName: "Russian", nativeName: "Русский" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", rtl: true },
  { code: "he", englishName: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", englishName: "Thai", nativeName: "ไทย" },
];

const CODE_RE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|[A-Z][a-z]{3}))?$/;

export function isLocaleCode(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!CODE_RE.test(value)) return false;
  return ALL_LOCALES.some((l) => l.code === value);
}

export function findLocale(code: string): Locale | undefined {
  return ALL_LOCALES.find((l) => l.code === code);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test src/i18n/locales.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales.ts src/i18n/locales.test.ts
git commit -m "feat(i18n): locale catalogue + validation"
```

---

## Task 2: i18n settings (TDD)

**Files:**

- Create: `src/i18n/settings.ts`
- Create: `src/i18n/settings.test.ts`
- Create: `src/db/migrations/0007_multilingual.sql`

- [ ] **Step 1: Write failing tests**

`src/i18n/settings.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { settings } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  getI18nSettings,
  setI18nSettings,
  enabledLocales,
  defaultLocale,
  invalidateI18nSettings,
} from "./settings";

const HAS_DB = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(settings)
    .where(sql`${settings.key} = 'i18n'`);
  await closeDb();
});

beforeEach(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(settings)
    .where(sql`${settings.key} = 'i18n'`);
  invalidateI18nSettings();
});

describe.runIf(HAS_DB)("i18n settings", () => {
  it("defaults to en-only, hidePrefix=true when no row exists", async () => {
    const s = await getI18nSettings();
    expect(s).toEqual({ defaultLocale: "en", enabledLocales: ["en"], hideDefaultPrefix: true });
  });

  it("setI18nSettings persists and read returns updated", async () => {
    await setI18nSettings({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: false,
    });
    expect(await defaultLocale()).toBe("en");
    expect(await enabledLocales()).toEqual(["en", "fr"]);
  });

  it("rejects setting when defaultLocale is not in enabledLocales", async () => {
    await expect(
      setI18nSettings({
        defaultLocale: "fr",
        enabledLocales: ["en"],
        hideDefaultPrefix: true,
      }),
    ).rejects.toThrow(/defaultLocale must be in enabledLocales/);
  });

  it("rejects an empty enabledLocales list", async () => {
    await expect(
      setI18nSettings({ defaultLocale: "en", enabledLocales: [], hideDefaultPrefix: true }),
    ).rejects.toThrow(/at least one locale/);
  });

  it("rejects unknown locale codes", async () => {
    await expect(
      setI18nSettings({
        defaultLocale: "en",
        enabledLocales: ["en", "zz"],
        hideDefaultPrefix: true,
      }),
    ).rejects.toThrow(/unknown locale/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/i18n/settings.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/i18n/settings.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { isLocaleCode } from "./locales";

export interface I18nSettings {
  defaultLocale: string;
  enabledLocales: string[];
  hideDefaultPrefix: boolean;
}

const DEFAULTS: I18nSettings = {
  defaultLocale: "en",
  enabledLocales: ["en"],
  hideDefaultPrefix: true,
};

const TTL_MS = 30_000;
let cached: { value: I18nSettings; expiresAt: number } | null = null;

export function invalidateI18nSettings(): void {
  cached = null;
}

export async function getI18nSettings(): Promise<I18nSettings> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const rows = await db().select().from(settings).where(eq(settings.key, "i18n"));
  const value = (rows[0]?.value as I18nSettings | undefined) ?? DEFAULTS;
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

export async function defaultLocale(): Promise<string> {
  return (await getI18nSettings()).defaultLocale;
}

export async function enabledLocales(): Promise<string[]> {
  return (await getI18nSettings()).enabledLocales;
}

export async function setI18nSettings(value: I18nSettings): Promise<void> {
  if (value.enabledLocales.length === 0) throw new Error("at least one locale required");
  for (const code of value.enabledLocales) {
    if (!isLocaleCode(code)) throw new Error(`unknown locale: ${code}`);
  }
  if (!value.enabledLocales.includes(value.defaultLocale)) {
    throw new Error("defaultLocale must be in enabledLocales");
  }
  await db()
    .insert(settings)
    .values({ key: "i18n", value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
  invalidateI18nSettings();
}
```

- [ ] **Step 4: Generate + commit the (no-op) migration journal entry** — the i18n settings live in the existing `settings` row, so there's no DDL change here. However, formalize the self-FK on `translationOf` if it isn't already present in earlier migrations.

Create `src/db/migrations/0007_multilingual.sql`:

```sql
-- Tighten the translation_of self-reference. Earlier migrations declared the
-- column but did not add the explicit FK (Drizzle's self-FK omission). This
-- migration backfills the constraint for both pages and posts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pages_translation_of_fk'
  ) THEN
    ALTER TABLE "pages"
      ADD CONSTRAINT "pages_translation_of_fk"
      FOREIGN KEY ("translation_of") REFERENCES "pages"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_translation_of_fk'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_translation_of_fk"
      FOREIGN KEY ("translation_of") REFERENCES "posts"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pages_translation_of_idx" ON "pages" ("translation_of");
CREATE INDEX IF NOT EXISTS "posts_translation_of_idx" ON "posts" ("translation_of");
```

Append the file to the Drizzle journal with a tag of `0007_multilingual`.

- [ ] **Step 5: Apply migration + run tests**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
pnpm test src/i18n/settings.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/settings.ts src/i18n/settings.test.ts src/db/migrations/0007_multilingual.sql
git commit -m "feat(i18n): settings + translation FK constraint"
```

---

## Task 3: URL helpers (TDD)

**Files:**

- Create: `src/i18n/url.ts`
- Create: `src/i18n/url.test.ts`

- [ ] **Step 1: Write failing tests**

`src/i18n/url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractLocaleFromPathname, buildLocalizedPath } from "./url";

const settings = {
  defaultLocale: "en",
  enabledLocales: ["en", "fr", "es"],
  hideDefaultPrefix: true,
};

describe("extractLocaleFromPathname", () => {
  it("returns default locale + clean path when no prefix matches", () => {
    expect(extractLocaleFromPathname("/about", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });

  it("returns the prefix locale + clean path when matched", () => {
    expect(extractLocaleFromPathname("/fr/a-propos", settings)).toEqual({
      locale: "fr",
      pathWithoutLocale: "/a-propos",
    });
  });

  it("ignores prefixes for disabled locales", () => {
    expect(extractLocaleFromPathname("/de/uber", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/de/uber",
    });
  });

  it("treats /en/foo identically to /foo when hideDefaultPrefix=true", () => {
    expect(extractLocaleFromPathname("/en/about", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });

  it("when hideDefaultPrefix=false, default locale needs a prefix to match", () => {
    expect(extractLocaleFromPathname("/about", { ...settings, hideDefaultPrefix: false })).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });
});

describe("buildLocalizedPath", () => {
  it("omits the default-locale prefix when hideDefaultPrefix=true", () => {
    expect(buildLocalizedPath("en", "/about", settings)).toBe("/about");
  });
  it("includes prefix for non-default locales", () => {
    expect(buildLocalizedPath("fr", "/a-propos", settings)).toBe("/fr/a-propos");
  });
  it("includes prefix for default locale when hideDefaultPrefix=false", () => {
    expect(buildLocalizedPath("en", "/about", { ...settings, hideDefaultPrefix: false })).toBe(
      "/en/about",
    );
  });
});
```

- [ ] **Step 2: Implement**

`src/i18n/url.ts`:

```ts
import type { I18nSettings } from "./settings";

export interface ExtractResult {
  locale: string;
  pathWithoutLocale: string;
}

export function extractLocaleFromPathname(pathname: string, settings: I18nSettings): ExtractResult {
  const segments = pathname.split("/");
  // segments[0] is "" (leading slash)
  const first = segments[1] ?? "";
  if (settings.enabledLocales.includes(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return {
      locale: first,
      pathWithoutLocale: rest === "/" ? "/" : rest.replace(/\/+$/, "") || "/",
    };
  }
  return { locale: settings.defaultLocale, pathWithoutLocale: pathname };
}

export function buildLocalizedPath(
  locale: string,
  pathWithoutLocale: string,
  settings: I18nSettings,
): string {
  const clean = pathWithoutLocale.startsWith("/") ? pathWithoutLocale : `/${pathWithoutLocale}`;
  if (locale === settings.defaultLocale && settings.hideDefaultPrefix) return clean;
  if (clean === "/") return `/${locale}`;
  return `/${locale}${clean}`;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/i18n/url.test.ts
```

Expected: 8 passed.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/url.ts src/i18n/url.test.ts
git commit -m "feat(i18n): URL ↔ locale helpers"
```

---

## Task 4: Translation graph helpers (TDD)

**Files:**

- Create: `src/i18n/translations.ts`
- Create: `src/i18n/translations.test.ts`

- [ ] **Step 1: Write failing tests**

`src/i18n/translations.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { siblingTranslations, findCanonicalId } from "./translations";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];
const pids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pids)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("translation graph (posts)", () => {
  it("siblingTranslations includes the canonical and every translation", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `t-${Date.now()}@e.com`, displayName: "T", role: "author" })
      .returning();
    uids.push(u!.id);
    const [canonical] = await db()
      .insert(posts)
      .values({
        title: "Hello",
        slug: `t-${Date.now()}-en`,
        locale: "en",
        authorId: u!.id,
        blocks: [],
        status: "published",
      })
      .returning();
    const [fr] = await db()
      .insert(posts)
      .values({
        title: "Bonjour",
        slug: `t-${Date.now()}-fr`,
        locale: "fr",
        translationOf: canonical!.id,
        authorId: u!.id,
        blocks: [],
        status: "published",
      })
      .returning();
    pids.push(canonical!.id, fr!.id);

    const sibs = await siblingTranslations({ table: "posts", id: fr!.id });
    expect(sibs.map((s) => s.locale).sort()).toEqual(["en", "fr"]);
  });

  it("findCanonicalId returns row id when row is canonical, else translationOf", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `c-${Date.now()}@e.com`, displayName: "C", role: "author" })
      .returning();
    uids.push(u!.id);
    const [canon] = await db()
      .insert(posts)
      .values({
        title: "X",
        slug: `c-${Date.now()}`,
        locale: "en",
        authorId: u!.id,
        blocks: [],
      })
      .returning();
    const [es] = await db()
      .insert(posts)
      .values({
        title: "X-es",
        slug: `c-${Date.now()}-es`,
        locale: "es",
        translationOf: canon!.id,
        authorId: u!.id,
        blocks: [],
      })
      .returning();
    pids.push(canon!.id, es!.id);

    expect(await findCanonicalId({ table: "posts", id: canon!.id })).toBe(canon!.id);
    expect(await findCanonicalId({ table: "posts", id: es!.id })).toBe(canon!.id);
  });
});
```

- [ ] **Step 2: Implement**

`src/i18n/translations.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type TranslatableTable = "pages" | "posts";

export interface Sibling {
  id: string;
  locale: string;
  slug: string;
  status: string | null;
}

export async function findCanonicalId(input: {
  table: TranslatableTable;
  id: string;
}): Promise<string> {
  const rows = await db().execute<{ canonical_id: string }>(sql`
    SELECT coalesce(translation_of, id) AS canonical_id
    FROM ${sql.raw(`"${input.table}"`)}
    WHERE id = ${input.id}
  `);
  const first = rows[0];
  if (!first) throw new Error(`row not found: ${input.table}/${input.id}`);
  return first.canonical_id;
}

export async function siblingTranslations(input: {
  table: TranslatableTable;
  id: string;
}): Promise<Sibling[]> {
  const canonicalId = await findCanonicalId(input);
  const rows = await db().execute<Sibling>(sql`
    SELECT id, locale, slug, status::text AS status
    FROM ${sql.raw(`"${input.table}"`)}
    WHERE id = ${canonicalId} OR translation_of = ${canonicalId}
    ORDER BY locale
  `);
  return rows as unknown as Sibling[];
}
```

- [ ] **Step 3: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/i18n/translations.test.ts
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat(i18n): translation graph helpers"
```

---

## Task 5: Middleware locale resolution

**Files:**

- Modify: `src/middleware.ts`

- [ ] **Step 1: Replace middleware**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getI18nSettings } from "@/i18n/settings";
import { extractLocaleFromPathname, buildLocalizedPath } from "@/i18n/url";

const PUBLIC_BYPASS = [
  /^\/api(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/setup(\/|$)/,
  /^\/(rss|sitemap)\.xml$/,
  /^\/robots\.txt$/,
  /^\/favicon\.ico$/,
];

function shouldBypass(pathname: string): boolean {
  return PUBLIC_BYPASS.some((rx) => rx.test(pathname));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  if (shouldBypass(pathname)) return NextResponse.next();

  const settings = await getI18nSettings();
  const { locale } = extractLocaleFromPathname(pathname, settings);

  // Redirect /<defaultLocale>/foo → /foo when hideDefaultPrefix=true
  if (settings.hideDefaultPrefix && pathname.startsWith(`/${settings.defaultLocale}/`)) {
    const stripped = pathname.replace(`/${settings.defaultLocale}`, "") || "/";
    const url = req.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 308);
  }

  // Rewrite "/about" → "/en/about" so the [locale] segment route catches it.
  if (locale === settings.defaultLocale && settings.hideDefaultPrefix) {
    const url = req.nextUrl.clone();
    url.pathname = buildLocalizedPath(locale, pathname, {
      ...settings,
      hideDefaultPrefix: false,
    });
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(i18n): middleware locale resolution + default-prefix rewrite"
```

---

## Task 6: Locale-prefixed public routes

**Files:**

- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Create: `src/app/[locale]/[...slug]/page.tsx`
- Create: `src/app/[locale]/blog/page.tsx`
- Create: `src/app/[locale]/blog/[slug]/page.tsx`
- Create: `src/app/[locale]/blog/category/[slug]/page.tsx`
- Create: `src/app/[locale]/blog/tag/[slug]/page.tsx`
- Modify: Existing non-locale routes are deleted; they are now handled by the `[locale]` segment plus the middleware rewrite.

> Existing `src/app/blog/page.tsx`, `src/app/blog/[slug]/page.tsx`, and archives delivered by **posts-taxonomies-comments** are **replaced** by their `[locale]` versions. Delete the old files in this task.

- [ ] **Step 1: Delete old non-localized routes**

```bash
rm -rf src/app/blog
rm -f src/app/page.tsx
```

> Keep `src/app/layout.tsx` (root layout from `themes`) and all `src/app/admin/**`, `src/app/api/**`, `src/app/setup/**`, `src/app/rss.xml/**`, `src/app/sitemap.xml/**`, `src/app/(auth)/**`.

- [ ] **Step 2: Locale layout**

`src/app/[locale]/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getI18nSettings } from "@/i18n/settings";

export async function generateStaticParams() {
  const settings = await getI18nSettings();
  return settings.enabledLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const settings = await getI18nSettings();
  if (!settings.enabledLocales.includes(locale)) notFound();
  return <div lang={locale}>{children}</div>;
}
```

- [ ] **Step 3: Locale home (page-driven)**

`src/app/[locale]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/pages/service"; // delivered by block-editor-core
import { BlockRenderer } from "@/render/BlockRenderer";
import { siblingTranslations } from "@/i18n/translations";
import { Hreflang } from "@/components/Hreflang";

export const revalidate = 60;

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const home = await getPageBySlug("home", locale, { publishedOnly: true });
  if (!home) notFound();
  const sibs = await siblingTranslations({ table: "pages", id: home.id });
  return (
    <>
      <Hreflang table="pages" id={home.id} />
      <BlockRenderer blocks={home.blocks as []} />
    </>
  );
}
```

- [ ] **Step 4: Locale catch-all page**

`src/app/[locale]/[...slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/pages/service";
import { BlockRenderer } from "@/render/BlockRenderer";
import { Hreflang } from "@/components/Hreflang";

export const revalidate = 60;

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  const fullSlug = slug.join("/");
  const page = await getPageBySlug(fullSlug, locale, { publishedOnly: true });
  if (!page) notFound();
  return (
    <>
      <Hreflang table="pages" id={page.id} />
      <BlockRenderer blocks={page.blocks as []} />
    </>
  );
}
```

- [ ] **Step 5: Locale blog index**

`src/app/[locale]/blog/page.tsx`:

```tsx
import Link from "next/link";
import { listPosts } from "@/posts/service";
import { buildLocalizedPath } from "@/i18n/url";
import { getI18nSettings } from "@/i18n/settings";

export const revalidate = 60;

export default async function LocaleBlogIndex({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const settings = await getI18nSettings();
  const { items, nextCursor } = await listPosts({
    status: "published",
    limit: 20,
    locale,
    cursor: sp.cursor,
  });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Blog</h1>
      <ul className="space-y-6">
        {items.map((p) => (
          <li key={p.id}>
            <h2 className="text-xl">
              <Link
                href={buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}
                className="hover:underline"
              >
                {p.title}
              </Link>
            </h2>
            <p className="text-sm text-gray-500">{p.publishedAt?.toISOString().slice(0, 10)}</p>
            {p.excerpt && <p className="mt-1 text-gray-700">{p.excerpt}</p>}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <p className="mt-8">
          <Link
            href={
              buildLocalizedPath(locale, "/blog", settings) +
              `?cursor=${encodeURIComponent(nextCursor)}`
            }
            className="underline"
          >
            Older →
          </Link>
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Locale single post**

`src/app/[locale]/blog/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPostBySlug } from "@/posts/service";
import { BlockRenderer } from "@/render/BlockRenderer";
import { CommentsThread } from "@/app/blog/[slug]/CommentsThread";
import { CommentForm } from "@/app/blog/[slug]/CommentForm";
import { Hreflang } from "@/components/Hreflang";

export const revalidate = 60;

export default async function LocalePostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug, locale, { publishedOnly: true });
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Hreflang table="posts" id={post.id} />
      <article>
        <h1 className="mb-2 text-3xl font-bold">{post.title}</h1>
        <p className="mb-6 text-sm text-gray-500">{post.publishedAt?.toISOString().slice(0, 10)}</p>
        <BlockRenderer blocks={post.blocks as []} />
      </article>
      {post.commentsEnabled !== "off" && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Comments</h2>
          <CommentsThread postId={post.id} />
          <CommentForm postId={post.id} />
        </section>
      )}
    </main>
  );
}
```

> The `CommentsThread` and `CommentForm` modules were imported from the old `/blog` directory in posts-taxonomies-comments. Move them under `src/components/blog/` for clarity:

```bash
mkdir -p src/components/blog
git mv src/app/blog/\[slug\]/CommentsThread.tsx src/components/blog/CommentsThread.tsx
git mv src/app/blog/\[slug\]/CommentForm.tsx src/components/blog/CommentForm.tsx
```

…and update the imports above accordingly:

```ts
import { CommentsThread } from "@/components/blog/CommentsThread";
import { CommentForm } from "@/components/blog/CommentForm";
```

- [ ] **Step 7: Locale archive pages**

`src/app/[locale]/blog/category/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { findTaxonomy, postsInTaxonomy } from "@/taxonomies/service";
import { buildLocalizedPath } from "@/i18n/url";
import { getI18nSettings } from "@/i18n/settings";

export const revalidate = 300;

export default async function LocaleCategoryArchive({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const tax = await findTaxonomy("category", slug);
  if (!tax) notFound();
  const items = await postsInTaxonomy(tax.id, { limit: 50 });
  const settings = await getI18nSettings();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Category: {tax.name}</h1>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              className="underline"
              href={buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}
            >
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

The tag archive mirrors this — copy the file and swap `"category"` → `"tag"` and the heading.

- [ ] **Step 8: Commit**

```bash
git add src/app/\[locale\] src/components/blog
git rm -r src/app/blog
git rm -f src/app/page.tsx
git commit -m "feat(i18n): locale-prefixed public routes"
```

---

## Task 7: Hreflang + LanguageSwitcher components (TDD)

**Files:**

- Create: `src/components/Hreflang.tsx`
- Create: `src/components/Hreflang.test.tsx`
- Create: `src/components/LanguageSwitcher.tsx`
- Create: `src/components/LanguageSwitcher.test.tsx`

- [ ] **Step 1: Write failing tests for Hreflang**

`src/components/Hreflang.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const siblingTranslations = vi.fn();
vi.mock("@/i18n/translations", () => ({
  siblingTranslations: (...a: unknown[]) => siblingTranslations(...a),
}));
const getI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({ getI18nSettings: () => getI18nSettings() }));
vi.stubEnv("APP_URL", "https://app.test");

const { Hreflang } = await import("./Hreflang");

describe("Hreflang", () => {
  it("emits one <link> per sibling and an x-default", async () => {
    siblingTranslations.mockResolvedValue([
      { id: "p-en", locale: "en", slug: "about", status: "published" },
      { id: "p-fr", locale: "fr", slug: "a-propos", status: "published" },
    ]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const ui = await Hreflang({ table: "pages", id: "p-en" });
    const { container } = render(ui);
    const links = container.querySelectorAll("link[rel='alternate']");
    expect(links).toHaveLength(3);
    expect(container.querySelector('link[hreflang="x-default"]')).toBeTruthy();
    expect(container.querySelector('link[hreflang="fr"]')?.getAttribute("href")).toBe(
      "https://app.test/fr/a-propos",
    );
    expect(container.querySelector('link[hreflang="en"]')?.getAttribute("href")).toBe(
      "https://app.test/about",
    );
  });

  it("renders nothing when no siblings", async () => {
    siblingTranslations.mockResolvedValue([]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en"],
      hideDefaultPrefix: true,
    });
    const ui = await Hreflang({ table: "pages", id: "x" });
    const { container } = render(ui);
    expect(container.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Implement Hreflang**

`src/components/Hreflang.tsx`:

```tsx
import { siblingTranslations, type TranslatableTable } from "@/i18n/translations";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { env } from "@/env";

export async function Hreflang({ table, id }: { table: TranslatableTable; id: string }) {
  const [sibs, settings] = await Promise.all([
    siblingTranslations({ table, id }),
    getI18nSettings(),
  ]);
  if (sibs.length === 0) return <></>;
  const base = (env().APP_URL ?? "").replace(/\/$/, "");
  const prefix = table === "posts" ? "/blog" : "";
  return (
    <>
      {sibs.map((s) => {
        const href =
          base +
          buildLocalizedPath(s.locale, `${prefix}/${s.slug}`.replace(/\/\//g, "/"), settings);
        return <link key={s.id} rel="alternate" hrefLang={s.locale} href={href} />;
      })}
      {/* x-default points at the default-locale row */}
      {sibs.find((s) => s.locale === settings.defaultLocale) && (
        <link
          rel="alternate"
          hrefLang="x-default"
          href={
            base +
            buildLocalizedPath(
              settings.defaultLocale,
              `${prefix}/${sibs.find((s) => s.locale === settings.defaultLocale)!.slug}`,
              settings,
            )
          }
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Write failing tests for LanguageSwitcher**

`src/components/LanguageSwitcher.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const siblingTranslations = vi.fn();
vi.mock("@/i18n/translations", () => ({
  siblingTranslations: (...a: unknown[]) => siblingTranslations(...a),
}));
const getI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({ getI18nSettings: () => getI18nSettings() }));

const { LanguageSwitcher } = await import("./LanguageSwitcher");

describe("LanguageSwitcher", () => {
  it("renders one link per available translation, highlighting current locale", async () => {
    siblingTranslations.mockResolvedValue([
      { id: "p-en", locale: "en", slug: "about", status: "published" },
      { id: "p-fr", locale: "fr", slug: "a-propos", status: "published" },
    ]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const ui = await LanguageSwitcher({ table: "pages", id: "p-fr", currentLocale: "fr" });
    const { container } = render(ui);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    const current = Array.from(links).find((a) => a.getAttribute("aria-current") === "true");
    expect(current?.textContent).toContain("Français");
  });

  it("renders nothing when no siblings", async () => {
    siblingTranslations.mockResolvedValue([]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en"],
      hideDefaultPrefix: true,
    });
    const ui = await LanguageSwitcher({ table: "pages", id: "x", currentLocale: "en" });
    const { container } = render(ui);
    expect(container.children.length).toBe(0);
  });
});
```

- [ ] **Step 4: Implement LanguageSwitcher**

`src/components/LanguageSwitcher.tsx`:

```tsx
import Link from "next/link";
import { siblingTranslations, type TranslatableTable } from "@/i18n/translations";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { findLocale } from "@/i18n/locales";

export async function LanguageSwitcher({
  table,
  id,
  currentLocale,
}: {
  table: TranslatableTable;
  id: string;
  currentLocale: string;
}) {
  const [sibs, settings] = await Promise.all([
    siblingTranslations({ table, id }),
    getI18nSettings(),
  ]);
  if (sibs.length === 0) return <></>;
  const prefix = table === "posts" ? "/blog" : "";
  return (
    <nav aria-label="Language" className="flex gap-2 text-sm">
      {sibs.map((s) => {
        const locale = findLocale(s.locale);
        const href = buildLocalizedPath(s.locale, `${prefix}/${s.slug}`, settings);
        const isCurrent = s.locale === currentLocale;
        return (
          <Link
            key={s.id}
            href={href}
            aria-current={isCurrent ? "true" : undefined}
            className={isCurrent ? "font-bold underline" : "underline-offset-2 hover:underline"}
            lang={s.locale}
          >
            {locale?.nativeName ?? s.locale}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/components/Hreflang.test.tsx src/components/LanguageSwitcher.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/Hreflang.tsx src/components/Hreflang.test.tsx \
        src/components/LanguageSwitcher.tsx src/components/LanguageSwitcher.test.tsx
git commit -m "feat(i18n): Hreflang + LanguageSwitcher components"
```

---

## Task 8: Translate-to action (TDD)

**Files:**

- Create: `src/app/actions/translations.ts`
- Create: `src/app/actions/translations.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/actions/translations.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/auth/context", () => ({ requireUser: () => requireUser() }));
const getPostById = vi.fn();
const createPost = vi.fn();
vi.mock("@/posts/service", () => ({
  getPostById: (...a: unknown[]) => getPostById(...a),
  createPost: (...a: unknown[]) => createPost(...a),
}));
const translateBlocks = vi.fn();
vi.mock("@/ai/features/translate", () => ({
  translateBlocks: (...a: unknown[]) => translateBlocks(...a),
}));
const findCanonicalId = vi.fn();
vi.mock("@/i18n/translations", () => ({
  findCanonicalId: (...a: unknown[]) => findCanonicalId(...a),
}));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const { translatePostAction } = await import("./translations");

afterEach(() => {
  requireUser.mockReset();
  getPostById.mockReset();
  createPost.mockReset();
  translateBlocks.mockReset();
  findCanonicalId.mockReset();
  redirect.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("translatePostAction", () => {
  it("creates a new post row pointing to canonical with AI-translated blocks", async () => {
    requireUser.mockResolvedValue({ id: "u-1" });
    getPostById.mockResolvedValue({
      id: "p-1",
      title: "Hello",
      slug: "hello",
      excerpt: null,
      blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      locale: "en",
      authorId: "u-1",
    });
    findCanonicalId.mockResolvedValue("p-1");
    translateBlocks.mockResolvedValue({
      kind: "ok",
      blocks: [{ id: "h", type: "heading", level: 1, text: "Bonjour" }],
    });
    createPost.mockResolvedValue({ id: "p-2", slug: "hello", locale: "fr" });

    await translatePostAction(
      undefined,
      fd({ postId: "11111111-1111-1111-1111-111111111111", targetLocale: "fr" }),
    );
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "fr",
        translationOf: "p-1",
        blocks: [{ id: "h", type: "heading", level: 1, text: "Bonjour" }],
      }),
      "u-1",
    );
    expect(redirect).toHaveBeenCalled();
  });

  it("falls back to original blocks when AI is disabled", async () => {
    requireUser.mockResolvedValue({ id: "u-1" });
    getPostById.mockResolvedValue({
      id: "p-1",
      title: "Hello",
      slug: "hello",
      excerpt: null,
      blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      locale: "en",
      authorId: "u-1",
    });
    findCanonicalId.mockResolvedValue("p-1");
    translateBlocks.mockResolvedValue({ kind: "disabled", reason: "x" });
    createPost.mockResolvedValue({ id: "p-2", slug: "hello", locale: "fr" });
    await translatePostAction(
      undefined,
      fd({ postId: "11111111-1111-1111-1111-111111111111", targetLocale: "fr" }),
    );
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      }),
      "u-1",
    );
  });
});
```

- [ ] **Step 2: Implement**

`src/app/actions/translations.ts`:

```ts
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/context";
import { createPost, getPostById } from "@/posts/service";
import { createPage, getPageById } from "@/pages/service"; // delivered by block-editor-core
import { translateBlocks } from "@/ai/features/translate";
import { findCanonicalId } from "@/i18n/translations";

interface ActionResult {
  error?: string;
}

const schema = z.object({
  postId: z.string().uuid().optional(),
  pageId: z.string().uuid().optional(),
  targetLocale: z.string().min(2).max(10),
});

export async function translatePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    postId: fd.get("postId") ?? undefined,
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success || !parsed.data.postId) return { error: "Invalid input" };

  const source = await getPostById(parsed.data.postId);
  if (!source) return { error: "Not found" };
  const canonical = await findCanonicalId({ table: "posts", id: source.id });
  const tr = await translateBlocks({
    blocks: source.blocks as unknown[],
    targetLocale: parsed.data.targetLocale,
    userId: user.id,
  });
  const blocks = tr.kind === "ok" ? tr.blocks : (source.blocks as unknown[]);

  const created = await createPost(
    {
      title: source.title,
      slug: source.slug,
      excerpt: source.excerpt ?? undefined,
      blocks,
      locale: parsed.data.targetLocale,
      translationOf: canonical,
      categoryIds: [],
      tagIds: [],
    },
    user.id,
  );
  redirect(`/admin/posts/${created.id}`);
}

export async function translatePageAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    pageId: fd.get("pageId") ?? undefined,
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success || !parsed.data.pageId) return { error: "Invalid input" };
  const source = await getPageById(parsed.data.pageId);
  if (!source) return { error: "Not found" };
  const canonical = await findCanonicalId({ table: "pages", id: source.id });
  const tr = await translateBlocks({
    blocks: source.blocks as unknown[],
    targetLocale: parsed.data.targetLocale,
    userId: user.id,
  });
  const blocks = tr.kind === "ok" ? tr.blocks : (source.blocks as unknown[]);
  const created = await createPage(
    {
      title: source.title,
      slug: source.slug,
      blocks,
      locale: parsed.data.targetLocale,
      translationOf: canonical,
    },
    user.id,
  );
  redirect(`/admin/pages/${created.id}`);
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/app/actions/translations.test.ts
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/translations.ts src/app/actions/translations.test.ts
git commit -m "feat(i18n): translate-post / translate-page actions"
```

---

## Task 9: Translate buttons + admin locale settings page

**Files:**

- Create: `src/app/admin/posts/[id]/TranslateButton.tsx`
- Create: `src/app/admin/pages/[id]/TranslateButton.tsx`
- Create: `src/app/admin/settings/locales/page.tsx`
- Create: `src/app/admin/settings/locales/LocalesForm.tsx`

- [ ] **Step 1: Translate button (posts)**

`src/app/admin/posts/[id]/TranslateButton.tsx`:

```tsx
import { enabledLocales } from "@/i18n/settings";
import { findLocale } from "@/i18n/locales";
import { translatePostAction } from "@/app/actions/translations";

export async function TranslateButton({
  postId,
  currentLocale,
}: {
  postId: string;
  currentLocale: string;
}) {
  const locales = await enabledLocales();
  const targets = locales.filter((l) => l !== currentLocale);
  if (targets.length === 0) return null;
  return (
    <details className="inline-block">
      <summary className="cursor-pointer text-sm underline">Translate to…</summary>
      <ul className="mt-2 space-y-1">
        {targets.map((code) => (
          <li key={code}>
            <form action={translatePostAction.bind(null, undefined)}>
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="targetLocale" value={code} />
              <button className="text-sm underline">{findLocale(code)?.nativeName ?? code}</button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 2: Translate button (pages)** — same shape, swap `postId` → `pageId` and call `translatePageAction`.

- [ ] **Step 3: Locales admin settings**

`src/app/admin/settings/locales/page.tsx`:

```tsx
import { requireRole } from "@/auth/context";
import { getI18nSettings } from "@/i18n/settings";
import { ALL_LOCALES } from "@/i18n/locales";
import { LocalesForm } from "./LocalesForm";

export const dynamic = "force-dynamic";

export default async function LocalesSettingsPage() {
  await requireRole("admin");
  const current = await getI18nSettings();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Locales</h1>
      <LocalesForm catalogue={[...ALL_LOCALES]} current={current} />
    </main>
  );
}
```

`src/app/admin/settings/locales/LocalesForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import type { Locale } from "@/i18n/locales";
import type { I18nSettings } from "@/i18n/settings";
import { saveLocalesAction } from "./actions";

export function LocalesForm({
  catalogue,
  current,
}: {
  catalogue: Locale[];
  current: I18nSettings;
}) {
  const [enabled, setEnabled] = useState<string[]>(current.enabledLocales);
  const [def, setDef] = useState<string>(current.defaultLocale);
  const [hide, setHide] = useState<boolean>(current.hideDefaultPrefix);
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(
    saveLocalesAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          defaultLocale: def,
          enabledLocales: enabled,
          hideDefaultPrefix: hide,
        })}
      />
      <fieldset>
        <legend className="font-semibold">Enabled locales</legend>
        <ul className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
          {catalogue.map((l) => (
            <li key={l.code}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled.includes(l.code)}
                  onChange={(e) =>
                    setEnabled((cur) =>
                      e.target.checked
                        ? Array.from(new Set([...cur, l.code]))
                        : cur.filter((c) => c !== l.code),
                    )
                  }
                />
                <span lang={l.code}>{l.nativeName}</span>
                <span className="text-gray-500">({l.code})</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Default locale</span>
        <select
          value={def}
          onChange={(e) => setDef(e.target.value)}
          className="rounded border px-2 py-1"
        >
          {enabled.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
        Hide default-locale prefix in URLs
      </label>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
```

`src/app/admin/settings/locales/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/auth/context";
import { setI18nSettings, invalidateI18nSettings } from "@/i18n/settings";

interface ActionResult {
  error?: string;
}

const schema = z.object({
  defaultLocale: z.string(),
  enabledLocales: z.array(z.string()).min(1),
  hideDefaultPrefix: z.boolean(),
});

export async function saveLocalesAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const raw = String(fd.get("payload") ?? "");
  let parsed;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    await setI18nSettings(parsed);
  } catch (err) {
    return { error: (err as Error).message };
  }
  invalidateI18nSettings();
  revalidatePath("/", "layout");
  return {};
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/posts/\[id\]/TranslateButton.tsx \
        src/app/admin/pages/\[id\]/TranslateButton.tsx \
        src/app/admin/settings/locales
git commit -m "feat(i18n): translate buttons + admin locales settings"
```

---

## Task 10: Sitemap + RSS per-locale

**Files:**

- Modify: `src/app/sitemap.xml/route.ts`
- Modify: `src/app/rss.xml/route.ts`

- [ ] **Step 1: Update sitemap to emit per-locale URLs**

Replace the loop in `src/app/sitemap.xml/route.ts`:

```ts
import { enabledLocales, getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";

// inside GET:
const settings = await getI18nSettings();
const urls: string[] = [];
for (const locale of settings.enabledLocales) {
  const { items } = await listPosts({ status: "published", locale, limit: 5000 });
  for (const p of items) {
    urls.push(
      `<url><loc>${appUrl}${buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`,
    );
  }
}
```

(Adapt the rest of the route to consume `urls.join("\n")` as before.)

- [ ] **Step 2: Update RSS to be per-locale**

In `src/app/rss.xml/route.ts`, accept a query string parameter `?locale=`. If absent, emit the default-locale feed.

```ts
import { defaultLocale } from "@/i18n/settings";

// inside GET(req: Request):
const url = new URL(req.url);
const locale = url.searchParams.get("locale") ?? (await defaultLocale());
const { items } = await listPosts({ status: "published", locale, limit: 50 });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/sitemap.xml/route.ts src/app/rss.xml/route.ts
git commit -m "feat(i18n): per-locale sitemap + RSS"
```

---

## Task 11: Final integration

> No code changes.

- [ ] **Step 1: Run the suite**

```bash
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 2: Smoke browse**

1. `/admin/settings/locales` — enable `en` + `fr`, default `en`, `hideDefaultPrefix=true`.
2. Open a published English post in `/admin/posts/[id]`. Click `Translate to → Français`. New post row appears.
3. Visit `/fr/blog/<slug>` — translated content renders.
4. Visit `/blog/<slug>` (default-locale, no prefix) — `Hreflang` includes `fr` alternate.
5. `curl /sitemap.xml` lists both locales.

- [ ] **Step 3: Invariants for downstream**

1. Middleware always routes through `[locale]` — the `[locale]` layout never sees an unknown locale.
2. `siblingTranslations()` is the canonical way to walk the translation graph.
3. `translationOf` is enforced by an FK; deleting a canonical row nulls out child translation pointers (intentional — translations survive the canonical deletion as orphans for admin review).
4. URLs flip cleanly when `hideDefaultPrefix` is toggled at runtime (settings cache invalidates on save).

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan                 | What it adds                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **importers**            | When importing WordPress XML with `<wp:post_translations>` metadata (WPML/Polylang), set `translation_of` and `locale` accordingly. |
| **exporter-backups**     | Round-trips locale + translation links via `pages/<locale>/<slug>.md` paths in the export ZIP.                                      |
| **themes**               | Themes consume `LanguageSwitcher` in their Layout.                                                                                  |
| **plugin-system**        | Plugins can register additional translation providers (DeepL, Google Translate) by swapping out `translateBlocks` via a hook.       |
| **deployment-hardening** | CDN cache key includes `:lang` segment so locale-scoped pages cache separately.                                                     |

---

_End of multilingual plan._
