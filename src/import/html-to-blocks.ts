import {
  parse,
  type ChildNode,
  type DocumentFragment,
  type Element,
  type TextNode,
} from "parse5";

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

function isElement(n: ChildNode): n is Element {
  return "tagName" in n;
}
function isText(n: ChildNode): n is TextNode {
  return n.nodeName === "#text";
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs?.find((a) => a.name === name)?.value;
}

function textOf(el: Element | DocumentFragment): string {
  let out = "";
  for (const child of el.childNodes) {
    if (isText(child)) out += child.value;
    else if (isElement(child)) out += textOf(child);
  }
  return out;
}

function inlineMarkdown(el: Element): string {
  let out = "";
  for (const child of el.childNodes) {
    if (isText(child)) out += child.value;
    else if (isElement(child)) {
      const tag = child.tagName;
      const inner = inlineMarkdown(child);
      switch (tag) {
        case "strong":
        case "b":
          out += `**${inner}**`;
          break;
        case "em":
        case "i":
          out += `_${inner}_`;
          break;
        case "code":
          out += `\`${inner}\``;
          break;
        case "a": {
          const href = attr(child, "href") ?? "";
          out += `[${inner}](${href})`;
          break;
        }
        case "br":
          out += "  \n";
          break;
        case "img": {
          const src = attr(child, "src") ?? "";
          const alt = attr(child, "alt") ?? "";
          out += `![${alt}](${src})`;
          break;
        }
        default:
          out += inner;
      }
    }
  }
  return out.trim();
}

function isStandaloneImgParagraph(el: Element): boolean {
  if (el.tagName !== "p") return false;
  const significant = el.childNodes.filter((c) => !(isText(c) && c.value.trim() === ""));
  return (
    significant.length === 1 && isElement(significant[0]!) && significant[0].tagName === "img"
  );
}

function listItems(list: Element): string[] {
  return list.childNodes
    .filter(isElement)
    .filter((c) => c.tagName === "li")
    .map((li) => inlineMarkdown(li));
}

function languageOf(codeEl: Element): string {
  const cls = attr(codeEl, "class") ?? "";
  const m = cls.match(/language-([\w-]+)/);
  return m?.[1] ?? "";
}

function convertElement(el: Element): Block | Block[] | null {
  const tag = el.tagName;
  if (
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6"
  ) {
    return {
      id: nextId("h"),
      type: "heading",
      level: Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
      text: inlineMarkdown(el),
    };
  }
  if (tag === "p") {
    if (isStandaloneImgParagraph(el)) {
      const img = el.childNodes.find((c) => isElement(c) && c.tagName === "img") as Element;
      return {
        id: nextId("p"),
        type: "paragraph",
        markdown: `![${attr(img, "alt") ?? ""}](${attr(img, "src") ?? ""})`,
      };
    }
    return { id: nextId("p"), type: "paragraph", markdown: inlineMarkdown(el) };
  }
  if (tag === "ul" || tag === "ol") {
    return { id: nextId("l"), type: "list", ordered: tag === "ol", items: listItems(el) };
  }
  if (tag === "blockquote") {
    const inner = inlineMarkdown(el);
    return { id: nextId("q"), type: "quote", markdown: inner };
  }
  if (tag === "pre") {
    const code = el.childNodes.find((c) => isElement(c) && c.tagName === "code") as
      | Element
      | undefined;
    const source = code ? textOf(code) : textOf(el);
    const language = code ? languageOf(code) : "";
    return { id: nextId("c"), type: "code", language, source };
  }
  if (tag === "hr") {
    return { id: nextId("d"), type: "divider" };
  }
  if (tag === "img") {
    return {
      id: nextId("p"),
      type: "paragraph",
      markdown: `![${attr(el, "alt") ?? ""}](${attr(el, "src") ?? ""})`,
    };
  }
  if (tag === "div" || tag === "section" || tag === "article") {
    return walkChildren(el);
  }
  // Unknown tag: dump raw HTML as a sanitizable block.
  return { id: nextId("html"), type: "html", html: serialize(el) };
}

function serialize(el: Element): string {
  return `<${el.tagName}>${textOf(el)}</${el.tagName}>`;
}

function walkChildren(parent: Element | DocumentFragment): Block[] {
  const out: Block[] = [];
  for (const child of parent.childNodes) {
    if (isText(child)) {
      const trimmed = child.value.trim();
      if (trimmed) out.push({ id: nextId("p"), type: "paragraph", markdown: trimmed });
      continue;
    }
    if (!isElement(child)) continue;
    const converted = convertElement(child);
    if (!converted) continue;
    if (Array.isArray(converted)) out.push(...converted);
    else out.push(converted);
  }
  return out;
}

export function htmlToBlocks(html: string): Block[] {
  counter = 0;
  const doc = parse(`<!doctype html><html><body>${html}</body></html>`);
  const body = ((doc as unknown as { childNodes: ChildNode[] }).childNodes ?? [])
    .filter(isElement)
    .find((n) => n.tagName === "html")
    ?.childNodes.filter(isElement)
    .find((n) => n.tagName === "body");
  if (!body) return [];
  return walkChildren(body);
}
