import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function SignUpCTA() {
  return (
    <section className="border-border border-t px-6 py-20 text-center">
      <div className="mx-auto max-w-[640px]">
        <h2 className="marketing-serif text-foreground mb-3 text-3xl tracking-tight">
          Run your site. Not your servers.
        </h2>
        <p className="text-muted-foreground mb-7 text-[15px] leading-relaxed">
          Start free. Bring your own domain when you&rsquo;re ready.
        </p>
        <Button size="lg" render={<Link href={"/sign-up" as Route} />}>
          Start free →
        </Button>
        <p className="text-muted-foreground mt-8 text-[12px]">
          Source available on GitHub. Want to self-host?{" "}
          <a href={WIKI_URL} className="hover:text-foreground underline underline-offset-4">
            See the Wiki →
          </a>
        </p>
      </div>
    </section>
  );
}
