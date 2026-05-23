"use client";

import { useActionState, useState } from "react";
import { rewriteAction } from "@/app/actions/ai";
import type { ActionResult } from "@/app/actions/ai";

/**
 * Stand-alone "Rewrite with AI" panel. The user pastes text in, picks a
 * mode/tone, and gets back rewritten copy they can copy back into the
 * editor. Kept intentionally separate from BlockNote — a deeper slash-
 * command integration can replace this later.
 */
export function RewritePanel(): React.ReactElement {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    rewriteAction,
    undefined,
  );
  const [copied, setCopied] = useState(false);

  async function copyResult(): Promise<void> {
    if (!state?.result) return;
    try {
      await navigator.clipboard.writeText(state.result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers
    }
  }

  return (
    <details className="rounded border bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium">Rewrite with AI</summary>
      <form action={action} className="mt-3 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-gray-600">Mode</span>
            <select name="mode" defaultValue="rewrite" className="rounded border p-2">
              <option value="rewrite">Rewrite</option>
              <option value="expand">Expand</option>
              <option value="shorten">Shorten</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-gray-600">Tone</span>
            <select name="tone" defaultValue="neutral" className="rounded border p-2">
              <option value="neutral">Neutral</option>
              <option value="persuasive">Persuasive</option>
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-gray-600">
            Text to rewrite{" "}
            <span className="text-xs text-gray-400">(paste from the editor)</span>
          </span>
          <textarea
            name="text"
            rows={5}
            required
            minLength={1}
            maxLength={8000}
            className="rounded border p-2"
            placeholder="Paste a paragraph or two…"
          />
        </label>

        {state?.error && (
          <p className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="justify-self-start rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Rewriting…" : "Rewrite"}
        </button>

        {state?.result && (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-gray-600">Result</span>
              <textarea
                readOnly
                rows={6}
                value={state.result}
                className="rounded border bg-gray-50 p-2 font-mono text-xs"
              />
            </label>
            <button
              type="button"
              onClick={copyResult}
              className="justify-self-start rounded border px-3 py-1.5 text-xs"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </form>
    </details>
  );
}
