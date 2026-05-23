"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Create account</h2>
      <form action={action} className="mt-6 grid gap-3">
        <div>
          <input
            name="displayName"
            placeholder="Your name"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.displayName && (
            <p className="text-sm text-red-600">{state.fieldErrors.displayName}</p>
          )}
        </div>
        <div>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.email && (
            <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
          )}
        </div>
        <div>
          <input
            name="password"
            type="password"
            placeholder="Password (12+ chars)"
            required
            className="w-full rounded border p-2"
          />
          {state?.fieldErrors?.password && (
            <p className="text-sm text-red-600">{state.fieldErrors.password}</p>
          )}
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </section>
  );
}
