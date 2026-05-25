import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { plugins, webhooks, webhookDeliveries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { rotateSecretAction } from "@/app/actions/plugins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

async function rotateAction(fd: FormData): Promise<void> {
  "use server";
  await rotateSecretAction(undefined, fd);
}

function deliveryVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "success":
    case "delivered":
      return "default";
    case "failed":
    case "error":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

export default async function PluginDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  await requireRole("admin");
  const { slug } = await params;
  const pRows = await db().select().from(plugins).where(eq(plugins.slug, slug));
  const plugin = pRows[0];
  if (!plugin) notFound();
  const hooks = await db().select().from(webhooks).where(eq(webhooks.pluginId, plugin.id));
  const firstHookId = hooks[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const recentDeliveries = await db()
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, firstHookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{plugin.name}</h1>
        <p className="text-muted-foreground text-sm">v{plugin.version}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Outgoing webhook subscriptions registered by this plugin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hooks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No webhooks registered for this plugin yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {hooks.map((h) => (
                <li key={h.id} className="border-border rounded-lg border p-3 text-sm">
                  <code className="text-xs">{h.url}</code>
                  <p className="text-muted-foreground mt-1 text-xs">
                    events: {h.events.join(", ")}
                  </p>
                  <p className="mt-1 font-mono text-xs break-all">secret: {h.secret}</p>
                  <form action={rotateAction} className="mt-2">
                    <input type="hidden" name="id" value={h.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Rotate secret
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>
            {recentDeliveries.length === 0
              ? "No deliveries yet."
              : `${recentDeliveries.length} most recent webhook deliveries.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentDeliveries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDeliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.event}</TableCell>
                    <TableCell>
                      <Badge variant={deliveryVariant(d.status)}>
                        {d.status}
                        {d.statusCode ? ` (${d.statusCode})` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>{d.attempts}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.createdAt.toISOString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
