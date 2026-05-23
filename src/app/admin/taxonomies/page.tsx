import { requireRole } from "@/auth/context";
import { listTaxonomies } from "@/taxonomies/service";
import { createTaxonomyAction } from "@/app/actions/taxonomies";

async function createTaxAction(fd: FormData): Promise<void> {
  "use server";
  await createTaxonomyAction(undefined, fd);
}

export const dynamic = "force-dynamic";

export default async function TaxonomiesPage(): Promise<React.ReactElement> {
  await requireRole("editor");
  const cats = await listTaxonomies({ type: "category", limit: 200 });
  const tags = await listTaxonomies({ type: "tag", limit: 200 });

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Categories &amp; Tags</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Categories</h2>
        <form action={createTaxAction} className="mb-4 flex gap-2 text-sm">
          <input type="hidden" name="type" value="category" />
          <input
            name="name"
            required
            placeholder="New category"
            className="rounded border px-2 py-1"
          />
          <button className="rounded bg-black px-3 py-1 text-white">Add</button>
        </form>
        <ul className="space-y-1 text-sm">
          {cats.map((c) => (
            <li key={c.id} className="font-mono">
              {c.slug} — {c.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Tags</h2>
        <form action={createTaxAction} className="mb-4 flex gap-2 text-sm">
          <input type="hidden" name="type" value="tag" />
          <input name="name" required placeholder="New tag" className="rounded border px-2 py-1" />
          <button className="rounded bg-black px-3 py-1 text-white">Add</button>
        </form>
        <ul className="space-y-1 text-sm">
          {tags.map((c) => (
            <li key={c.id} className="font-mono">
              {c.slug} — {c.name}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
