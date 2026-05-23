import type { Route } from "next";
import Link from "next/link";

export default function AdminDashboard(): React.ReactElement {
  return (
    <section>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 text-gray-600">Start by writing a page.</p>
      <Link
        href={"/admin/pages" as Route}
        className="mt-4 inline-block rounded bg-black px-4 py-2 text-white"
      >
        Go to pages →
      </Link>
    </section>
  );
}
