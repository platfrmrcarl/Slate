import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/auth/context";
import { generateBlockId } from "@/blocks/ids";
import { createPage } from "@/services/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewPageRoute(): Promise<never> {
  const user = await requireRole("contributor");
  const page = await createPage({
    title: "Untitled",
    authorId: user.id,
    blocks: [{ id: generateBlockId(), type: "paragraph", markdown: "" }],
  });
  redirect(`/admin/pages/${page.id}` as Route);
}
