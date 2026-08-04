import Link from "next/link";
import type { VercelTokenEnvReadiness } from "@/lib/deploy/vercel-token-env-readiness";

type VercelTokenEnvBannerProps = {
  readiness: VercelTokenEnvReadiness;
};

/**
 * Vercel Domains API alert when VERCEL_TOKEN is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from production-domain / APP_URL / Stripe banners.
 */
export function VercelTokenEnvBanner({ readiness }: VercelTokenEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Vercel domain automation blocked — VERCEL_TOKEN is still a placeholder"
          : "Vercel domain automation blocked — VERCEL_TOKEN missing"}
      </p>
      <p className="mt-1 text-blue-900">
        Without a real <code className="text-xs">VERCEL_TOKEN</code>, paid handoffs stay{" "}
        <code className="text-xs">awaiting_dns</code> with manual notes —{" "}
        <code className="text-xs">tryProvisionVercelDomain</code> never calls the Domains API
        even when <code className="text-xs">NEXT_PUBLIC_PRODUCTION_DOMAIN</code> and APP_URL
        look ready. Set a Vercel account token before first paid deploy handoff (optional{" "}
        <code className="text-xs">VERCEL_PROJECT_ID</code> or per-handoff{" "}
        <strong>Assign project</strong> still required for the API call).
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-blue-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-blue-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/production-deploy"
          className="text-blue-900 underline underline-offset-2"
        >
          Production deploy
        </Link>
      </p>
    </div>
  );
}
