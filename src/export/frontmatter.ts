import matter from "gray-matter";

/**
 * Render a YAML-frontmatter block for the given data. Includes the leading
 * and trailing `---` delimiters but no trailing newline — callers append the
 * separator before the body.
 */
export function renderFrontmatter(data: Record<string, unknown>): string {
  const stringified = matter.stringify("", data);
  // gray-matter emits "---\n<yaml>---\n" — strip the trailing newline so
  // callers can append explicitly.
  return stringified.replace(/\n$/, "");
}

export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(input: string): ParsedDoc {
  const parsed = matter(input);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}
