import { Command } from "commander";
import repl from "node:repl";
import pc from "picocolors";

export function shellCommand(): Command {
  return new Command("shell")
    .description("Open a Node REPL with @wpk/db, @wpk/auth, @wpk/posts preloaded (local only)")
    .action(async () => {
      const db = await import("../../../../src/db");
      const users = await import("../../../../src/auth/users");
      const posts = await import("../../../../src/posts/service");
      const media = await import("../../../../src/media/service");
      console.log(pc.gray("Loaded: db, users, posts, media. Ctrl-D to exit."));
      const r = repl.start({ prompt: "wpk> " });
      Object.assign(r.context, { db, users, posts, media });
    });
}
