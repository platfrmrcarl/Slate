import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listUsers } from "@/auth/users";
import type { Role } from "@/db/schema";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["owner", "admin", "editor", "author", "contributor", "subscriber"];

function isRole(s: string | undefined): s is Role {
  return !!s && (ROLES as readonly string[]).includes(s);
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
    <section>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link
          href={"/admin/users/new" as Route}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          New user
        </Link>
      </header>
      <nav className="mb-4 flex gap-3 text-sm">
        <Link
          href={"/admin/users" as Route}
          className={!filter ? "font-semibold underline" : "underline-offset-2 hover:underline"}
        >
          all
        </Link>
        {ROLES.map((r) => (
          <Link
            key={r}
            href={`/admin/users?role=${r}` as Route}
            className={
              filter === r ? "font-semibold underline" : "underline-offset-2 hover:underline"
            }
          >
            {r}
          </Link>
        ))}
      </nav>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Email</th>
            <th>Display name</th>
            <th>Role</th>
            <th>Created</th>
            <th>Verified</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">
                <Link className="underline" href={`/admin/users/${u.id}` as Route}>
                  {u.email}
                </Link>
              </td>
              <td>{u.displayName}</td>
              <td>{u.role}</td>
              <td>{u.createdAt.toISOString().slice(0, 10)}</td>
              <td>{u.emailVerifiedAt ? "yes" : "no"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-gray-500">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
