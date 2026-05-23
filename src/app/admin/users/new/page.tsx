import { requireRole } from "@/auth/context";
import type { Role } from "@/db/schema";
import { CreateUserForm } from "./CreateUserForm";

export const dynamic = "force-dynamic";

const ROLES_ADMIN: Role[] = ["admin", "editor", "author", "contributor", "subscriber"];
const ROLES_OWNER: Role[] = ["owner", ...ROLES_ADMIN];

export default async function NewUserPage(): Promise<React.ReactElement> {
  const actor = await requireRole("admin");
  const assignable = actor.role === "owner" ? ROLES_OWNER : ROLES_ADMIN;

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">New user</h1>
      <CreateUserForm assignableRoles={assignable} />
    </section>
  );
}
