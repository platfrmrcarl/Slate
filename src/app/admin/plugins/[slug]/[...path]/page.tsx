import { notFound } from "next/navigation";
import path from "node:path";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { plugins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pluginManifestSchema } from "@/plugins/manifest";
import { loadModule } from "@/plugins/loadModule";

export const dynamic = "force-dynamic";

/**
 * Dynamic plugin admin sub-route. Matches `adminMenu[].path` from the
 * plugin manifest, enforces the declared minRole, then loads and renders
 * the plugin-supplied component. Falls through to 404 when no match.
 */
export default async function PluginSubRoute({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}): Promise<React.ReactElement> {
  const { slug, path: subPath } = await params;
  const rows = await db().select().from(plugins).where(eq(plugins.slug, slug));
  const plugin = rows[0];
  if (!plugin || !plugin.enabled) notFound();
  const manifest = pluginManifestSchema.parse(plugin.manifest);
  const full = `/${subPath.join("/")}`;
  const menu = manifest.adminMenu?.find((m) => m.path === full);
  if (!menu) notFound();

  await requireRole(menu.minRole);
  const rootPath = path.resolve(process.cwd(), "plugins", slug);
  let mod: { default?: React.ComponentType };
  try {
    mod = (await loadModule(rootPath, menu.component)) as { default?: React.ComponentType };
  } catch {
    return <p className="text-destructive p-6 text-sm">Plugin component failed to load.</p>;
  }
  const Component = mod.default;
  if (!Component) {
    return (
      <p className="text-destructive p-6 text-sm">Plugin component missing default export.</p>
    );
  }
  return <Component />;
}
