import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;
let sql: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!cached) {
    sql = postgres(env().DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
    cached = undefined;
  }
}
