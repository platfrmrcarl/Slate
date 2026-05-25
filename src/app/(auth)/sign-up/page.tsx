"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

// useSearchParams forces client-side rendering at this segment; Next's static
// prerender bails out unless the consumer sits inside a Suspense boundary.
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  const search = useSearchParams();
  const tierParam = search.get("tier");
  const validTier =
    tierParam === "essential" || tierParam === "premium" || tierParam === "enterprise"
      ? tierParam
      : null;
  const googleHref = validTier
    ? `/api/auth/oauth/google/start?tier=${encodeURIComponent(validTier)}`
    : "/api/auth/oauth/google/start";

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Create account</h2>
        {validTier && (
          <p className="text-muted-foreground text-sm">
            You picked the{" "}
            <span className="text-foreground font-medium capitalize">{validTier}</span> plan.
            Payment on the next step.
          </p>
        )}
      </header>

      <form action={action} className="grid gap-4">
        {validTier && <input type="hidden" name="tier" value={validTier} />}
        <div className="grid gap-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" required autoComplete="name" />
          {state?.fieldErrors?.displayName && (
            <p className="text-destructive text-sm">{state.fieldErrors.displayName}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
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
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs uppercase">or</span>
            <Separator className="flex-1" />
          </div>
          <Button variant="outline" className="w-full" render={<a href={googleHref} />}>
            Continue with Google
          </Button>
        </>
      )}
    </section>
  );
}
