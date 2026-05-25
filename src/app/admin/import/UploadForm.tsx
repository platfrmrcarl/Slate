"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <form onSubmit={onSubmit} className="space-y-4 text-sm">
      <div className="grid gap-1.5">
        <Label htmlFor="import-source">Source</Label>
        <select
          id="import-source"
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          className="border-input bg-background h-8 w-fit rounded-lg border px-2.5 text-sm"
        >
          <option value="wordpress">WordPress XML (WXR)</option>
          <option value="ghost">Ghost JSON</option>
          <option value="markdown">Markdown folder (zip)</option>
          <option value="csv">CSV</option>
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="import-file">File</Label>
        <Input id="import-file" type="file" name="file" required />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Uploading…" : "Start import"}
      </Button>
    </form>
  );
}
