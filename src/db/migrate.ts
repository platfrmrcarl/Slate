import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1 });
  const dbInstance = drizzle(sql);
  console.log("Running migrations…");
  await migrate(dbInstance, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations complete.");
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
