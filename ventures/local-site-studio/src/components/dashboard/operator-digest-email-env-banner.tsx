import Link from "next/link";
import type { OperatorDigestEmailEnvReadiness } from "@/lib/digest/operator-digest-email-env-readiness";

type OperatorDigestEmailEnvBannerProps = {
  readiness: OperatorDigestEmailEnvReadiness;
};

/**
 * Operator alert when OPERATOR_DIGEST_EMAIL is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe / Resend / Anthropic banners; show all when each gaps.
 */
export function OperatorDigestEmailEnvBanner({
  readiness,
}: OperatorDigestEmailEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Daily digest blocked — OPERATOR_DIGEST_EMAIL is still a placeholder"
          : "Daily digest blocked — OPERATOR_DIGEST_EMAIL missing"}
      </p>
      <p className="mt-1 text-emerald-900">
        Without a real <code className="text-xs">OPERATOR_DIGEST_EMAIL</code>,{" "}
        <strong>Send daily digest</strong> on{" "}
        <Link
          href="/dashboard/leads"
          className="underline underline-offset-2"
        >
          /dashboard/leads
        </Link>{" "}
        only errors on click — Work next, follow-ups due, abandoned carts, unreplied
        inquiries, packs due, upsells, and Commerce payouts owed never leave the
        dashboard. Set your operator inbox before relying on the digest for daily
        urgency.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-emerald-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-emerald-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/process"
          className="text-emerald-900 underline underline-offset-2"
        >
          Process log
        </Link>
      </p>
    </div>
  );
}
