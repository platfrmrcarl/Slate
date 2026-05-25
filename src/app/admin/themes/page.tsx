import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listThemes, getActiveThemeRow } from "@/themes/service";
import { activateThemeAction } from "@/app/actions/themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function activateAction(fd: FormData): Promise<void> {
  "use server";
  await activateThemeAction(undefined, fd);
}

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  await requireRole("admin");
  const [themesList, active] = await Promise.all([listThemes(), getActiveThemeRow()]);
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Themes</h1>
          <p className="text-muted-foreground text-sm">
            Switch the active theme and customize available themes.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={"/admin/themes/install" as Route} />}>
          Install theme
        </Button>
      </header>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {themesList.map((t) => {
          const isActive = active?.themeId === t.id;
          return (
            <li key={t.id}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle>{t.name}</CardTitle>
                      <CardDescription>
                        v{t.version} · {t.slug}
                      </CardDescription>
                    </div>
                    {isActive && <Badge variant="default">Active</Badge>}
                  </div>
                </CardHeader>
                <CardContent />
                <CardFooter className="gap-2">
                  {isActive ? (
                    <Button size="sm" variant="outline" disabled>
                      Active
                    </Button>
                  ) : (
                    <form action={activateAction}>
                      <input type="hidden" name="themeId" value={t.id} />
                      <Button type="submit" size="sm">
                        Activate
                      </Button>
                    </form>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href={`/admin/themes/customize?id=${t.id}` as Route} />}
                  >
                    Customize
                  </Button>
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
