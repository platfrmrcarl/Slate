import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { remoteRequest, resolveTransport, localRun, type TransportOpts } from "../transport";

export function userCommand(opts: TransportOpts): Command {
  const cmd = new Command("user");

  cmd
    .command("create <email>")
    .option("--role <role>", "owner|admin|editor|author|contributor|subscriber", "subscriber")
    .option("--display-name <name>")
    .option("--password <password>", "if omitted, you'll be prompted")
    .action(
      async (email: string, sub: { role: string; displayName?: string; password?: string }) => {
        const transport = resolveTransport(opts);
        const displayName =
          sub.displayName ??
          ((await p.text({ message: "Display name", placeholder: "Jane Doe" })) as string);
        const password =
          sub.password ?? ((await p.password({ message: "Password (min 12 chars)" })) as string);
        const payload = { email, displayName, password, role: sub.role };
        if (transport === "remote") {
          const { id } = await remoteRequest<{ id: string }>(
            "POST",
            "/api/cli/users/create",
            payload,
            opts,
          );
          console.log(pc.green(`Created user ${id}`));
        } else {
          await localRun(async () => {
            const { createUser } = await import("../../../../src/auth/users");
            const u = await createUser(payload as never);
            console.log(pc.green(`Created user ${u.id}`));
          });
        }
      },
    );

  cmd.command("reset-password <email>").action(async (email: string) => {
    const { url } = await remoteRequest<{ url: string }>(
      "POST",
      "/api/cli/users/reset-password",
      { email },
      opts,
    );
    console.log(pc.green("Reset link:"));
    console.log(url);
  });

  return cmd;
}
