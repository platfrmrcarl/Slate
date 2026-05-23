export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED, mime);
}

export function extensionFor(mime: string): string | null {
  return ALLOWED[mime] ?? null;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isTransformableImageMime(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/gif";
}
