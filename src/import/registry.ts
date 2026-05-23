import { parseWordpressXml } from "./importers/wordpress";
import { parseGhostJson } from "./importers/ghost";
import { parseMarkdownZip } from "./importers/markdown";
import { parseCsv } from "./importers/csv";
import type { ImportRecord } from "./types";

export type ImporterName = "wordpress" | "ghost" | "markdown" | "csv";

type ParserBytes = (bytes: Buffer) => AsyncGenerator<ImportRecord>;
type ParserText = (text: string) => AsyncGenerator<ImportRecord>;

export interface ImporterDef {
  name: ImporterName;
  contentType: "text" | "bytes";
  parse: ParserText | ParserBytes;
}

export const IMPORTERS: Record<ImporterName, ImporterDef> = {
  wordpress: { name: "wordpress", contentType: "text", parse: parseWordpressXml as ParserText },
  ghost: { name: "ghost", contentType: "text", parse: parseGhostJson as ParserText },
  markdown: { name: "markdown", contentType: "bytes", parse: parseMarkdownZip as ParserBytes },
  csv: { name: "csv", contentType: "text", parse: parseCsv as ParserText },
};
