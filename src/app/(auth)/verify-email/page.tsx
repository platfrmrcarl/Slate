"use client";

import { Suspense, useActionState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmailAction } from "@/app/actions/auth";

interface State {
  ok?: boolean;
  error?: string;
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action] = useActionState<State | undefined, FormData>(
    verifyEmailAction,
    undefined,
  );

  useEffect(() => {
    if (token && !state) {
      const fd = new FormData();
      fd.append("token", token);
      action(fd);
    }
  }, [token, state, action]);

  if (state?.ok) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Email verified</h1>
        <p>You&apos;re all set.</p>
        <a className="mt-3 inline-block underline" href="/">
          Continue
        </a>
      </main>
    );
  }
  if (state?.error) {
    return (
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Verification failed</h1>
        <p className="text-sm text-red-700">{state.error}</p>
        <a className="mt-3 inline-block underline" href="/admin/profile">
          Resend verification email
        </a>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Verifying…</h1>
      <p>Hold tight.</p>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto mt-20 max-w-md p-6">
          <p>Loading…</p>
        </main>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
