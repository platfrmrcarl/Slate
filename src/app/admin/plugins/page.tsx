import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listPlugins } from "@/plugins/service";
import { enablePluginAction, disablePluginAction } from "@/app/actions/plugins";
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

export const dynamic = "force-dynamic";

async function enableAction(fd: FormData): Promise<void> {
  "use server";
  await enablePluginAction(undefined, fd);
}

async function disableAction(fd: FormData): Promise<void> {
  "use server";
  await disablePluginAction(undefined, fd);
}

export default async function PluginsPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const list = await listPlugins();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
        <p className="text-muted-foreground text-sm">
          Discover, enable, and manage installed plugins.
        </p>
      </header>

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No plugins discovered</CardTitle>
            <CardDescription>
              Drop a directory under <code>plugins/</code> with a valid <code>manifest.json</code>{" "}
              or install a <code>slate-plugin-*</code> npm package.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto px-0"
                          nativeButton={false}
                          render={<Link href={`/admin/plugins/${p.slug}` as Route} />}
                        >
                          {p.name}
                        </Button>
                      </CardTitle>
                      <CardDescription>
                        v{p.version} · {p.slug}
                      </CardDescription>
                    </div>
                    {p.enabled && <Badge variant="default">Enabled</Badge>}
                  </div>
                </CardHeader>
                <CardContent />
                <CardFooter>
                  <form action={p.enabled ? disableAction : enableAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" size="sm" variant={p.enabled ? "outline" : "default"}>
                      {p.enabled ? "Disable" : "Enable"}
                    </Button>
                  </form>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
