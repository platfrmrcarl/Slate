import { Command } from "commander";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { remoteRequest, type TransportOpts } from "../transport";

const sh = promisify(exec);

export function themeCommand(opts: TransportOpts): Command {
  const cmd = new Command("theme");

  cmd
    .command("install <gitUrlOrZip>")
    .description("Install a theme from a git URL or zip file (compose-time path)")
    .action(async (source: string) => {
      const dest = path.resolve(process.cwd(), "themes");
      await fs.mkdir(dest, { recursive: true });
      if (source.endsWith(".zip")) {
        const slug = path.basename(source, ".zip");
        await sh(`unzip -o ${JSON.stringify(source)} -d ${JSON.stringify(path.join(dest, slug))}`);
      } else {
        const slug = path.basename(source.replace(/\.git$/, ""));
        await sh(
          `git clone --depth 1 ${JSON.stringify(source)} ${JSON.stringify(path.join(dest, slug))}`,
        );
      }
      console.log(
        pc.green(
          "Theme cloned/unzipped. Run `pnpm build` and redeploy to make it active in the registry.",
        ),
      );
    });

  cmd
    .command("activate <slug>")
    .description("Activate an installed theme by slug")
    .action(async (slug: string) => {
      await remoteRequest("POST", "/api/cli/themes/activate", { slug }, opts);
      console.log(pc.green(`Activated theme ${slug}`));
    });

  return cmd;
}
