/**
 * Operator-visible readiness for the daily digest destination email.
 *
 * Stripe / Resend / Anthropic banners already cover payment, outbound transport,
 * and AI pack quality. Without OPERATOR_DIGEST_EMAIL, Send daily digest only
 * errors on click — operators get no early dashboard signal that pipeline-health
 * digest delivery is unconfigured (Work next, follow-ups, abandoned carts,
 * unreplied inquiries, packs due, upsells, Commerce payouts owed).
 *
 * Matches sendDailyDigestAction's gate in
 * src/app/dashboard/leads/actions.ts:
 *   missing or whitespace-only → error return.
 * Also flags documented .env.example placeholders (you@example.com) that would
 * otherwise look "set" while still pointing at a non-operator inbox.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not call Resend and does not invent optional aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const OPERATOR_DIGEST_EMAIL_ENV_NAMES = ["OPERATOR_DIGEST_EMAIL"] as const;

export type OperatorDigestEmailEnvName =
  (typeof OPERATOR_DIGEST_EMAIL_ENV_NAMES)[number];

export type OperatorDigestEmailEnvReadiness = {
  /** True when OPERATOR_DIGEST_EMAIL is a non-placeholder destination. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly OperatorDigestEmailEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly OperatorDigestEmailEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly OperatorDigestEmailEnvName[];
  /** True when OPERATOR_DIGEST_EMAIL would pass sendDailyDigestAction's trim check. */
  digestEmailReady: boolean;
  /** True when the value looks like a documented placeholder, not a real inbox. */
  placeholderDetected: boolean;
};

/** Stable list of digest destination env names from launch checklist / .env.example. */
export function listRequiredOperatorDigestEmailEnvNames(): OperatorDigestEmailEnvName[] {
  return [...OPERATOR_DIGEST_EMAIL_ENV_NAMES];
}

/** Documented .env.example / paste placeholders — not usable operator inboxes. */
export function isOperatorDigestEmailPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (lower === "you@example.com" || lower === "operator@example.com") {
    return true;
  }
  if (lower.endsWith("@example.com") || lower.endsWith("@example.org")) {
    return true;
  }
  return false;
}

/**
 * True when the value would pass sendDailyDigestAction's trim gate and is not
 * a documented placeholder.
 */
export function isOperatorDigestEmailConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isOperatorDigestEmailPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether Send daily digest has a configured destination.
 * Env presence only — does not validate deliverability with Resend.
 */
export function assessOperatorDigestEmailEnvReadiness(
  env: EnvLike = process.env,
): OperatorDigestEmailEnvReadiness {
  const required = listRequiredOperatorDigestEmailEnvNames();
  const raw = env.OPERATOR_DIGEST_EMAIL;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isOperatorDigestEmailPlaceholder(trimmed);
  const digestEmailReady = isOperatorDigestEmailConfigured(raw);
  const present: OperatorDigestEmailEnvName[] = digestEmailReady
    ? ["OPERATOR_DIGEST_EMAIL"]
    : [];
  const missing: OperatorDigestEmailEnvName[] = digestEmailReady
    ? []
    : ["OPERATOR_DIGEST_EMAIL"];
  return {
    ready: digestEmailReady,
    required,
    present,
    missing,
    digestEmailReady,
    placeholderDetected,
  };
}
