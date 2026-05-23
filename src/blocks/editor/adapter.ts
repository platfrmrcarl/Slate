import type { Block } from "../types";
import { generateBlockId } from "../ids";

// BlockNote's block shape is intentionally typed loose-ly here — we deal with the JSON
// document representation, not the full editor types, to avoid coupling to internals.
export interface BNText {
  type: "text";
  text: string;
  styles?: Record<string, unknown>;
}

export interface BNBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: BNText[] | string;
  children?: BNBlock[];
}

function textOf(content: BNBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content.map((c) => c.text ?? "").join("");
}

function inlineMarkdownOf(content: BNBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .map((c) => {
      const styles = (c.styles ?? {}) as Record<string, boolean>;
      let s = c.text ?? "";
      if (styles.code) s = `\`${s}\``;
      if (styles.bold) s = `**${s}**`;
      if (styles.italic) s = `_${s}_`;
      return s;
    })
    .join("");
}

function textRun(s: string): BNText[] {
  return s ? [{ type: "text", text: s, styles: {} }] : [];
}

export function toBlockNote(blocks: Block[]): BNBlock[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading":
        return { id: b.id, type: "heading", props: { level: b.level }, content: textRun(b.text) };
      case "paragraph":
        return { id: b.id, type: "paragraph", content: textRun(b.markdown) };
      case "list":
        // Lists in BlockNote are flat: each item is its own block of bulletListItem / numberedListItem.
        // We adapt by emitting a single "list" pseudo-block whose items are joined with `\n`
        // and round-tripped via the `_wpkListContainer` / `_wpkItemCount` markers.
        return {
          id: b.id,
          type: b.ordered ? "numberedListItem" : "bulletListItem",
          content: textRun(b.items.join("\n")),
          props: { _wpkListContainer: true, _wpkItemCount: b.items.length },
        };
      case "quote":
        return {
          id: b.id,
          type: "quote",
          content: textRun(b.markdown),
          props: { attribution: b.attribution ?? "" },
        };
      case "code":
        return {
          id: b.id,
          type: "codeBlock",
          props: { language: b.language },
          content: b.source,
        };
      case "divider":
        return { id: b.id, type: "divider" };
      case "embed":
        return {
          id: b.id,
          type: "embed",
          props: { provider: b.provider, url: b.url, html: b.html ?? "" },
        };
      case "button":
        return {
          id: b.id,
          type: "button",
          props: { label: b.label, href: b.href, variant: b.variant },
        };
      case "image":
        return {
          id: b.id,
          type: "image",
          props: {
            mediaId: b.mediaId,
            alt: b.alt ?? "",
            caption: b.caption ?? "",
            size: b.size ?? "medium",
          },
        };
      case "gallery":
        return {
          id: b.id,
          type: "gallery",
          props: {
            mediaIds: b.mediaIds.join(","),
            layout: b.layout,
          },
        };
    }
  });
}

export function fromBlockNote(bn: BNBlock[]): Block[] {
  const out: Block[] = [];
  for (const node of bn) {
    const id = node.id || generateBlockId();
    switch (node.type) {
      case "heading": {
        const level = Number((node.props as { level?: number } | undefined)?.level ?? 1) as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6;
        out.push({ id, type: "heading", level, text: textOf(node.content) });
        break;
      }
      case "paragraph":
        out.push({ id, type: "paragraph", markdown: inlineMarkdownOf(node.content) });
        break;
      case "bulletListItem":
      case "numberedListItem": {
        const ordered = node.type === "numberedListItem";
        const items = textOf(node.content)
          .split("\n")
          .filter((s) => s.length > 0);
        if (items.length === 0) items.push("");
        out.push({ id, type: "list", ordered, items });
        break;
      }
      case "quote": {
        const attribution = (node.props as { attribution?: string } | undefined)?.attribution;
        out.push({
          id,
          type: "quote",
          markdown: textOf(node.content),
          ...(attribution ? { attribution } : {}),
        });
        break;
      }
      case "codeBlock": {
        const language = (node.props as { language?: string } | undefined)?.language ?? "text";
        out.push({ id, type: "code", language, source: textOf(node.content) });
        break;
      }
      case "divider":
        out.push({ id, type: "divider" });
        break;
      case "embed": {
        const props = node.props as { provider?: string; url?: string; html?: string } | undefined;
        const provider = (props?.provider ?? "generic") as
          | "youtube"
          | "vimeo"
          | "twitter"
          | "spotify"
          | "generic";
        const url = props?.url ?? "";
        out.push({
          id,
          type: "embed",
          provider,
          url,
          ...(props?.html ? { html: props.html } : {}),
        });
        break;
      }
      case "button": {
        const props = node.props as
          | { label?: string; href?: string; variant?: "primary" | "secondary" | "ghost" }
          | undefined;
        out.push({
          id,
          type: "button",
          label: props?.label ?? "",
          href: props?.href ?? "",
          variant: props?.variant ?? "primary",
        });
        break;
      }
      case "image": {
        const props = node.props as
          | {
              mediaId?: string;
              alt?: string;
              caption?: string;
              size?: "small" | "medium" | "full";
            }
          | undefined;
        const mediaId = props?.mediaId ?? "";
        if (!mediaId) break;
        out.push({
          id,
          type: "image",
          mediaId,
          ...(props?.alt ? { alt: props.alt } : {}),
          ...(props?.caption ? { caption: props.caption } : {}),
          ...(props?.size ? { size: props.size } : {}),
        });
        break;
      }
      case "gallery": {
        const props = node.props as
          | { mediaIds?: string; layout?: "grid" | "carousel" | "masonry" }
          | undefined;
        const mediaIds = (props?.mediaIds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        out.push({
          id,
          type: "gallery",
          mediaIds,
          layout: props?.layout ?? "grid",
        });
        break;
      }
      // Unknown block types are dropped to keep the canonical shape valid.
      default:
        break;
    }
  }
  return out;
}
