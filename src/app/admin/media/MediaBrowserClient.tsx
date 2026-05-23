"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MediaBrowserClient(): React.ReactElement {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setError(null);
    const urlRes = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!urlRes.ok) {
      setError(`upload URL: ${urlRes.status}`);
      return;
    }
    const { url, objectPath } = (await urlRes.json()) as { url: string; objectPath: string };
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) {
      setError(`storage PUT: ${put.status}`);
      return;
    }
    const reg = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectPath,
        mimeType: file.type || "application/octet-stream",
        originalFilename: file.name,
      }),
    });
    if (!reg.ok) {
      setError(`register: ${reg.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      await upload(f);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={onChange}
        disabled={pending}
        className="text-sm"
      />
    </div>
  );
}
