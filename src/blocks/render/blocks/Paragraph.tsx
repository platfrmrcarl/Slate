import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function Paragraph({ block }: { block: Extract<Block, { type: "paragraph" }> }) {
  const html = await renderMarkdownToHtml(block.markdown);
  return <div className="my-3 leading-relaxed prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
