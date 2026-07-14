import Link from "next/link";
import type { ProductionDomainEnvReadiness } from "@/lib/deploy/production-domain-env-readiness";

type ProductionDomainEnvBannerProps = {
  readiness: ProductionDomainEnvReadiness;
};

/**
 * Production-root alert when NEXT_PUBLIC_PRODUCTION_DOMAIN is missing,
 * localhost, or a placeholder. Hidden when ready — not a pipeline-health
 * metric card. Distinct from Stripe / Resend / Anthropic / digest / auth /
 * APP_URL / brand banners.
 */
export function ProductionDomainEnvBanner({
  readiness,
}: ProductionDomainEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  const title = readiness.localhostDetected
    ? "Production root still localhost — NEXT_PUBLIC_PRODUCTION_DOMAIN needs a public host"
    : readiness.placeholderDetected
      ? "Production root is still a placeholder — NEXT_PUBLIC_PRODUCTION_DOMAIN"
      : "Production root missing — NEXT_PUBLIC_PRODUCTION_DOMAIN unset";

  return (
    <div
      className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950"
      role="status"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-cyan-900">
        Without an explicit <code className="text-xs">NEXT_PUBLIC_PRODUCTION_DOMAIN</code>,
        handoff <code className="text-xs">suggestedHost</code> values and DNS counseling fall
        back to stripping <code className="text-xs">preview.</code> from{" "}
        <code className="text-xs">NEXT_PUBLIC_PREVIEW_DOMAIN</code> (or the localsitestudio.com
        default) — Starter preview-subdomain URLs advertise the wrong root once APP_URL is live.
        Set the bare production host (e.g. <code className="text-xs">yoursite.com</code>) before
        first paid handoff.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-cyan-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-cyan-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/production-deploy"
          className="text-cyan-900 underline underline-offset-2"
        >
          Production deploy
        </Link>
      </p>
    </div>
  );
}
