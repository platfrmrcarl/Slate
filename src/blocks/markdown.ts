import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const schema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-[\w-]+$/]],
    a: [...(defaultSchema.attributes?.a ?? []), ["rel"], ["target"]],
  },
};

// Pipeline:
// - remark-parse: markdown -> mdast
// - remark-gfm: tables, strikethrough, task lists
// - remark-rehype with allowDangerousHtml: pass raw HTML through as raw nodes
// - rehype-raw: parse raw HTML string nodes into real hast elements
// - rehype-sanitize: strip <script>, on* attrs, etc. from the parsed tree
// - rehype-stringify: hast -> HTML string
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdownToHtml(source: string): Promise<string> {
  if (!source) return "";
  const file = await processor.process(source);
  return String(file);
}
