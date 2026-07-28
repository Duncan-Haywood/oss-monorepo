import Link from "next/link";
import type { OperatorDigestCronEnvReadiness } from "@/lib/digest/operator-digest-cron-env-readiness";

type OperatorDigestCronEnvBannerProps = {
  readiness: OperatorDigestCronEnvReadiness;
};

/**
 * Operator alert when CRON_SECRET is missing, independent of
 * OperatorDigestEmailEnvBanner (a missing CRON_SECRET does not block the
 * manual "Send daily digest" button the way a missing OPERATOR_DIGEST_EMAIL
 * does — it only leaves the unattended Vercel Cron triggers dormant, with no
 * other dashboard-visible signal). CRON_SECRET gates TWO separate cron
 * routes that share this one secret — GET /api/cron/daily-digest and GET
 * /api/cron/checkout-recovery (see .env.example) — so this banner's copy
 * must name both, not just the digest it was originally written for.
 * Hidden when ready — not a pipeline-health metric card. Distinct from
 * every other env banner; show all when each gaps.
 */
export function OperatorDigestCronEnvBanner({
  readiness,
}: OperatorDigestCronEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      role="status"
    >
      <p className="font-medium">Cron automation not configured — CRON_SECRET missing</p>
      <p className="mt-1 text-emerald-900">
        Both the daily digest and abandoned-checkout/cart recovery emails still work manually
        (<strong>Send daily digest</strong> and the per-lead recovery send on{" "}
        <Link href="/dashboard/leads" className="underline underline-offset-2">
          /dashboard/leads
        </Link>
        ), but without <code className="text-xs">CRON_SECRET</code> both unattended Vercel Cron
        triggers stay dormant — each will only ever fire if an operator remembers to click the
        button. A misconfigured or never-configured automation shows up only as a failing cron run
        in Vercel&apos;s own dashboard, not here.
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
        <Link href="/docs/process" className="text-emerald-900 underline underline-offset-2">
          Process log
        </Link>
      </p>
    </div>
  );
}
