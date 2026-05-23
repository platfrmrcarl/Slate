import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { plugins, webhooks, webhookDeliveries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { rotateSecretAction } from "@/app/actions/plugins";

export const dynamic = "force-dynamic";

async function rotateAction(fd: FormData): Promise<void> {
  "use server";
  await rotateSecretAction(undefined, fd);
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
    <main className="p-6">
      <h1 className="mb-2 text-2xl font-bold">{plugin.name}</h1>
      <p className="mb-4 text-sm text-gray-500">v{plugin.version}</p>
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Webhooks</h2>
        {hooks.length === 0 ? (
          <p className="text-xs text-gray-500">No webhooks registered for this plugin yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {hooks.map((h) => (
              <li key={h.id} className="rounded border p-3">
                <code className="text-xs">{h.url}</code>
                <p className="mt-1 text-xs text-gray-500">events: {h.events.join(", ")}</p>
                <p className="mt-1 break-all font-mono text-xs">secret: {h.secret}</p>
                <form action={rotateAction} className="mt-2">
                  <input type="hidden" name="id" value={h.id} />
                  <button type="submit" className="text-xs underline">
                    Rotate secret
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent deliveries</h2>
        {recentDeliveries.length === 0 ? (
          <p className="text-xs text-gray-500">No deliveries yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1">Event</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentDeliveries.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="py-1 font-mono">{d.event}</td>
                  <td>
                    {d.status} {d.statusCode ? `(${d.statusCode})` : ""}
                  </td>
                  <td>{d.attempts}</td>
                  <td>{d.createdAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
