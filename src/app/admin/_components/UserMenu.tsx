"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";
import type { User } from "@/db/schema";

export function UserMenu({ user }: { user: User }): React.ReactElement {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700">
        {user.displayName} · <span className="text-xs text-gray-500">{user.role}</span>
      </span>
      <form
        action={() => {
          start(() => signOutAction());
        }}
      >
        <button type="submit" disabled={pending} className="rounded border px-3 py-1 text-sm">
          {pending ? "…" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
