"use client";

import { useActionState, useState } from "react";
import { rewriteAction } from "@/app/actions/ai";
import type { ActionResult } from "@/app/actions/ai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <Card>
      <CardContent>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Rewrite with AI</summary>
          <form action={action} className="mt-3 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="rewrite-mode">Mode</Label>
                <select
                  id="rewrite-mode"
                  name="mode"
                  defaultValue="rewrite"
                  className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
                >
                  <option value="rewrite">Rewrite</option>
                  <option value="expand">Expand</option>
                  <option value="shorten">Shorten</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="rewrite-tone">Tone</Label>
                <select
                  id="rewrite-tone"
                  name="tone"
                  defaultValue="neutral"
                  className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
                >
                  <option value="neutral">Neutral</option>
                  <option value="persuasive">Persuasive</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="rewrite-text">
                Text to rewrite{" "}
                <span className="text-muted-foreground text-xs">(paste from the editor)</span>
              </Label>
              <Textarea
                id="rewrite-text"
                name="text"
                rows={5}
                required
                minLength={1}
                maxLength={8000}
                placeholder="Paste a paragraph or two…"
              />
            </div>

            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="justify-self-start"
            >
              {pending ? "Rewriting…" : "Rewrite"}
            </Button>

            {state?.result && (
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="rewrite-result">Result</Label>
                  <Textarea
                    id="rewrite-result"
                    readOnly
                    rows={6}
                    value={state.result}
                    className="bg-muted font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyResult}
                  className="justify-self-start"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
          </form>
        </details>
      </CardContent>
    </Card>
  );
}
