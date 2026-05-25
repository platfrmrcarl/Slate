"use client";

import { useActionState } from "react";
import type { Role } from "@/db/schema";
import { updateUserRoleAction, sendPasswordResetAction } from "@/app/actions/users";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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
  const [resetState, resetAction, resetPending] = useActionState<FormState | undefined, FormData>(
    sendPasswordResetAction,
    undefined,
  );

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Role</CardTitle>
          <CardDescription>Change the role assigned to this user.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={roleAction} className="grid gap-4">
            <input type="hidden" name="userId" value={userId} />
            <div className="grid gap-2">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                name="role"
                defaultValue={currentRole}
                disabled={!canEditRole}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {!canEditRole && (
                <p className="text-muted-foreground text-xs">
                  You cannot change your own role.
                </p>
              )}
            </div>
            {roleState?.error && (
              <Alert variant="destructive">
                <AlertDescription>{roleState.error}</AlertDescription>
              </Alert>
            )}
            {roleState?.ok && (
              <p className="text-sm text-emerald-600 dark:text-emerald-500">Role updated.</p>
            )}
            <div>
              <Button type="submit" disabled={rolePending || !canEditRole}>
                {rolePending ? "Saving…" : "Save role"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password reset</CardTitle>
          <CardDescription>
            Sends a password-reset email to this user. Valid for 1 hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={resetAction} className="grid gap-4">
            <input type="hidden" name="userId" value={userId} />
            {resetState?.error && (
              <Alert variant="destructive">
                <AlertDescription>{resetState.error}</AlertDescription>
              </Alert>
            )}
            {resetState?.ok && (
              <p className="text-sm text-emerald-600 dark:text-emerald-500">
                Reset email sent.
              </p>
            )}
            <div>
              <Button type="submit" variant="outline" disabled={resetPending}>
                {resetPending ? "Sending…" : "Send password reset link"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
