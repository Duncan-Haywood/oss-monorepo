/**
 * Operator-visible readiness for the shared Vercel Cron secret gating EVERY
 * cron route wired in vercel.json's "crons" array (see .env.example for the
 * current list — three as of this writing: GET /api/cron/daily-digest, GET
 * /api/cron/checkout-recovery, GET /api/cron/outreach-followups — all
 * shipped in separate same-day iterations but sharing this one env var).
 *
 * OperatorDigestEmailEnvBanner (operator-digest-email-env-readiness.ts) only
 * covers OPERATOR_DIGEST_EMAIL — the manual "Send daily digest" button's own
 * gate. CRON_SECRET is a separate, independent gate: every equivalent manual
 * per-item send still works fine with CRON_SECRET unset, but the whole point
 * of every cron route (removing reliance on the operator remembering to
 * click a button — see operator-daily-digest-cron-automation in
 * BUSINESS_DECISIONS) silently never fires if CRON_SECRET is missing, and
 * there is no other dashboard-visible signal of that — a misconfigured or
 * never-configured automation only shows up in Vercel's own cron-run
 * history, a surface a single-operator user has no routine reason to check.
 * See operator-digest-cron-secret-env-banner.
 *
 * Deliberately a separate readiness check + banner from the email one (not a
 * shared multi-var list) since the failure modes are not equivalent: a
 * missing CRON_SECRET does not block any manual send the way a missing
 * OPERATOR_DIGEST_EMAIL blocks the digest button, so the two need distinct
 * wording and must be independently hideable once each is fixed. Named for
 * the digest (its original, still-primary consumer) rather than renamed for
 * every cron route sharing the secret — a rename purely to keep pace with
 * each new consumer would be unrelated scope creep every time; this
 * module's return type/logic already generalizes correctly (env presence
 * only) regardless of how many routes end up gated on CRON_SECRET.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not call Vercel and does not invent aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const OPERATOR_DIGEST_CRON_ENV_NAMES = ["CRON_SECRET"] as const;

export type OperatorDigestCronEnvName =
  (typeof OPERATOR_DIGEST_CRON_ENV_NAMES)[number];

export type OperatorDigestCronEnvReadiness = {
  /** True when CRON_SECRET is set (automation can leave the notConfigured skip path). */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly OperatorDigestCronEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly OperatorDigestCronEnvName[];
  /** Subset of required that are missing or whitespace-only. */
  missing: readonly OperatorDigestCronEnvName[];
};

/** Stable list of digest-cron env names from launch checklist / .env.example. */
export function listRequiredOperatorDigestCronEnvNames(): OperatorDigestCronEnvName[] {
  return [...OPERATOR_DIGEST_CRON_ENV_NAMES];
}

/**
 * True when the value would pass the cron route's own trim gate. Matches
 * `process.env.CRON_SECRET?.trim()` in src/app/api/cron/daily-digest/route.ts.
 */
export function isOperatorDigestCronSecretConfigured(raw: string | undefined): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Assess whether the daily-digest cron automation can leave the notConfigured
 * skip path. Env presence only — does not validate the secret with Vercel.
 */
export function assessOperatorDigestCronEnvReadiness(
  env: EnvLike = process.env,
): OperatorDigestCronEnvReadiness {
  const required = listRequiredOperatorDigestCronEnvNames();
  const cronSecretReady = isOperatorDigestCronSecretConfigured(env.CRON_SECRET);
  const present: OperatorDigestCronEnvName[] = cronSecretReady ? ["CRON_SECRET"] : [];
  const missing: OperatorDigestCronEnvName[] = cronSecretReady ? [] : ["CRON_SECRET"];
  return {
    ready: cronSecretReady,
    required,
    present,
    missing,
  };
}
