import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function findRepoRoot(start: string): string {
  let dir = start;
  // Walk up looking for a pnpm-workspace.yaml (the monorepo root marker).
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Apply pending Drizzle migrations (uses local DATABASE_URL)")
    .action(async () => {
      const cwd = findRepoRoot(path.resolve(process.cwd()));
      const child = spawn("pnpm", ["db:migrate"], { stdio: "inherit", cwd });
      await new Promise<void>((resolve, reject) => {
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });
    });
}
