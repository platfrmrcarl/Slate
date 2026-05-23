import type { Route } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/auth/context";
import { Sidebar } from "./_components/Sidebar";
import { UserMenu } from "./_components/UserMenu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = ["owner", "admin", "editor", "author", "contributor"] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const user = await getOptionalUser();
  if (!user) redirect("/sign-in?redirectTo=/admin" as Route);

  if (!ALLOWED_ROLES.includes(user.role as (typeof ALLOWED_ROLES)[number])) {
    redirect("/" as Route);
  }

  return (
    <div className="grid min-h-screen grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar role={user.role} />
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm text-gray-500">Admin</span>
          <UserMenu user={user} />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
