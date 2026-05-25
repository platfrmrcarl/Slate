import { enabledLocales } from "@/i18n/settings";
import { findLocale } from "@/i18n/locales";
import { translatePostAction } from "@/app/actions/translations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

async function submitTranslate(fd: FormData): Promise<void> {
  "use server";
  await translatePostAction(undefined, fd);
}

export async function TranslateButton({
  postId,
  currentLocale,
}: {
  postId: string;
  currentLocale: string;
}): Promise<React.ReactElement | null> {
  const locales = await enabledLocales();
  const targets = locales.filter((l) => l !== currentLocale);
  if (targets.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        Translate to…
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {targets.map((code) => (
          <DropdownMenuItem key={code} className="p-0">
            <form action={submitTranslate} className="w-full">
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="targetLocale" value={code} />
              <button type="submit" className="w-full px-1.5 py-1 text-left text-sm">
                {findLocale(code)?.nativeName ?? code}
              </button>
            </form>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
