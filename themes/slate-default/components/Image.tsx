import { ImageBlock } from "@/blocks/render/blocks/Image";
import { nanoid } from "nanoid";

export async function Image({
  media,
  alt,
  caption,
  size,
}: {
  media: string;
  alt?: string;
  caption?: string;
  size?: "small" | "medium" | "full";
}) {
  // ImageBlock expects a Block with optional fields strictly omitted when undefined
  // under exactOptionalPropertyTypes — build the input lazily.
  const block: Parameters<typeof ImageBlock>[0]["block"] = {
    id: nanoid(),
    type: "image",
    mediaId: media,
    ...(alt !== undefined ? { alt } : {}),
    ...(caption !== undefined ? { caption } : {}),
    ...(size !== undefined ? { size } : {}),
  };
  return ImageBlock({ block });
}
