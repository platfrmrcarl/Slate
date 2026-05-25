import type { Route } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/context";
import { requestEmailVerificationAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function resendVerificationFormAction(formData: FormData): Promise<void> {
  "use server";
  await requestEmailVerificationAction(undefined, formData);
}

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Your account details and verification status.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Information associated with your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span>{user.email}</span>
              {user.emailVerifiedAt ? (
                <Badge variant="outline">verified</Badge>
              ) : (
                <Badge variant="outline">unverified</Badge>
              )}
            </dd>
            <dt className="text-muted-foreground">Display name</dt>
            <dd>{user.displayName}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>{user.role}</dd>
          </dl>
        </CardContent>
      </Card>

      {!user.emailVerifiedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Verify your email</CardTitle>
            <CardDescription>We can send another verification link to your inbox.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={resendVerificationFormAction}>
              <input type="hidden" name="email" value={user.email} />
              <Button type="submit">Send verification email</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Update your sign-in credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={"/forgot-password" as Route} />}
          >
            Change password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
