"use client";

import { useActionState } from "react";
import { requestMagicLinkAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function MagicLinkPage() {
  const [state, action, pending] = useActionState(requestMagicLinkAction, undefined);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in via magic link</h2>
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you a link that signs you in. No password required.
        </p>
      </header>

      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
          {state?.fieldErrors?.email && (
            <p className="text-destructive text-sm">{state.fieldErrors.email}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send magic link"}
        </Button>
      </form>
    </section>
  );
}
