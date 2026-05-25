"use client";

import { useActionState } from "react";
import { generatePageWizardAction, type GenerateWizardState } from "./actions";

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
    <form action={action} className="mt-3 grid gap-3">
      <input type="hidden" name="themeSlug" value={themeSlug} />

      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">
          Title <span className="text-xs text-gray-400">(optional)</span>
        </span>
        <input
          name="title"
          placeholder="Page title"
          className="rounded border p-2"
          maxLength={200}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">Page type</span>
        <select name="pageType" defaultValue="landing" className="rounded border p-2">
          {PAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">Prompt</span>
        <textarea
          name="prompt"
          rows={5}
          required
          minLength={3}
          maxLength={2000}
          placeholder="Describe what this page should say, who it's for, and the call to action."
          className="rounded border p-2"
        />
      </label>

      {state?.error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate draft"}
      </button>
    </form>
  );
}
