import type { Block } from "@/blocks/types";

export function Code({ block }: { block: Extract<Block, { type: "code" }> }) {
  return (
    <pre className="my-4 overflow-auto rounded bg-gray-900 p-4 text-gray-100">
      <code className={`language-${block.language}`}>{block.source}</code>
    </pre>
  );
}
