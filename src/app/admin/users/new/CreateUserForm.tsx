"use client";

import { useActionState } from "react";
import type { Role } from "@/db/schema";
import { createUserAction } from "@/app/actions/users";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Invite user</CardTitle>
        <CardDescription>
          New users receive the chosen role and can sign in immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input id="new-user-email" name="email" type="email" required />
            {fe.email && <p className="text-destructive text-xs">{fe.email}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-displayName">Display name</Label>
            <Input id="new-user-displayName" name="displayName" type="text" required />
            {fe.displayName && <p className="text-destructive text-xs">{fe.displayName}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              name="password"
              type="password"
              required
              minLength={12}
            />
            {fe.password && <p className="text-destructive text-xs">{fe.password}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-role">Role</Label>
            <select
              id="new-user-role"
              name="role"
              defaultValue="subscriber"
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-3"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {fe.role && <p className="text-destructive text-xs">{fe.role}</p>}
          </div>

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
