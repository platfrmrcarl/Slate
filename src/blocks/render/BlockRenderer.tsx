import { cloneElement, Fragment, type ReactElement } from "react";
import type { Block } from "@/blocks/types";
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

export async function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return <>{await Promise.all(blocks.map((b) => renderOne(b)))}</>;
}

// Async components are invoked directly and awaited here so the returned tree
// contains only resolved React elements. This lets the renderer feed sync
// outputs (renderToString, renderToStaticMarkup) without triggering suspense.
async function renderOne(block: Block): Promise<ReactElement> {
  switch (block.type) {
    case "heading":
      return withKey(await Heading({ block }), block.id);
    case "paragraph":
      return withKey(await Paragraph({ block }), block.id);
    case "list":
      return withKey(await List({ block }), block.id);
    case "quote":
      return withKey(await Quote({ block }), block.id);
    case "code":
      return withKey(Code({ block }), block.id);
    case "divider":
      return withKey(Divider(), block.id);
    case "embed":
      return withKey(Embed({ block }), block.id);
    case "button":
      return withKey(Button({ block }), block.id);
    case "image":
      return withKey((await ImageBlock({ block })) ?? <Fragment />, block.id);
    case "gallery":
      return withKey((await GalleryBlock({ block })) ?? <Fragment />, block.id);
  }
}

function withKey(element: ReactElement, key: string): ReactElement {
  return cloneElement(element, { key });
}
