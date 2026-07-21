import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { cancelledCheckoutBanner } from "@/lib/checkout/cancelled-banner";
import { planCheckoutPageAccess } from "@/lib/checkout/checkout-page-access";
import { loadCheckoutPrefillLead } from "@/lib/checkout/prefill-slug";
import { brand } from "@/lib/brand";
import type { BundleTier } from "@/lib/pricing/bundles";
import { staticPageMetadata } from "@/lib/seo";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { CheckoutForm, type CheckoutPrefill } from "./checkout-form";

export const metadata: Metadata = staticPageMetadata({
  title: `Checkout — ${brand.name}`,
  description: `Complete your ${brand.name} purchase and go live in minutes.`,
  path: "/checkout",
});

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
  const clientIp = clientIpFromHeaders(await headers());
  // Rate limit BEFORE loadCheckoutPrefillLead — that call fires a real
  // Convex/SQLite round trip for any slug that passes the length gate, and
  // this page previously had no per-IP throttle at all (checkout-page-rate-
  // limit; twin of checkout-success-page-rate-limit / preview-page-rate-limit
  // on the same resource-exhaustion class). A rate-limited hit skips the DB
  // lookup and falls back to the un-prefilled checkout, never strands the
  // buyer, same fail-to-cheap-existing-path pattern as those two siblings.
  const plan = await planCheckoutPageAccess(params.slug, clientIp, {
    loadPrefillLead: loadCheckoutPrefillLead,
    checkRateLimit,
  });
  const { slug, lead } =
    plan.kind === "rate_limited" ? { slug: undefined, lead: null } : plan.result;

  const prefill: CheckoutPrefill = {
    slug,
    businessName: lead?.businessName,
    email: lead?.email,
    recommendedTier: lead?.recommendedTier,
    initialTier: parseTier(params.tier) ?? lead?.recommendedTier,
    initialCommerce: params.commerce === "1" || params.commerce === "true",
  };

  const banner = cancelledCheckoutBanner(lead);

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      {params.cancelled === "1" ? (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {banner.kind === "with_preview" ? (
            <>
              Checkout cancelled — your preview is still available at{" "}
              <Link className="underline underline-offset-2" href={banner.previewPath}>
                {banner.previewPath}
              </Link>
              . Adjust the plan below when you are ready.
            </>
          ) : (
            "Checkout cancelled — adjust your plan below whenever you're ready."
          )}
        </p>
      ) : null}
      <Suspense>
        <CheckoutForm prefill={prefill} />
      </Suspense>
    </main>
  );
}
