"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface State {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<State | undefined, FormData>(
    forgotPasswordAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Check your email</h2>
        </header>
        <p className="text-muted-foreground text-sm">
          If we have an account for that address, a password-reset link is on its way. The link
          expires in 24 hours.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
      </header>
      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
            aria-invalid={state?.fieldErrors?.email ? true : undefined}
          />
          {state?.fieldErrors?.email && (
            <p className="text-destructive text-sm">{state.fieldErrors.email}</p>
          )}
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </section>
  );
}
