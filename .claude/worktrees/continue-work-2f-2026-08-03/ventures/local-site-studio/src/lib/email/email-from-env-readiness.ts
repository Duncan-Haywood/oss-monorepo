/**
 * Operator-visible readiness for the Resend From address (EMAIL_FROM).
 *
 * Resend API-key readiness covers transport. Without EMAIL_FROM, brand.emailFrom
 * falls back to EMAIL_FROM_FALLBACK while historical send paths hardcoded
 * outreach@updates.localsitestudio.com — operators can set SPF/DKIM on their
 * domain and still send from the wrong From address (or never notice the env
 * is ignored). Launch checklist requires EMAIL_FROM beside RESEND_API_KEY.
 *
 * Matches brand.emailFrom / read path in src/lib/brand.ts:
 *   missing or whitespace-only → EMAIL_FROM_FALLBACK
 * Also flags documented paste placeholders (@example.com / changeme@…).
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not call Resend and does not invent aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const EMAIL_FROM_ENV_NAMES = ["EMAIL_FROM"] as const;

export type EmailFromEnvName = (typeof EMAIL_FROM_ENV_NAMES)[number];

export type EmailFromEnvReadiness = {
  /** True when EMAIL_FROM is a non-placeholder From address. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly EmailFromEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly EmailFromEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly EmailFromEnvName[];
  /** True when EMAIL_FROM would leave the brand.emailFrom fallback path. */
  emailFromReady: boolean;
  /** True when the value looks like a documented placeholder, not a real From. */
  placeholderDetected: boolean;
};

/** Stable list of EMAIL_FROM env names from launch checklist / .env.example. */
export function listRequiredEmailFromEnvNames(): EmailFromEnvName[] {
  return [...EMAIL_FROM_ENV_NAMES];
}

/** Documented paste / example placeholders — not usable Resend From addresses. */
export function isEmailFromPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (
    lower === "noreply@example.com" ||
    lower === "from@example.com" ||
    lower === "you@example.com" ||
    lower === "email@example.com" ||
    lower === "test@example.com" ||
    lower === "changeme" ||
    lower === "placeholder" ||
    lower === "xxx" ||
    lower === "todo"
  ) {
    return true;
  }
  if (
    lower.endsWith("@example.com") ||
    lower.endsWith("@example.org") ||
    lower.endsWith("@localhost") ||
    lower.endsWith("@test.com")
  ) {
    return true;
  }
  if (
    lower.startsWith("changeme") ||
    lower.startsWith("your@") ||
    lower.startsWith("you@") ||
    lower.startsWith("todo@")
  ) {
    return true;
  }
  return false;
}

/**
 * True when EMAIL_FROM is set to a non-placeholder value (operators must set
 * explicitly — brand.emailFrom fallback alone does not count as ready).
 */
export function isEmailFromConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isEmailFromPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Build the Resend `from` header: `Display Name <email@domain>`.
 * If EMAIL_FROM already includes angle brackets, use it as-is.
 */
export function formatResendFromHeader(
  displayName: string,
  emailFrom: string,
): string {
  const email = emailFrom.trim();
  const name = displayName.trim();
  if (email.includes("<") && email.endsWith(">")) {
    return email;
  }
  if (!name) {
    return email;
  }
  return `${name} <${email}>`;
}

/**
 * Assess whether EMAIL_FROM is ready for Resend From addressing.
 * Env presence only — does not validate domain verification with Resend.
 */
export function assessEmailFromEnvReadiness(
  env: EnvLike = process.env,
): EmailFromEnvReadiness {
  const required = listRequiredEmailFromEnvNames();
  const raw = env.EMAIL_FROM;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isEmailFromPlaceholder(trimmed);
  const emailFromReady = isEmailFromConfigured(raw);
  const present: EmailFromEnvName[] = emailFromReady ? ["EMAIL_FROM"] : [];
  const missing: EmailFromEnvName[] = emailFromReady ? [] : ["EMAIL_FROM"];
  return {
    ready: emailFromReady,
    required,
    present,
    missing,
    emailFromReady,
    placeholderDetected,
  };
}
