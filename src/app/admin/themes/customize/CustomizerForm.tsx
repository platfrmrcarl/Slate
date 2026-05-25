"use client";

import { useActionState, useMemo, useState } from "react";
import type { ThemeManifest } from "@/themes/manifest";
import { customizeThemeAction } from "@/app/actions/themes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomizerForm({
  themeId,
  manifest,
  values,
}: {
  themeId: string;
  manifest: ThemeManifest;
  values: Record<string, string | number | boolean | undefined>;
}) {
  const initial = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? ""])),
    [values],
  );
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(
    customizeThemeAction,
    undefined,
  );
  const [local, setLocal] = useState<Record<string, string | boolean>>(
    initial as Record<string, string | boolean>,
  );

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="themeId" value={themeId} />
          <input
            type="hidden"
            name="customizationJson"
            value={JSON.stringify(
              Object.fromEntries(
                Object.entries(local).map(([k, v]) => [
                  k,
                  v === "true" ? true : v === "false" ? false : v,
                ]),
              ),
            )}
          />
          {manifest.customizations.map((c) => (
            <div key={c.key} className="grid gap-1.5">
              <Label htmlFor={`cz-${c.key}`}>{c.label}</Label>
              {c.type === "color" && (
                <input
                  id={`cz-${c.key}`}
                  type="color"
                  value={String(local[c.key] ?? "#000000")}
                  onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
                  className="border-input h-9 w-16 rounded-lg border"
                />
              )}
              {c.type === "text" && (
                <Input
                  id={`cz-${c.key}`}
                  type="text"
                  value={String(local[c.key] ?? "")}
                  onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
                />
              )}
              {c.type === "font" && (
                <Input
                  id={`cz-${c.key}`}
                  type="text"
                  value={String(local[c.key] ?? "")}
                  onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
                  placeholder='e.g. "Inter, system-ui, sans-serif"'
                />
              )}
              {c.type === "boolean" && (
                <Checkbox
                  id={`cz-${c.key}`}
                  checked={local[c.key] === true || local[c.key] === "true"}
                  onCheckedChange={(checked) =>
                    setLocal((s) => ({ ...s, [c.key]: String(checked === true) }))
                  }
                />
              )}
              {c.type === "select" && (
                <select
                  id={`cz-${c.key}`}
                  value={String(local[c.key] ?? c.default)}
                  onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
                  className="border-input bg-background h-8 w-fit rounded-lg border px-2.5 text-sm"
                >
                  {c.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {c.type === "image" && (
                <Input
                  id={`cz-${c.key}`}
                  type="text"
                  placeholder="media UUID"
                  value={String(local[c.key] ?? "")}
                  onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Saving…" : "Save customization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
