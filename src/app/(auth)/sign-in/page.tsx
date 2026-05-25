"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-muted-foreground text-sm">Welcome back.</p>
      </header>

      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="text-muted-foreground space-y-1 text-center text-sm">
        <p>
          <Link href={"/magic-link" as Route} className="underline-offset-4 hover:underline">
            Sign in via magic link
          </Link>{" "}
          ·{" "}
          <Link href={"/sign-up" as Route} className="underline-offset-4 hover:underline">
            Create account
          </Link>
        </p>
        <p>
          <Link href={"/forgot-password" as Route} className="underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </p>
      </div>

      {(process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" ||
        process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1") && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs uppercase">or</span>
            <Separator className="flex-1" />
          </div>
          <div className="grid gap-2">
            {process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "1" && (
              <Button
                variant="outline"
                className="w-full"
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                render={<a href="/api/auth/oauth/google/start" />}
              >
                Continue with Google
              </Button>
            )}
            {process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "1" && (
              <Button
                variant="outline"
                className="w-full"
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                render={<a href="/api/auth/oauth/github/start" />}
              >
                Continue with GitHub
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
