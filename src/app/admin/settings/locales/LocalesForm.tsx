"use client";

import { useActionState, useState } from "react";
import type { Locale } from "@/i18n/locales";
import type { I18nSettings } from "@/i18n/settings";
import { saveLocalesAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function LocalesForm({
  catalogue,
  current,
}: {
  catalogue: Locale[];
  current: I18nSettings;
}): React.ReactElement {
  const [enabled, setEnabled] = useState<string[]>(current.enabledLocales);
  const [def, setDef] = useState<string>(current.defaultLocale);
  const [hide, setHide] = useState<boolean>(current.hideDefaultPrefix);
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(
    saveLocalesAction,
    undefined,
  );

  return (
    <form action={action} className="grid max-w-3xl gap-6">
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          defaultLocale: def,
          enabledLocales: enabled,
          hideDefaultPrefix: hide,
        })}
      />

      <Card>
        <CardHeader>
          <CardTitle>Enabled locales</CardTitle>
          <CardDescription>Choose which languages your site supports.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {catalogue.map((l) => {
              const checkboxId = `locale-${l.code}`;
              const isChecked = enabled.includes(l.code);
              return (
                <li key={l.code}>
                  <Label
                    htmlFor={checkboxId}
                    className="flex items-center gap-2 text-sm font-normal"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        setEnabled((cur) =>
                          checked
                            ? Array.from(new Set([...cur, l.code]))
                            : cur.filter((c) => c !== l.code),
                        )
                      }
                    />
                    <span lang={l.code}>{l.nativeName}</span>
                    <span className="text-muted-foreground">({l.code})</span>
                  </Label>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
          <CardDescription>Default locale and URL behavior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="defaultLocale">Default locale</Label>
            <select
              id="defaultLocale"
              value={def}
              onChange={(e) => setDef(e.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-fit rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-3"
            >
              {enabled.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <Label
            htmlFor="hideDefaultPrefix"
            className="flex items-center gap-2 text-sm font-normal"
          >
            <Checkbox
              id="hideDefaultPrefix"
              checked={hide}
              onCheckedChange={(checked) => setHide(checked === true)}
            />
            Hide default-locale prefix in URLs
          </Label>
        </CardContent>
      </Card>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
