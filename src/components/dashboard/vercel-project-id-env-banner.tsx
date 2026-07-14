import Link from "next/link";
import type { VercelProjectIdEnvReadiness } from "@/lib/deploy/vercel-project-id-env-readiness";

type VercelProjectIdEnvBannerProps = {
  readiness: VercelProjectIdEnvReadiness;
};

/**
 * Shared Vercel project alert when VERCEL_PROJECT_ID is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Vercel-token (blue) / production-domain (cyan) banners.
 */
export function VercelProjectIdEnvBanner({
  readiness,
}: VercelProjectIdEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Vercel Domains API shared project blocked — VERCEL_PROJECT_ID is still a placeholder"
          : "Vercel Domains API shared project blocked — VERCEL_PROJECT_ID missing"}
      </p>
      <p className="mt-1 text-indigo-900">
        Without a real shared <code className="text-xs">VERCEL_PROJECT_ID</code>,{" "}
        <code className="text-xs">tryProvisionVercelDomain</code> still skips the Domains API
        unless every paid handoff gets per-client <strong>Assign project</strong> — even when{" "}
        <code className="text-xs">VERCEL_TOKEN</code> is set. Paste the shared Vercel project id
        (or assign per handoff) before first paid deploy.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-indigo-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-indigo-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/production-deploy"
          className="text-indigo-900 underline underline-offset-2"
        >
          Production deploy
        </Link>
      </p>
    </div>
  );
}
