"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpAction } from "@/app/actions/auth";

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
  return (
    <section>
      <h2 className="text-2xl font-bold">Create account</h2>
      {validTier && (
        <p className="mt-1 text-sm text-gray-500">
          You picked the <span className="font-semibold capitalize">{validTier}</span> plan. Payment on the next step.
        </p>
      )}
      <form action={action} className="mt-6 grid gap-3">
        {validTier && <input type="hidden" name="tier" value={validTier} />}
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
