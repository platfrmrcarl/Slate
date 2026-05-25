import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { env } from "@/env";
import { logger } from "@/lib/logger";

/**
 * Streams a `pg_dump` of the database referenced by DATABASE_URL.
 *
 * - When the URL host resolves to localhost we shell out via
 *   `docker compose exec -T postgres pg_dump …` so devs don't need a local
 *   `pg_dump` binary that matches the server version.
 * - Otherwise we expect `pg_dump` to be on the PATH (production runtime image
 *   ships `postgresql-client`).
 *
 * The custom (`--format=custom`) format is portable across Postgres minor
 * versions and round-trippable via `pg_restore`.
 */
export async function pgDump(): Promise<Readable> {
  const url = new URL(env().DATABASE_URL);
  const inDocker = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const args = ["--no-owner", "--no-acl", "--format=custom"];
  const proc = inDocker
    ? spawn("docker", [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        decodeURIComponent(url.username),
        "-d",
        url.pathname.replace(/^\//, ""),
        ...args,
      ])
    : spawn("pg_dump", [env().DATABASE_URL, ...args]);
  proc.stderr.on("data", (b: Buffer) => logger().debug({ stderr: b.toString() }, "pg_dump:stderr"));
  proc.on("error", (err: unknown) => logger().warn({ err }, "pg_dump:error"));
  return proc.stdout as unknown as Readable;
}
