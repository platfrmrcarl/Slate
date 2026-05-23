"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExportButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [includeDb, setIncludeDb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeDb }),
    });
    setPending(false);
    if (!res.ok) {
      setError(`Failed (${res.status})`);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/admin/export#${id}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeDb}
          onChange={(e) => setIncludeDb(e.target.checked)}
        />
        Include database dump
      </label>
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start export"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
