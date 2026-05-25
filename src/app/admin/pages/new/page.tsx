import type { Route } from "next";
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { getActiveTheme } from "@/themes/active";
import { aiEnabled } from "@/ai/disabled";
import { GenerateWithAIForm } from "./GenerateWithAIForm";
import { createBlankPageAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewPageRoute(): Promise<React.ReactElement> {
  await requireRole("contributor");
  const active = await getActiveTheme();
  const themeSlug = active?.slug ?? "slate-default";
  const enabled = aiEnabled();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New page</h1>
        <p className="text-muted-foreground text-sm">
          Start with an empty editor or have AI draft a first pass for you.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Start blank</CardTitle>
            <CardDescription>Create an empty draft and open the editor.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createBlankPageAction}>
              <Button type="submit" variant="outline">
                Create blank page
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate with AI</CardTitle>
            <CardDescription>
              Describe the page; Claude will draft blocks you can edit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enabled ? (
              <GenerateWithAIForm themeSlug={themeSlug} />
            ) : (
              <Alert>
                <AlertDescription>
                  AI is disabled. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in your
                  environment to enable page generation. See{" "}
                  <Link href={"/admin/settings" as Route} className="underline underline-offset-2">
                    settings
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
