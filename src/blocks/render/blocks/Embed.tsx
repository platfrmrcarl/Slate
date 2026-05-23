import type { Block } from "@/blocks/types";

const YT_RE = /(?:youtu\.be\/|v=)([\w-]{11})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

export function Embed({ block }: { block: Extract<Block, { type: "embed" }> }) {
  if (block.provider === "youtube") {
    const id = YT_RE.exec(block.url)?.[1];
    if (id) return iframe(`https://www.youtube-nocookie.com/embed/${id}`);
  }
  if (block.provider === "vimeo") {
    const id = VIMEO_RE.exec(block.url)?.[1];
    if (id) return iframe(`https://player.vimeo.com/video/${id}`);
  }
  if (block.provider === "spotify") {
    return iframe(block.url.replace("open.spotify.com/", "open.spotify.com/embed/"));
  }
  // twitter + generic: render a fallback link; full oEmbed lookup arrives with deployment-hardening
  return (
    <a href={block.url} rel="noopener nofollow" className="my-4 block text-blue-700 underline">
      {block.url}
    </a>
  );
}

function iframe(src: string) {
  return (
    <div className="my-4 aspect-video w-full">
      <iframe
        className="h-full w-full"
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
