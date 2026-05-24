import type { Route } from "next";
import { redirect } from "next/navigation";
import { countOwners } from "@/auth/users";
import { runSetupAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function setupFormAction(formData: FormData): Promise<void> {
  "use server";
  await runSetupAction(undefined, formData);
}

export default async function SetupPage() {
  if ((await countOwners()) > 0) redirect("/sign-in" as Route);
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Welcome to Slate</h1>
      <p className="mt-2 text-gray-600">Set up your site and create the owner account.</p>

      <form action={setupFormAction} className="mt-6 grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-gray-700">Site</legend>
          <input
            name="siteTitle"
            placeholder="Site title"
            className="rounded border p-2"
            required
          />
          <input
            name="siteTagline"
            placeholder="Tagline (optional)"
            className="rounded border p-2"
          />
          <input
            name="defaultLocale"
            defaultValue="en"
            placeholder="Default locale (e.g. en)"
            className="rounded border p-2"
          />
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-gray-700">Owner</legend>
          <input
            name="displayName"
            placeholder="Your name"
            className="rounded border p-2"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="rounded border p-2"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password (12+ chars)"
            className="rounded border p-2"
            required
          />
        </fieldset>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Create site
        </button>
      </form>
    </main>
  );
}
