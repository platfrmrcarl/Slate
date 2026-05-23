import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { getActiveTheme } from "@/themes/active";
import { aiEnabled } from "@/ai/disabled";
import { GenerateWithAIForm } from "./GenerateWithAIForm";
import { createBlankPageAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewPageRoute(): Promise<React.ReactElement> {
  await requireRole("contributor");
  const active = await getActiveTheme();
  const themeSlug = active?.slug ?? "wpk-default";
  const enabled = aiEnabled();

  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-xl font-semibold">New page</h1>
        <p className="text-sm text-gray-600">
          Start with an empty editor or have AI draft a first pass for you.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Start blank</h2>
          <p className="mt-1 text-sm text-gray-600">
            Create an empty draft and open the editor.
          </p>
          <form action={createBlankPageAction} className="mt-3">
            <button type="submit" className="rounded border px-4 py-2 text-sm">
              Create blank page
            </button>
          </form>
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Generate with AI</h2>
          <p className="mt-1 text-sm text-gray-600">
            Describe the page; Claude will draft blocks you can edit.
          </p>
          {enabled ? (
            <GenerateWithAIForm themeSlug={themeSlug} />
          ) : (
            <p className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              AI is disabled. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in your
              environment to enable page generation. See{" "}
              <a
                href={"/admin/settings" as Route}
                className="underline underline-offset-2"
              >
                settings
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
