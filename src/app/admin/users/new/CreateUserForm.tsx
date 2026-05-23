"use client";

import { useActionState } from "react";
import type { Role } from "@/db/schema";
import { createUserAction } from "@/app/actions/users";

interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export function CreateUserForm({
  assignableRoles,
}: {
  assignableRoles: Role[];
}): React.ReactElement {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(
    createUserAction,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-md space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Email</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded border px-2 py-1"
        />
        {fe.email && <p className="mt-1 text-xs text-red-700">{fe.email}</p>}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Display name</span>
        <input
          name="displayName"
          type="text"
          required
          className="w-full rounded border px-2 py-1"
        />
        {fe.displayName && <p className="mt-1 text-xs text-red-700">{fe.displayName}</p>}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={12}
          className="w-full rounded border px-2 py-1"
        />
        {fe.password && <p className="mt-1 text-xs text-red-700">{fe.password}</p>}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Role</span>
        <select name="role" defaultValue="subscriber" className="rounded border px-2 py-1">
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {fe.role && <p className="mt-1 text-xs text-red-700">{fe.role}</p>}
      </label>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
