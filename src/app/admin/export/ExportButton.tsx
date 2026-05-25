"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
    <div className="space-y-4">
      <Label htmlFor="includeDb" className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          id="includeDb"
          checked={includeDb}
          onCheckedChange={(checked) => setIncludeDb(checked === true)}
        />
        Include database dump
      </Label>
      <Button onClick={onClick} disabled={pending} size="sm">
        {pending ? "Starting…" : "Start export"}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
