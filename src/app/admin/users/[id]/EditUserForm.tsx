"use client";

import { useActionState } from "react";
import type { Role } from "@/db/schema";
import { updateUserRoleAction, sendPasswordResetAction } from "@/app/actions/users";

interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

export function EditUserForm({
  userId,
  currentRole,
  assignableRoles,
  canEditRole,
}: {
  userId: string;
  currentRole: Role;
  assignableRoles: Role[];
  canEditRole: boolean;
}): React.ReactElement {
  const [roleState, roleAction, rolePending] = useActionState<FormState | undefined, FormData>(
    updateUserRoleAction,
    undefined,
  );
  const [resetState, resetAction, resetPending] = useActionState<
    FormState | undefined,
    FormData
  >(sendPasswordResetAction, undefined);

  return (
    <div className="max-w-md space-y-8">
      <form action={roleAction} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Role</span>
          <select
            name="role"
            defaultValue={currentRole}
            disabled={!canEditRole}
            className="rounded border px-2 py-1 disabled:opacity-50"
          >
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {!canEditRole && (
          <p className="text-xs text-gray-500">You cannot change your own role.</p>
        )}
        {roleState?.error && <p className="text-sm text-red-700">{roleState.error}</p>}
        {roleState?.ok && <p className="text-sm text-green-700">Role updated.</p>}
        <button
          disabled={rolePending || !canEditRole}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {rolePending ? "Saving…" : "Save role"}
        </button>
      </form>

      <form action={resetAction} className="space-y-3 border-t pt-4">
        <input type="hidden" name="userId" value={userId} />
        <h2 className="text-sm font-semibold">Password reset</h2>
        <p className="text-xs text-gray-500">
          Sends a password-reset email to this user. Valid for 1 hour.
        </p>
        {resetState?.error && <p className="text-sm text-red-700">{resetState.error}</p>}
        {resetState?.ok && <p className="text-sm text-green-700">Reset email sent.</p>}
        <button
          disabled={resetPending}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {resetPending ? "Sending…" : "Send password reset link"}
        </button>
      </form>
    </div>
  );
}
