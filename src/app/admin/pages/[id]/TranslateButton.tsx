import { enabledLocales } from "@/i18n/settings";
import { findLocale } from "@/i18n/locales";
import { translatePageAction } from "@/app/actions/translations";

async function submitTranslate(fd: FormData): Promise<void> {
  "use server";
  await translatePageAction(undefined, fd);
}

export async function TranslateButton({
  pageId,
  currentLocale,
}: {
  pageId: string;
  currentLocale: string;
}): Promise<React.ReactElement | null> {
  const locales = await enabledLocales();
  const targets = locales.filter((l) => l !== currentLocale);
  if (targets.length === 0) return null;
  return (
    <details className="inline-block">
      <summary className="cursor-pointer text-sm underline">Translate to…</summary>
      <ul className="mt-2 space-y-1">
        {targets.map((code) => (
          <li key={code}>
            <form action={submitTranslate}>
              <input type="hidden" name="pageId" value={pageId} />
              <input type="hidden" name="targetLocale" value={code} />
              <button className="text-sm underline">{findLocale(code)?.nativeName ?? code}</button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
