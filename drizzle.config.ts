import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://wpk:wpk@localhost:5432/wpk",
  },
  strict: true,
  verbose: true,
} satisfies Config;
