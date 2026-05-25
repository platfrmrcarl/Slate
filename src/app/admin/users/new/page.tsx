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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New user</h1>
        <p className="text-muted-foreground text-sm">
          Create an account and assign an initial role.
        </p>
      </header>
      <CreateUserForm assignableRoles={assignable} />
    </div>
  );
}
