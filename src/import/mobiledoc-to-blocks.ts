import { markdownToBlocks } from "./markdown-to-blocks";

type MobiledocCard = [string, Record<string, unknown>];

export interface Mobiledoc {
  version: string;
  cards: MobiledocCard[];
  sections: Array<Array<unknown>>;
  atoms: Array<Array<unknown>>;
  markups: Array<Array<unknown>>;
}

async function sectionToBlocks(doc: Mobiledoc, section: Array<unknown>): Promise<unknown[]> {
  const type = section[0];
  if (type === 10) {
    const card = doc.cards[section[1] as number];
    if (!card) return [];
    const [name, payload] = card;
    if (name === "markdown") {
      const md = (payload as { markdown?: string }).markdown ?? "";
      return await markdownToBlocks(md);
    }
    if (name === "html") {
      return [
        {
          id: `mh-${Math.random().toString(36).slice(2, 8)}`,
          type: "html",
          html: String((payload as { html?: string }).html ?? ""),
        },
      ];
    }
    if (name === "image") {
      const src = String((payload as { src?: string }).src ?? "");
      const alt = String((payload as { alt?: string }).alt ?? "");
      return [
        {
          id: `mi-${Math.random().toString(36).slice(2, 8)}`,
          type: "paragraph",
          markdown: `![${alt}](${src})`,
        },
      ];
    }
    return [];
  }
  if (type === 1) {
    const markers = section[2] as Array<[number, number[], number, string]>;
    const text = markers.map((m) => m[3]).join("");
    return [
      {
        id: `mp-${Math.random().toString(36).slice(2, 8)}`,
        type: "paragraph",
        markdown: text,
      },
    ];
  }
  return [];
}

export async function mobiledocToBlocks(doc: Mobiledoc): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const section of doc.sections) {
    const blocks = await sectionToBlocks(doc, section);
    if (Array.isArray(blocks)) out.push(...blocks);
  }
  return out;
}
