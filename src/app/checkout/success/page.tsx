import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ManageBillingButton } from "./manage-billing-button";
import { planCheckoutSuccessAccess } from "@/lib/checkout/success-page-access";
import { loadCheckoutSuccessSession } from "@/lib/checkout/success-session";
import { brand } from "@/lib/brand";
import { staticPageMetadata } from "@/lib/seo";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

// Every other page in this flow (checkout/page.tsx, privacy, terms, all 12
// /docs/* pages) sets its own metadata; without one here this page silently
// inherited root layout.tsx's homepageMetadata() — wrong title/description
// and a canonical/OG url pointing at "/" instead of itself (same bug class
// docs-canonical-self-reference-fix fixed for /docs/*, never swept past that
// route tree). Per-session transactional page with no evergreen content to
// rank, so noindex — mirrors the /preview/[slug] non-indexable pattern.
export const metadata: Metadata = {
  ...staticPageMetadata({
    title: `Payment received — ${brand.name}`,
    description: `Your ${brand.name} purchase is confirmed — next steps to get your site live.`,
    path: "/checkout/success",
  }),
  robots: { index: false, follow: false },
};

type CheckoutSuccessPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { session_id } = await searchParams;
  const clientIp = clientIpFromHeaders(await headers());
  // Rate limit BEFORE loadCheckoutSuccessSession — that call fires up to two
  // live Stripe API calls (retrieve + listLineItems) for any session_id that
  // passes parseCheckoutSessionId's length cap, and this page previously had
  // no per-IP throttle at all (checkout-success-page-rate-limit; twin of
  // billing-portal's rate limit on the same retrieve call class).
  const plan = await planCheckoutSuccessAccess(session_id, clientIp, {
    loadSession: (id) =>
      loadCheckoutSuccessSession(id, { secretKey: process.env.STRIPE_SECRET_KEY }),
    checkRateLimit,
  });
  // A rate-limited hit skips the Stripe calls entirely and falls back to the
  // existing, already-rendered "couldn't confirm" state below rather than
  // erroring — same fail-to-cheap-existing-path pattern as
  // preview-page-rate-limit.
  const checkout = plan.kind === "rate_limited" ? { confirmed: false as const } : plan.result;

  if (!checkout.confirmed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t confirm this payment</h1>
        <p className="mt-3 text-zinc-600">
          If you just completed checkout, this can take a few seconds — refresh the page. If the
          problem continues, contact support and reference your email from checkout.
        </p>
        <Link
          href="/checkout"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white"
        >
          Back to checkout
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Payment received</h1>
      <p className="mt-3 text-zinc-600">
        Thanks — your order is confirmed. A receipt is on its way from Stripe, and we&apos;ll
        follow up by email with next steps to get your site live.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {checkout.showBillingPortal ? (
          <ManageBillingButton sessionId={checkout.sessionId} />
        ) : null}
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-200 bg-white px-8 font-medium text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
