import sharp from "sharp";

export type Fit = "inside" | "cover" | "contain" | "fill";
export type Format = "jpeg" | "webp" | "avif" | "png" | "auto";

export interface TransformOptions {
  width?: number;
  height?: number;
  quality: number;
  fit: Fit;
  format: Format;
}

export interface TransformResult {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

const MAX_DIM = 4000;
const VALID_FITS = new Set<Fit>(["inside", "cover", "contain", "fill"]);
const VALID_FORMATS = new Set<Format>(["jpeg", "webp", "avif", "png", "auto"]);

export function parseTransform(params: URLSearchParams): TransformOptions {
  const w = params.get("w");
  const h = params.get("h");
  const q = params.get("q");
  const fit = (params.get("fit") ?? "inside") as Fit;
  const format = (params.get("fmt") ?? "auto") as Format;

  const width = w !== null ? Number(w) : undefined;
  const height = h !== null ? Number(h) : undefined;
  const quality = q !== null ? Number(q) : 82;

  if (width !== undefined && (!Number.isFinite(width) || width <= 0 || width > MAX_DIM)) {
    throw new Error(`invalid width: must be 1..${MAX_DIM}`);
  }
  if (height !== undefined && (!Number.isFinite(height) || height <= 0 || height > MAX_DIM)) {
    throw new Error(`invalid height: must be 1..${MAX_DIM}`);
  }
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error("invalid quality: must be 1..100");
  }
  if (!VALID_FITS.has(fit)) throw new Error(`invalid fit: ${fit}`);
  if (!VALID_FORMATS.has(format)) throw new Error(`invalid format: ${format}`);

  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    quality,
    fit,
    format,
  };
}

export function pickFormat(accept: string | null, requested: Format): Exclude<Format, "auto"> {
  if (requested !== "auto") return requested;
  const a = (accept ?? "").toLowerCase();
  if (a.includes("image/avif")) return "avif";
  if (a.includes("image/webp")) return "webp";
  return "jpeg";
}

export async function applyTransform(
  input: Buffer,
  opts: TransformOptions,
  accept: string | null = null,
): Promise<TransformResult> {
  const format = pickFormat(accept, opts.format);
  let pipe = sharp(input, { failOn: "error" }).rotate();

  if (opts.width !== undefined || opts.height !== undefined) {
    pipe = pipe.resize({
      ...(opts.width !== undefined ? { width: opts.width } : {}),
      ...(opts.height !== undefined ? { height: opts.height } : {}),
      fit: opts.fit,
      withoutEnlargement: true,
    });
  }
  switch (format) {
    case "jpeg":
      pipe = pipe.jpeg({ quality: opts.quality, mozjpeg: true });
      break;
    case "png":
      pipe = pipe.png({ compressionLevel: 9 });
      break;
    case "webp":
      pipe = pipe.webp({ quality: opts.quality });
      break;
    case "avif":
      pipe = pipe.avif({ quality: opts.quality, effort: 4 });
      break;
  }

  const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    contentType: `image/${format === "jpeg" ? "jpeg" : format}`,
    width: info.width,
    height: info.height,
  };
}
