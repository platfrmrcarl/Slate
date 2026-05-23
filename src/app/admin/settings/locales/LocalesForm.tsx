"use client";

import { useActionState, useState } from "react";
import type { Locale } from "@/i18n/locales";
import type { I18nSettings } from "@/i18n/settings";
import { saveLocalesAction } from "./actions";

export function LocalesForm({
  catalogue,
  current,
}: {
  catalogue: Locale[];
  current: I18nSettings;
}): React.ReactElement {
  const [enabled, setEnabled] = useState<string[]>(current.enabledLocales);
  const [def, setDef] = useState<string>(current.defaultLocale);
  const [hide, setHide] = useState<boolean>(current.hideDefaultPrefix);
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(
    saveLocalesAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          defaultLocale: def,
          enabledLocales: enabled,
          hideDefaultPrefix: hide,
        })}
      />
      <fieldset>
        <legend className="font-semibold">Enabled locales</legend>
        <ul className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
          {catalogue.map((l) => (
            <li key={l.code}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled.includes(l.code)}
                  onChange={(e) =>
                    setEnabled((cur) =>
                      e.target.checked
                        ? Array.from(new Set([...cur, l.code]))
                        : cur.filter((c) => c !== l.code),
                    )
                  }
                />
                <span lang={l.code}>{l.nativeName}</span>
                <span className="text-gray-500">({l.code})</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Default locale</span>
        <select
          value={def}
          onChange={(e) => setDef(e.target.value)}
          className="rounded border px-2 py-1"
        >
          {enabled.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
        Hide default-locale prefix in URLs
      </label>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
