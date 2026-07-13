/**
 * Operator-visible readiness for outbound email (Resend).
 *
 * Stripe banners already cover payment secrets. Without a real RESEND_API_KEY,
 * sendEmail() silently mock-logs every outreach / receipt / recovery / pack /
 * digest message — operators think sends succeeded while no customer inbox
 * receives them.
 *
 * Matches sendEmail's mock gate in src/lib/email/resend.ts:
 *   missing, whitespace-only, re_placeholder*, or exact "re_..." → not ready.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not call Resend and does not invent optional aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const RESEND_EMAIL_ENV_NAMES = ["RESEND_API_KEY"] as const;

export type ResendEmailEnvName = (typeof RESEND_EMAIL_ENV_NAMES)[number];

export type ResendEmailEnvReadiness = {
  /** True when RESEND_API_KEY is a non-placeholder secret. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly ResendEmailEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly ResendEmailEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly ResendEmailEnvName[];
  /** True when RESEND_API_KEY would leave mock-email mode. */
  apiKeyReady: boolean;
  /** True when the value looks like a documented placeholder, not a real key. */
  placeholderDetected: boolean;
};

/** Stable list of Resend env names from launch checklist / .env.example. */
export function listRequiredResendEmailEnvNames(): ResendEmailEnvName[] {
  return [...RESEND_EMAIL_ENV_NAMES];
}

/**
 * True when the value is usable for a real Resend send.
 * Mirrors sendEmail's mock gate (missing / placeholder → mock).
 */
export function isResendApiKeyConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.startsWith("re_placeholder") || trimmed === "re_...") {
    return false;
  }
  return true;
}

/**
 * Assess whether outbound email can leave mock mode.
 * Env presence only — does not validate key format with Resend.
 */
export function assessResendEmailEnvReadiness(
  env: EnvLike = process.env,
): ResendEmailEnvReadiness {
  const required = listRequiredResendEmailEnvNames();
  const raw = env.RESEND_API_KEY;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.startsWith("re_placeholder") || trimmed === "re_...";
  const apiKeyReady = isResendApiKeyConfigured(raw);
  const present: ResendEmailEnvName[] = apiKeyReady ? ["RESEND_API_KEY"] : [];
  const missing: ResendEmailEnvName[] = apiKeyReady ? [] : ["RESEND_API_KEY"];
  return {
    ready: apiKeyReady,
    required,
    present,
    missing,
    apiKeyReady,
    placeholderDetected,
  };
}
