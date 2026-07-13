import Link from "next/link";
import type { BundlePriceEnvReadiness } from "@/lib/pricing/price-env-readiness";

type BundlePriceEnvBannerProps = {
  readiness: BundlePriceEnvReadiness;
};

/**
 * Sale-blocking alert when required STRIPE_PRICE_ID_* env vars are missing.
 * Hidden when ready — not a pipeline-health metric card.
 */
export function BundlePriceEnvBanner({ readiness }: BundlePriceEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  const preview = readiness.missing.slice(0, 3);
  const more = readiness.missing.length - preview.length;

  return (
    <div
      className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
      role="status"
    >
      <p className="font-medium">Checkout blocked — Stripe Price env vars missing</p>
      <p className="mt-1 text-rose-900">
        {readiness.missing.length} of {readiness.required.length} required{" "}
        <code className="text-xs">STRIPE_PRICE_ID_*</code> secrets are unset.
        Bundle and Commerce checkout will return 501 until they are pasted.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-rose-900">
        {preview.map((name) => (
          <li key={name}>{name}</li>
        ))}
        {more > 0 ? <li>+{more} more</li> : null}
      </ul>
      <p className="mt-2 text-rose-900">
        Run bootstrap (
        <code className="text-xs">ALLOW_STRIPE_BOOTSTRAP=1</code>,{" "}
        <code className="text-xs">POST /api/stripe/bootstrap-prices</code>
        ), paste <code className="text-xs">envSnippet</code>, then unset the
        flag — see{" "}
        <Link
          href="/docs/launch-checklist"
          className="underline underline-offset-2"
        >
          Launch checklist
        </Link>
        .
      </p>
    </div>
  );
}
