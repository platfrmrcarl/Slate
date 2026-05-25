import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingNav() {
  return (
    <nav className="border-border border-b">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
        <Link
          href={"/" as Route}
          className="marketing-serif text-foreground text-lg tracking-tight"
        >
          <span className="text-[#a8a3ff]" aria-hidden>
            ◐
          </span>{" "}
          <span>Slate</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<a href="#features" />}>
            Features
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={"/products" as Route} />}>
            Pricing
          </Button>
          <Button variant="ghost" size="sm" render={<a href={WIKI_URL} />}>
            Self-host →
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={"/sign-in" as Route} />}>
            Sign in
          </Button>
          <Button size="sm" render={<Link href={"/sign-up" as Route} />}>
            Sign up
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
