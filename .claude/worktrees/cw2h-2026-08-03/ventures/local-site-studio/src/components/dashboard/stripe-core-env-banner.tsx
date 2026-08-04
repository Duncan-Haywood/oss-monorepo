import Link from "next/link";
import type { StripeCoreEnvReadiness } from "@/lib/pricing/stripe-core-env-readiness";

type StripeCoreEnvBannerProps = {
  readiness: StripeCoreEnvReadiness;
};

/**
 * Sale/fulfillment alert when core Stripe secrets are missing.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from BundlePriceEnvBanner (Price IDs); show both when both gap.
 */
export function StripeCoreEnvBanner({ readiness }: StripeCoreEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  const checkoutBlocked = !readiness.secretKeyReady;
  const fulfillmentSilent = readiness.secretKeyReady && !readiness.webhookSecretReady;

  return (
    <div
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <p className="font-medium">
        {fulfillmentSilent
          ? "Fulfillment at risk — Stripe webhook secret missing"
          : checkoutBlocked
            ? "Checkout blocked — Stripe secret key missing"
            : "Stripe core secrets incomplete"}
      </p>
      <p className="mt-1 text-amber-900">
        {fulfillmentSilent ? (
          <>
            Checkout can succeed in Stripe while{" "}
            <code className="text-xs">/api/stripe/webhook</code> returns 501 — CRM, handoff, and
            receipts never record. Set <code className="text-xs">STRIPE_WEBHOOK_SECRET</code> and
            point the Stripe webhook at this deploy before taking live payments.
          </>
        ) : (
          <>
            {readiness.missing.length} of {readiness.required.length} required Stripe core secrets
            are unset. Bundle and Commerce checkout / webhook fulfillment need these before the
            first paid order.
          </>
        )}
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-amber-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-amber-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
      </p>
    </div>
  );
}
