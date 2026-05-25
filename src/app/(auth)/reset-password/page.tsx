"use client";

import { Suspense, useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface State {
  ok?: boolean;
  error?: string;
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action, pending] = useActionState<State | undefined, FormData>(
    resetPasswordAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Password updated</h2>
        </header>
        <p className="text-muted-foreground text-sm">You can now sign in with your new password.</p>
        <Link href={"/sign-in" as Route} className="text-sm underline-offset-4 hover:underline">
          Sign in
        </Link>
      </section>
    );
  }
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Choose a new password</h2>
      </header>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Set password"}
        </Button>
      </form>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <section className="space-y-1">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </section>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
