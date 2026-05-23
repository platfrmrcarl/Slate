import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";

// Phase 1: lean on BlockNote's built-ins for heading/paragraph/list/quote/codeBlock.
// Phase 2 (later task): add custom specs for embed + button so the editor can render
// them. For now, the adapter shuttles their data through props — the editor wrapper
// is the next step's concern.
//
// `divider` was a built-in in BlockNote ≥0.26, but BlockNote 0.27 ships without one.
// We fall back to `paragraph` so the schema still type-checks; the adapter emits
// divider blocks as a placeholder `type: "divider"` BN block which is dropped by
// the editor but preserved when round-tripping through our adapter on JSON only.
const specsWithDivider = defaultBlockSpecs as typeof defaultBlockSpecs & {
  divider?: (typeof defaultBlockSpecs)["paragraph"];
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    divider: specsWithDivider.divider ?? defaultBlockSpecs.paragraph,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

export type EditorSchema = typeof editorSchema;
