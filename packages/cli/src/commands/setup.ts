import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { saveCredentials } from "../credentials";

export function setupCommand(): Command {
  return new Command("setup")
    .description("Interactive first-run config (writes credentials)")
    .action(async () => {
      p.intro(pc.bold("WordPressKiller setup"));
      const url = (await p.text({
        message: "Install URL (https://...)",
        placeholder: "https://example.com",
        validate: (v) => (/^https?:\/\//.test(v) ? undefined : "must start with http(s)://"),
      })) as string;
      const token = (await p.password({
        message: "Admin token (issue from /admin/api-tokens or via the setup wizard)",
      })) as string;
      await saveCredentials({ url, token });
      p.outro(pc.green("Saved."));
    });
}
