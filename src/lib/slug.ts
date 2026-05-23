export interface SlugifyOptions {
  allowSlashes?: boolean;
}

export function slugify(input: string, opts: SlugifyOptions = {}): string {
  const decomposed = input.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (opts.allowSlashes) {
    return decomposed
      .split("/")
      .map((segment) => oneSegment(segment))
      .filter((s) => s.length > 0)
      .join("/");
  }
  return oneSegment(decomposed);
}

function oneSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.!?,;:'"()]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureUniqueSlug(
  candidate: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(candidate))) return candidate;
  for (let i = 2; i <= 100; i++) {
    const next = `${candidate}-${i}`;
    if (!(await isTaken(next))) return next;
  }
  throw new Error("ensureUniqueSlug: gave up after 100 attempts");
}
