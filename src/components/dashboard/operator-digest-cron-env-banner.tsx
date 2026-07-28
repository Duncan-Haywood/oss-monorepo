import Link from "next/link";
import type { OperatorDigestCronEnvReadiness } from "@/lib/digest/operator-digest-cron-env-readiness";

type OperatorDigestCronEnvBannerProps = {
  readiness: OperatorDigestCronEnvReadiness;
};

/**
 * Operator alert when CRON_SECRET is missing, independent of
 * OperatorDigestEmailEnvBanner (a missing CRON_SECRET does not block any
 * manual per-item send the way a missing OPERATOR_DIGEST_EMAIL blocks the
 * digest button — it only leaves the unattended Vercel Cron triggers
 * dormant, with no other dashboard-visible signal). CRON_SECRET gates every
 * cron route wired in vercel.json that shares this one secret — the count
 * has already grown from one to three in a single day (daily-digest,
 * checkout-recovery, outreach-followups) as concurrent sessions kept adding
 * new automations. The banner's core claim ("every vercel.json cron stays
 * dormant without this") is feature-list-agnostic and stays true regardless
 * of how many crons exist; the named examples in the copy are illustrative,
 * not an exhaustively-maintained enumeration, and the copy explicitly
 * points at .env.example as the authoritative current list — so a future
 * fourth/fifth cron route makes the example list slightly stale, not wrong,
 * without needing every future cron-adding session to also touch this file.
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
        Every scheduled automation wired as a &quot;crons&quot; entry in{" "}
        <code className="text-xs">vercel.json</code> (currently the daily digest, abandoned-checkout
        recovery, and cold-outreach follow-ups — see <code className="text-xs">.env.example</code>{" "}
        for the current list) shares this one secret and stays dormant without it. The equivalent
        manual sends on{" "}
        <Link href="/dashboard/leads" className="underline underline-offset-2">
          /dashboard/leads
        </Link>{" "}
        still work fine — each automation will simply only ever fire if an operator remembers to
        click its button instead. A misconfigured or never-configured automation shows up only as
        a failing cron run in Vercel&apos;s own dashboard, not here.
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
