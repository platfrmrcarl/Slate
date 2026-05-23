import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { listMedia } from "@/media/service";
import { imgUrl } from "@/media/url";
import { MediaBrowserClient } from "./MediaBrowserClient";
import { AutoAltButton } from "./AutoAltButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  return (
    <section>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Media</h1>
        <MediaBrowserClient />
      </header>

      <nav className="mb-4 flex gap-2 text-sm">
        <Link href={"/admin/media" as Route} className="underline-offset-2 hover:underline">
          All
        </Link>
        <Link
          href={"/admin/media?mime=image/" as Route}
          className="underline-offset-2 hover:underline"
        >
          Images
        </Link>
        <Link
          href={"/admin/media?mime=video/" as Route}
          className="underline-offset-2 hover:underline"
        >
          Video
        </Link>
        <Link
          href={"/admin/media?mime=application/pdf" as Route}
          className="underline-offset-2 hover:underline"
        >
          PDFs
        </Link>
      </nav>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((m) => (
          <li key={m.id} className="rounded border bg-white p-2 text-xs">
            {m.mimeType.startsWith("image/") ? (
              <Image
                src={imgUrl(m.id, { width: 240, height: 240, fit: "cover" })}
                width={240}
                height={240}
                alt={m.altText ?? m.originalFilename}
                className="h-32 w-full rounded object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded bg-gray-100 text-gray-500">
                {m.mimeType}
              </div>
            )}
            <p className="mt-1 truncate" title={m.originalFilename}>
              {m.originalFilename}
            </p>
            <p className="text-gray-500">
              {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
              {(m.sizeBytes / 1024).toFixed(0)} KB
            </p>
            {m.mimeType.startsWith("image/") && !m.altText && (
              <div className="mt-2">
                <AutoAltButton mediaId={m.id} />
              </div>
            )}
            {m.altText && (
              <p className="mt-1 line-clamp-2 text-[10px] text-gray-500" title={m.altText}>
                alt: {m.altText}
              </p>
            )}
          </li>
        ))}
      </ul>

      {nextCursor && (
        <div className="mt-6">
          <Link
            href={
              `/admin/media?cursor=${encodeURIComponent(nextCursor)}${sp.mime ? `&mime=${sp.mime}` : ""}` as Route
            }
            className="text-sm underline"
          >
            Older →
          </Link>
        </div>
      )}
    </section>
  );
}
