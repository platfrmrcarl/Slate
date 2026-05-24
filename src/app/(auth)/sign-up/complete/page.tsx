import { redirect } from "next/navigation";
import type { Route } from "next";
import { getOptionalUser } from "@/auth/context";

export const dynamic = "force-dynamic";

// Return URL hit after embedded Stripe Checkout completes. The
// `customer.subscription.created` webhook upserts the subscription row out
// of band; here we just confirm the user is signed in and bounce them into
// the admin. If anyone hits this URL directly without a session, send them
// to /sign-in.
export default async function CheckoutCompletePage() {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/sign-in" as Route);
  }
  redirect("/admin" as Route);
}
