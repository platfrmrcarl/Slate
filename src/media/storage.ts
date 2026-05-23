import { Storage, type File } from "@google-cloud/storage";
import type { Readable } from "node:stream";
import { generateKeyPairSync } from "node:crypto";
import { env } from "@/env";

export class NotFoundError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`);
    this.name = "NotFoundError";
  }
}

let emulatorCredentials: { client_email: string; private_key: string } | undefined;
function getEmulatorCredentials(): { client_email: string; private_key: string } {
  if (emulatorCredentials) return emulatorCredentials;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  emulatorCredentials = {
    client_email: "fake-gcs@slate-dev.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  return emulatorCredentials;
}

let cached: Storage | undefined;
function client(): Storage {
  if (cached) return cached;
  const e = env();
  if (e.GCS_EMULATOR_HOST) {
    cached = new Storage({
      apiEndpoint: e.GCS_EMULATOR_HOST,
      projectId: "slate-dev",
      credentials: getEmulatorCredentials(),
    });
  } else {
    cached = new Storage();
  }
  return cached;
}

function bucketName(): string {
  const name = env().GCS_BUCKET_MEDIA;
  if (!name) throw new Error("GCS_BUCKET_MEDIA is not set");
  return name;
}

export async function ensureBucket(): Promise<void> {
  const name = bucketName();
  const [exists] = await client().bucket(name).exists();
  if (!exists) await client().createBucket(name);
}

function file(key: string): File {
  return client().bucket(bucketName()).file(key);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await file(key).save(body, { contentType, resumable: false, validation: false });
}

export interface ObjectHead {
  size: number;
  contentType: string;
  updatedAt: Date;
  etag: string;
}

export async function headObject(key: string): Promise<ObjectHead> {
  try {
    const [meta] = await file(key).getMetadata();
    return {
      size: Number(meta.size ?? 0),
      contentType: String(meta.contentType ?? "application/octet-stream"),
      updatedAt: new Date(meta.updated ?? Date.now()),
      etag: String(meta.etag ?? ""),
    };
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: number }).code === 404) {
      throw new NotFoundError(key);
    }
    throw err;
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  return file(key).createReadStream();
}

export async function deleteObject(key: string): Promise<void> {
  await file(key).delete({ ignoreNotFound: true });
}

export async function createSignedUploadUrl(
  key: string,
  contentType: string,
  ttlSeconds = 300,
): Promise<string> {
  const [url] = await file(key).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + ttlSeconds * 1000,
    contentType,
  });
  return url;
}

export async function createSignedReadUrl(key: string, ttlSeconds = 300): Promise<string> {
  const [url] = await file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + ttlSeconds * 1000,
  });
  return url;
}
