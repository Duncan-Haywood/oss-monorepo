import Link from "next/link";
import { BUNDLES, COMMERCE_ADDON, tierUpsellPricing } from "@/lib/pricing/bundles";
import type { PublicLead } from "@/lib/leads/public-fields";

type TierUpsellProps = {
  /**
   * Must be the softCapLeadForPublicSurface result, not a raw Lead — this
   * component is rendered on the public /preview/[slug] page, and PublicLead
   * structurally excludes dashboard-only fields (notes, stripeConnectAccountId)
   * so a future Client Component boundary here can't serialize them into the
   * RSC payload.
   */
  lead: PublicLead;
  /**
   * True when the lead already has a prior bundle order (loadPreviewSetupFeeWaived) —
   * shows the same "setup already covered" price checkout would charge, so a
   * customer following an upsell email's waiver promise back to this preview
   * page doesn't see a contradicting full setup fee (preview-tier-upsell-setup-fee-waiver-parity).
   */
  setupFeeWaived?: boolean;
};

/**
 * Interactive upsell — cards are intentional here (checkout CTAs).
 * See business model: "Preview site tier comparison cards".
 */
export function TierUpsell({ lead, setupFeeWaived = false }: TierUpsellProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16" aria-labelledby="tier-upsell-heading">
      <div className="max-w-2xl">
        <h2 id="tier-upsell-heading" className="text-2xl font-semibold tracking-tight text-zinc-900">
          Choose how you want to go live
        </h2>
        <p className="mt-3 text-zinc-600">
          We recommend <span className="font-medium capitalize">{lead.recommendedTier}</span> for{" "}
          {lead.businessName}. You can change tiers at checkout.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {BUNDLES.map((bundle) => {
          const recommended = bundle.id === lead.recommendedTier;
          const pricing = tierUpsellPricing(bundle, setupFeeWaived);
          return (
            <div
              key={bundle.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                recommended ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white/90"
              }`}
            >
              <p className={`text-sm font-medium ${recommended ? "text-zinc-400" : "text-zinc-500"}`}>
                {bundle.name}
                {recommended ? " · recommended" : ""}
              </p>
              <p className={`mt-1 text-sm ${recommended ? "text-zinc-300" : "text-zinc-600"}`}>
                {bundle.tagline}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">${pricing.headlineUsd}</p>
              <p className={`mt-1 text-sm ${recommended ? "text-zinc-300" : "text-zinc-600"}`}>
                {pricing.caption}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {bundle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className={recommended ? "text-zinc-400" : "text-zinc-500"}>✓</span>
                    <span className={recommended ? "text-zinc-200" : "text-zinc-700"}>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/checkout?slug=${encodeURIComponent(lead.slug)}&tier=${bundle.id}&source=preview`}
                className={`mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  recommended
                    ? "bg-white text-zinc-900 hover:bg-zinc-100"
                    : "bg-zinc-900 text-white hover:bg-zinc-700"
                }`}
              >
                Get {bundle.name}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-zinc-500">
        Optional Commerce add-on (+${COMMERCE_ADDON.setupPriceUsd} + ${COMMERCE_ADDON.monthlyPriceUsd}
        /mo) can be selected at checkout for online orders or deposits.{" "}
        <Link href="/docs/product-bundles" className="underline underline-offset-2">
          Full tier details
        </Link>
        .
      </p>
    </section>
  );
}
