import { Command, Option } from "commander";
import { userCommand } from "./commands/user";
import { themeCommand } from "./commands/theme";
import { pluginCommand } from "./commands/plugin";
import { migrateCommand } from "./commands/migrate";
import { importCommand } from "./commands/import";
import { exportCommand } from "./commands/export";

const program = new Command()
  .name("wpkiller")
  .description("WordPressKiller CLI")
  .version("0.1.0")
  .addOption(new Option("--url <url>", "remote instance URL"))
  .addOption(new Option("--token <token>", "admin token"));

const transportOpts = () => {
  const o = program.opts<{ url?: string; token?: string }>();
  const out: { url?: string; token?: string } = {};
  if (o.url !== undefined) out.url = o.url;
  if (o.token !== undefined) out.token = o.token;
  return out;
};

program.addCommand(userCommand(transportOpts()));
program.addCommand(themeCommand(transportOpts()));
program.addCommand(pluginCommand());
program.addCommand(migrateCommand());
program.addCommand(importCommand(transportOpts()));
program.addCommand(exportCommand(transportOpts(), false));
program.addCommand(exportCommand(transportOpts(), true));

program.command("ping").action(() => console.log("pong"));

await program.parseAsync(process.argv);
