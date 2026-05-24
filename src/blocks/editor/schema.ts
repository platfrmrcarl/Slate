import {
  BlockNoteSchema,
  createBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";

// `divider` was a built-in in BlockNote ≥0.26, but BlockNote 0.27 ships without one.
// We fall back to `paragraph` so the schema still type-checks; the adapter emits
// divider blocks as a placeholder `type: "divider"` BN block which is dropped by
// the editor but preserved when round-tripping through our adapter on JSON only.
const specsWithDivider = defaultBlockSpecs as typeof defaultBlockSpecs & {
  divider?: (typeof defaultBlockSpecs)["paragraph"];
};

// --- Custom block specs --------------------------------------------------------
//
// We mirror the adapter's `BNBlock → Block` shape for these four custom types
// (image / gallery / embed / button). The renderer side (public site) is handled
// by the components under `src/blocks/render/*`; here we only need the editor to
// know how to insert + display the blocks in the slash menu.
//
// All four blocks are leaf nodes (`content: "none"`), so they render purely from
// their props. We build plain DOM in the `render` function — no React imports —
// which keeps this module loadable from node test environments.

const imageBlock = createBlockSpec(
  {
    type: "image",
    propSchema: {
      mediaId: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      size: { default: "medium", values: ["small", "medium", "full"] as const },
    },
    content: "none",
  },
  {
    render: (block) => {
      const props = block.props as {
        mediaId: string;
        alt: string;
        caption: string;
        size: string;
      };
      const dom = document.createElement("div");
      dom.className = "slate-editor-block slate-editor-image";
      dom.style.cssText =
        "border:1px dashed #d4d4d8;border-radius:6px;padding:8px;margin:4px 0;background:#fafafa;font-size:13px;";
      dom.textContent = props.mediaId
        ? `[image ${props.size}] ${props.mediaId}${props.alt ? ` — ${props.alt}` : ""}`
        : "[image] (paste a mediaId)";
      return { dom };
    },
  },
);

const galleryBlock = createBlockSpec(
  {
    type: "gallery",
    propSchema: {
      mediaIds: { default: "" },
      layout: { default: "grid", values: ["grid", "carousel", "masonry"] as const },
    },
    content: "none",
  },
  {
    render: (block) => {
      const props = block.props as { mediaIds: string; layout: string };
      const dom = document.createElement("div");
      dom.className = "slate-editor-block slate-editor-gallery";
      dom.style.cssText =
        "border:1px dashed #d4d4d8;border-radius:6px;padding:8px;margin:4px 0;background:#fafafa;font-size:13px;";
      const count = props.mediaIds.split(",").filter((s) => s.trim().length > 0).length;
      dom.textContent = `[gallery ${props.layout}] ${count} item(s)`;
      return { dom };
    },
  },
);

const embedBlock = createBlockSpec(
  {
    type: "embed",
    propSchema: {
      provider: {
        default: "generic",
        values: ["youtube", "vimeo", "twitter", "spotify", "generic"] as const,
      },
      url: { default: "" },
      html: { default: "" },
    },
    content: "none",
  },
  {
    render: (block) => {
      const props = block.props as { provider: string; url: string; html: string };
      const dom = document.createElement("div");
      dom.className = "slate-editor-block slate-editor-embed";
      dom.style.cssText =
        "border:1px solid #e4e4e7;border-radius:6px;padding:10px;margin:4px 0;background:#ffffff;";
      const title = document.createElement("div");
      title.style.cssText = "font-size:11px;text-transform:uppercase;color:#71717a;";
      title.textContent = `Embed · ${props.provider}`;
      const url = document.createElement("div");
      url.style.cssText = "font-size:13px;color:#3f3f46;word-break:break-all;";
      url.textContent = props.url || "(no URL)";
      dom.appendChild(title);
      dom.appendChild(url);
      return { dom };
    },
  },
);

const buttonBlock = createBlockSpec(
  {
    type: "button",
    propSchema: {
      label: { default: "Click me" },
      href: { default: "#" },
      variant: { default: "primary", values: ["primary", "secondary", "ghost"] as const },
    },
    content: "none",
  },
  {
    render: (block) => {
      const props = block.props as { label: string; href: string; variant: string };
      const dom = document.createElement("div");
      dom.className = "slate-editor-block slate-editor-button";
      dom.style.cssText = "margin:4px 0;";
      const btn = document.createElement("span");
      const bg =
        props.variant === "ghost"
          ? "transparent"
          : props.variant === "secondary"
            ? "#e4e4e7"
            : "#111827";
      const color = props.variant === "primary" ? "#ffffff" : "#111827";
      btn.style.cssText = `display:inline-block;padding:6px 12px;border-radius:6px;background:${bg};color:${color};font-size:13px;border:1px solid #d4d4d8;`;
      btn.textContent = `${props.label}  →  ${props.href}`;
      dom.appendChild(btn);
      return { dom };
    },
  },
);

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    divider: specsWithDivider.divider ?? defaultBlockSpecs.paragraph,
    image: imageBlock,
    gallery: galleryBlock,
    embed: embedBlock,
    button: buttonBlock,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

export type EditorSchema = typeof editorSchema;
