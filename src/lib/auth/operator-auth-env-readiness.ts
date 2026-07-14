/**
 * Operator-visible readiness for dashboard auth (shared-secret password).
 *
 * Stripe / Resend / Anthropic / digest banners already cover payment, outbound
 * transport, AI pack quality, and digest destination. Without
 * OPERATOR_DASHBOARD_PASSWORD, proxy.ts and requireOperatorAuth stay in open
 * demo mode — every CRM / outreach / fulfill mutation is world-reachable while
 * lead inventory and outbound sends are live.
 *
 * Matches isOperatorAuthConfigured / getPassword in src/lib/auth/operator.ts:
 *   missing or whitespace-only → auth inactive (open dashboard).
 * Also flags documented paste placeholders (changeme / password / secret) that
 * would otherwise look "set" while remaining trivial to guess.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not invent optional aggregates. Local demos may leave this unset —
 * the banner is the early production signal before real lead data.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const OPERATOR_AUTH_ENV_NAMES = ["OPERATOR_DASHBOARD_PASSWORD"] as const;

export type OperatorAuthEnvName = (typeof OPERATOR_AUTH_ENV_NAMES)[number];

export type OperatorAuthEnvReadiness = {
  /** True when OPERATOR_DASHBOARD_PASSWORD locks the dashboard. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly OperatorAuthEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly OperatorAuthEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly OperatorAuthEnvName[];
  /** True when a non-placeholder password would activate auth. */
  passwordReady: boolean;
  /** True when the value looks like a documented placeholder, not a real secret. */
  placeholderDetected: boolean;
};

/** Stable list of operator auth env names from launch checklist / .env.example. */
export function listRequiredOperatorAuthEnvNames(): OperatorAuthEnvName[] {
  return [...OPERATOR_AUTH_ENV_NAMES];
}

/** Documented paste placeholders — not usable production secrets. */
export function isOperatorAuthPasswordPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (
    lower === "changeme" ||
    lower === "password" ||
    lower === "secret" ||
    lower === "opensecret" ||
    lower === "operator" ||
    lower === "dashboard"
  ) {
    return true;
  }
  if (lower.startsWith("changeme") || lower.startsWith("password")) {
    return true;
  }
  return false;
}

/**
 * True when the value would activate operator auth (and is not a documented
 * placeholder).
 */
export function isOperatorAuthPasswordConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isOperatorAuthPasswordPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether the operator dashboard is locked behind a shared secret.
 * Env presence only — does not validate strength beyond placeholder rejection.
 */
export function assessOperatorAuthEnvReadiness(
  env: EnvLike = process.env,
): OperatorAuthEnvReadiness {
  const required = listRequiredOperatorAuthEnvNames();
  const raw = env.OPERATOR_DASHBOARD_PASSWORD;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isOperatorAuthPasswordPlaceholder(trimmed);
  const passwordReady = isOperatorAuthPasswordConfigured(raw);
  const present: OperatorAuthEnvName[] = passwordReady
    ? ["OPERATOR_DASHBOARD_PASSWORD"]
    : [];
  const missing: OperatorAuthEnvName[] = passwordReady
    ? []
    : ["OPERATOR_DASHBOARD_PASSWORD"];
  return {
    ready: passwordReady,
    required,
    present,
    missing,
    passwordReady,
    placeholderDetected,
  };
}
