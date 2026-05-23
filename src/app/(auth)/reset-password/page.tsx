"use client";

import { Suspense, useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";

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
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Password updated</h1>
        <p>You can now sign in with your new password.</p>
        <Link className="mt-3 inline-block underline" href={"/sign-in" as Route}>
          Sign in
        </Link>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Choose a new password</h1>
      <form action={action} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">New password</span>
          <input
            type="password"
            name="password"
            minLength={12}
            required
            className="w-full rounded border px-2 py-1"
          />
        </label>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Set password"}
        </button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto mt-20 max-w-md p-6">
          <p>Loading…</p>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
