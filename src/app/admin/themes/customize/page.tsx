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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Customize: {theme.name}</h1>
        <p className="text-muted-foreground text-sm">
          Override theme tokens, fonts, copy, and layout choices.
        </p>
      </header>
      <CustomizerForm themeId={theme.id} manifest={manifest} values={values} />
    </div>
  );
}
