import Link from "next/link";
import type { CompanyAddressEnvReadiness } from "@/lib/brand/company-address-env-readiness";

type CompanyAddressEnvBannerProps = {
  readiness: CompanyAddressEnvReadiness;
};

/**
 * CAN-SPAM postal-address alert when NEXT_PUBLIC_COMPANY_ADDRESS is missing
 * or a placeholder. Hidden when ready — not a pipeline-health metric card.
 * Distinct from brand-name / Resend / Stripe banners; show all when each gaps.
 */
export function CompanyAddressEnvBanner({
  readiness,
}: CompanyAddressEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "CAN-SPAM address blocked — NEXT_PUBLIC_COMPANY_ADDRESS is still a placeholder"
          : "CAN-SPAM address blocked — NEXT_PUBLIC_COMPANY_ADDRESS missing"}
      </p>
      <p className="mt-1 text-yellow-900">
        Without a real <code className="text-xs">NEXT_PUBLIC_COMPANY_ADDRESS</code>, every
        outreach footer ships the documented stub{" "}
        <code className="text-xs">
          [Registered business address — Colorado, USA]
        </code>{" "}
        via <code className="text-xs">brand.postalAddress</code> — Resend/brand can look
        ready while CAN-SPAM physical-address disclosure is still a placeholder. Set the
        registered Colorado postal address before the first outreach batch.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-yellow-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-yellow-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/compliance"
          className="text-yellow-900 underline underline-offset-2"
        >
          Compliance
        </Link>
      </p>
    </div>
  );
}
