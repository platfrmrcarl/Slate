import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function Quote({ block }: { block: Extract<Block, { type: "quote" }> }) {
  const html = await renderMarkdownToHtml(block.markdown);
  return (
    <blockquote className="my-4 border-l-4 border-gray-300 pl-4 italic text-gray-700">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {block.attribution && (
        <footer className="mt-2 text-sm not-italic">— {block.attribution}</footer>
      )}
    </blockquote>
  );
}
