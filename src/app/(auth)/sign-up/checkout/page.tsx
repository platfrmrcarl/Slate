"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Lazily resolve the Stripe instance; load once, share across remounts.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return Promise.resolve(null);
    stripePromise = loadStripe(pk);
  }
  return stripePromise;
}

type TierId = "essential" | "premium" | "enterprise";

function isTier(v: string | null): v is TierId {
  return v === "essential" || v === "premium" || v === "enterprise";
}

// useSearchParams forces CSR — wrap the consumer in Suspense so Next's
// build-phase prerender doesn't bail out.
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-xl p-6">
          <p className="text-sm text-gray-500">Loading secure checkout…</p>
        </section>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const tier = search.get("tier");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTier(tier)) {
      router.replace("/products");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        if (res.status === 401) {
          router.replace(`/sign-in?redirectTo=/sign-up/checkout%3Ftier%3D${tier}`);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Checkout failed (${res.status})`);
        }
        const { clientSecret: cs } = (await res.json()) as { clientSecret: string };
        if (!cancelled) setClientSecret(cs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tier, router]);

  if (error) {
    return (
      <section className="mx-auto max-w-xl p-6">
        <h2 className="text-xl font-semibold">Couldn&rsquo;t start checkout</h2>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <p className="mt-4 text-sm">
          Try again from{" "}
          <Link className="underline" href={"/products" as Route}>
            our pricing page
          </Link>
          .
        </p>
      </section>
    );
  }

  if (!clientSecret) {
    return (
      <section className="mx-auto max-w-xl p-6">
        <p className="text-sm text-gray-500">Loading secure checkout…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </section>
  );
}
