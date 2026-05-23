import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";

export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Apply pending Drizzle migrations (uses local DATABASE_URL)")
    .action(async () => {
      const cwd = path.resolve(process.cwd());
      const child = spawn("pnpm", ["db:migrate"], { stdio: "inherit", cwd });
      await new Promise<void>((resolve, reject) => {
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });
    });
}
