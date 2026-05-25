"use client";

import { useState, useTransition } from "react";
import { autoSeoAction } from "@/app/actions/ai";
import { extractPlainText } from "@/blocks/extract-text";
import type { Block } from "@/blocks/types";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  blocks: Block[];
  excerpt?: string;
  onSuggest: (s: { seoTitle: string; seoDescription: string }) => void;
}

/**
 * "Suggest with AI" trigger placed next to SEO title + description inputs.
 * Reads current form state, calls autoSeoAction, and invokes the parent's
 * onSuggest to populate fields (the parent still controls when to save).
 */
export function AutoSeoButton({ title, blocks, excerpt, onSuggest }: Props): React.ReactElement {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(): void {
    setError(null);
    if (!title.trim()) {
      setError("Add a title first");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.append("title", title);
      if (excerpt) fd.append("excerpt", excerpt);
      fd.append("contentPreview", extractPlainText(blocks).slice(0, 5000));
      const res = await autoSeoAction(undefined, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.seoTitle && res.seoDescription) {
        onSuggest({ seoTitle: res.seoTitle, seoDescription: res.seoDescription });
      } else {
        setError("AI returned no suggestion");
      }
    });
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Thinking…" : "Suggest with AI"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
