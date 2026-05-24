import { Command } from "commander";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import pc from "picocolors";
import { remoteRequest, type TransportOpts } from "../transport";

async function poll(
  id: string,
  opts: TransportOpts,
): Promise<{ status: string; result?: { sizeBytes?: number } }> {
  for (let attempt = 0; attempt < 600; attempt++) {
    const r = await remoteRequest<{ status: string; result?: { sizeBytes?: number } }>(
      "GET",
      `/api/cli/exports?id=${id}`,
      undefined,
      opts,
    );
    if (r.status === "completed" || r.status === "failed") return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("timed out waiting for export");
}

export function exportCommand(opts: TransportOpts, includeDb: boolean): Command {
  const name = includeDb ? "backup" : "export";
  return new Command(name)
    .argument("<outputPath>", "where to save the export ZIP")
    .description(
      includeDb
        ? "Trigger a full export (+ db dump) and download it"
        : "Trigger an export and download it",
    )
    .action(async (outputPath: string) => {
      const { id } = await remoteRequest<{ id: string }>(
        "POST",
        "/api/cli/exports",
        { includeDb },
        opts,
      );
      console.log(pc.gray(`waiting for job ${id}...`));
      const r = await poll(id, opts);
      if (r.status !== "completed") throw new Error(`export ended in status ${r.status}`);
      const baseUrl = opts.url ?? process.env.SLATE_URL;
      if (!baseUrl) throw new Error("SLATE_URL or --url required");
      const token = opts.token ?? process.env.SLATE_TOKEN;
      const dl = await fetch(
        baseUrl.replace(/\/$/, "") + `/api/export/${id}/download`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!dl.ok || !dl.body) throw new Error(`download failed: ${dl.status}`);
      await pipeline(dl.body as unknown as NodeJS.ReadableStream, fs.createWriteStream(outputPath));
      console.log(pc.green(`Saved ${outputPath}`));
    });
}
