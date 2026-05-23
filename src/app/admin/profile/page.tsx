import type { Route } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/context";
import { requestEmailVerificationAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

async function resendVerificationFormAction(formData: FormData): Promise<void> {
  "use server";
  await requestEmailVerificationAction(undefined, formData);
}

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Profile</h1>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="font-semibold">Email</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerifiedAt ? (
            <span className="ml-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
              verified
            </span>
          ) : (
            <span className="ml-2 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
              unverified
            </span>
          )}
        </dd>
        <dt className="font-semibold">Display name</dt>
        <dd>{user.displayName}</dd>
        <dt className="font-semibold">Role</dt>
        <dd>{user.role}</dd>
      </dl>
      {!user.emailVerifiedAt && (
        <form action={resendVerificationFormAction} className="mt-6">
          <input type="hidden" name="email" value={user.email} />
          <button className="rounded bg-black px-3 py-1.5 text-sm text-white">
            Send verification email
          </button>
        </form>
      )}
      <p className="mt-8 text-sm">
        <Link className="underline" href={"/forgot-password" as Route}>
          Change password
        </Link>
      </p>
    </main>
  );
}
