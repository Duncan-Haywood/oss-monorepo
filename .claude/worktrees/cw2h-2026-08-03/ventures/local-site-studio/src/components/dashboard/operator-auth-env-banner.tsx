import Link from "next/link";
import type { OperatorAuthEnvReadiness } from "@/lib/auth/operator-auth-env-readiness";

type OperatorAuthEnvBannerProps = {
  readiness: OperatorAuthEnvReadiness;
};

/**
 * Security alert when OPERATOR_DASHBOARD_PASSWORD is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe / Resend / Anthropic / digest banners; show all when each gaps.
 */
export function OperatorAuthEnvBanner({ readiness }: OperatorAuthEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Dashboard open — OPERATOR_DASHBOARD_PASSWORD is still a placeholder"
          : "Dashboard open — OPERATOR_DASHBOARD_PASSWORD missing"}
      </p>
      <p className="mt-1 text-amber-900">
        Without a real <code className="text-xs">OPERATOR_DASHBOARD_PASSWORD</code>,{" "}
        <code className="text-xs">proxy.ts</code> and{" "}
        <code className="text-xs">requireOperatorAuth</code> stay in open demo mode —
        every CRM / outreach / fulfill mutation on{" "}
        <Link href="/dashboard/leads" className="underline underline-offset-2">
          /dashboard/leads
        </Link>{" "}
        is world-reachable. Set a shared secret before loading real lead data or
        sending outreach.
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
        {" · "}
        <Link
          href="/dashboard/login"
          className="text-amber-900 underline underline-offset-2"
        >
          Operator login
        </Link>
      </p>
    </div>
  );
}
