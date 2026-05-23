import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { getThemeById, getActiveThemeRow } from "@/themes/service";
import { themeManifestSchema, mergeCustomization } from "@/themes/manifest";
import { CustomizerForm } from "./CustomizerForm";

export const dynamic = "force-dynamic";

export default async function CustomizePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireRole("admin");
  const { id } = await searchParams;
  if (!id) notFound();
  const theme = await getThemeById(id);
  if (!theme) notFound();
  const manifest = themeManifestSchema.parse(theme.manifest);
  const active = await getActiveThemeRow();
  const overrides =
    active?.themeId === theme.id
      ? (active.customization as Record<string, string | number | boolean>)
      : {};
  const values = mergeCustomization(manifest, overrides);
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Customize: {theme.name}</h1>
      <CustomizerForm themeId={theme.id} manifest={manifest} values={values} />
    </main>
  );
}
