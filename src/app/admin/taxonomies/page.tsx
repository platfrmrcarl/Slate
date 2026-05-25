import { requireRole } from "@/auth/context";
import { listTaxonomies } from "@/taxonomies/service";
import { createTaxonomyAction } from "@/app/actions/taxonomies";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories &amp; Tags</h1>
        <p className="text-muted-foreground text-sm">
          Manage taxonomies used to organize posts.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            {cats.length === 0 ? "No categories yet." : `${cats.length} categor${cats.length === 1 ? "y" : "ies"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createTaxAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="type" value="category" />
            <div className="grid flex-1 gap-2 min-w-[12rem]">
              <Label htmlFor="new-category">New category</Label>
              <Input id="new-category" name="name" required placeholder="Category name" />
            </div>
            <Button type="submit">Add</Button>
          </form>
          {cats.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.slug}
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            {tags.length === 0 ? "No tags yet." : `${tags.length} tag${tags.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createTaxAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="type" value="tag" />
            <div className="grid flex-1 gap-2 min-w-[12rem]">
              <Label htmlFor="new-tag">New tag</Label>
              <Input id="new-tag" name="name" required placeholder="Tag name" />
            </div>
            <Button type="submit">Add</Button>
          </form>
          {tags.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.slug}
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
