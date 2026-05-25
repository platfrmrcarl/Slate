import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listUsers } from "@/auth/users";
import type { Role } from "@/db/schema";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["owner", "admin", "editor", "author", "contributor", "subscriber"];

function isRole(s: string | undefined): s is Role {
  return !!s && (ROLES as readonly string[]).includes(s);
}

function roleVariant(role: Role): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "owner":
      return "destructive";
    case "admin":
      return "default";
    case "editor":
    case "author":
      return "secondary";
    default:
      return "outline";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<React.ReactElement> {
  await requireRole("admin");
  const sp = await searchParams;
  const filter = isRole(sp.role) ? sp.role : undefined;
  const items = await listUsers(filter ? { role: filter } : {});

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm">
            Manage user accounts, roles, and access.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={"/admin/users/new" as Route} />}>
          New user
        </Button>
      </header>

      <nav className="flex flex-wrap gap-1">
        <Button
          variant={!filter ? "secondary" : "ghost"}
          size="sm"
          nativeButton={false}
          render={<Link href={"/admin/users" as Route} />}
        >
          all
        </Button>
        {ROLES.map((r) => (
          <Button
            key={r}
            variant={filter === r ? "secondary" : "ghost"}
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/users?role=${r}` as Route} />}
          >
            {r}
          </Button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {items.length === 0 ? "No users found." : `${items.length} user(s) shown.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback>{initials(u.displayName)}</AvatarFallback>
                      </Avatar>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-0"
                        nativeButton={false}
                        render={<Link href={`/admin/users/${u.id}` as Route} />}
                      >
                        {u.displayName}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleVariant(u.role)}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    {u.emailVerifiedAt ? (
                      <Badge variant="outline">yes</Badge>
                    ) : (
                      <Badge variant="secondary">no</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-4 text-center">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
