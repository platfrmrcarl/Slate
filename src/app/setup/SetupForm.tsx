"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

type SetupAction = (
  prev: ActionResult | undefined,
  formData: FormData,
) => Promise<ActionResult>;

export function SetupForm({ action }: { action: SetupAction }) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Site</CardTitle>
          <CardDescription>Basic details for your new site.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="siteTitle">Site title</Label>
            <Input id="siteTitle" name="siteTitle" required placeholder="My Site" />
            {state?.fieldErrors?.siteTitle && (
              <p className="text-destructive text-sm">{state.fieldErrors.siteTitle}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="siteTagline">Tagline</Label>
            <Input id="siteTagline" name="siteTagline" placeholder="Optional" />
            {state?.fieldErrors?.siteTagline && (
              <p className="text-destructive text-sm">{state.fieldErrors.siteTagline}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="defaultLocale">Default locale</Label>
            <Input
              id="defaultLocale"
              name="defaultLocale"
              defaultValue="en"
              placeholder="e.g. en"
            />
            {state?.fieldErrors?.defaultLocale && (
              <p className="text-destructive text-sm">{state.fieldErrors.defaultLocale}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner account</CardTitle>
          <CardDescription>
            This account will have full administrative access.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              name="displayName"
              required
              autoComplete="name"
              placeholder="Jane Doe"
            />
            {state?.fieldErrors?.displayName && (
              <p className="text-destructive text-sm">{state.fieldErrors.displayName}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            {state?.fieldErrors?.email && (
              <p className="text-destructive text-sm">{state.fieldErrors.email}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password (12+ chars)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
            {state?.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating site…" : "Create site"}
      </Button>
    </form>
  );
}
