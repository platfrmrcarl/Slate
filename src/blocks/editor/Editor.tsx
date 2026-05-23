"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCallback, useMemo, useRef } from "react";
import { editorSchema } from "./schema";
import { fromBlockNote, toBlockNote, type BNBlock } from "./adapter";
import type { Block } from "../types";

export interface EditorProps {
  initialBlocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function Editor({ initialBlocks, onChange }: EditorProps) {
  const initial = useMemo(() => toBlockNote(initialBlocks) as unknown, [initialBlocks]);
  const lastSerialized = useRef<string>("");

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: initial as never,
  });

  const handleChange = useCallback(() => {
    const document = editor.document as unknown as BNBlock[];
    const canonical = fromBlockNote(document);
    const serialized = JSON.stringify(canonical);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    onChange(canonical);
  }, [editor, onChange]);

  return (
    <div className="rounded border bg-white">
      <BlockNoteView editor={editor} onChange={handleChange} />
    </div>
  );
}
