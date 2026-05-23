import { cloneElement, Fragment, type ReactElement } from "react";
import type { Block } from "@/blocks/types";
import { blockRegistry } from "@/blocks/registry";
import { Heading } from "./blocks/Heading";
import { Paragraph } from "./blocks/Paragraph";
import { List } from "./blocks/List";
import { Quote } from "./blocks/Quote";
import { Code } from "./blocks/Code";
import { Divider } from "./blocks/Divider";
import { Embed } from "./blocks/Embed";
import { Button } from "./blocks/Button";
import { ImageBlock } from "./blocks/Image";
import { GalleryBlock } from "./blocks/Gallery";

// A `Block` is the canonical built-in discriminated union; plugin authors
// may also persist `{ type: "custom:<slug>-<name>", ... }` records — those
// route through the runtime registry, not the switch below.
type AnyBlock = Block | (Record<string, unknown> & { id: string; type: string });

export async function BlockRenderer({ blocks }: { blocks: AnyBlock[] }) {
  return <>{await Promise.all(blocks.map((b) => renderOne(b)))}</>;
}

// Async components are invoked directly and awaited here so the returned tree
// contains only resolved React elements. This lets the renderer feed sync
// outputs (renderToString, renderToStaticMarkup) without triggering suspense.
async function renderOne(block: AnyBlock): Promise<ReactElement> {
  const b = block as Block;
  switch (b.type) {
    case "heading":
      return withKey(await Heading({ block: b }), b.id);
    case "paragraph":
      return withKey(await Paragraph({ block: b }), b.id);
    case "list":
      return withKey(await List({ block: b }), b.id);
    case "quote":
      return withKey(await Quote({ block: b }), b.id);
    case "code":
      return withKey(Code({ block: b }), b.id);
    case "divider":
      return withKey(Divider(), b.id);
    case "embed":
      return withKey(Embed({ block: b }), b.id);
    case "button":
      return withKey(Button({ block: b }), b.id);
    case "image":
      return withKey((await ImageBlock({ block: b })) ?? <Fragment />, b.id);
    case "gallery":
      return withKey((await GalleryBlock({ block: b })) ?? <Fragment />, b.id);
    default:
      // Plugin-contributed block. Look up `render` in the runtime registry
      // and invoke it; fall back to an empty Fragment if no definition is
      // registered (e.g., plugin disabled after pages referencing it were
      // saved).
      return await renderPluginBlock(
        block as Record<string, unknown> & { id: string; type: string },
      );
  }
}

async function renderPluginBlock(
  block: Record<string, unknown> & { id: string; type: string },
): Promise<ReactElement> {
  const def = blockRegistry.get(block.type);
  const render = def && (def as { render?: unknown }).render;
  if (typeof render !== "function") return withKey(<Fragment />, block.id);
  const out = await (render as (b: typeof block) => ReactElement | Promise<ReactElement>)(block);
  return withKey(out ?? <Fragment />, block.id);
}

function withKey(element: ReactElement, key: string): ReactElement {
  return cloneElement(element, { key });
}
