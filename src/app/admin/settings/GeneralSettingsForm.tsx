"use client";

import { useActionState } from "react";
import { saveGeneralSettingsAction } from "@/app/actions/settings";

interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

export interface GeneralSettingsValues {
  siteTitle: string;
  siteTagline: string;
  defaultLocale: string;
  postsPerPage: number;
  seoDescription: string;
}

export function GeneralSettingsForm({
  initial,
  enabledLocales,
}: {
  initial: GeneralSettingsValues;
  enabledLocales: string[];
}): React.ReactElement {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(
    saveGeneralSettingsAction,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Site title</span>
        <input
          name="siteTitle"
          defaultValue={initial.siteTitle}
          required
          className="w-full rounded border px-2 py-1"
        />
        {fe.siteTitle && <p className="mt-1 text-xs text-red-700">{fe.siteTitle}</p>}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Tagline</span>
        <input
          name="siteTagline"
          defaultValue={initial.siteTagline}
          className="w-full rounded border px-2 py-1"
        />
        {fe.siteTagline && <p className="mt-1 text-xs text-red-700">{fe.siteTagline}</p>}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Default locale</span>
        <select
          name="defaultLocale"
          defaultValue={initial.defaultLocale}
          className="rounded border px-2 py-1"
        >
          {enabledLocales.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {fe.defaultLocale && <p className="mt-1 text-xs text-red-700">{fe.defaultLocale}</p>}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Posts per page</span>
        <input
          name="postsPerPage"
          type="number"
          min={1}
          max={100}
          defaultValue={initial.postsPerPage}
          className="w-32 rounded border px-2 py-1"
        />
        {fe.postsPerPage && <p className="mt-1 text-xs text-red-700">{fe.postsPerPage}</p>}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Site description (SEO)</span>
        <textarea
          name="seoDescription"
          defaultValue={initial.seoDescription}
          rows={3}
          className="w-full rounded border px-2 py-1"
        />
        {fe.seoDescription && <p className="mt-1 text-xs text-red-700">{fe.seoDescription}</p>}
      </label>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Saved.</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
