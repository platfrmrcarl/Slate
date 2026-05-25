import { Command } from "commander";
import repl from "node:repl";
import pc from "picocolors";

export function shellCommand(): Command {
  return new Command("shell")
    .description(
      "Open a Node REPL with @slate/db, @slate/auth, @slate/posts preloaded (local only)",
    )
    .action(async () => {
      // Dynamic-string imports keep these out of the cli package's tsc rootDir.
      const dbPath = "../../../../src/db";
      const usersPath = "../../../../src/auth/users";
      const postsPath = "../../../../src/posts/service";
      const mediaPath = "../../../../src/media/service";
      const db = await import(dbPath);
      const users = await import(usersPath);
      const posts = await import(postsPath);
      const media = await import(mediaPath);
      console.log(pc.gray("Loaded: db, users, posts, media. Ctrl-D to exit."));
      const r = repl.start({ prompt: "wpk> " });
      Object.assign(r.context, { db, users, posts, media });
    });
}
