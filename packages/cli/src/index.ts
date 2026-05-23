import { Command } from "commander";
import pc from "picocolors";

const program = new Command().name("wpkiller").description("WordPressKiller CLI").version("0.1.0");

program
  .command("ping")
  .description("Health probe")
  .action(() => {
    console.log(pc.green("pong"));
  });

await program.parseAsync(process.argv);
