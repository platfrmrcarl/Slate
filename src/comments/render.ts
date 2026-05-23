import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

const schema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), ["rel"], ["target"]],
  },
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    href: ["http", "https", "mailto"],
  },
};

function rehypeAddNofollow() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "a") {
        node.properties = node.properties ?? {};
        node.properties.rel = "nofollow noopener noreferrer";
        node.properties.target = "_blank";
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeAddNofollow)
  .use(rehypeStringify);

export async function renderCommentMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file).trim();
}
