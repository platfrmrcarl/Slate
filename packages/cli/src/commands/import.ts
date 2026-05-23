import { Command } from "commander";
import fs from "node:fs";
import pc from "picocolors";
import { type TransportOpts } from "../transport";

const SOURCES = new Set(["wordpress", "ghost", "markdown", "csv"]);

export function importCommand(opts: TransportOpts): Command {
  return new Command("import")
    .argument("<source>", `one of ${[...SOURCES].join(", ")}`)
    .argument("<file>", "path to the export file to import")
    .action(async (source: string, file: string) => {
      if (!SOURCES.has(source)) throw new Error(`unknown source: ${source}`);
      const buffer = await fs.promises.readFile(file);
      const baseUrl = opts.url ?? process.env.SLATE_URL;
      if (!baseUrl) throw new Error("SLATE_URL or --url required");
      const token = opts.token ?? process.env.SLATE_TOKEN;
      const url = baseUrl.replace(/\/$/, "") + `/api/import/${source}`;
      const fd = new FormData();
      fd.append("file", new Blob([buffer]), file.split("/").pop() ?? "upload.bin");
      const res = await fetch(url, {
        method: "POST",
        body: fd,
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`import failed: ${res.status} ${await res.text()}`);
      const { id } = (await res.json()) as { id: string };
      console.log(pc.green(`Import job ${id} enqueued. Watch /admin/import/${id} for progress.`));
    });
}
