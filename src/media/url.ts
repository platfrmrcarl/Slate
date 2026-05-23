import { env } from "@/env";

export interface ImgUrlOptions {
  width?: number;
  height?: number;
  quality?: number;
  fit?: "inside" | "cover" | "contain" | "fill";
  format?: "auto" | "jpeg" | "webp" | "avif" | "png";
}

export function imgUrl(mediaId: string, opts: ImgUrlOptions = {}): string {
  const e = env();
  const base = e.MEDIA_PUBLIC_URL ?? e.APP_URL ?? "";
  const u = new URL(`${base.replace(/\/$/, "")}/api/img/${mediaId}`);
  if (opts.width) u.searchParams.set("w", String(opts.width));
  if (opts.height) u.searchParams.set("h", String(opts.height));
  if (opts.quality) u.searchParams.set("q", String(opts.quality));
  if (opts.fit) u.searchParams.set("fit", opts.fit);
  if (opts.format && opts.format !== "auto") u.searchParams.set("fmt", opts.format);
  return u.toString();
}
