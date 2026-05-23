import type { JSX } from "react";
import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

const SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "text-4xl",
  2: "text-3xl",
  3: "text-2xl",
  4: "text-xl",
  5: "text-lg",
  6: "text-base",
};

export async function Heading({ block }: { block: Extract<Block, { type: "heading" }> }) {
  const html = await renderMarkdownToHtml(block.text);
  const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag className={`${SIZE[block.level]} font-bold mt-6 mb-3`}>
      <span dangerouslySetInnerHTML={{ __html: stripParagraph(html) }} />
    </Tag>
  );
}

function stripParagraph(html: string): string {
  return html.replace(/^<p>/, "").replace(/<\/p>\s*$/, "");
}
