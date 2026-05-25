"use client";

import { useActionState } from "react";
import { generatePageWizardAction, type GenerateWizardState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PAGE_TYPES = [
  { value: "landing", label: "Landing page" },
  { value: "blog", label: "Blog post" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "custom", label: "Custom" },
] as const;

export function GenerateWithAIForm({ themeSlug }: { themeSlug: string }): React.ReactElement {
  const [state, action, pending] = useActionState<GenerateWizardState | undefined, FormData>(
    generatePageWizardAction,
    undefined,
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="themeSlug" value={themeSlug} />

      <div className="grid gap-2">
        <Label htmlFor="generate-title">
          Title <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="generate-title"
          name="title"
          placeholder="Page title"
          maxLength={200}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="generate-pageType">Page type</Label>
        <select
          id="generate-pageType"
          name="pageType"
          defaultValue="landing"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-3"
        >
          {PAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="generate-prompt">Prompt</Label>
        <Textarea
          id="generate-prompt"
          name="prompt"
          rows={5}
          required
          minLength={3}
          maxLength={2000}
          placeholder="Describe what this page should say, who it's for, and the call to action."
        />
      </div>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate draft"}
        </Button>
      </div>
    </form>
  );
}
