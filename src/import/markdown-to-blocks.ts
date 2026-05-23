import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Heading, Paragraph, List, Code, Blockquote } from "mdast";
import { toMarkdown } from "mdast-util-to-markdown";

let counter = 0;
function nextId(prefix = "b"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Date.now().toString(36).slice(-4)}`;
}

interface Block {
  id: string;
  type: string;
  [k: string]: unknown;
}

function inline(node: unknown): string {
  return toMarkdown(node as Parameters<typeof toMarkdown>[0]).trim();
}

export async function markdownToBlocks(source: string): Promise<Block[]> {
  counter = 0;
  const tree = unified().use(remarkParse).parse(source) as Root;
  const out: Block[] = [];

  for (const node of tree.children) {
    if (node.type === "heading") {
      const h = node as Heading;
      out.push({
        id: nextId("h"),
        type: "heading",
        level: h.depth,
        text: inline({ type: "paragraph", children: h.children }),
      });
    } else if (node.type === "paragraph") {
      const p = node as Paragraph;
      out.push({ id: nextId("p"), type: "paragraph", markdown: inline(p).trim() });
    } else if (node.type === "blockquote") {
      const bq = node as Blockquote;
      out.push({
        id: nextId("q"),
        type: "quote",
        markdown: inline({ type: "blockquote", children: bq.children })
          .replace(/^>\s?/gm, "")
          .trim(),
      });
    } else if (node.type === "list") {
      const l = node as List;
      const items = l.children.map((li) => {
        return li.children
          .map((c) => inline(c))
          .join(" ")
          .trim();
      });
      out.push({ id: nextId("l"), type: "list", ordered: !!l.ordered, items });
    } else if (node.type === "code") {
      const c = node as Code;
      const lang = c.lang ?? "";
      if (lang.startsWith("block:")) {
        try {
          const parsed = JSON.parse(c.value);
          if (parsed && typeof parsed === "object" && "type" in parsed) {
            out.push(parsed as Block);
            continue;
          }
        } catch {
          // fall through to normal code block
        }
      }
      out.push({ id: nextId("c"), type: "code", language: lang, source: c.value });
    } else if (node.type === "thematicBreak") {
      out.push({ id: nextId("d"), type: "divider" });
    } else {
      // Anything else (html, table, etc.) gets serialized as a paragraph block.
      const md = inline(node);
      out.push({ id: nextId("p"), type: "paragraph", markdown: md });
    }
  }
  return out;
}
