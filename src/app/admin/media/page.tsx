import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { listMedia } from "@/media/service";
import { imgUrl } from "@/media/url";
import { MediaBrowserClient } from "./MediaBrowserClient";
import { AutoAltButton } from "./AutoAltButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_FILTERS = [
  { label: "All", value: "" },
  { label: "Images", value: "image/" },
  { label: "Video", value: "video/" },
  { label: "PDFs", value: "application/pdf" },
] as const;

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; mime?: string }>;
}): Promise<React.ReactElement> {
  await requireRole("author");
  const sp = await searchParams;
  const { items, nextCursor } = await listMedia({
    limit: 30,
    ...(sp.cursor !== undefined ? { cursor: sp.cursor } : {}),
    ...(sp.mime !== undefined ? { mimePrefix: sp.mime } : {}),
  });
  const activeMime = sp.mime ?? "";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
          <p className="text-muted-foreground text-sm">
            Upload, browse, and tag media for use in posts and pages.
          </p>
        </div>
        <MediaBrowserClient />
      </header>

      <nav className="flex flex-wrap gap-1">
        {MIME_FILTERS.map((f) => {
          const href = (f.value ? `/admin/media?mime=${f.value}` : "/admin/media") as Route;
          return (
            <Button
              key={f.label}
              variant={activeMime === f.value ? "secondary" : "ghost"}
              size="sm"
              nativeButton={false}
              render={<Link href={href} />}
            >
              {f.label}
            </Button>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No media yet. Upload files to get started.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((m) => (
            <li key={m.id}>
              <Card className="overflow-hidden p-0">
                <div className="bg-muted aspect-square w-full">
                  {m.mimeType.startsWith("image/") ? (
                    <Image
                      src={imgUrl(m.id, { width: 240, height: 240, fit: "cover" })}
                      width={240}
                      height={240}
                      alt={m.altText ?? m.originalFilename}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
                      {m.mimeType}
                    </div>
                  )}
                </div>
                <CardContent className="p-2 text-xs">
                  <p className="truncate font-medium" title={m.originalFilename}>
                    {m.originalFilename}
                  </p>
                  <p className="text-muted-foreground">
                    {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
                    {(m.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                  {m.mimeType.startsWith("image/") && !m.altText && (
                    <div className="mt-2">
                      <AutoAltButton mediaId={m.id} />
                    </div>
                  )}
                  {m.altText && (
                    <p
                      className="text-muted-foreground mt-1 line-clamp-2 text-[10px]"
                      title={m.altText}
                    >
                      alt: {m.altText}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={
                  `/admin/media?cursor=${encodeURIComponent(nextCursor)}${sp.mime ? `&mime=${sp.mime}` : ""}` as Route
                }
              />
            }
          >
            Older →
          </Button>
        </div>
      )}
    </div>
  );
}
