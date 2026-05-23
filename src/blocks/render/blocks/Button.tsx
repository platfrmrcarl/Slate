import type { Block } from "@/blocks/types";

const VARIANT: Record<"primary" | "secondary" | "ghost", string> = {
  primary: "bg-black text-white",
  secondary: "bg-gray-200 text-gray-900",
  ghost: "border border-gray-300 text-gray-900",
};

export function Button({ block }: { block: Extract<Block, { type: "button" }> }) {
  return (
    <p className="my-4">
      <a
        href={block.href}
        className={`inline-block rounded px-4 py-2 ${VARIANT[block.variant]} no-underline`}
      >
        {block.label}
      </a>
    </p>
  );
}
