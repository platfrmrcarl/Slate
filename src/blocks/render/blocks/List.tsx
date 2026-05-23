import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function List({ block }: { block: Extract<Block, { type: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  const items = await Promise.all(block.items.map((md) => renderMarkdownToHtml(md)));
  return (
    <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} pl-6 my-3 space-y-1`}>
      {items.map((html, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: stripParagraph(html) }} />
      ))}
    </Tag>
  );
}

function stripParagraph(html: string): string {
  return html.replace(/^<p>/, "").replace(/<\/p>\s*$/, "");
}
