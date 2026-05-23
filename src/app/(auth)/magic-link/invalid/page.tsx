import type { Route } from "next";
import Link from "next/link";

export default function MagicLinkInvalidPage() {
  return (
    <section>
      <h2 className="text-2xl font-bold">That link didn&apos;t work</h2>
      <p className="mt-2 text-gray-600">It may have expired or already been used.</p>
      <p className="mt-4">
        <Link href={"/magic-link" as Route} className="underline">
          Request a new link
        </Link>
      </p>
    </section>
  );
}
