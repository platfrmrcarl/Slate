"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Source = "wordpress" | "ghost" | "markdown" | "csv";

export function UploadForm(): React.ReactElement {
  const router = useRouter();
  const [source, setSource] = useState<Source>("wordpress");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/import/${source}`, { method: "POST", body: fd });
    setPending(false);
    if (!res.ok) {
      setError(`Upload failed (${res.status})`);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/admin/import/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block font-semibold">Source</span>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          className="rounded border px-2 py-1"
        >
          <option value="wordpress">WordPress XML (WXR)</option>
          <option value="ghost">Ghost JSON</option>
          <option value="markdown">Markdown folder (zip)</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      <input type="file" name="file" required />
      {error && <p className="text-red-700">{error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Start import"}
      </button>
    </form>
  );
}
