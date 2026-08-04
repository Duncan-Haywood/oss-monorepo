/**
 * The environment variable that carries the sign-in allowlist.
 *
 * It is named once, here, because the defect this constant exists to prevent
 * was a name mismatch: `wrangler.jsonc` and `.env.example` set `ALLOWED_EMAIL`
 * while the code compared against a hardcoded string and read no variable at
 * all. The configuration claimed the allowlist was operator-editable; the code
 * admitted exactly one address on earth. `allowlistConfig.test.ts` holds this
 * name and the names the configuration sets to each other.
 */
export const ALLOWED_EMAIL_VAR = "ALLOWED_EMAIL";

export const AUTH_COOKIE_NAME = "bir_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * The addresses this deployment admits, as configured right now.
 *
 * Read on every call rather than captured at module load. This app runs on
 * Cloudflare Workers via OpenNext, where `process.env` is populated from the
 * Worker's bindings by the adapter — a module-level capture can evaluate
 * before that happens and would then be permanently empty, which is the
 * failure mode where a feature is silently off and no test notices. Reading
 * per call also means changing the `ALLOWED_EMAIL` var takes effect without a
 * code change, which is the entire point of the fix.
 *
 * The variable is indexed dynamically so that no bundler can inline a
 * build-time value in place of the runtime lookup.
 *
 * This is a server-only read. Every caller is server-side (middleware, the
 * OAuth callback, session verification); `allowlistConfig.test.ts` proves no
 * `"use client"` module can reach this module, so the value neither ships into
 * the HTML nor evaporates in the browser.
 */
export function getAllowedEmails(): string[] {
  const configured = process.env[ALLOWED_EMAIL_VAR];
  if (!configured) return [];
  return configured
    .split(",")
    .map((entry) => entry.toLowerCase().trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Whether anyone at all can sign in to this deployment.
 *
 * An unset or empty `ALLOWED_EMAIL` is a misconfiguration, not an invitation:
 * `isEmailAllowed` denies everyone while this is false. It deliberately does
 * not fall back to a built-in address — a fallback is how the hardcoded
 * allowlist survived being "made configurable" the first time.
 */
export function isAllowlistConfigured(): boolean {
  return getAllowedEmails().length > 0;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false; // fail closed: no allowlist, no access
  return allowed.includes(email.toLowerCase().trim());
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return "dev-only-secret-change-in-production";
    }
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return secret;
}

export function getGoogleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID;
}

export function getGoogleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function isCloudflareAccessEnabled(): boolean {
  return (
    process.env.CLOUDFLARE_ACCESS_ENABLED === "true" ||
    Boolean(getCloudflareAccessTeamDomain() && getCloudflareAccessAudience())
  );
}

export function getCloudflareAccessTeamDomain(): string | undefined {
  return (
    process.env.TEAM_DOMAIN ?? process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN
  );
}

export function getCloudflareAccessAudience(): string | undefined {
  return process.env.POLICY_AUD ?? process.env.CLOUDFLARE_ACCESS_AUDIENCE;
}

export function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
