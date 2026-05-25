"use client";

import { Suspense, useActionState, useEffect } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyEmailAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface State {
  ok?: boolean;
  error?: string;
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action] = useActionState<State | undefined, FormData>(verifyEmailAction, undefined);

  useEffect(() => {
    if (token && !state) {
      const fd = new FormData();
      fd.append("token", token);
      action(fd);
    }
  }, [token, state, action]);

  if (state?.ok) {
    return (
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Email verified</h2>
        </header>
        <p className="text-muted-foreground text-sm">You&apos;re all set.</p>
        <Link href={"/" as Route} className="text-sm underline-offset-4 hover:underline">
          Continue
        </Link>
      </section>
    );
  }
  if (state?.error) {
    return (
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Verification failed</h2>
        </header>
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
        <Link
          href={"/admin/profile" as Route}
          className="text-sm underline-offset-4 hover:underline"
        >
          Resend verification email
        </Link>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Verifying…</h2>
      </header>
      <p className="text-muted-foreground text-sm">Hold tight.</p>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <section className="space-y-1">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </section>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
