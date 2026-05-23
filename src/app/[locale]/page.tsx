import { notFound } from "next/navigation";
import { getPageBySlug } from "@/services/pages/service";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { Hreflang } from "@/components/Hreflang";

export const revalidate = 60;

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const home = await getPageBySlug("home", locale, { publishedOnly: true });
  if (!home) notFound();
  return (
    <>
      <Hreflang table="pages" id={home.id} />
      <BlockRenderer blocks={home.blocks} />
    </>
  );
}
