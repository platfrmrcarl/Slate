"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestMediaAltTextAction } from "@/app/actions/ai";

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
      <p className="text-[10px] text-gray-600">
        Generation in progress…{" "}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="underline underline-offset-2"
        >
          Reload
        </button>
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded border px-2 py-1 text-[10px] disabled:opacity-50"
      >
        {pending ? "Queuing…" : "Generate alt text"}
      </button>
      {status === "error" && error && <p className="text-[10px] text-red-700">{error}</p>}
    </div>
  );
}
