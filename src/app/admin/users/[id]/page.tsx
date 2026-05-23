import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { findUserById } from "@/auth/users";
import type { Role } from "@/db/schema";
import { EditUserForm } from "./EditUserForm";

export const dynamic = "force-dynamic";

const ROLES_ADMIN: Role[] = ["admin", "editor", "author", "contributor", "subscriber"];
const ROLES_OWNER: Role[] = ["owner", ...ROLES_ADMIN];

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const actor = await requireRole("admin");
  const { id } = await params;
  const target = await findUserById(id);
  if (!target) notFound();

  const assignable = actor.role === "owner" ? ROLES_OWNER : ROLES_ADMIN;
  const canEditRole = actor.id !== target.id;

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{target.displayName}</h1>
        <p className="text-sm text-gray-500">{target.email}</p>
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">ID</dt>
          <dd className="font-mono text-xs">{target.id}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{target.createdAt.toISOString().slice(0, 19).replace("T", " ")}</dd>
          <dt className="text-gray-500">Verified</dt>
          <dd>{target.emailVerifiedAt ? "yes" : "no"}</dd>
        </dl>
      </header>
      <EditUserForm
        userId={target.id}
        currentRole={target.role}
        assignableRoles={assignable}
        canEditRole={canEditRole}
      />
    </section>
  );
}
