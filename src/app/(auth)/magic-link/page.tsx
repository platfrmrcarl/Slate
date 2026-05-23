"use client";

import { useActionState } from "react";
import { requestMagicLinkAction } from "@/app/actions/auth";

export default function MagicLinkPage() {
  const [state, action, pending] = useActionState(requestMagicLinkAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Sign in via magic link</h2>
      <p className="mt-2 text-sm text-gray-600">
        We&apos;ll email you a link that signs you in. No password required.
      </p>
      <form action={action} className="mt-6 grid gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border p-2"
        />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
        )}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </section>
  );
}
