import { Command } from "commander";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import pc from "picocolors";

const sh = promisify(exec);

export function pluginCommand(): Command {
  const cmd = new Command("plugin");
  cmd
    .command("install <package>")
    .description("Install a plugin npm package (e.g., wpkiller-plugin-mailchimp)")
    .action(async (pkg: string) => {
      const { stdout, stderr } = await sh(`pnpm add ${JSON.stringify(pkg)}`);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      console.log(pc.green("Installed. Run `pnpm build` and redeploy."));
    });
  return cmd;
}
