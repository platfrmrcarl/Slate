"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <section>
      <h2 className="text-2xl font-bold">Sign in</h2>
      <form action={action} className="mt-6 grid gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        <Link href={"/magic-link" as Route}>Sign in via magic link</Link> ·{" "}
        <Link href={"/sign-up" as Route}>Create account</Link>
      </p>
      <div className="mt-6 grid gap-2">
        {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="rounded border px-4 py-2 text-center" href="/api/auth/oauth/google/start">
            Continue with Google
          </a>
        )}
        {process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1" && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="rounded border px-4 py-2 text-center" href="/api/auth/oauth/github/start">
            Continue with GitHub
          </a>
        )}
      </div>
    </section>
  );
}
