"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestMediaAltTextAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";

interface Props {
  mediaId: string;
}

type Status = "idle" | "queued" | "error";

/**
 * Per-image trigger that enqueues the media-alt-text job. The job updates
 * media.altText asynchronously; we expose a "Reload" link so editors can
 * pull in the result without watching for it.
 */
export function AutoAltButton({ mediaId }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function run(): void {
    setError(null);
    start(async () => {
      const res = await requestMediaAltTextAction(mediaId);
      if (res.error) {
        setStatus("error");
        setError(res.error);
        return;
      }
      setStatus("queued");
    });
  }

  if (status === "queued") {
    return (
      <p className="text-muted-foreground text-[10px]">
        Generation in progress…{" "}
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0 text-[10px]"
          onClick={() => router.refresh()}
        >
          Reload
        </Button>
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={run}
        disabled={pending}
        className="text-[10px]"
      >
        {pending ? "Queuing…" : "Generate alt text"}
      </Button>
      {status === "error" && error && (
        <p className="text-destructive text-[10px]">{error}</p>
      )}
    </div>
  );
}
