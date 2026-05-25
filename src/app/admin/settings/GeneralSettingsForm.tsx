"use client";

import { useActionState } from "react";
import { saveGeneralSettingsAction } from "@/app/actions/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

export interface GeneralSettingsValues {
  siteTitle: string;
  siteTagline: string;
  defaultLocale: string;
  postsPerPage: number;
  seoDescription: string;
}

export function GeneralSettingsForm({
  initial,
  enabledLocales,
}: {
  initial: GeneralSettingsValues;
  enabledLocales: string[];
}): React.ReactElement {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(
    saveGeneralSettingsAction,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Site identity</CardTitle>
          <CardDescription>How your site presents itself to visitors.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="siteTitle">Site title</Label>
            <Input
              id="siteTitle"
              name="siteTitle"
              defaultValue={initial.siteTitle}
              required
              aria-invalid={fe.siteTitle ? true : undefined}
            />
            {fe.siteTitle && <p className="text-destructive text-sm">{fe.siteTitle}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="siteTagline">Tagline</Label>
            <Input
              id="siteTagline"
              name="siteTagline"
              defaultValue={initial.siteTagline}
              aria-invalid={fe.siteTagline ? true : undefined}
            />
            {fe.siteTagline && <p className="text-destructive text-sm">{fe.siteTagline}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="seoDescription">Site description (SEO)</Label>
            <Textarea
              id="seoDescription"
              name="seoDescription"
              defaultValue={initial.seoDescription}
              rows={3}
              aria-invalid={fe.seoDescription ? true : undefined}
            />
            {fe.seoDescription && <p className="text-destructive text-sm">{fe.seoDescription}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reading</CardTitle>
          <CardDescription>Defaults for content delivery and listings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="defaultLocale">Default locale</Label>
            <select
              id="defaultLocale"
              name="defaultLocale"
              defaultValue={initial.defaultLocale}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-fit rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-3"
            >
              {enabledLocales.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            {fe.defaultLocale && <p className="text-destructive text-sm">{fe.defaultLocale}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="postsPerPage">Posts per page</Label>
            <Input
              id="postsPerPage"
              name="postsPerPage"
              type="number"
              min={1}
              max={100}
              defaultValue={initial.postsPerPage}
              className="w-32"
              aria-invalid={fe.postsPerPage ? true : undefined}
            />
            {fe.postsPerPage && <p className="text-destructive text-sm">{fe.postsPerPage}</p>}
          </div>
        </CardContent>
      </Card>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
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
