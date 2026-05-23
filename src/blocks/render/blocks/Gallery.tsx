import type { ReactElement } from "react";
import Image from "next/image";
import type { Block } from "@/blocks/types";
import { getMediaById } from "@/media/service";
import { imgUrl } from "@/media/url";

type GalleryBlockInput = Extract<Block, { type: "gallery" }>;

export async function GalleryBlock({
  block,
}: {
  block: GalleryBlockInput;
}): Promise<ReactElement | null> {
  if (block.mediaIds.length === 0) return null;
  const items = await Promise.all(
    block.mediaIds.map(async (id) => ({ id, media: await getMediaById(id) })),
  );
  const layoutClass =
    block.layout === "grid"
      ? "grid grid-cols-2 gap-3 md:grid-cols-3"
      : block.layout === "masonry"
        ? "columns-2 gap-3 md:columns-3"
        : "flex gap-3 overflow-x-auto snap-x";

  return (
    <section className={`my-6 ${layoutClass}`}>
      {items.map(({ id, media }) =>
        media ? (
          <figure key={id} className={block.layout === "carousel" ? "min-w-[60%] snap-center" : ""}>
            <Image
              src={imgUrl(media.id, { width: 800, height: 600, fit: "cover" })}
              width={800}
              height={600}
              alt={media.altText ?? ""}
              loading="lazy"
              decoding="async"
              unoptimized
              className="h-auto w-full rounded"
            />
          </figure>
        ) : null,
      )}
    </section>
  );
}
