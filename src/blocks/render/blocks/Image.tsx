import type { ReactElement } from "react";
import Image from "next/image";
import type { Block } from "@/blocks/types";
import { getMediaById } from "@/media/service";
import { imgUrl } from "@/media/url";

type ImageBlockInput = Extract<Block, { type: "image" }>;

const SIZE_WIDTH: Record<NonNullable<ImageBlockInput["size"]>, number> = {
  small: 400,
  medium: 800,
  full: 1600,
};

export async function ImageBlock({
  block,
}: {
  block: ImageBlockInput;
}): Promise<ReactElement | null> {
  const media = await getMediaById(block.mediaId);
  if (!media) return null;
  const width = SIZE_WIDTH[block.size ?? "medium"];
  const ratio = media.width && media.height ? media.height / media.width : 2 / 3;
  const height = Math.round(width * ratio);
  const alt = block.alt ?? media.altText ?? "";
  // We use our own /api/img/[id] transform endpoint, so next/image stays
  // unoptimized — it just renders an <img> with our URL.
  return (
    <figure className="my-6">
      <Image
        src={imgUrl(media.id, { width })}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        decoding="async"
        sizes={`(max-width: 768px) 100vw, ${width}px`}
        unoptimized
        className="h-auto w-full rounded"
      />
      {block.caption && (
        <figcaption className="mt-2 text-sm text-gray-600">{block.caption}</figcaption>
      )}
    </figure>
  );
}
