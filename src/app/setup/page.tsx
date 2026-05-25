import type { Route } from "next";
import { redirect } from "next/navigation";
import { countOwners } from "@/auth/users";
import { runSetupAction } from "./actions";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SetupPage() {
  if ((await countOwners()) > 0) redirect("/sign-in" as Route);
  return (
    <main className="bg-background text-foreground min-h-screen px-4 py-12">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Slate</h1>
          <p className="text-muted-foreground text-sm">
            Set up your site and create the owner account to get started.
          </p>
        </header>
        <SetupForm action={runSetupAction} />
      </div>
    </main>
  );
}
