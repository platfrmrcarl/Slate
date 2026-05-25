import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { findUserById } from "@/auth/users";
import type { Role } from "@/db/schema";
import { EditUserForm } from "./EditUserForm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ROLES_ADMIN: Role[] = ["admin", "editor", "author", "contributor", "subscriber"];
const ROLES_OWNER: Role[] = ["owner", ...ROLES_ADMIN];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

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
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <Avatar size="lg">
          <AvatarFallback>{initials(target.displayName)}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{target.displayName}</h1>
          <p className="text-muted-foreground text-sm">{target.email}</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Read-only metadata for this user.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="font-mono text-xs">{target.id}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="outline">{target.role}</Badge>
            </dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{target.createdAt.toISOString().slice(0, 19).replace("T", " ")}</dd>
            <dt className="text-muted-foreground">Verified</dt>
            <dd>
              {target.emailVerifiedAt ? (
                <Badge variant="outline">yes</Badge>
              ) : (
                <Badge variant="secondary">no</Badge>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <EditUserForm
        userId={target.id}
        currentRole={target.role}
        assignableRoles={assignable}
        canEditRole={canEditRole}
      />
    </div>
  );
}
