"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";

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
      <main className="mx-auto mt-20 max-w-md p-6">
        <h1 className="mb-4 text-2xl font-bold">Check your email</h1>
        <p>
          If we have an account for that address, a password-reset link is on its way. The link
          expires in 24 hours.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-20 max-w-md p-6">
      <h1 className="mb-4 text-2xl font-bold">Reset your password</h1>
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Email</span>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border px-2 py-1"
            aria-invalid={state?.fieldErrors?.email ? true : undefined}
          />
          {state?.fieldErrors?.email && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.email}</p>
          )}
        </label>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </main>
  );
}
