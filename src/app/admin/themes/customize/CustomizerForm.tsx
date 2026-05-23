"use client";

import { useActionState, useMemo, useState } from "react";
import type { ThemeManifest } from "@/themes/manifest";
import { customizeThemeAction } from "@/app/actions/themes";

export function CustomizerForm({
  themeId,
  manifest,
  values,
}: {
  themeId: string;
  manifest: ThemeManifest;
  values: Record<string, string | number | boolean | undefined>;
}) {
  const initial = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? ""])),
    [values],
  );
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(
    customizeThemeAction,
    undefined,
  );
  const [local, setLocal] = useState<Record<string, string | boolean>>(
    initial as Record<string, string | boolean>,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="themeId" value={themeId} />
      <input
        type="hidden"
        name="customizationJson"
        value={JSON.stringify(
          Object.fromEntries(
            Object.entries(local).map(([k, v]) => [
              k,
              v === "true" ? true : v === "false" ? false : v,
            ]),
          ),
        )}
      />
      {manifest.customizations.map((c) => (
        <label key={c.key} className="block text-sm">
          <span className="mb-1 block font-medium">{c.label}</span>
          {c.type === "color" && (
            <input
              type="color"
              value={String(local[c.key] ?? "#000000")}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
              className="h-9 w-16 rounded border"
            />
          )}
          {c.type === "text" && (
            <input
              type="text"
              value={String(local[c.key] ?? "")}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
              className="w-full rounded border px-2 py-1"
            />
          )}
          {c.type === "font" && (
            <input
              type="text"
              value={String(local[c.key] ?? "")}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
              className="w-full rounded border px-2 py-1"
              placeholder='e.g. "Inter, system-ui, sans-serif"'
            />
          )}
          {c.type === "boolean" && (
            <input
              type="checkbox"
              checked={local[c.key] === true || local[c.key] === "true"}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: String(e.target.checked) }))}
            />
          )}
          {c.type === "select" && (
            <select
              value={String(local[c.key] ?? c.default)}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
              className="rounded border px-2 py-1"
            >
              {c.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {c.type === "image" && (
            <input
              type="text"
              placeholder="media UUID"
              value={String(local[c.key] ?? "")}
              onChange={(e) => setLocal((s) => ({ ...s, [c.key]: e.target.value }))}
              className="w-full rounded border px-2 py-1"
            />
          )}
        </label>
      ))}
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save customization"}
      </button>
    </form>
  );
}
