/**
 * Operator-visible readiness for Vercel Domains API automation.
 *
 * Production-domain / APP_URL / brand banners already cover suggestedHost root
 * and canonical links. Without VERCEL_TOKEN, tryProvisionVercelDomain skips the
 * Domains API and paid handoffs stay awaiting_dns with manual operator notes —
 * Phase 5 auto-provision never starts while other launch secrets look ready.
 *
 * Matches tryProvisionVercelDomain / buildHandoffRecord gates in
 * src/lib/deploy/handoff.ts:
 *   missing or whitespace-only → treated as unset (manual provisioning notes).
 * Also flags documented paste placeholders (changeme / token / vercel / xxx)
 * that would otherwise look "set" while still failing API auth.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not call Vercel and does not invent aggregates.
 * Does not require VERCEL_PROJECT_ID (per-handoff Assign project covers that).
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const VERCEL_TOKEN_ENV_NAMES = ["VERCEL_TOKEN"] as const;

export type VercelTokenEnvName = (typeof VERCEL_TOKEN_ENV_NAMES)[number];

export type VercelTokenEnvReadiness = {
  /** True when VERCEL_TOKEN is a usable non-placeholder secret. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly VercelTokenEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly VercelTokenEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly VercelTokenEnvName[];
  /** True when VERCEL_TOKEN would leave the Domains API unconfigured skip path. */
  tokenReady: boolean;
  /** True when the value looks like a documented paste placeholder. */
  placeholderDetected: boolean;
};

/** Stable list of Vercel token env names from launch checklist / .env.example. */
export function listRequiredVercelTokenEnvNames(): VercelTokenEnvName[] {
  return [...VERCEL_TOKEN_ENV_NAMES];
}

/** Documented paste placeholders — not usable production tokens. */
export function isVercelTokenPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (
    lower === "changeme" ||
    lower === "token" ||
    lower === "vercel" ||
    lower === "xxx" ||
    lower === "your_token" ||
    lower === "your-token" ||
    lower === "vercel_token" ||
    lower === "placeholder"
  ) {
    return true;
  }
  if (
    lower.startsWith("changeme") ||
    lower.startsWith("your_token") ||
    lower.startsWith("your-token") ||
    lower.startsWith("xxx")
  ) {
    return true;
  }
  return false;
}

/**
 * True when the value would enable Domains API attempts (and is not a
 * documented placeholder). Matches tryProvisionVercelDomain's trim gate.
 */
export function isVercelTokenConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isVercelTokenPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether Vercel Domains API automation can leave the unconfigured skip
 * path. Env presence only — does not validate the token with Vercel.
 */
export function assessVercelTokenEnvReadiness(
  env: EnvLike = process.env,
): VercelTokenEnvReadiness {
  const required = listRequiredVercelTokenEnvNames();
  const raw = env.VERCEL_TOKEN;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isVercelTokenPlaceholder(trimmed);
  const tokenReady = isVercelTokenConfigured(raw);
  const present: VercelTokenEnvName[] = tokenReady ? ["VERCEL_TOKEN"] : [];
  const missing: VercelTokenEnvName[] = tokenReady ? [] : ["VERCEL_TOKEN"];
  return {
    ready: tokenReady,
    required,
    present,
    missing,
    tokenReady,
    placeholderDetected,
  };
}
