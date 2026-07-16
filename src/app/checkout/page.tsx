import { Suspense } from "react";
import { loadCheckoutPrefillLead } from "@/lib/checkout/prefill-slug";
import { leadPreviewPath } from "@/lib/leads/slug-path";
import type { BundleTier } from "@/lib/pricing/bundles";
import { CheckoutForm, type CheckoutPrefill } from "./checkout-form";

type CheckoutPageProps = {
  searchParams: Promise<{
    slug?: string;
    tier?: string;
    commerce?: string;
    cancelled?: string;
  }>;
};

function parseTier(value: string | undefined): BundleTier | undefined {
  if (value === "starter" || value === "growth" || value === "complete") {
    return value;
  }
  return undefined;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  // Optional slug: over-long treated as missing (fall-back), never strands checkout.
  const { slug, lead } = await loadCheckoutPrefillLead(params.slug);

  const prefill: CheckoutPrefill = {
    slug,
    businessName: lead?.businessName,
    email: lead?.email,
    recommendedTier: lead?.recommendedTier,
    initialTier: parseTier(params.tier) ?? lead?.recommendedTier,
    initialCommerce: params.commerce === "1" || params.commerce === "true",
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      {params.cancelled === "1" ? (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout cancelled — your preview is still available
          {prefill.slug ? (
            <>
              {" "}
              at{" "}
              <a
                className="underline underline-offset-2"
                href={leadPreviewPath(prefill.slug)}
              >
                {leadPreviewPath(prefill.slug)}
              </a>
            </>
          ) : null}
          . Adjust the plan below when you are ready.
        </p>
      ) : null}
      <Suspense>
        <CheckoutForm prefill={prefill} />
      </Suspense>
    </main>
  );
}
