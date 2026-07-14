import Link from "next/link";
import type { BrandNameEnvReadiness } from "@/lib/brand/brand-name-env-readiness";

type BrandNameEnvBannerProps = {
  readiness: BrandNameEnvReadiness;
};

/**
 * Brand alert when NEXT_PUBLIC_BRAND_NAME is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe / Resend / Anthropic / digest / auth banners;
 * show all when each gaps.
 */
export function BrandNameEnvBanner({ readiness }: BrandNameEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Brand copy blocked — NEXT_PUBLIC_BRAND_NAME is still a placeholder"
          : "Brand copy blocked — NEXT_PUBLIC_BRAND_NAME missing"}
      </p>
      <p className="mt-1 text-rose-900">
        Without a real <code className="text-xs">NEXT_PUBLIC_BRAND_NAME</code>, every
        customer-facing surface (outreach From name, marketing footers, voice intros,
        CAN-SPAM sender lines) falls back to{" "}
        <code className="text-xs">Your Brand</code> — Resend/Stripe can look ready while
        the first Email 1 still ships unbranded. Set the public brand before the first
        outreach batch.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-rose-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-rose-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/business-model"
          className="text-rose-900 underline underline-offset-2"
        >
          Business model
        </Link>
      </p>
    </div>
  );
}
