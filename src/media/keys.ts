const MAX_LEN = 64;

export function sanitizeFilename(input: string): string {
  // Strip control characters first (NUL etc. should disappear, not become dashes).
  // eslint-disable-next-line no-control-regex
  const noCtrl = input.replace(/[\x00-\x1f\x7f]/g, "");
  // Drop path-traversal segments ("." and ".."); keep other path segments and
  // let the unsafe-char pass below replace the separators with dashes.
  const segments = noCtrl.split(/[\\/]/).filter((s) => s !== "." && s !== "..");
  const base = segments.join("/");

  const lastDot = base.lastIndexOf(".");
  const stem = lastDot === -1 ? base : base.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : base.slice(lastDot + 1);

  const cleanStem = stem
    .toLowerCase()
    .replace(/\.+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const cleanExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);

  const joined = cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
  if (!joined || joined === "." || joined === "..") return "file";

  if (joined.length <= MAX_LEN) return joined;
  if (!cleanExt) return joined.slice(0, MAX_LEN);
  const budget = MAX_LEN - cleanExt.length - 1;
  return `${cleanStem.slice(0, budget)}.${cleanExt}`;
}

export interface BuildPathOptions {
  now: Date;
  uuid: string;
  filename: string;
}

export function buildObjectPath(opts: BuildPathOptions): string {
  const yyyy = opts.now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (opts.now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `media/${yyyy}/${mm}/${opts.uuid}-${sanitizeFilename(opts.filename)}`;
}
