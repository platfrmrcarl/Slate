import type { Block } from "./types";

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
    .replace(/[*_`~]+/g, "") // emphasis chars
    .replace(/^#+\s+/gm, "") // header hashes
    .replace(/^>\s+/gm, "") // blockquote arrows
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPlainText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(stripMarkdown(block.text));
        break;
      case "paragraph":
        parts.push(stripMarkdown(block.markdown));
        break;
      case "list":
        parts.push(block.items.map(stripMarkdown).join(" "));
        break;
      case "quote":
        parts.push(stripMarkdown(block.markdown));
        if (block.attribution) parts.push(block.attribution);
        break;
      case "button":
        parts.push(block.label);
        break;
      // code, divider, embed contribute nothing to search
    }
  }
  return parts.filter(Boolean).join(" ").trim();
}
